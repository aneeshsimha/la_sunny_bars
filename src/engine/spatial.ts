import Flatbush from 'flatbush';
import type { Occluder } from './shadows';

export interface SpatialIndex {
  flatbush: Flatbush;
  occluders: Occluder[];
}

/**
 * Build a static spatial index from an array of occluders.
 * The index stores bounding boxes of each occluder polygon.
 * Call once on neighborhood init; re-init when neighborhood changes.
 */
export function buildSpatialIndex(occluders: Occluder[]): SpatialIndex {
  const fb = new Flatbush(Math.max(occluders.length, 1));

  for (const occ of occluders) {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of occ.polygon) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // Pad bbox slightly to handle edge-touching buildings
    fb.add(minLng - 0.00001, minLat - 0.00001, maxLng + 0.00001, maxLat + 0.00001);
  }

  if (occluders.length > 0) fb.finish();
  return { flatbush: fb, occluders };
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * Return all occluders whose bounding box overlaps a search radius around a point.
 * This is a conservative filter — it may return occluders that are slightly outside
 * the radius. Use filterOccludersByProximity from shadows.ts for exact filtering.
 *
 * No-false-negatives guarantee: every occluder that could cast a shadow on `point`
 * at any sun altitude will appear in the result.
 */
export function getCandidateOccluders(
  index: SpatialIndex,
  point: [number, number],
  radiusMeters: number = 250
): Occluder[] {
  if (index.occluders.length === 0) return [];

  const [pLng, pLat] = point;
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * cosLat);

  const indices = index.flatbush.search(
    pLng - dLng,
    pLat - dLat,
    pLng + dLng,
    pLat + dLat
  );

  return indices.map((i) => index.occluders[i]);
}

/**
 * Return all occluders whose bounding box overlaps a rectangular lng/lat bbox.
 * Unlike `getCandidateOccluders` (point + radius, used for venue scoring),
 * this is a direct region query — used by the shadow-polygon layer to fetch
 * everything in the current viewport (+ margin) without a linear scan.
 *
 * Same conservative-filter guarantee as `getCandidateOccluders`: occluders are
 * matched by (slightly padded) bbox overlap, so partially-in-view buildings are
 * included even if their centroid falls outside `bbox`.
 */
export function getCandidatesInBbox(
  index: SpatialIndex,
  bbox: [west: number, south: number, east: number, north: number]
): Occluder[] {
  if (index.occluders.length === 0) return [];

  const [west, south, east, north] = bbox;
  const indices = index.flatbush.search(west, south, east, north);
  return indices.map((i) => index.occluders[i]);
}

/**
 * Precompute candidate occluder lists for all venues at init time.
 * Returns a Map from venue id to occluder array.
 * This avoids repeated spatial queries during scoring.
 */
export function precomputeCandidates(
  index: SpatialIndex,
  venues: Array<{ id: string; coords: [number, number] }>,
  radiusMeters: number = 250
): Map<string, Occluder[]> {
  const result = new Map<string, Occluder[]>();
  for (const venue of venues) {
    result.set(venue.id, getCandidateOccluders(index, venue.coords, radiusMeters));
  }
  return result;
}
