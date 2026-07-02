/**
 * LARIAC LiDAR measured-height matching (ANS-235).
 *
 * Pure logic extracted so it can be unit-tested without a live ArcGIS
 * FeatureServer call. Orchestration (paginated fetch, Flatbush candidate
 * lookup, reading/writing buildings.json) lives in
 * `pipeline/augment-lariac-heights.ts`.
 *
 * UNITS: LARIAC's `HEIGHT` and `ELEV` fields are in FEET (verified against
 * US Bank Tower: HEIGHT=1016.83, i.e. its known 1018ft height). Everything
 * in this module converts feet -> meters via FEET_TO_METERS.
 */

// Approximate meters per degree of latitude (Earth circumference / 360).
// Same constant used throughout the pipeline (pipeline/linkBuildings.ts,
// src/engine/shadows.ts) for local east/north meter conversions.
const METERS_PER_DEG_LAT = 111_320;

export const FEET_TO_METERS = 0.3048;

// Match rule threshold: an occluder footprint centroid must have a LARIAC
// centroid within this many meters to be considered "measured" (per the
// ANS-235 brief).
export const MATCH_RADIUS_METERS = 20;

/** Convert a LARIAC HEIGHT/ELEV value (feet) to meters. */
export function feetToMeters(feet: number): number {
  return feet * FEET_TO_METERS;
}

/** A LARIAC building record: centroid (lng/lat, EPSG:4326) + raw feet values. */
export interface LariacRecord {
  lng: number;
  lat: number;
  heightFt: number;
  elevFt: number;
}

export interface LariacMatch {
  heightMeters: number;
  baseElevMeters: number;
  distanceMeters: number;
}

/** Average of polygon vertices — same simple centroid used by pipeline/linkBuildings.ts. */
export function polygonCentroid(polygon: [number, number][]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const [vertexLng, vertexLat] of polygon) {
    lng += vertexLng;
    lat += vertexLat;
  }
  return [lng / polygon.length, lat / polygon.length];
}

/**
 * Find the nearest LARIAC candidate to `centroid` (an occluder footprint
 * centroid), among a pre-filtered candidate list, within `radiusMeters`.
 * Distance is computed in local east/north meters using METERS_PER_DEG_LAT
 * + a cos(lat) correction for longitude (consistent with the rest of the
 * pipeline's lng/lat -> meters conversions).
 *
 * Returns null if `candidates` is empty or the nearest one is farther than
 * `radiusMeters`.
 */
export function findNearestLariacMatch(
  centroid: [number, number],
  candidates: LariacRecord[],
  radiusMeters: number
): LariacMatch | null {
  const cosLat = Math.cos((centroid[1] * Math.PI) / 180);

  let best: LariacRecord | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const eastMeters = (candidate.lng - centroid[0]) * METERS_PER_DEG_LAT * cosLat;
    const northMeters = (candidate.lat - centroid[1]) * METERS_PER_DEG_LAT;
    const dist = Math.hypot(eastMeters, northMeters);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  if (!best || bestDist > radiusMeters) return null;

  return {
    heightMeters: feetToMeters(best.heightFt),
    baseElevMeters: feetToMeters(best.elevFt),
    distanceMeters: bestDist,
  };
}
