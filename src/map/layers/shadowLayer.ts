import mapboxgl from "mapbox-gl";
import {
  computeShadowPolygon,
  type Occluder,
  type SunPosition,
} from "@/engine/shadows";
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

/**
 * Project building footprints into ground-shadow polygons for the current sun
 * position and feed them to the "shadow-polygons" source. This is the visible
 * "sunlight simulator": shadows lengthen and rotate as the sun moves.
 *
 * Only occluders whose centroid falls inside the current viewport (+ margin)
 * are rendered, capped to `cap` nearest the map center to keep dense, zoomed-out
 * views fast. At night (sun at/below horizon) the layer is cleared.
 */
export function updateShadowPolygons(
  map: mapboxgl.Map,
  occluders: Occluder[],
  sun: SunPosition,
  bounds: MapBounds,
  cap = 2500
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
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;

  // One pass: keep occluders whose centroid is in view, remembering distance²
  // to the viewport center so we can cap to the nearest ones.
  const inView: { occ: Occluder; d2: number }[] = [];
  for (const occ of occluders) {
    const c = centroidOf(occ.polygon);
    if (!c) continue;
    if (c[0] < w || c[0] > e || c[1] < s || c[1] > n) continue;
    const dx = c[0] - cx;
    const dy = c[1] - cy;
    inView.push({ occ, d2: dx * dx + dy * dy });
  }

  if (inView.length > cap) {
    inView.sort((a, b) => a.d2 - b.d2);
    inView.length = cap;
  }

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const { occ } of inView) {
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
