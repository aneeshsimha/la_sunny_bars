import { describe, it, expect } from 'vitest';
import {
  isPointInSunlight,
  isPointInPolygon,
  computeShadowPolygon,
  scoreSunlight,
  filterOccludersByProximity,
  estimateSkyExposure,
  convexHull,
  METERS_PER_DEG_LAT,
  type Occluder,
  type SunPosition,
} from './shadows';

// ---------------------------------------------------------------------------
// 1. Sun below horizon → always shadow
// ---------------------------------------------------------------------------
describe('isPointInSunlight — sun below horizon', () => {
  it('returns false when sun altitude is negative', () => {
    const sun: SunPosition = { azimuth: 0, altitude: -0.1 };
    expect(isPointInSunlight([0, 0], [], sun)).toBe(false);
  });

  it('returns false when sun altitude is exactly 0', () => {
    const sun: SunPosition = { azimuth: 0, altitude: 0 };
    expect(isPointInSunlight([0, 0], [], sun)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. No occluders → always sunlight when sun is up
// ---------------------------------------------------------------------------
describe('isPointInSunlight — no occluders', () => {
  it('returns true with no buildings', () => {
    const sun: SunPosition = { azimuth: 0, altitude: 0.5 };
    expect(isPointInSunlight([0, 0], [], sun)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Shadow polygon geometry
// Building: [[0,0],[0.001,0],[0.001,0.001],[0,0.001]], height=10m
// Sun: altitude=π/4 (45°), azimuth=0 (due south → shadow goes north)
// Shadow length = 10/tan(π/4) = 10m → dLat = 10/111320 ≈ 0.0000898 degrees
// Shadow tip north edge ≈ 0.001 + 0.0000898 ≈ 0.0010898
// ---------------------------------------------------------------------------
describe('shadow polygon geometry', () => {
  const building: Occluder = {
    polygon: [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
    ],
    height: 10,
  };
  const sun: SunPosition = { azimuth: 0, altitude: Math.PI / 4 };

  it('computes a shadow polygon as the convex hull of footprint + projected vertices', () => {
    // ANS-234: computeShadowPolygon now returns convexHull(footprint ∪
    // projected), not the raw concatenation. For this square + due-north
    // shadow, the projected copy overlaps the footprint's lng range and its
    // lat range only extends past the footprint's north edge, so the two
    // squares' union hull is a single axis-aligned rectangle — 4 vertices,
    // not the old 8 (4 original + 4 projected, which formed a
    // self-intersecting ring — see the "winding fix" describe block below).
    const poly = computeShadowPolygon(building, sun);
    expect(poly).toHaveLength(4);
  });

  it('shadow polygon projects northward', () => {
    const poly = computeShadowPolygon(building, sun);
    const maxLat = Math.max(...poly.map(([, lat]) => lat));
    // Shadow tip should be ~0.0000898 degrees north of building top (0.001)
    const expectedTipLat = 0.001 + 10 / METERS_PER_DEG_LAT;
    expect(maxLat).toBeCloseTo(expectedTipLat, 5);
  });

  it('point in projected shadow strip (north of building) is in shadow', () => {
    // The shadow polygon covers the projected area north of the building.
    // At azimuth=0, altitude=π/4, building top is at lat=0.001,
    // shadow tip is at lat≈0.0010898. [0.0005, 0.00105] is between them.
    expect(isPointInSunlight([0.0005, 0.00105], [building], sun)).toBe(false);
  });

  it('point far north is outside shadow', () => {
    // [0.0005, 0.01] is well beyond the shadow tip (~0.00109)
    expect(isPointInSunlight([0.0005, 0.01], [building], sun)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. filterOccludersByProximity
// ---------------------------------------------------------------------------
describe('filterOccludersByProximity', () => {
  it('returns only near occluder when radius excludes the far one', () => {
    // At lat~0: 1 deg ≈ 111320m
    // Near building centroid ~50m north: dLat ≈ 50/111320 ≈ 0.000449
    // Far building centroid ~500m north: dLat ≈ 500/111320 ≈ 0.00449
    const nearBuilding: Occluder = {
      polygon: [
        [-0.0001, 0.000449],
        [0.0001, 0.000449],
        [0.0001, 0.000549],
        [-0.0001, 0.000549],
      ],
      height: 10,
    };
    const farBuilding: Occluder = {
      polygon: [
        [-0.0001, 0.00449],
        [0.0001, 0.00449],
        [0.0001, 0.00459],
        [-0.0001, 0.00459],
      ],
      height: 10,
    };

    const result = filterOccludersByProximity([0, 0], [nearBuilding, farBuilding], 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(nearBuilding);
  });

  it('returns both occluders when radius is large enough', () => {
    const nearBuilding: Occluder = {
      polygon: [
        [-0.0001, 0.000449],
        [0.0001, 0.000449],
        [0.0001, 0.000549],
        [-0.0001, 0.000549],
      ],
      height: 10,
    };
    const farBuilding: Occluder = {
      polygon: [
        [-0.0001, 0.00449],
        [0.0001, 0.00449],
        [0.0001, 0.00459],
        [-0.0001, 0.00459],
      ],
      height: 10,
    };

    const result = filterOccludersByProximity([0, 0], [nearBuilding, farBuilding], 600);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5. estimateSkyExposure returns value in [0, 1]
// ---------------------------------------------------------------------------
describe('estimateSkyExposure', () => {
  it('returns 1.0 with no occluders', () => {
    expect(estimateSkyExposure([0, 0], [])).toBe(1);
  });

  it('returns value between 0 and 1 with nearby tall building', () => {
    const building: Occluder = {
      polygon: [
        [0.0001, 0.0001],
        [0.0002, 0.0001],
        [0.0002, 0.0002],
        [0.0001, 0.0002],
      ],
      height: 50,
    };
    const score = estimateSkyExposure([0, 0], [building]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores lower when surrounded by many tall buildings', () => {
    const makeBuilding = (lngOffset: number, latOffset: number): Occluder => ({
      polygon: [
        [lngOffset - 0.00005, latOffset - 0.00005],
        [lngOffset + 0.00005, latOffset - 0.00005],
        [lngOffset + 0.00005, latOffset + 0.00005],
        [lngOffset - 0.00005, latOffset + 0.00005],
      ],
      height: 40,
    });
    // Surround the point with 8 tall buildings at ~30m distance
    const offset = 0.0003; // ~33m
    const buildings: Occluder[] = [
      makeBuilding(offset, 0),
      makeBuilding(-offset, 0),
      makeBuilding(0, offset),
      makeBuilding(0, -offset),
      makeBuilding(offset, offset),
      makeBuilding(-offset, offset),
      makeBuilding(offset, -offset),
      makeBuilding(-offset, -offset),
    ];
    const scoreBoxed = estimateSkyExposure([0, 0], buildings);
    const scoreClear = estimateSkyExposure([0, 0], []);
    expect(scoreBoxed).toBeLessThan(scoreClear);
  });
});

// ---------------------------------------------------------------------------
// 6. Opacity: occluder with opacity=0.5 → scoreSunlight returns 0.5
// ---------------------------------------------------------------------------
describe('opacity / scoreSunlight', () => {
  const sun: SunPosition = { azimuth: 0, altitude: Math.PI / 4 };

  // All opacity tests use [0.0005, 0.00105] — a point in the projected shadow
  // strip just north of the building's north edge (lat=0.001).
  const shadowPoint: [number, number] = [0.0005, 0.00105];

  it('opaque building (no opacity) gives score 0 when in shadow', () => {
    const building: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
    };
    expect(scoreSunlight(shadowPoint, [building], sun)).toBe(0.0);
  });

  it('opacity=0.5 occluder gives score 0.5 when point is in its shadow', () => {
    const treeCanopy: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
      opacity: 0.5,
    };
    const score = scoreSunlight(shadowPoint, [treeCanopy], sun);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('opacity=0.2 (<=0.3) occluder casts no shadow — score stays 1.0', () => {
    const thinCanopy: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
      opacity: 0.2,
    };
    const score = scoreSunlight(shadowPoint, [thinCanopy], sun);
    expect(score).toBe(1.0);
  });

  it('multiple occluders: min score wins (most blocking)', () => {
    // One opaque building + one 0.5 opacity canopy, both cover the shadow point
    const opaqueBuilding: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
      opacity: 1.0,
    };
    const partialCanopy: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
      opacity: 0.5,
    };
    const score = scoreSunlight(shadowPoint, [opaqueBuilding, partialCanopy], sun);
    // Opaque wins: score = 0.0
    expect(score).toBe(0.0);
  });

  it('isPointInSunlight skips opacity<=0.3 occluder', () => {
    const thinCanopy: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 10,
      opacity: 0.3,
    };
    // opacity <=0.3 → occluder is skipped → point is in sunlight
    expect(isPointInSunlight(shadowPoint, [thinCanopy], sun)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Receiver elevation (ANS-218 D6) — score a receiver above ground level.
// An occluder can only shade an elevated receiver if occluder.height >
// receiverZ; the effective caster height becomes (occluder.height -
// receiverZ). Omitting receiverZ (or passing 0) must remain byte-identical
// to the pre-D6 ground-level behavior.
// ---------------------------------------------------------------------------
describe('receiver elevation (receiverZ)', () => {
  const building: Occluder = {
    polygon: [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
    ],
    height: 10,
  };
  const sun: SunPosition = { azimuth: 0, altitude: Math.PI / 4 };
  const shadowPoint: [number, number] = [0.0005, 0.00105];

  it('golden: computeShadowPolygon(occluder, sun) === computeShadowPolygon(occluder, sun, 0)', () => {
    const implicit = computeShadowPolygon(building, sun);
    const explicitZero = computeShadowPolygon(building, sun, 0);
    expect(explicitZero).toEqual(implicit);
    // Pin the exact pre-D6 geometry so a regression in the effective-height
    // path can't silently change the ground-level (z=0) result. Length is 4
    // (convex hull of footprint + projected — ANS-234), not the old 8.
    expect(implicit).toHaveLength(4);
    const maxLat = Math.max(...implicit.map(([, lat]) => lat));
    expect(maxLat).toBeCloseTo(0.001 + 10 / METERS_PER_DEG_LAT, 5);
  });

  it('golden: isPointInSunlight and scoreSunlight are unchanged when receiverZ is omitted vs 0', () => {
    expect(isPointInSunlight(shadowPoint, [building], sun, 0)).toBe(
      isPointInSunlight(shadowPoint, [building], sun)
    );
    expect(isPointInSunlight(shadowPoint, [building], sun)).toBe(false);
    expect(scoreSunlight(shadowPoint, [building], sun, 0)).toBe(
      scoreSunlight(shadowPoint, [building], sun)
    );
    expect(scoreSunlight(shadowPoint, [building], sun)).toBe(0.0);
  });

  it('an occluder shorter than the receiver casts no shadow', () => {
    // building height=10, receiver at z=15 → occluder is entirely below the
    // receiver, so it cannot shade it.
    expect(computeShadowPolygon(building, sun, 15)).toEqual([]);
    expect(isPointInSunlight(shadowPoint, [building], sun, 15)).toBe(true);
    expect(scoreSunlight(shadowPoint, [building], sun, 15)).toBe(1.0);
  });

  it('an occluder exactly at the receiver height casts no shadow (at/below rule)', () => {
    expect(computeShadowPolygon(building, sun, 10)).toEqual([]);
    expect(isPointInSunlight(shadowPoint, [building], sun, 10)).toBe(true);
  });

  it('a taller occluder casts a correspondingly shorter shadow on an elevated receiver', () => {
    const tallBuilding: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 20,
    };
    // Full height (z=0): shadow tip at lat ≈ 0.001 + 20/METERS_PER_DEG_LAT ≈ 0.0011797
    // Effective height at receiverZ=10 (20-10=10): tip at ≈ 0.001 + 10/METERS_PER_DEG_LAT ≈ 0.0010898
    const nearPoint: [number, number] = [0.0005, 0.00105]; // inside both shadows
    const farPoint: [number, number] = [0.0005, 0.00115]; // inside full-height shadow only

    expect(isPointInSunlight(nearPoint, [tallBuilding], sun, 0)).toBe(false);
    expect(isPointInSunlight(farPoint, [tallBuilding], sun, 0)).toBe(false);

    // At receiverZ=10 the effective caster height is halved: the near point
    // is still within the (shorter) shadow, but the far point is now sunlit.
    expect(isPointInSunlight(nearPoint, [tallBuilding], sun, 10)).toBe(false);
    expect(isPointInSunlight(farPoint, [tallBuilding], sun, 10)).toBe(true);
  });

  it('acceptance scene: a rooftop above a shorter neighbor reads sunny at low sun where z=0 would be shaded', () => {
    // Neighbor building south of the point, low sun altitude → long shadow
    // reaches ~150m north.
    const neighbor: Occluder = {
      polygon: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
      ],
      height: 15,
    };
    const lowSun: SunPosition = { azimuth: 0, altitude: 0.1 }; // ~5.7°
    const point: [number, number] = [0.0005, 0.0015]; // well within the long low-sun shadow

    // Ground level (z=0): shaded by the 15m neighbor.
    expect(isPointInSunlight(point, [neighbor], lowSun, 0)).toBe(false);
    expect(scoreSunlight(point, [neighbor], lowSun, 0)).toBe(0);

    // Rooftop at z=20 (taller than the 15m neighbor): the neighbor is below
    // the receiver and casts no shadow on it — reads sunny.
    expect(isPointInSunlight(point, [neighbor], lowSun, 20)).toBe(true);
    expect(scoreSunlight(point, [neighbor], lowSun, 20)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 8. Near-field terrain slope via ground elevation (ANS-238)
//
// effectiveHeight = (occluder.baseElev ?? receiverGroundElev) + occluder.height
//                    - (receiverGroundElev + receiverZ)
// Fallback (occluder.baseElev == null OR receiverGroundElev == null):
// effectiveHeight = occluder.height - receiverZ (byte-identical to pre-ANS-238).
//
// Shared scene: 1m x 1m footprint (in degrees) at [0,0]-[0.001,0.001],
// height=10, sun altitude=45deg (tan=1) azimuth=0 (shadow thrown due north).
// Flat-plane shadow tip: 0.001 + 10/METERS_PER_DEG_LAT ≈ 0.0010898311
// ---------------------------------------------------------------------------
describe('near-field terrain slope via ground elevation (ANS-238)', () => {
  const baseBuilding = {
    polygon: [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
    ] as [number, number][],
    height: 10,
  };
  const sun: SunPosition = { azimuth: 0, altitude: Math.PI / 4 };
  const flatTipLat = 0.001 + 10 / METERS_PER_DEG_LAT; // ≈ 0.0010898311

  describe('uphill caster shades a downhill receiver beyond the flat-plane boundary', () => {
    // baseElev=20 (caster 20m uphill of receiver), receiverGroundElev=0.
    // effectiveHeight = (20+10) - (0+0) = 30 (vs flat-plane 10).
    // Elevation-aware tip: 0.001 + 30/METERS_PER_DEG_LAT ≈ 0.0012694934
    const uphillBuilding: Occluder = { ...baseBuilding, baseElev: 20 };
    const upTipLat = 0.001 + 30 / METERS_PER_DEG_LAT; // ≈ 0.0012694934
    // Hand-computed midpoint between the flat-plane and elevation-aware tips —
    // strictly beyond flat-plane shade, strictly within elevation-aware shade.
    const boundaryPoint: [number, number] = [0.0005, (flatTipLat + upTipLat) / 2];

    it('flat-plane model (no groundElev) reads this point as sunlit', () => {
      expect(isPointInSunlight(boundaryPoint, [uphillBuilding], sun, 0)).toBe(true);
      expect(scoreSunlight(boundaryPoint, [uphillBuilding], sun, 0)).toBe(1.0);
    });

    it('elevation-aware model (receiverGroundElev=0) reads this point as shaded', () => {
      expect(isPointInSunlight(boundaryPoint, [uphillBuilding], sun, 0, 0)).toBe(false);
      expect(scoreSunlight(boundaryPoint, [uphillBuilding], sun, 0, 0)).toBe(0.0);
    });
  });

  describe('downhill caster shades less than the flat-plane model', () => {
    // baseElev=-5 (caster 5m downhill of receiver), receiverGroundElev=0.
    // effectiveHeight = (-5+10) - (0+0) = 5 (vs flat-plane 10).
    // Elevation-aware tip: 0.001 + 5/METERS_PER_DEG_LAT ≈ 0.0010449156
    const downhillBuilding: Occluder = { ...baseBuilding, baseElev: -5 };
    const downTipLat = 0.001 + 5 / METERS_PER_DEG_LAT; // ≈ 0.0010449156
    // Hand-computed midpoint between the elevation-aware and flat-plane tips —
    // strictly within flat-plane shade, strictly beyond elevation-aware shade.
    const boundaryPoint: [number, number] = [0.0005, (downTipLat + flatTipLat) / 2];

    it('flat-plane model (no groundElev) reads this point as shaded', () => {
      expect(isPointInSunlight(boundaryPoint, [downhillBuilding], sun, 0)).toBe(false);
      expect(scoreSunlight(boundaryPoint, [downhillBuilding], sun, 0)).toBe(0.0);
    });

    it('elevation-aware model (receiverGroundElev=0) reads this point as sunlit', () => {
      expect(isPointInSunlight(boundaryPoint, [downhillBuilding], sun, 0, 0)).toBe(true);
      expect(scoreSunlight(boundaryPoint, [downhillBuilding], sun, 0, 0)).toBe(1.0);
    });
  });

  describe('null-fallback byte-identity', () => {
    const shadowPoint: [number, number] = [0.0005, 0.00105]; // reused from earlier D6 tests

    it('occluder.baseElev == null falls back exactly, even with a known receiverGroundElev', () => {
      const unmatchedOccluder: Occluder = { ...baseBuilding, baseElev: null };
      const withGroundElev = computeShadowPolygon(unmatchedOccluder, sun, 0, 20);
      const flatPlane = computeShadowPolygon(baseBuilding, sun, 0);
      expect(withGroundElev).toEqual(flatPlane);
      expect(isPointInSunlight(shadowPoint, [unmatchedOccluder], sun, 0, 20)).toBe(
        isPointInSunlight(shadowPoint, [baseBuilding], sun, 0)
      );
      expect(scoreSunlight(shadowPoint, [unmatchedOccluder], sun, 0, 20)).toBe(
        scoreSunlight(shadowPoint, [baseBuilding], sun, 0)
      );
    });

    it('receiverGroundElev == null falls back exactly, even with a known occluder.baseElev', () => {
      const matchedOccluder: Occluder = { ...baseBuilding, baseElev: 20 };
      const withoutGroundElev = computeShadowPolygon(matchedOccluder, sun, 0, null);
      const flatPlane = computeShadowPolygon(baseBuilding, sun, 0);
      expect(withoutGroundElev).toEqual(flatPlane);
      expect(isPointInSunlight(shadowPoint, [matchedOccluder], sun, 0, null)).toBe(
        isPointInSunlight(shadowPoint, [baseBuilding], sun, 0)
      );
      expect(scoreSunlight(shadowPoint, [matchedOccluder], sun, 0, null)).toBe(
        scoreSunlight(shadowPoint, [baseBuilding], sun, 0)
      );
    });

    it('receiverGroundElev omitted (undefined) falls back exactly, same as passing null', () => {
      const matchedOccluder: Occluder = { ...baseBuilding, baseElev: 20 };
      const omitted = computeShadowPolygon(matchedOccluder, sun, 0);
      const explicitNull = computeShadowPolygon(matchedOccluder, sun, 0, null);
      expect(omitted).toEqual(explicitNull);
    });

    it('golden: a Pasadena-like scene (baseElev always null) is unaffected by a passed-through groundElev', () => {
      // Simulates the worker passing a computed venue groundElev into scoring
      // for a withheld-neighborhood occluder set where every baseElev is null.
      const pasadenaOccluders: Occluder[] = [
        { ...baseBuilding, baseElev: null },
        { ...baseBuilding, height: 20, baseElev: null },
      ];
      const withVenueGroundElev = pasadenaOccluders.map((o) =>
        computeShadowPolygon(o, sun, 0, 150)
      );
      const withoutGroundElev = pasadenaOccluders.map((o) => computeShadowPolygon(o, sun, 0));
      expect(withVenueGroundElev).toEqual(withoutGroundElev);
    });
  });
});

// ---------------------------------------------------------------------------
// computeShadowPolygon — winding fix (ANS-234)
//
// The old ring construction `[...polygon, ...projected.reverse()]` is only
// a simple (non-self-intersecting) polygon when the footprint's first/last
// array vertex happen to be the correct tangent points for the sweep
// direction — which isn't true in general. A self-intersecting ring makes
// the ray-cast `isPointInPolygon` test give wrong verdicts for genuinely
// shaded points. The fix replaces the ring with the convex hull of
// (footprint vertices ∪ projected vertices), which is the geometrically
// correct swept shadow region for a convex footprint.
// ---------------------------------------------------------------------------
describe('computeShadowPolygon — winding fix (ANS-234)', () => {
  // Golden test: a triangular footprint whose vertex array order does not
  // match the sweep tangent points for this azimuth. Under the old
  // `[...polygon, ...projected.reverse()]` construction the resulting ring
  // self-intersects so severely that a point directly UNDER the building's
  // own footprint (physically shaded — an opaque roof blocks the sun above
  // it, regardless of azimuth) reads as fully sunlit.
  const triangle: Occluder = {
    polygon: [
      [0, 0],
      [0.001, 0],
      [0, 0.001],
    ],
    height: 10,
  };
  const sun: SunPosition = { azimuth: Math.PI / 4, altitude: Math.PI / 4 };
  // Inside the triangle footprint itself: x + y = 0.0006 < 0.001.
  const underBuilding: [number, number] = [0.0002, 0.0004];

  it('golden: a point directly under the building reads shaded, not sunlit', () => {
    expect(isPointInSunlight(underBuilding, [triangle], sun)).toBe(false);
    expect(scoreSunlight(underBuilding, [triangle], sun)).toBe(0);
  });

  it('the shadow ring contains the footprint (a simple, non-self-intersecting polygon)', () => {
    const poly = computeShadowPolygon(triangle, sun);
    expect(isPointInPolygon(underBuilding, poly)).toBe(true);
  });

  // 8-azimuth correctness: a square occluder, sun cycled through all 8
  // cardinal/intercardinal azimuths. For each azimuth, a point positioned
  // just beyond the footprint's edge in the shadow-throw direction must
  // read shaded, and a point well beyond the opposite (sun-facing) edge
  // must read sunlit.
  describe('8-azimuth correctness (tall occluder, synthetic scene)', () => {
    const half = 0.0005; // footprint half-width, degrees (~55m at the equator)
    const square: Occluder = {
      polygon: [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ],
      height: 20,
    };
    const altitude = Math.PI / 4; // 45°
    // Building centered at lat=0 so lng/lat degrees scale identically
    // (avgLat=0 → metersPerDegLng === METERS_PER_DEG_LAT), keeping the
    // math below direction-symmetric.
    const shadowLengthDeg = 20 / METERS_PER_DEG_LAT;

    const azimuthsDeg = [0, 45, 90, 135, 180, 225, 270, 315];

    for (const deg of azimuthsDeg) {
      it(`azimuth ${deg}°: shadow-throw point is shaded, sun-side point is lit`, () => {
        const az = (deg * Math.PI) / 180;
        const sunAt: SunPosition = { azimuth: az, altitude };
        const dirEast = Math.sin(az);
        const dirNorth = Math.cos(az);

        // The footprint's support point(s) in the shadow direction — i.e.
        // whichever corner(s) are most extreme along (dirEast, dirNorth).
        // Averaging ties (e.g. two corners sharing an edge, at axis-aligned
        // azimuths) yields the edge midpoint, keeping the test point off
        // any hull boundary line.
        let bestDot = -Infinity;
        for (const [x, y] of square.polygon) {
          const dot = x * dirEast + y * dirNorth;
          if (dot > bestDot) bestDot = dot;
        }
        const eps = 1e-9;
        const tied = square.polygon.filter(
          ([x, y]) => Math.abs(x * dirEast + y * dirNorth - bestDot) < eps
        );
        const supportX = tied.reduce((s, [x]) => s + x, 0) / tied.length;
        const supportY = tied.reduce((s, [, y]) => s + y, 0) / tied.length;

        // Halfway from the support point to its shadow-projected copy:
        // strictly beyond the footprint's own edge, strictly within the
        // hull (verified by direct convex-hull computation for this
        // symmetric square scene at each of these 8 azimuths).
        const shadedPoint: [number, number] = [
          supportX + (dirEast * shadowLengthDeg) / 2,
          supportY + (dirNorth * shadowLengthDeg) / 2,
        ];

        // Far on the opposite (sun-facing) side: the hull never extends
        // beyond the footprint's own edge on that side, so this is
        // guaranteed outside the hull for every azimuth.
        const sunlitPoint: [number, number] = [
          -dirEast * 0.001,
          -dirNorth * 0.001,
        ];

        expect(scoreSunlight(shadedPoint, [square], sunAt)).toBe(0);
        expect(scoreSunlight(sunlitPoint, [square], sunAt)).toBe(1);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// convexHull — exported helper (ANS-234)
// ---------------------------------------------------------------------------
describe('convexHull', () => {
  it('collapses collinear points to their two extreme endpoints', () => {
    const points: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3]];
    expect(convexHull(points)).toEqual([[0, 0], [3, 3]]);
  });

  it('removes duplicate points', () => {
    const points: [number, number][] = [[0, 0], [0, 0], [1, 0], [0, 1]];
    expect(convexHull(points)).toEqual([[0, 0], [1, 0], [0, 1]]);
  });

  it('returns all 3 vertices of a triangle', () => {
    const points: [number, number][] = [[0, 0], [4, 0], [0, 4]];
    expect(convexHull(points)).toEqual([[0, 0], [4, 0], [0, 4]]);
  });

  it('returns all 4 vertices of a square (no interior points to drop)', () => {
    const points: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(convexHull(points)).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });

  it('drops a point strictly inside the hull', () => {
    const points: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2], // interior — not a hull vertex
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([2, 2]);
  });

  it('degenerate: empty input returns empty', () => {
    expect(convexHull([])).toEqual([]);
  });

  it('degenerate: single point returns that point', () => {
    expect(convexHull([[1, 1]])).toEqual([[1, 1]]);
  });

  it('degenerate: two distinct points returns both, unchanged', () => {
    expect(convexHull([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });

  it('degenerate: fewer than 3 unique points after dedup returns the unique set', () => {
    // 3 array entries, but only 2 distinct points.
    expect(convexHull([[0, 0], [1, 1], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });
});

// ---------------------------------------------------------------------------
// isPointInPolygon — exported helper
// ---------------------------------------------------------------------------
describe('isPointInPolygon', () => {
  it('returns true for point inside a simple square', () => {
    const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(isPointInPolygon([0.5, 0.5], square)).toBe(true);
  });

  it('returns false for point outside', () => {
    const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(isPointInPolygon([2, 2], square)).toBe(false);
  });

  it('returns false for degenerate polygon (< 3 vertices)', () => {
    expect(isPointInPolygon([0, 0], [[0, 0], [1, 1]])).toBe(false);
  });
});
