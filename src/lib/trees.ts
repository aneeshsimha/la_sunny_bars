import { type BuildingFootprint } from "@/lib/shadows";

// Approximate degrees per meter at LA's latitude (~34°N)
// 3m radius in lat degrees: 3 / 111320 ≈ 0.0000270°  (radius, so diameter = 2x)
// For 3m radius:
const RADIUS_LAT_DEG = 3 / 111_320; // ≈ 0.0000270°
const RADIUS_LNG_DEG = 3 / (111_320 * Math.cos((34 * Math.PI) / 180)); // ≈ 0.0000326°

// Number of octagon vertices
const OCTAGON_SIDES = 8;

/** Convert a tree [lng, lat] point to a BuildingFootprint octagon. */
function treeToFootprint(lng: number, lat: number): BuildingFootprint {
  const polygon: [number, number][] = [];
  for (let i = 0; i < OCTAGON_SIDES; i++) {
    const angle = (2 * Math.PI * i) / OCTAGON_SIDES;
    polygon.push([
      lng + RADIUS_LNG_DEG * Math.cos(angle),
      lat + RADIUS_LAT_DEG * Math.sin(angle),
    ]);
  }
  return { polygon, height: 8 };
}

// Promise-based cache — deduplicates concurrent calls before the fetch resolves
let cache: Promise<BuildingFootprint[]> | null = null;

async function fetchAndParse(): Promise<BuildingFootprint[]> {
  const response = await fetch("/data/trees.geojson");
  if (!response.ok) {
    console.warn(`Failed to load trees.geojson: ${response.status}`);
    return [];
  }

  const geojson = await response.json();
  const features: Array<{ geometry: { type: string; coordinates: [number, number] } }> =
    geojson.features ?? [];

  return features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      return treeToFootprint(lng, lat);
    });
}

/** Load trees from /data/trees.geojson and convert to BuildingFootprint octagons. */
export function loadTreesAsBuildings(): Promise<BuildingFootprint[]> {
  if (!cache) cache = fetchAndParse();
  return cache;
}
