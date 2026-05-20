/**
 * Fetches street tree data from OpenStreetMap's Overpass API
 * for Los Angeles and saves it as a GeoJSON file.
 *
 * Usage: npx tsx scripts/fetch-trees.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// Bounding box covering core LA (south,west,north,east — Overpass order)
const BBOX = "33.95,-118.55,34.20,-118.20";

const OUTPUT_PATH = "public/data/trees.geojson";

// Maximum trees to keep; if result exceeds this, subsample to stay under ~3 MB
const MAX_TREES = 50_000;

const OVERPASS_QUERY = `
[out:json][timeout:90];
node["natural"="tree"](${BBOX});
out;
`.trim();

// --- Types ---

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface TreeProperties {
  id: number;
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: TreeProperties;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// --- Main ---

async function main() {
  console.log("Fetching tree data from Overpass API...");
  console.log(`Bounding box: ${BBOX}`);

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "la-sunny-bars/1.0 tree-fetch",
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!response.ok) {
    throw new Error(
      `Overpass API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data: OverpassResponse = await response.json();
  console.log(`Received ${data.elements.length} raw elements from Overpass`);

  // Process node elements into GeoJSON features
  let features: GeoJSONFeature[] = [];

  for (const el of data.elements) {
    if (el.type !== "node") continue;
    if (el.lat === undefined || el.lon === undefined) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [el.lon, el.lat],
      },
      properties: {
        id: el.id,
      },
    });
  }

  console.log(`Parsed ${features.length} tree nodes`);

  // Subsample if too large to keep file under ~3 MB
  if (features.length > MAX_TREES) {
    const step = Math.ceil(features.length / MAX_TREES);
    features = features.filter((_, i) => i % step === 0);
    console.log(
      `Subsampled to every ${step}th tree → ${features.length} trees`
    );
  }

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(`\nSaved ${features.length} trees to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
