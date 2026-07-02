// Shadow calculation engine — ported from src/lib/shadows.ts.
// Replaces BuildingFootprint with Occluder (adds opacity for trees/canopies).
// src/lib/shadows.ts is preserved for the existing app until cutover (ANS-102).

// --- Types ---

export interface Occluder {
  polygon: [number, number][]; // [lng, lat] vertices of footprint
  height: number; // height in meters
  opacity?: number; // 1.0 = solid building; <1.0 = tree canopy, attenuates shadow
  heightSource?: 'measured' | 'levels' | 'default'; // provenance of `height`, if known (ANS-213 B9)
  baseElev?: number | null; // ground elevation in meters, from LARIAC ELEV when matched (ANS-235); null if unmatched
}

export interface SunPosition {
  azimuth: number; // radians, 0 = south, positive = west (suncalc convention)
  altitude: number; // radians, angle above horizon
}

// --- Constants ---

// Approximate meters per degree of latitude (Earth circumference / 360)
export const METERS_PER_DEG_LAT = 111_320;

// --- Core Functions ---

/**
 * Determine whether a point is in sunlight given nearby occluders and sun position.
 * Returns true if in sunlight, false if in shadow.
 *
 * Opacity rules:
 *   - opacity <= 0.3: occluder is too transparent to cast a blocking shadow — skip.
 *   - 0.3 < opacity < 1: treated as fully opaque (conservative).
 *   - opacity === 1 (or undefined): fully opaque.
 *
 * `receiverZ` (meters, default 0) is the receiver's elevation above ground
 * (e.g. a rooftop patio's height); see `computeShadowPolygon` (ANS-218 D6).
 */
export function isPointInSunlight(
  point: [number, number], // [lng, lat]
  occluders: Occluder[],
  sun: SunPosition,
  receiverZ: number = 0
): boolean {
  // Sun below or at the horizon — everything is in shadow
  if (sun.altitude <= 0) return false;

  for (const occluder of occluders) {
    const opacity = occluder.opacity ?? 1.0;
    // Very transparent occluders do not block sun at all
    if (opacity <= 0.3) continue;

    const shadowPoly = computeShadowPolygon(occluder, sun, receiverZ);
    if (isPointInPolygon(point, shadowPoly)) {
      return false;
    }
  }

  return true;
}

/**
 * Compute the shadow polygon cast by an occluder given a sun position, as
 * seen by a receiver at elevation `receiverZ` meters above ground (default
 * 0 = ground level).
 *
 * The ground shadow of a footprint extruded to height `h` is the region
 * swept between the footprint and its ground-projected copy (each vertex
 * pushed along the ground in the direction opposite the sun). For a convex
 * footprint that region is exactly the convex hull of (footprint vertices ∪
 * projected vertices) — computed via `convexHull` (ANS-234). The resulting
 * ring is OPEN (not closed back to its first vertex); callers close it
 * (e.g. `shadowLayer.ts` does `[...ring, ring[0]]`) and `isPointInPolygon`
 * handles open rings.
 *
 * Non-convex footprints: the hull can slightly OVER-cover (mark a bit more
 * ground as shaded than the true swept region) since it fills in the
 * footprint's own concavities. That's acceptable and conservative — it
 * never misses real shade, it can only over-report it.
 *
 * An occluder can only shade a receiver above ground if part of it rises
 * above the receiver's elevation; the effective caster height used for the
 * projection is `occluder.height - receiverZ` (ANS-218 D6). Occluders at or
 * below the receiver (effective height <= 0) cast no shadow on it. Omitting
 * `receiverZ` (or passing 0) is byte-identical to the pre-D6 ground-level
 * behavior.
 *
 * TODO(D6 follow-up): near-field terrain slope (ground elevation under the
 * receiver/occluders) is not modeled — `receiverZ` currently only accounts
 * for a venue's own elevation (e.g. rooftop height), not sloped streets.
 * Wiring in real ground-elevation deltas needs a DEM (USGS 3DEP/SRTM), which
 * is not in the repo and requires a network fetch — deferred to a future
 * ticket.
 */
export function computeShadowPolygon(
  occluder: Occluder,
  sun: SunPosition,
  receiverZ: number = 0
): [number, number][] {
  // Sun at or below horizon: shadow extends infinitely — return empty polygon.
  if (sun.altitude <= 0) return [];

  const { polygon, height } = occluder;
  if (polygon.length === 0) return [];

  // Effective caster height as seen by a receiver at `receiverZ`. An occluder
  // at or below the receiver casts no shadow on it.
  const effectiveHeight = height - receiverZ;
  if (effectiveHeight <= 0) return [];

  // Shadow length on the ground in meters.
  const shadowLengthMeters = effectiveHeight / Math.tan(sun.altitude);

  // Shadow direction: opposite the sun azimuth.
  // suncalc: azimuth 0 = south, positive = west (clockwise from south).
  // Shadow falls away from the sun:
  //   shadow_dir = (sin(azimuth), cos(azimuth))  [east, north]
  const shadowDirEast = Math.sin(sun.azimuth);
  const shadowDirNorth = Math.cos(sun.azimuth);

  // Average latitude for lng → meters conversion.
  const avgLat =
    polygon.reduce((sum, v) => sum + v[1], 0) / polygon.length;

  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((avgLat * Math.PI) / 180);
  const dLng = (shadowDirEast * shadowLengthMeters) / metersPerDegLng;
  const dLat = (shadowDirNorth * shadowLengthMeters) / METERS_PER_DEG_LAT;

  // Project each vertex to get the far edge of the shadow.
  const projected: [number, number][] = polygon.map(([lng, lat]) => [
    lng + dLng,
    lat + dLat,
  ]);

  // Build the shadow polygon as the convex hull of footprint + projected
  // vertices (see function doc for why — ANS-234).
  return convexHull([...polygon, ...projected]);
}

/**
 * Convex hull of a set of 2D points via Andrew's monotone chain
 * (exported for testing). Points are sorted lexicographically, duplicate
 * points are removed, and collinear points along an edge are dropped (only
 * the extreme points of each collinear run are kept). Returns an OPEN ring
 * (no repeated first/last point) — 0, 1, or 2 points if fewer than 3
 * distinct points are given.
 */
export function convexHull(points: [number, number][]): [number, number][] {
  const uniqueByKey = new Map<string, [number, number]>();
  for (const p of points) uniqueByKey.set(`${p[0]},${p[1]}`, p);
  const sorted = [...uniqueByKey.values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );

  if (sorted.length < 3) return sorted;

  // Cross product of (o->a) x (o->b); > 0 means a->b turns left (CCW) around o.
  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number]
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Each of lower/upper ends with the other's starting point — drop that dupe.
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Sunlight score for a point: 0.0 (full shadow) to 1.0 (full sun).
 *
 * Opacity-aware: if a point is in the shadow of an occluder with opacity < 1,
 * the score contribution is (1 - opacity) rather than 0. When the point is in
 * shadow of multiple occluders, the most-blocking one (lowest score) wins.
 *
 * Opacity rules for shadow contribution:
 *   - opacity <= 0.3: occluder casts no shadow — score stays 1.0.
 *   - 0.3 < opacity < 1: partial shadow → score = (1 - opacity).
 *   - opacity >= 1 (or undefined): full shadow → score = 0.0.
 *
 * `receiverZ` (meters, default 0) is the receiver's elevation above ground
 * (e.g. a rooftop patio's height); see `computeShadowPolygon` (ANS-218 D6).
 */
export function scoreSunlight(
  point: [number, number],
  occluders: Occluder[],
  sun: SunPosition,
  receiverZ: number = 0
): number {
  if (sun.altitude <= 0) return 0.0;

  let minScore = 1.0;

  for (const occluder of occluders) {
    const opacity = occluder.opacity ?? 1.0;
    // Very transparent: no shadow contribution
    if (opacity <= 0.3) continue;

    const shadowPoly = computeShadowPolygon(occluder, sun, receiverZ);
    if (isPointInPolygon(point, shadowPoly)) {
      const score = opacity >= 1.0 ? 0.0 : 1.0 - opacity;
      if (score < minScore) minScore = score;
    }
  }

  return minScore;
}

/**
 * Estimate how open the sky feels from a venue based on nearby occluder height,
 * distance, and direction around the point.
 *
 * Score: 1.0 = mostly open sky, 0.0 = boxed in by tall nearby structures.
 */
export function estimateSkyExposure(
  point: [number, number],
  occluders: Occluder[],
  radiusMeters: number = 180,
  sectorCount: number = 12
): number {
  if (occluders.length === 0) return 1;

  const [pLng, pLat] = point;
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const sectorObstruction = new Array(sectorCount).fill(0);

  for (const occluder of occluders) {
    const centroid = computePolygonCentroid(occluder.polygon);
    if (!centroid) continue;

    const [cLng, cLat] = centroid;
    const eastMeters = (cLng - pLng) * METERS_PER_DEG_LAT * cosLat;
    const northMeters = (cLat - pLat) * METERS_PER_DEG_LAT;
    const distance = Math.hypot(eastMeters, northMeters);

    if (distance === 0 || distance > radiusMeters * 1.35) continue;

    const angle = Math.atan2(northMeters, eastMeters);
    const sectorIndex = Math.min(
      sectorCount - 1,
      Math.floor(((angle + Math.PI) / (Math.PI * 2)) * sectorCount)
    );

    const elevationAngle = Math.atan2(Math.max(occluder.height, 1), distance);
    const normalizedElevation = Math.min(elevationAngle / (Math.PI / 3), 1);
    const proximityWeight = Math.max(0.2, 1 - distance / (radiusMeters * 1.35));
    const obstruction = normalizedElevation * proximityWeight;

    sectorObstruction[sectorIndex] = Math.max(
      sectorObstruction[sectorIndex],
      obstruction
    );
  }

  const averageObstruction =
    sectorObstruction.reduce((sum, value) => sum + value, 0) / sectorCount;

  return clamp01(1 - averageObstruction);
}

/**
 * Filter occluders to only those within `radiusMeters` of the point.
 * Uses a cheap centroid bounding-box prefilter.
 *
 * Rationale: a 50 m tall building at a low 15° sun altitude casts a shadow
 * ~186 m long, so a 200 m radius is a reasonable default cutoff.
 */
export function filterOccludersByProximity(
  point: [number, number], // [lng, lat]
  occluders: Occluder[],
  radiusMeters: number = 200
): Occluder[] {
  const [pLng, pLat] = point;
  const cosLat = Math.cos((pLat * Math.PI) / 180);

  const dLatMax = radiusMeters / METERS_PER_DEG_LAT;
  const dLngMax = radiusMeters / (METERS_PER_DEG_LAT * cosLat);

  return occluders.filter((o) => {
    const n = o.polygon.length;
    if (n === 0) return false;
    let cLng = 0;
    let cLat = 0;
    for (const [lng, lat] of o.polygon) {
      cLng += lng;
      cLat += lat;
    }
    cLng /= n;
    cLat /= n;

    return (
      Math.abs(cLat - pLat) <= dLatMax && Math.abs(cLng - pLng) <= dLngMax
    );
  });
}

// --- Internal Helpers ---

/**
 * Ray-casting point-in-polygon test (exported for testing).
 * Casts a ray from the point in the +x (east) direction and counts edge crossings.
 */
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;

  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function computePolygonCentroid(
  polygon: [number, number][]
): [number, number] | null {
  if (polygon.length === 0) return null;

  let lng = 0;
  let lat = 0;
  for (const [vertexLng, vertexLat] of polygon) {
    lng += vertexLng;
    lat += vertexLat;
  }

  return [lng / polygon.length, lat / polygon.length];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
