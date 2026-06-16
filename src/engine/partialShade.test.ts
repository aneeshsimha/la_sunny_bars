import { describe, it, expect } from 'vitest';
import {
  sampleGrid,
  scorePartialShade,
  SAMPLE_COUNT,
  PATIO_RADIUS_METERS,
} from './partialShade';
import type { Occluder, SunPosition } from './shadows';
import { METERS_PER_DEG_LAT } from './shadows';

// A point in Silver Lake, LA
const CENTER: [number, number] = [-118.2617, 34.0872];

// Sun clearly above horizon (noon-ish altitude)
const SUN_UP: SunPosition = {
  azimuth: 0,
  altitude: Math.PI / 4, // 45°
};

// Sun below horizon
const SUN_DOWN: SunPosition = {
  azimuth: 0,
  altitude: -0.1,
};

describe('sampleGrid', () => {
  it('returns SAMPLE_COUNT points', () => {
    const pts = sampleGrid(CENTER, PATIO_RADIUS_METERS);
    expect(pts).toHaveLength(SAMPLE_COUNT);
  });

  it('returns exactly 9 points for a 3x3 grid', () => {
    const pts = sampleGrid(CENTER, 5);
    expect(pts).toHaveLength(9);
  });

  it('spreads points around the center', () => {
    const pts = sampleGrid(CENTER, PATIO_RADIUS_METERS);
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    // All lngs and lats should not all be the same
    expect(new Set(lngs).size).toBeGreaterThan(1);
    expect(new Set(lats).size).toBeGreaterThan(1);
    // Center point should be included (row=0, col=0 → offset 0,0)
    expect(pts.some((p) => p[0] === CENTER[0] && p[1] === CENTER[1])).toBe(true);
  });
});

describe('scorePartialShade', () => {
  it('returns 0 when sun is below the horizon', () => {
    const score = scorePartialShade(CENTER, [], SUN_DOWN);
    expect(score).toBe(0);
  });

  it('returns 0 when altitude is exactly 0', () => {
    const sun: SunPosition = { azimuth: 0, altitude: 0 };
    const score = scorePartialShade(CENTER, [], sun);
    expect(score).toBe(0);
  });

  it('returns 1.0 with no occluders and sun up', () => {
    const score = scorePartialShade(CENTER, [], SUN_UP);
    expect(score).toBeCloseTo(1.0);
  });

  it('returns a value in [0, 1] for a point near a building', () => {
    // Build a tall building to the north of CENTER that will cast a shadow south
    // at SUN_UP (azimuth=0 → shadow falls south).
    // Place the building just north of CENTER so all sample points are in shadow.
    const cosLat = Math.cos((CENTER[1] * Math.PI) / 180);
    const buildingHalfSize = 0.0001; // ~11m

    // offset north by ~15m so it's just north of the patio samples
    const northOffset = 15 / METERS_PER_DEG_LAT;

    const buildingOccluder: Occluder = {
      polygon: [
        [CENTER[0] - buildingHalfSize / cosLat, CENTER[1] + northOffset],
        [CENTER[0] + buildingHalfSize / cosLat, CENTER[1] + northOffset],
        [CENTER[0] + buildingHalfSize / cosLat, CENTER[1] + northOffset + buildingHalfSize],
        [CENTER[0] - buildingHalfSize / cosLat, CENTER[1] + northOffset + buildingHalfSize],
      ],
      height: 20, // 20m tall → shadow length = 20 / tan(45°) = 20m
    };

    const score = scorePartialShade(CENTER, [buildingOccluder], SUN_UP);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns a lower score when a large building fully covers the sample grid', () => {
    // A very large building directly above (north of) the venue
    // casting shadow at altitude=45° (shadow length = height)
    // Use a big building height so shadow easily covers ~10m radius
    const cosLat = Math.cos((CENTER[1] * Math.PI) / 180);
    const halfW = 0.001 / cosLat; // wide enough to cover all 9 samples

    // place it 5m north so shadow of a 30m building extends 30m south
    const northOffset = 5 / METERS_PER_DEG_LAT;

    const bigBuilding: Occluder = {
      polygon: [
        [CENTER[0] - halfW, CENTER[1] + northOffset],
        [CENTER[0] + halfW, CENTER[1] + northOffset],
        [CENTER[0] + halfW, CENTER[1] + northOffset + 0.001],
        [CENTER[0] - halfW, CENTER[1] + northOffset + 0.001],
      ],
      height: 30,
    };

    const scoreWith = scorePartialShade(CENTER, [bigBuilding], SUN_UP);
    const scoreWithout = scorePartialShade(CENTER, [], SUN_UP);
    expect(scoreWith).toBeLessThan(scoreWithout);
  });
});
