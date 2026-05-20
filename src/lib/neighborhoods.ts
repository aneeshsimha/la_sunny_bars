import neighborhoodsData from "../../public/data/neighborhoods.json";

export interface Neighborhood {
  slug: string;
  name: string;
  /** [west, south, east, north] in degrees */
  bbox: [number, number, number, number];
  /** [lng, lat] */
  center: [number, number];
}

// Cast the imported JSON to the typed interface.
// The JSON is the single source of truth; this file re-exports it typed.
export const neighborhoods: Neighborhood[] = neighborhoodsData as Neighborhood[];
