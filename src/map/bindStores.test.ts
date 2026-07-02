import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Occluder } from '@/engine/shadows';

// ---------------------------------------------------------------------------
// Mocks: suncalc (pin the sun to a known daytime position regardless of
// currentTime), the occluder loader (avoid a real fetch), and the scoring
// worker client (control whether the worker path succeeds/rejects, without
// spinning up a real Worker).
// ---------------------------------------------------------------------------
vi.mock('suncalc', () => ({
  default: {
    getPosition: vi.fn(() => ({ azimuth: 2.5, altitude: 0.6 })),
  },
}));

const mockLoadBuildingOccluders = vi.fn<(slug: string) => Promise<Occluder[]>>();
vi.mock('@/data/loaders', () => ({
  loadBuildingOccluders: (slug: string) => mockLoadBuildingOccluders(slug),
}));

const mockRequestShadows = vi.fn();
vi.mock('@/worker/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/worker/client')>('@/worker/client');
  return {
    ...actual,
    defaultScoringClient: {
      ...actual.defaultScoringClient,
      requestShadows: (...args: unknown[]) => mockRequestShadows(...args),
    },
  };
});

const { bindStores } = await import('./bindStores');
const { useUIStore } = await import('@/state/uiStore');
const { useLocationStore } = await import('@/state/locationStore');
const { ShadowRequestSuperseded } = await import('@/worker/client');

function mkOccluder(height: number, lng: number, lat: number): Occluder {
  const d = 0.0005;
  return {
    height,
    polygon: [
      [lng, lat],
      [lng + d, lat],
      [lng + d, lat + d],
      [lng, lat + d],
    ],
  };
}

function makeFakeMap() {
  const setData = vi.fn();
  const source = { setData };
  const listeners = new Map<string, Array<() => void>>();

  const map = {
    getBounds: () => ({
      getWest: () => -118.31,
      getSouth: () => 34.04,
      getEast: () => -118.29,
      getNorth: () => 34.06,
    }),
    getZoom: () => 16,
    getBearing: () => 0,
    getSource: (id: string) => (id === 'shadow-polygons' ? source : undefined),
    on: (evt: string, cb: () => void) => {
      const arr = listeners.get(evt) ?? [];
      arr.push(cb);
      listeners.set(evt, arr);
    },
    off: vi.fn(),
    easeTo: vi.fn(),
    isStyleLoaded: () => true,
    getLayer: () => undefined,
    setPaintProperty: vi.fn(),
  };

  return { map, source, setData };
}

async function flush(): Promise<void> {
  // Let the fire-and-forget recomputeShadows() promise chain (multiple
  // awaits deep) settle.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

beforeEach(() => {
  mockLoadBuildingOccluders.mockReset();
  mockRequestShadows.mockReset();
  useUIStore.setState({ shadowOverlayOn: true });
  useLocationStore.setState({ neighborhoodSlug: 'silver-lake' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bindStores — shadow worker path with main-thread fallback (ANS-237)', () => {
  it('uses the worker result and does not touch the main-thread path when the worker succeeds', async () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
          },
        },
      ],
    };
    mockRequestShadows.mockResolvedValue(fc);

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockRequestShadows).toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(fc);
    expect(mockLoadBuildingOccluders).not.toHaveBeenCalled();

    cleanup();
  });

  it('falls back to the main-thread projection when the worker is not ready (rejects)', async () => {
    mockRequestShadows.mockRejectedValue(
      new Error('Worker not initialized. Call init() before requestShadows().')
    );
    const occluders = [mkOccluder(20, -118.3, 34.05)];
    mockLoadBuildingOccluders.mockResolvedValue(occluders);

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockRequestShadows).toHaveBeenCalled();
    // Fallback engaged: the building occluder loader was used...
    expect(mockLoadBuildingOccluders).toHaveBeenCalledWith('silver-lake');
    // ...and the main-thread pipeline produced a real (non-blank) shadow
    // polygon for the in-view occluder, proving the fallback actually
    // renders rather than just "not crashing".
    expect(setData).toHaveBeenCalled();
    const fc = setData.mock.calls[0][0];
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);

    cleanup();
  });

  it('falls back and renders real shadows while the worker is (re-)initializing on a neighborhood switch', async () => {
    // During a neighborhood switch, AppShell.loadNeighborhood calls init()
    // again -> the client is 'initializing' and requestShadows rejects
    // not-ready (NOT supersede). recomputeShadows must fall back promptly to
    // the main thread and render the CURRENT neighborhood's shadows rather
    // than awaiting the re-init window and leaving the previous
    // neighborhood's (stale) shadows on screen (ANS-237).
    mockRequestShadows.mockRejectedValue(
      new Error('Worker not initialized. Call init() before requestShadows().')
    );
    const occluders = [mkOccluder(20, -118.3, 34.05)];
    mockLoadBuildingOccluders.mockResolvedValue(occluders);

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockRequestShadows).toHaveBeenCalled();
    expect(mockLoadBuildingOccluders).toHaveBeenCalledWith('silver-lake');
    // A real, non-empty FeatureCollection was rendered via the fallback —
    // the layer is not blank/stale during re-init.
    expect(setData).toHaveBeenCalled();
    const fc = setData.mock.calls[0][0];
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);

    cleanup();
  });

  it('falls back to the main-thread projection when the worker errors generically', async () => {
    mockRequestShadows.mockRejectedValue(new Error('boom'));
    mockLoadBuildingOccluders.mockResolvedValue([mkOccluder(20, -118.3, 34.05)]);

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockLoadBuildingOccluders).toHaveBeenCalled();
    expect(setData).toHaveBeenCalled();

    cleanup();
  });

  it('does NOT fall back when a shadow request is merely superseded by a newer one', async () => {
    mockRequestShadows.mockRejectedValue(new ShadowRequestSuperseded());

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockRequestShadows).toHaveBeenCalled();
    // No fallback: superseded just means a newer request will render soon.
    expect(mockLoadBuildingOccluders).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();

    cleanup();
  });

  it('skips shadow recompute entirely (no worker call, no fallback) when the overlay is off', async () => {
    useUIStore.setState({ shadowOverlayOn: false });

    const { map, setData } = makeFakeMap();
    const cleanup = bindStores(map as never);
    await flush();

    expect(mockRequestShadows).not.toHaveBeenCalled();
    expect(mockLoadBuildingOccluders).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();

    cleanup();
  });
});
