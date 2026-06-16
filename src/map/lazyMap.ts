import type mapboxgl from "mapbox-gl";

let cached: typeof mapboxgl | null = null;

export async function loadMapboxGL(): Promise<typeof mapboxgl> {
  if (cached) return cached;
  const m = await import("mapbox-gl");
  cached = m.default;
  return cached;
}
