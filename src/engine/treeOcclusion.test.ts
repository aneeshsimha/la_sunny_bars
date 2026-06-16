import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scorePartialShade } from './partialShade';
import type { Occluder, SunPosition } from './shadows';
import { METERS_PER_DEG_LAT } from './shadows';

// A point in Silver Lake, LA — same as partialShade.test.ts baseline
const CENTER: [number, number] = [-118.2617, 34.0872];

// Sun clearly above horizon (noon-ish altitude, shadow cast south)
const SUN_UP: SunPosition = {
  azimuth: 0,
  altitude: Math.PI / 4, // 45°
};

// Build a large occluder just north of CENTER that casts a shadow covering the patio.
// Shadow length at 45° = height → a 30m building casts a 30m shadow.
function makeLargeNorthOccluder(height: number, opacity?: number): Occluder {
  const cosLat = Math.cos((CENTER[1] * Math.PI) / 180);
  const halfW = 0.001 / cosLat; // wide enough to cover all sample points
  const northOffset = 5 / METERS_PER_DEG_LAT; // 5m north of the venue

  return {
    polygon: [
      [CENTER[0] - halfW, CENTER[1] + northOffset],
      [CENTER[0] + halfW, CENTER[1] + northOffset],
      [CENTER[0] + halfW, CENTER[1] + northOffset + 0.001],
      [CENTER[0] - halfW, CENTER[1] + northOffset + 0.001],
    ],
    height,
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

describe('tree occluder partial shade', () => {
  it('returns a score strictly between 0 and 1 for a tree with opacity=0.5', () => {
    const tree = makeLargeNorthOccluder(30, 0.5);
    const score = scorePartialShade(CENTER, [tree], SUN_UP);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('tree (opacity=0.5) score is higher than a solid building (no opacity)', () => {
    const tree = makeLargeNorthOccluder(30, 0.5);
    const building = makeLargeNorthOccluder(30); // solid (opacity defaults to 1)
    const treeScore = scorePartialShade(CENTER, [tree], SUN_UP);
    const buildingScore = scorePartialShade(CENTER, [building], SUN_UP);
    expect(treeScore).toBeGreaterThan(buildingScore);
  });

  it('very transparent occluder (opacity=0.2) casts no shadow — score stays at 1', () => {
    const ghostTree = makeLargeNorthOccluder(30, 0.2);
    const score = scorePartialShade(CENTER, [ghostTree], SUN_UP);
    expect(score).toBeCloseTo(1.0);
  });

  it('solid building (opacity=1.0 explicit) scores lower than no occluders', () => {
    const building = makeLargeNorthOccluder(30, 1.0);
    const scoreWith = scorePartialShade(CENTER, [building], SUN_UP);
    const scoreWithout = scorePartialShade(CENTER, [], SUN_UP);
    expect(scoreWith).toBeLessThan(scoreWithout);
  });
});

describe('loadAllOccluders combines buildings and trees', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns building + tree occluders concatenated', async () => {
    const buildingOccluder: Occluder = {
      polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
      height: 10,
    };
    const treeOccluder: Occluder = {
      polygon: [[2, 2], [3, 2], [3, 3], [2, 3]],
      height: 5,
      opacity: 0.6,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('buildings.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ slug: 'test', count: 1, occluders: [buildingOccluder] }),
        });
      }
      if (url.includes('trees.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ slug: 'test', count: 1, occluders: [treeOccluder] }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }) as unknown as typeof fetch;

    const { loadAllOccluders, clearBuildingCache } = await import('../data/loaders');
    clearBuildingCache();

    const result = await loadAllOccluders('test');
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(buildingOccluder);
    expect(result).toContainEqual(treeOccluder);
  });

  it('returns only building occluders when trees.json returns 404', async () => {
    const buildingOccluder: Occluder = {
      polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
      height: 15,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('buildings.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ slug: 'no-trees', count: 1, occluders: [buildingOccluder] }),
        });
      }
      if (url.includes('trees.json')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }) as unknown as typeof fetch;

    const { loadAllOccluders, clearBuildingCache } = await import('../data/loaders');
    clearBuildingCache();

    const result = await loadAllOccluders('no-trees');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(buildingOccluder);
  });
});
