// Shared ground-shadow projection pipeline (ANS-237).
//
// This is the SINGLE implementation of "occluders + sun + viewport bounds +
// zoom + cap -> visible shadow polygons", used by BOTH:
//   - the main-thread shadow layer (src/map/layers/shadowLayer.ts), and
//   - the scoring worker's `shadow` handler (src/worker/scoring.worker.ts).
// Keeping this logic in one place means the two paths can never disagree —
// there's nothing to duplicate/drift.

import { computeShadowPolygon, type Occluder, type SunPosition } from './shadows';
import { getCandidatesInBbox, type SpatialIndex } from './spatial';

/** [west, south, east, north] */
export type MapBounds = [number, number, number, number];

export type ShadowFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon>;

export function emptyShadowCollection(): ShadowFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function centroidOf(polygon: [number, number][]): [number, number] | null {
  const n = polygon.length;
  if (n === 0) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of polygon) {
    lng += x;
    lat += y;
  }
  return [lng / n, lat / n];
}

// Shadow-polygon render cap, by zoom band (lowest qualifying `minZoom` wins).
// Zoomed way out, the viewport spans many buildings whose ground shadows are
// tiny on screen, so we cap harder to keep projection fast. Zoomed in, the
// in-view count is naturally small, so we allow more (effectively "no cap"
// for typical street-level views).
const SHADOW_CAP_BANDS: ReadonlyArray<{ minZoom: number; cap: number }> = [
  { minZoom: 17, cap: 5000 },
  { minZoom: 15, cap: 3000 },
  { minZoom: 13, cap: 1500 },
  { minZoom: 0, cap: 600 },
];

/** Resolve the shadow-casting cap for a given map zoom level. */
export function capForZoom(zoom: number): number {
  for (const band of SHADOW_CAP_BANDS) {
    if (zoom >= band.minZoom) return band.cap;
  }
  return SHADOW_CAP_BANDS[SHADOW_CAP_BANDS.length - 1].cap;
}

/**
 * Choose which in-view occluders get shadow polygons this frame.
 *
 * When `candidates` exceeds the cap, keep the TALLEST casters — height is the
 * dominant term in shadow length, so tall buildings cast the shadows that
 * matter most. Selection deliberately does NOT depend on distance to the
 * viewport center: at a fixed zoom, panning changes which buildings show up in
 * `candidates`, but never re-ranks two buildings relative to each other, so
 * the kept set doesn't pop in/out as you pan.
 *
 * Ties (equal height) are broken by a geometry-derived key rather than array
 * order — a Flatbush bbox query's result order can vary between viewports, and
 * a position-based tiebreak would silently reintroduce pan-dependence.
 */
export function selectShadowCasters(
  candidates: Occluder[],
  zoom: number,
  capOverride?: number
): Occluder[] {
  const cap = capOverride ?? capForZoom(zoom);
  if (candidates.length <= cap) return candidates;

  const sorted = [...candidates].sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    const ca = centroidOf(a.polygon) ?? [0, 0];
    const cb = centroidOf(b.polygon) ?? [0, 0];
    if (ca[0] !== cb[0]) return ca[0] - cb[0];
    return ca[1] - cb[1];
  });
  sorted.length = cap;
  return sorted;
}

/**
 * Expand a [west, south, east, north] bbox by a margin fraction of its own
 * size on each side. Used to pad the viewport query so buildings just outside
 * the visible area (whose shadow may still fall in view) aren't missed.
 */
export function expandBounds(
  bounds: MapBounds,
  marginFactor: number = 0.2
): MapBounds {
  const [west, south, east, north] = bounds;
  const margLng = (east - west) * marginFactor;
  const margLat = (north - south) * marginFactor;
  return [west - margLng, south - margLat, east + margLng, north + margLat];
}

/**
 * Full shared shadow-projection pipeline, given a prebuilt spatial index:
 * viewport bbox query (+ margin) -> zoom-aware capping (tallest-first,
 * pan-stable) -> per-occluder ground-shadow polygon projection. At night (sun
 * at/below horizon) this returns an empty collection.
 */
export function computeShadowFeatures(
  index: SpatialIndex,
  sun: SunPosition,
  bounds: MapBounds,
  zoom: number,
  cap?: number
): ShadowFeatureCollection {
  if (sun.altitude <= 0) return emptyShadowCollection();

  const candidates = getCandidatesInBbox(index, expandBounds(bounds));
  const kept = selectShadowCasters(candidates, zoom, cap);

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const occ of kept) {
    const ring = computeShadowPolygon(occ, sun);
    if (ring.length < 3) continue;
    // Close the ring for valid GeoJSON.
    const coords = [...ring, ring[0]];
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
  }

  return { type: 'FeatureCollection', features };
}
