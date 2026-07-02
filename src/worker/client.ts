import type { Occluder, SunPosition } from '../engine/shadows';
import type { InitMsg, ScoreMsg, PlanMsg, WorkerOutMsg } from './protocol';

export type VenueCoords = {
  id: string;
  coords: [number, number];
  facadeAzimuths?: number[];
  /** Seating type; used to derive receiver elevation for rooftops (ANS-218 D6). */
  seatingType?: string | null;
  /** Matched building roof height in meters, if any (ANS-218 D6). */
  buildingHeight?: number | null;
};

export interface ScoringClient {
  /** Initialize the worker with occluders and venue list. Must call before score(). */
  init(occluders: Occluder[], venues: VenueCoords[]): Promise<void>;
  /** Score all venues at the given sun position. Coalesces rapid calls. */
  score(sun: SunPosition): Promise<Record<string, number>>;
  /**
   * Simulate forward in time from the given sun position and return how many
   * minutes until the venue first goes into shadow.
   * Returns null if the venue is still in sun past maxMinutes.
   */
  planVenue(
    venueId: string,
    sun: SunPosition,
    timestampMs: number,
    lat: number,
    lng: number,
    stepMinutes?: number,
    maxMinutes?: number,
  ): Promise<number | null>;
  /** Terminate the worker. */
  destroy(): void;
}

type WorkerState = 'idle' | 'initializing' | 'ready' | 'scoring';

interface PendingScore {
  sun: SunPosition;
  resolve: (scores: Record<string, number>) => void;
  reject: (err: unknown) => void;
}

interface InFlightScore {
  requestId: number;
  resolve: (scores: Record<string, number>) => void;
  reject: (err: unknown) => void;
}

interface InFlightPlan {
  requestId: number;
  resolve: (minutes: number | null) => void;
  reject: (err: unknown) => void;
}

export function createScoringClient(): ScoringClient {
  const worker = new Worker(new URL('./scoring.worker.ts', import.meta.url));

  let state: WorkerState = 'idle';
  let nextRequestId = 1;

  // Pending: a score request queued while worker is busy (drop-and-replace)
  let pending: PendingScore | null = null;

  // In-flight: the score request currently being processed
  let inFlight: InFlightScore | null = null;

  // In-flight plan requests (keyed by requestId; multiple can be in flight)
  const inFlightPlans = new Map<number, InFlightPlan>();

  // For init: we only need one resolver at a time
  let initResolve: (() => void) | null = null;
  let initReject: ((err: unknown) => void) | null = null;

  worker.onmessage = (event: MessageEvent<WorkerOutMsg>) => {
    const msg = event.data;

    if (msg.type === 'ready') {
      state = 'ready';
      if (initResolve) {
        const res = initResolve;
        initResolve = null;
        initReject = null;
        res();
      }
      // If there was a score queued before init finished, send it now
      if (pending) {
        sendPending();
      }
      return;
    }

    if (msg.type === 'scoreResult') {
      const currentInFlight = inFlight;
      inFlight = null;

      if (currentInFlight && currentInFlight.requestId === msg.requestId) {
        currentInFlight.resolve(msg.scores);
      }

      // If there's a pending request queued, send it now
      if (pending) {
        sendPending();
      } else {
        state = 'ready';
      }
      return;
    }

    if (msg.type === 'planResult') {
      const plan = inFlightPlans.get(msg.requestId);
      if (plan) {
        inFlightPlans.delete(msg.requestId);
        plan.resolve(msg.sunUntilMinutes);
      }
      return;
    }
  };

  worker.onerror = (event) => {
    const err = event.error ?? new Error('Worker error');
    if (initReject) {
      const rej = initReject;
      initResolve = null;
      initReject = null;
      rej(err);
    }
    if (inFlight) {
      inFlight.reject(err);
      inFlight = null;
    }
    if (pending) {
      pending.reject(err);
      pending = null;
    }
    for (const plan of inFlightPlans.values()) {
      plan.reject(err);
    }
    inFlightPlans.clear();
    state = 'idle';
  };

  function sendPending(): void {
    if (!pending) return;

    const { sun, resolve, reject } = pending;
    pending = null;

    const requestId = nextRequestId++;
    inFlight = { requestId, resolve, reject };
    state = 'scoring';

    const msg: ScoreMsg = { type: 'score', requestId, sun };
    worker.postMessage(msg);
  }

  return {
    init(occluders: Occluder[], venues: VenueCoords[]): Promise<void> {
      return new Promise((resolve, reject) => {
        state = 'initializing';
        initResolve = resolve;
        initReject = reject;

        const msg: InitMsg = {
          type: 'init',
          occluders,
          venues,
        };
        worker.postMessage(msg);
      });
    },

    score(sun: SunPosition): Promise<Record<string, number>> {
      return new Promise((resolve, reject) => {
        if (state === 'scoring' || state === 'initializing') {
          // Drop any previously queued pending request and replace with this one
          if (pending) {
            pending.reject(new Error('Superseded by newer score request'));
          }
          pending = { sun, resolve, reject };
          return;
        }

        if (state === 'ready') {
          const requestId = nextRequestId++;
          inFlight = { requestId, resolve, reject };
          state = 'scoring';

          const msg: ScoreMsg = { type: 'score', requestId, sun };
          worker.postMessage(msg);
          return;
        }

        // Worker is idle (not yet initialized)
        reject(new Error('Worker not initialized. Call init() before score().'));
      });
    },

    planVenue(
      venueId: string,
      sun: SunPosition,
      timestampMs: number,
      lat: number,
      lng: number,
      stepMinutes = 5,
      maxMinutes = 180,
    ): Promise<number | null> {
      return new Promise((resolve, reject) => {
        if (state === 'idle') {
          reject(new Error('Worker not initialized. Call init() before planVenue().'));
          return;
        }

        const requestId = nextRequestId++;
        inFlightPlans.set(requestId, { requestId, resolve, reject });

        const msg: PlanMsg = {
          type: 'plan',
          requestId,
          venueId,
          sun,
          timestampMs,
          lat,
          lng,
          stepMinutes,
          maxMinutes,
        };
        worker.postMessage(msg);
      });
    },

    destroy(): void {
      worker.terminate();
      state = 'idle';
      if (pending) {
        pending.reject(new Error('Worker destroyed'));
        pending = null;
      }
      if (inFlight) {
        inFlight.reject(new Error('Worker destroyed'));
        inFlight = null;
      }
      for (const plan of inFlightPlans.values()) {
        plan.reject(new Error('Worker destroyed'));
      }
      inFlightPlans.clear();
    },
  };
}

// --- Singleton ---

let _defaultClient: ScoringClient | null = null;

export function getDefaultScoringClient(): ScoringClient {
  if (!_defaultClient) {
    _defaultClient = createScoringClient();
  }
  return _defaultClient;
}

// Named export for conventional import
export const defaultScoringClient: ScoringClient = {
  init(occluders, venues) {
    return getDefaultScoringClient().init(occluders, venues);
  },
  score(sun) {
    return getDefaultScoringClient().score(sun);
  },
  planVenue(venueId, sun, timestampMs, lat, lng, stepMinutes, maxMinutes) {
    return getDefaultScoringClient().planVenue(venueId, sun, timestampMs, lat, lng, stepMinutes, maxMinutes);
  },
  destroy() {
    if (_defaultClient) {
      _defaultClient.destroy();
      _defaultClient = null;
    }
  },
};
