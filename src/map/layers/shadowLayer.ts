import mapboxgl from "mapbox-gl";
import {
  computeShadowPolygon,
  type Occluder,
  type SunPosition,
} from "@/engine/shadows";
import {
  buildSpatialIndex,
  getCandidatesInBbox,
  type SpatialIndex,
} from "@/engine/spatial";
import type { MapBounds } from "@/state/uiStore";

function emptyCollection(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return { type: "FeatureCollection", features: [] };
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

// Cache one Flatbush index per occluder-array identity. `loadBuildingOccluders`
// memory-caches occluders per neighborhood slug, so the array reference is
// stable across recomputes for the same neighborhood — building the index once
// per neighborhood (not once per recompute) is what makes the viewport query
// below an index lookup instead of a linear scan.
const indexCache = new WeakMap<Occluder[], SpatialIndex>();

function getOrBuildIndex(occluders: Occluder[]): SpatialIndex {
  let index = indexCache.get(occluders);
  if (!index) {
    index = buildSpatialIndex(occluders);
    indexCache.set(occluders, index);
  }
  return index;
}

/**
 * Project building footprints into ground-shadow polygons for the current sun
 * position and feed them to the "shadow-polygons" source. This is the visible
 * "sunlight simulator": shadows lengthen and rotate as the sun moves.
 *
 * Occluders in the current viewport (+ margin) are found via a Flatbush bbox
 * query (see `getOrBuildIndex`/`getCandidatesInBbox`), then capped by
 * `selectShadowCasters` — zoom-aware, tallest-first, stable under panning. At
 * night (sun at/below horizon) the layer is cleared.
 */
export function updateShadowPolygons(
  map: mapboxgl.Map,
  occluders: Occluder[],
  sun: SunPosition,
  bounds: MapBounds,
  cap?: number
): void {
  const source = map.getSource("shadow-polygons") as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (!source) return;

  if (sun.altitude <= 0) {
    source.setData(emptyCollection());
    return;
  }

  const [west, south, east, north] = bounds;
  const margLng = (east - west) * 0.2;
  const margLat = (north - south) * 0.2;
  const w = west - margLng;
  const e = east + margLng;
  const s = south - margLat;
  const n = north + margLat;

  const index = getOrBuildIndex(occluders);
  const candidates = getCandidatesInBbox(index, [w, s, e, n]);
  const kept = selectShadowCasters(candidates, map.getZoom(), cap);

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const occ of kept) {
    // TODO(ANS-215 follow-up): offload projection to a worker
    const ring = computeShadowPolygon(occ, sun);
    if (ring.length < 3) continue;
    // Close the ring for valid GeoJSON.
    const coords = [...ring, ring[0]];
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }

  source.setData({ type: "FeatureCollection", features });
}

export function addShadowLayer(map: mapboxgl.Map): void {
  if (!map.getSource("shadow-polygons")) {
    map.addSource("shadow-polygons", {
      type: "geojson",
      data: emptyCollection(),
    });
  }

  if (!map.getLayer("shadow-polygons")) {
    map.addLayer({
      id: "shadow-polygons",
      type: "fill",
      source: "shadow-polygons",
      paint: {
        "fill-color": "#1A0F5C",
        "fill-opacity": 0.32,
      },
    });
  }
}

export function updateShadowOverlay(
  map: mapboxgl.Map,
  visible: boolean
): void {
  if (!map.isStyleLoaded() || !map.getLayer("shadow-polygons")) return;

  map.setPaintProperty(
    "shadow-polygons",
    "fill-opacity",
    visible ? 0.32 : 0
  );
}
