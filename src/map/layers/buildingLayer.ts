import mapboxgl from "mapbox-gl";

export function addBuildingLayer(map: mapboxgl.Map): void {
  const layers = map.getStyle()?.layers ?? [];
  let labelLayerId: string | undefined;
  for (const layer of layers) {
    if (
      layer.type === "symbol" &&
      (layer as mapboxgl.SymbolLayer).layout?.["text-field"]
    ) {
      labelLayerId = layer.id;
      break;
    }
  }

  map.addLayer(
    {
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#aaa",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          0,
          12.5,
          [
            "coalesce",
            ["get", "height"],
            ["*", ["coalesce", ["get", "levels"], 1], 3],
          ],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          0,
          12.5,
          ["coalesce", ["get", "min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.85,
      },
    } as mapboxgl.AnyLayer,
    labelLayerId
  );
}

export function updateSunLight(
  map: mapboxgl.Map,
  azimuthRad: number,
  altitudeRad: number
): void {
  if (!map.isStyleLoaded()) return;

  const azimuthDeg = (azimuthRad * 180) / Math.PI + 180;
  const altitudeDeg = Math.max(0, (altitudeRad * 180) / Math.PI);

  map.setLight({
    anchor: "map",
    position: [1.15, azimuthDeg, altitudeDeg],
    intensity: 0.5,
    color: "white",
  });

  // Move the sky's sun with the real sun so the atmosphere brightens toward it.
  // sky-atmosphere-sun is [azimuth°, polar°] where polar 0 = zenith, 90 = horizon.
  if (map.getLayer("sky")) {
    const polarDeg = Math.min(180, Math.max(0, 90 - altitudeDeg));
    map.setPaintProperty("sky", "sky-atmosphere-sun", [azimuthDeg, polarDeg]);
  }
}
