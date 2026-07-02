import type { Occluder, SunPosition } from './shadows';
import { scoreSunlight, METERS_PER_DEG_LAT } from './shadows';
import { PATIO_RADIUS_METERS, SAMPLE_COUNT, ORIENTATION_BIAS_METERS } from './constants';

export { PATIO_RADIUS_METERS, SAMPLE_COUNT };

/**
 * Known street-facing/open-side orientation for a venue's patio (ANS-217 D5).
 * `facadeAzimuths` are the outward-normal compass azimuths (degrees, 0 = N
 * clockwise) of the building footprint edges nearest the venue, as populated
 * by B10 (`VenueFeature.facadeAzimuths`). Empty = orientation unknown; the
 * symmetric grid is used as a fallback.
 */
export interface PatioOrientation {
  facadeAzimuths: number[];
}

/**
 * Options for `scorePartialShade`: D5's patio orientation plus D6's receiver
 * elevation (ANS-218 D6).
 */
export interface ScorePartialShadeOptions extends PatioOrientation {
  /**
   * Receiver elevation in meters above ground (default 0 = ground level).
   * Used to score rooftop patios at their real elevation instead of ground
   * level, so occluders shorter than the receiver don't spuriously shade it
   * (see `scoreSunlight` / `computeShadowPolygon` in `shadows.ts`).
   */
  receiverZ?: number;
}

/**
 * Convert a venue's facade azimuths into a ground-plane [east, north] offset
 * (in meters) that biases the sample grid toward the mean street-facing
 * direction. Returns null when orientation is unknown (empty array) or when
 * multiple facades cancel out (e.g. azimuths on opposite sides average to no
 * clear direction) — callers should fall back to the symmetric grid in both
 * cases.
 *
 * Uses a circular (vector) mean rather than an arithmetic mean of the
 * azimuths so wraparound (e.g. 350° and 10°) averages correctly.
 */
export function facadeBiasOffsetMeters(
  facadeAzimuths: number[]
): { east: number; north: number } | null {
  if (facadeAzimuths.length === 0) return null;

  let sumEast = 0;
  let sumNorth = 0;
  for (const azimuthDeg of facadeAzimuths) {
    const rad = (azimuthDeg * Math.PI) / 180;
    sumEast += Math.sin(rad);
    sumNorth += Math.cos(rad);
  }

  const magnitude = Math.hypot(sumEast, sumNorth);
  // Treat near-zero magnitude as "no clear direction" (opposing facades
  // cancel out). Uses an epsilon rather than a strict ===0 check because
  // trig on `Math.PI`-derived radians (e.g. azimuths 0 and 180) doesn't
  // cancel to exactly zero due to floating-point error.
  if (magnitude < 1e-9) return null;

  return {
    east: (sumEast / magnitude) * ORIENTATION_BIAS_METERS,
    north: (sumNorth / magnitude) * ORIENTATION_BIAS_METERS,
  };
}

/**
 * Generate a 3x3 grid of sample points around a center coordinate.
 *
 * When `orientation.facadeAzimuths` is non-empty, the grid center is shifted
 * toward the mean facade direction (see `facadeBiasOffsetMeters`) before the
 * symmetric offsets are applied, biasing samples toward the likely patio
 * side rather than sampling symmetrically around the raw venue point (which
 * is typically a door/centroid, not the seating area).
 *
 * @param center - [lng, lat] of the venue
 * @param radiusMeters - half-extent of the grid in meters
 * @param orientation - optional known patio orientation
 * @returns SAMPLE_COUNT [lng, lat] points spread across the grid
 */
export function sampleGrid(
  center: [number, number],
  radiusMeters: number,
  orientation?: PatioOrientation
): [number, number][] {
  const [lng, lat] = center;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * cosLat);

  let centerLng = lng;
  let centerLat = lat;
  const bias = orientation ? facadeBiasOffsetMeters(orientation.facadeAzimuths) : null;
  if (bias) {
    centerLat += bias.north / METERS_PER_DEG_LAT;
    centerLng += bias.east / (METERS_PER_DEG_LAT * cosLat);
  }

  const points: [number, number][] = [];
  // 3x3 grid: offsets at -1, 0, +1 in each axis
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      points.push([centerLng + col * dLng, centerLat + row * dLat]);
    }
  }

  return points;
}

/**
 * Score partial shade for a venue by sampling a 3x3 grid within PATIO_RADIUS_METERS.
 *
 * Returns a continuous 0–1 value where:
 *   0 = all sample points in full shadow (or sun below horizon)
 *   1 = all sample points in full sunlight
 *
 * @param center - [lng, lat] of the venue
 * @param occluders - nearby occluder geometries
 * @param sun - current sun position
 * @param options - optional known patio orientation (ANS-217 D5) and receiver
 *   elevation (ANS-218 D6). When orientation is omitted or `facadeAzimuths`
 *   is empty, samples symmetrically as before. When `receiverZ` is omitted
 *   (or 0), scores at ground level as before.
 */
export function scorePartialShade(
  center: [number, number],
  occluders: Occluder[],
  sun: SunPosition,
  options?: ScorePartialShadeOptions
): number {
  if (sun.altitude <= 0) return 0;

  const samples = sampleGrid(center, PATIO_RADIUS_METERS, options);
  const receiverZ = options?.receiverZ ?? 0;
  let total = 0;
  for (const pt of samples) {
    total += scoreSunlight(pt, occluders, sun, receiverZ);
  }
  return total / samples.length;
}
