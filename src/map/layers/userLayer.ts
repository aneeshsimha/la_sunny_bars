import mapboxgl from "mapbox-gl";

function userGeoJSON(
  coords: [number, number] | null
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (!coords) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: coords },
      },
    ],
  };
}

export function addUserLayer(map: mapboxgl.Map): void {
  if (!map.getSource("user-location")) {
    map.addSource("user-location", {
      type: "geojson",
      data: userGeoJSON(null),
    });
  }

  // Outer ring (pulse effect)
  if (!map.getLayer("user-location-ring")) {
    map.addLayer({
      id: "user-location-ring",
      type: "circle",
      source: "user-location",
      paint: {
        "circle-radius": 14,
        "circle-color": "rgba(66, 133, 244, 0.15)",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(66, 133, 244, 0.5)",
      },
    });
  }

  // Inner puck
  if (!map.getLayer("user-location-dot")) {
    map.addLayer({
      id: "user-location-dot",
      type: "circle",
      source: "user-location",
      paint: {
        "circle-radius": 7,
        "circle-color": "#4285F4",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export function updateUserLocation(
  map: mapboxgl.Map,
  coords: [number, number] | null
): void {
  if (!map.isStyleLoaded() || !map.getSource("user-location")) return;

  const source = map.getSource("user-location") as mapboxgl.GeoJSONSource;
  source.setData(userGeoJSON(coords));
}
