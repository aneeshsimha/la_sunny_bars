import { describe, it, expect, beforeEach } from 'vitest';
import { createScoringClient, ShadowRequestSuperseded } from './client';
import type { WorkerOutMsg } from './protocol';
import type { MapBounds, ShadowFeatureCollection } from '../engine/shadowProjection';
import type { SunPosition } from '../engine/shadows';

// ---------------------------------------------------------------------------
// FakeWorker: a controllable stand-in for the real Worker global (which
// doesn't exist in the vitest/node environment — createScoringClient() does
// `new Worker(new URL('./scoring.worker.ts', import.meta.url))`). Tests
// install this on globalThis.Worker, then drive replies manually via
// `reply()` to exercise client.ts's coalescing/state logic without spinning
// up a real worker thread.
// ---------------------------------------------------------------------------
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerOutMsg>) => void) | null = null;
  onerror: ((event: { error?: unknown }) => void) | null = null;
  posted: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }

  terminate(): void {}

  reply(msg: WorkerOutMsg): void {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerOutMsg>);
  }
}

function shadowMsgsOf(w: FakeWorker): Array<{ type: 'shadow'; requestId: number }> {
  return w.posted.filter(
    (m): m is { type: 'shadow'; requestId: number } =>
      typeof m === 'object' && m !== null && (m as { type?: string }).type === 'shadow'
  );
}

const sun: SunPosition = { azimuth: 1, altitude: 0.5 };
const bounds: MapBounds = [-118.3, 34.0, -118.29, 34.01];
const fc = (n: number): ShadowFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { n },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
    },
  ],
});

beforeEach(() => {
  FakeWorker.instances = [];
  (globalThis as unknown as { Worker: typeof FakeWorker }).Worker = FakeWorker;
});

async function readyClient() {
  const client = createScoringClient();
  const w = FakeWorker.instances[0];
  const initPromise = client.init([], []);
  w.reply({ type: 'ready', venueCount: 0, occluderCount: 0 });
  await initPromise;
  return { client, w };
}

describe('requestShadows — not-ready fallback signal', () => {
  it('rejects when the worker has never been initialized', async () => {
    const client = createScoringClient();
    await expect(client.requestShadows(sun, bounds, 16)).rejects.toThrow(
      /not initialized/
    );
  });
});

describe('requestShadows — happy path', () => {
  it('sends a shadow message and resolves with the features the worker returns', async () => {
    const { client, w } = await readyClient();

    const p = client.requestShadows(sun, bounds, 16, 500);
    const [msg] = shadowMsgsOf(w);
    expect(msg).toBeTruthy();

    w.reply({ type: 'shadowResult', requestId: msg.requestId, features: fc(1) });
    await expect(p).resolves.toEqual(fc(1));
  });

  it('is independent of a concurrently in-flight score request', async () => {
    const { client, w } = await readyClient();

    // Kick off a score request (puts the shared `state` into 'scoring') and,
    // without resolving it, immediately request shadows too.
    void client.score(sun);
    const p = client.requestShadows(sun, bounds, 16);

    const [msg] = shadowMsgsOf(w);
    expect(msg).toBeTruthy(); // sent immediately, not blocked behind score

    w.reply({ type: 'shadowResult', requestId: msg.requestId, features: fc(2) });
    await expect(p).resolves.toEqual(fc(2));
  });
});

describe('requestShadows — drop-and-replace coalescing', () => {
  it('supersedes a still-queued shadow request, leaving the in-flight one untouched', async () => {
    const { client, w } = await readyClient();

    const pA = client.requestShadows(sun, bounds, 16); // sent immediately -> in-flight
    const pB = client.requestShadows(sun, bounds, 17); // queued behind A
    const pC = client.requestShadows(sun, bounds, 18); // supersedes B

    await expect(pB).rejects.toBeInstanceOf(ShadowRequestSuperseded);

    // Only A has been posted to the worker so far — C is still queued behind
    // A's in-flight slot.
    expect(shadowMsgsOf(w)).toHaveLength(1);

    const [msgA] = shadowMsgsOf(w);
    w.reply({ type: 'shadowResult', requestId: msgA.requestId, features: fc(10) });
    await expect(pA).resolves.toEqual(fc(10));

    // Resolving A's in-flight slot flushes the queue: C gets sent next.
    const msgs = shadowMsgsOf(w);
    expect(msgs).toHaveLength(2);
    const msgC = msgs[1];
    w.reply({ type: 'shadowResult', requestId: msgC.requestId, features: fc(30) });
    await expect(pC).resolves.toEqual(fc(30));
  });
});

describe('requestShadows — rejects (not queues) during (re-)init', () => {
  it('rejects not-ready — NOT supersede — while the worker is initializing, so callers fall back promptly', async () => {
    const client = createScoringClient();
    const w = FakeWorker.instances[0];

    // init() in flight (state === 'initializing'), not yet ready. This is the
    // neighborhood-switch window: a shadow request here must reject promptly
    // rather than queue behind init, or bindStores would await the whole
    // re-init and render stale (previous-neighborhood) shadows.
    const initPromise = client.init([], []);
    const shadowPromise = client.requestShadows(sun, bounds, 16);

    // Nothing was posted to the worker, and the promise rejects immediately
    // with the not-ready error (so bindStores hits its catch and falls back).
    expect(shadowMsgsOf(w)).toHaveLength(0);
    await expect(shadowPromise).rejects.toThrow(/not initialized/);
    await expect(shadowPromise).rejects.not.toBeInstanceOf(ShadowRequestSuperseded);

    // init still completes normally afterward.
    w.reply({ type: 'ready', venueCount: 0, occluderCount: 0 });
    await initPromise;

    // And once ready, a fresh shadow request works.
    const p2 = client.requestShadows(sun, bounds, 16);
    const [msg] = shadowMsgsOf(w);
    expect(msg).toBeTruthy();
    w.reply({ type: 'shadowResult', requestId: msg.requestId, features: fc(5) });
    await expect(p2).resolves.toEqual(fc(5));
  });
});

describe('requestShadows — teardown', () => {
  it('rejects a pending shadow request on worker error', async () => {
    const { client, w } = await readyClient();
    const p = client.requestShadows(sun, bounds, 16);
    w.onerror?.({ error: new Error('boom') });
    await expect(p).rejects.toThrow('boom');
  });

  it('rejects an in-flight/pending shadow request on destroy()', async () => {
    const { client, w } = await readyClient();
    const pA = client.requestShadows(sun, bounds, 16);
    const pB = client.requestShadows(sun, bounds, 17);
    void w; // in-flight A never replied to; B is queued
    client.destroy();
    await expect(pA).rejects.toThrow('Worker destroyed');
    await expect(pB).rejects.toThrow('Worker destroyed');
  });
});
