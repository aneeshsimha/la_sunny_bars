/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import SunCalc from 'suncalc';
import type { Occluder, SunPosition } from '../engine/shadows';
import { buildSpatialIndex, precomputeCandidates } from '../engine/spatial';
import { scorePartialShade } from '../engine/partialShade';
import { flatHorizonProfile, isSunAboveHorizon } from '../engine/terrain';
import type { HorizonProfile } from '../engine/terrain';
import type { WorkerInMsg, WorkerOutMsg, PlanResultMsg } from './protocol';

// --- State ---

type StoredVenue = {
  id: string;
  coords: [number, number];
  facadeAzimuths?: number[];
  seatingType?: string | null;
  buildingHeight?: number | null;
};

let storedVenues: StoredVenue[] = [];
let candidateMap: Map<string, Occluder[]> = new Map();
let storedHorizonProfile: HorizonProfile = flatHorizonProfile();

/**
 * Receiver elevation (meters) for scoring a venue: a rooftop venue matched to
 * a building of known height is scored at that roof elevation instead of
 * ground level (ANS-218 D6); everything else scores at z=0.
 *
 * TODO(D6 follow-up): near-field terrain slope (sloped streets) is not
 * modeled here — that needs ground-elevation data from a DEM (USGS
 * 3DEP/SRTM), which isn't in the repo and would require a network fetch.
 */
function receiverZFor(venue: StoredVenue): number {
  return venue.seatingType === 'rooftop' && venue.buildingHeight != null
    ? venue.buildingHeight
    : 0;
}

// --- Scoring ---

function scoreVenues(sun: SunPosition): Record<string, number> {
  const scores: Record<string, number> = {};

  // Sun below horizon: all venues score 0
  if (sun.altitude <= 0) {
    for (const venue of storedVenues) {
      scores[venue.id] = 0;
    }
    return scores;
  }

  // Terrain horizon occlusion: if the sun is below the terrain horizon in this
  // direction, all venues are in shadow (hills blocking the sun).
  if (!isSunAboveHorizon(sun, storedHorizonProfile)) {
    for (const venue of storedVenues) {
      scores[venue.id] = 0;
    }
    return scores;
  }

  for (const venue of storedVenues) {
    const candidates = candidateMap.get(venue.id) ?? [];
    scores[venue.id] = scorePartialShade(venue.coords, candidates, sun, {
      facadeAzimuths: venue.facadeAzimuths ?? [],
      receiverZ: receiverZFor(venue),
    });
  }

  return scores;
}

// --- Message handler ---

self.onmessage = (event: MessageEvent<WorkerInMsg>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    storedVenues = msg.venues;
    storedHorizonProfile = msg.horizonProfile ?? flatHorizonProfile();

    const index = buildSpatialIndex(msg.occluders);
    candidateMap = precomputeCandidates(index, storedVenues);

    const reply: WorkerOutMsg = {
      type: 'ready',
      venueCount: storedVenues.length,
      occluderCount: msg.occluders.length,
    };
    self.postMessage(reply);
    return;
  }

  if (msg.type === 'score') {
    const scores = scoreVenues(msg.sun);
    const reply: WorkerOutMsg = {
      type: 'scoreResult',
      requestId: msg.requestId,
      scores,
    };
    self.postMessage(reply);
    return;
  }

  if (msg.type === 'plan') {
    const { requestId, venueId, timestampMs, lat, lng, stepMinutes, maxMinutes } = msg;
    const candidates = candidateMap.get(venueId) ?? [];

    // Find the venue coords
    const venue = storedVenues.find((v) => v.id === venueId);
    if (!venue) {
      const reply: PlanResultMsg = {
        type: 'planResult',
        requestId,
        venueId,
        sunUntilMinutes: null,
      };
      self.postMessage(reply);
      return;
    }

    const stepMs = stepMinutes * 60_000;
    const steps = Math.ceil(maxMinutes / stepMinutes);
    let sunUntilMinutes: number | null = null;

    for (let i = 1; i <= steps; i++) {
      const t = new Date(timestampMs + i * stepMs);
      const pos = SunCalc.getPosition(t, lat, lng);
      const sun: SunPosition = { azimuth: pos.azimuth, altitude: pos.altitude };

      // Sun below horizon means shaded
      if (sun.altitude <= 0 || !isSunAboveHorizon(sun, storedHorizonProfile)) {
        sunUntilMinutes = (i - 1) * stepMinutes;
        break;
      }

      const score = scorePartialShade(venue.coords, candidates, sun, {
        facadeAzimuths: venue.facadeAzimuths ?? [],
        receiverZ: receiverZFor(venue),
      });
      // Threshold: if score drops below 0.2, consider it in shadow
      if (score < 0.2) {
        sunUntilMinutes = (i - 1) * stepMinutes;
        break;
      }
    }

    const reply: PlanResultMsg = {
      type: 'planResult',
      requestId,
      venueId,
      sunUntilMinutes,
    };
    self.postMessage(reply);
    return;
  }
};
