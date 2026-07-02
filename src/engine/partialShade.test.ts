import { describe, it, expect } from 'vitest';
import {
  sampleGrid,
  scorePartialShade,
  facadeBiasOffsetMeters,
  SAMPLE_COUNT,
  PATIO_RADIUS_METERS,
} from './partialShade';
import { ORIENTATION_BIAS_METERS } from './constants';
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

describe('facadeBiasOffsetMeters', () => {
  it('returns null for an empty facadeAzimuths array', () => {
    expect(facadeBiasOffsetMeters([])).toBeNull();
  });

  it('points north (0 east, +bias north) for a north-facing facade (azimuth 0)', () => {
    const offset = facadeBiasOffsetMeters([0]);
    expect(offset).not.toBeNull();
    expect(offset!.east).toBeCloseTo(0);
    expect(offset!.north).toBeCloseTo(ORIENTATION_BIAS_METERS);
  });

  it('points south (0 east, -bias north) for a south-facing facade (azimuth 180)', () => {
    const offset = facadeBiasOffsetMeters([180]);
    expect(offset).not.toBeNull();
    expect(offset!.east).toBeCloseTo(0);
    expect(offset!.north).toBeCloseTo(-ORIENTATION_BIAS_METERS);
  });

  it('points east (+bias east, 0 north) for an east-facing facade (azimuth 90)', () => {
    const offset = facadeBiasOffsetMeters([90]);
    expect(offset).not.toBeNull();
    expect(offset!.east).toBeCloseTo(ORIENTATION_BIAS_METERS);
    expect(offset!.north).toBeCloseTo(0);
  });

  it('averages multiple azimuths via a circular (vector) mean', () => {
    // 0 and 90 should average to a NE-pointing vector, not a naive arithmetic
    // mean's due-east direction and not an unnormalized sum either.
    const offset = facadeBiasOffsetMeters([0, 90]);
    expect(offset).not.toBeNull();
    expect(offset!.east).toBeGreaterThan(0);
    expect(offset!.north).toBeGreaterThan(0);
    expect(offset!.east).toBeCloseTo(offset!.north);
    // magnitude should still equal the configured bias distance
    expect(Math.hypot(offset!.east, offset!.north)).toBeCloseTo(ORIENTATION_BIAS_METERS);
  });

  it('returns null when opposing facades cancel out (no clear direction)', () => {
    expect(facadeBiasOffsetMeters([0, 180])).toBeNull();
  });
});

describe('sampleGrid with orientation', () => {
  it('is unchanged when orientation is omitted (symmetric fallback, golden)', () => {
    const withoutOrientation = sampleGrid(CENTER, PATIO_RADIUS_METERS);
    const withEmptyAzimuths = sampleGrid(CENTER, PATIO_RADIUS_METERS, { facadeAzimuths: [] });
    expect(withEmptyAzimuths).toEqual(withoutOrientation);
  });

  it('shifts every sample point north when facing north (azimuth 0)', () => {
    const base = sampleGrid(CENTER, PATIO_RADIUS_METERS);
    const oriented = sampleGrid(CENTER, PATIO_RADIUS_METERS, { facadeAzimuths: [0] });
    for (let i = 0; i < base.length; i++) {
      expect(oriented[i][0]).toBeCloseTo(base[i][0]); // lng unchanged
      expect(oriented[i][1]).toBeGreaterThan(base[i][1]); // lat shifted north
    }
  });

  it('shifts every sample point south when facing south (azimuth 180)', () => {
    const base = sampleGrid(CENTER, PATIO_RADIUS_METERS);
    const oriented = sampleGrid(CENTER, PATIO_RADIUS_METERS, { facadeAzimuths: [180] });
    for (let i = 0; i < base.length; i++) {
      expect(oriented[i][0]).toBeCloseTo(base[i][0]);
      expect(oriented[i][1]).toBeLessThan(base[i][1]);
    }
  });
});

describe('scorePartialShade with orientation (symmetric fallback golden test)', () => {
  it('produces byte-identical scores whether orientation is omitted or facadeAzimuths is empty', () => {
    const cosLat = Math.cos((CENTER[1] * Math.PI) / 180);
    const occluder: Occluder = {
      polygon: [
        [CENTER[0] - 0.0005 / cosLat, CENTER[1] + 0.0001],
        [CENTER[0] + 0.0005 / cosLat, CENTER[1] + 0.0001],
        [CENTER[0] + 0.0005 / cosLat, CENTER[1] + 0.0002],
        [CENTER[0] - 0.0005 / cosLat, CENTER[1] + 0.0002],
      ],
      height: 20,
    };

    const withoutOrientation = scorePartialShade(CENTER, [occluder], SUN_UP);
    const withEmptyOrientation = scorePartialShade(CENTER, [occluder], SUN_UP, {
      facadeAzimuths: [],
    });

    expect(withEmptyOrientation).toBe(withoutOrientation);
  });
});

describe('scorePartialShade acceptance: N-facing vs S-facing patio on the same building', () => {
  // A building "wall" sits north of the venue's raw OSM point, spanning
  // latitudes [bandSouthMeters, bandNorthMeters] (relative to CENTER). A
  // north-facing patio (facadeAzimuths=[0]) biases the grid toward/into that
  // band; a south-facing patio (facadeAzimuths=[180]) biases the grid away
  // from it entirely (south rows top out well below bandSouthMeters), so the
  // two must diverge materially.
  //
  // The building's east-west edge is placed deliberately: `computeShadowPolygon`
  // builds the shadow as [footprint, ...projected.reverse()], which only
  // yields a vertical boundary edge at each rectangle's *east* edge (not its
  // west edge) — so a point is only reliably detected as "in shadow" when its
  // longitude falls within the shift-magnitude-wide strip between the
  // footprint's east edge and the projected footprint's east edge, not
  // anywhere in the footprint's full width. Placing the footprint's east edge
  // just beyond the sample grid's east column (for a west-falling morning
  // shadow) or just west of the grid's west column (for an east-falling
  // evening shadow) keeps every sample column inside that reliable strip.
  const cosLat = Math.cos((CENTER[1] * Math.PI) / 180);
  const metersToDLat = (m: number) => m / METERS_PER_DEG_LAT;
  const metersToDLng = (m: number) => m / (METERS_PER_DEG_LAT * cosLat);

  const bandSouthMeters = 5; // > max south-biased row (2m), excludes south grid entirely
  const bandNorthMeters = 25; // > max north-biased row (18m), covers both affected north rows

  function buildingWithEastEdge(eastEdgeMeters: number, widthMeters: number): Occluder {
    const eastLng = CENTER[0] + metersToDLng(eastEdgeMeters);
    const westLng = CENTER[0] + metersToDLng(eastEdgeMeters - widthMeters);
    return {
      polygon: [
        [westLng, CENTER[1] + metersToDLat(bandSouthMeters)],
        [eastLng, CENTER[1] + metersToDLat(bandSouthMeters)],
        [eastLng, CENTER[1] + metersToDLat(bandNorthMeters)],
        [westLng, CENTER[1] + metersToDLat(bandNorthMeters)],
      ],
      height: 15,
    };
  }

  // Low morning sun: sun due east, low altitude (suncalc convention: azimuth
  // 0 = south, positive = west, so due east is -PI/2). Shadow falls west.
  const LOW_MORNING_SUN: SunPosition = { azimuth: -Math.PI / 2, altitude: 0.15 };
  // Low evening sun: sun due west, low altitude. Shadow falls east.
  const LOW_EVENING_SUN: SunPosition = { azimuth: Math.PI / 2, altitude: 0.15 };

  it('diverges materially at low morning sun', () => {
    const building = buildingWithEastEdge(15, 4); // east edge past the grid's east column
    const northFacing = scorePartialShade(CENTER, [building], LOW_MORNING_SUN, {
      facadeAzimuths: [0],
    });
    const southFacing = scorePartialShade(CENTER, [building], LOW_MORNING_SUN, {
      facadeAzimuths: [180],
    });
    expect(southFacing - northFacing).toBeGreaterThan(0.3);
  });

  it('diverges materially at low evening sun', () => {
    const building = buildingWithEastEdge(-15, 4); // east edge before the grid's west column
    const northFacing = scorePartialShade(CENTER, [building], LOW_EVENING_SUN, {
      facadeAzimuths: [0],
    });
    const southFacing = scorePartialShade(CENTER, [building], LOW_EVENING_SUN, {
      facadeAzimuths: [180],
    });
    expect(southFacing - northFacing).toBeGreaterThan(0.3);
  });
});
