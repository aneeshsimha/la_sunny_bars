import mapboxgl from "mapbox-gl";

function emptyCollection(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return { type: "FeatureCollection", features: [] };
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
