import mapboxgl from "mapbox-gl";
import { type Occluder, type SunPosition } from "@/engine/shadows";
import { buildSpatialIndex, type SpatialIndex } from "@/engine/spatial";
import {
  computeShadowFeatures,
  emptyShadowCollection,
  capForZoom,
  selectShadowCasters,
} from "@/engine/shadowProjection";
import type { MapBounds } from "@/state/uiStore";

// Re-exported for backward compatibility (existing callers/tests import
// these from shadowLayer). The implementation now lives in
// @/engine/shadowProjection so it can be shared with the scoring worker
// (ANS-237) — see that module for the actual logic + docs.
export { capForZoom, selectShadowCasters };

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
 * This is the main-thread FALLBACK path (ANS-237) — `bindStores.recomputeShadows`
 * prefers the worker's `shadow` message (see src/worker/scoring.worker.ts /
 * src/worker/client.ts) and only calls this when the worker path is
 * unavailable (not yet initialized, or errored). It must keep working
 * correctly on its own; do not assume the worker path has run first.
 *
 * Occluders in the current viewport (+ margin) are found via a Flatbush bbox
 * query, then capped by `selectShadowCasters` — zoom-aware, tallest-first,
 * stable under panning. At night (sun at/below horizon) the layer is cleared.
 * The actual projection pipeline lives in @/engine/shadowProjection so this
 * path and the worker path share one implementation.
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

  const index = getOrBuildIndex(occluders);
  const features = computeShadowFeatures(index, sun, bounds, map.getZoom(), cap);
  source.setData(features);
}

export function addShadowLayer(map: mapboxgl.Map): void {
  if (!map.getSource("shadow-polygons")) {
    map.addSource("shadow-polygons", {
      type: "geojson",
      data: emptyShadowCollection(),
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
