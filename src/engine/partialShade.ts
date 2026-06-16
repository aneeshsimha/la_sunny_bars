import type { Occluder, SunPosition } from './shadows';
import { scoreSunlight, METERS_PER_DEG_LAT } from './shadows';
import { PATIO_RADIUS_METERS, SAMPLE_COUNT } from './constants';

export { PATIO_RADIUS_METERS, SAMPLE_COUNT };

/**
 * Generate a 3x3 grid of sample points around a center coordinate.
 *
 * @param center - [lng, lat] of the venue
 * @param radiusMeters - half-extent of the grid in meters
 * @returns SAMPLE_COUNT [lng, lat] points spread across the grid
 */
export function sampleGrid(
  center: [number, number],
  radiusMeters: number
): [number, number][] {
  const [lng, lat] = center;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * cosLat);

  const points: [number, number][] = [];
  // 3x3 grid: offsets at -1, 0, +1 in each axis
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      points.push([lng + col * dLng, lat + row * dLat]);
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
 */
export function scorePartialShade(
  center: [number, number],
  occluders: Occluder[],
  sun: SunPosition
): number {
  if (sun.altitude <= 0) return 0;

  const samples = sampleGrid(center, PATIO_RADIUS_METERS);
  let total = 0;
  for (const pt of samples) {
    total += scoreSunlight(pt, occluders, sun);
  }
  return total / samples.length;
}
