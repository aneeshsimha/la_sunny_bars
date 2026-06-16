import type mapboxgl from "mapbox-gl";
import { loadMapboxGL } from "./lazyMap";

export async function createMap(container: HTMLElement): Promise<mapboxgl.Map> {
  const mgl = await loadMapboxGL();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      "Mapbox token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local"
    );
  }

  mgl.accessToken = token;

  const map = new mgl.Map({
    container,
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-118.4912, 34.0195],
    zoom: 13,
    pitch: 45,
    bearing: -17,
    antialias: true,
  });

  map.on("style.load", () => {
    map.setFog({
      color: "rgb(186, 210, 235)",
      "high-color": "rgb(36, 92, 223)",
      "horizon-blend": 0.02,
      "space-color": "rgb(11, 11, 25)",
      "star-intensity": 0.6,
    });

    if (!map.getLayer("sky")) {
      map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0.0, 0.0],
          "sky-atmosphere-sun-intensity": 15,
        },
      } as mapboxgl.AnyLayer);
    }
  });

  return map;
}
