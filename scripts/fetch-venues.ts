/**
 * Fetches bar/restaurant/cafe/pub venue data from OpenStreetMap's Overpass API
 * for Los Angeles and saves it as a GeoJSON file.
 *
 * Usage: npx tsx scripts/fetch-venues.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// Bounding box covering Santa Monica, Venice, Culver City, WeHo, Beverly Hills,
// Mid-Wilshire, Silver Lake, Echo Park, DTLA, and surrounding areas
const BBOX = "33.96,-118.52,34.11,-118.22"; // south,west,north,east

const OUTPUT_PATH = "public/data/venues.geojson";

// Overpass QL query: fetch nodes and ways for the four amenity types within the bbox.
// We fetch ALL venues (not just outdoor_seating=yes) because that tag is sparse in LA.
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  node["amenity"="bar"](${BBOX});
  node["amenity"="restaurant"](${BBOX});
  node["amenity"="cafe"](${BBOX});
  node["amenity"="pub"](${BBOX});
  way["amenity"="bar"](${BBOX});
  way["amenity"="restaurant"](${BBOX});
  way["amenity"="cafe"](${BBOX});
  way["amenity"="pub"](${BBOX});
);
out body;
>;
out skel qt;
`.trim();

// --- Types ---

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface VenueProperties {
  name: string;
  amenity: string;
  outdoor_seating: "yes" | "no" | "unknown";
  cuisine: string | null;
  opening_hours: string | null;
  website: string | null;
  osm_id: number;
  osm_type: "node" | "way";
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: VenueProperties;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// --- Main ---

async function main() {
  console.log("Fetching venue data from Overpass API...");
  console.log(`Bounding box: ${BBOX}`);

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!response.ok) {
    throw new Error(
      `Overpass API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data: OverpassResponse = await response.json();
  console.log(`Received ${data.elements.length} raw elements from Overpass`);

  // Build a lookup of node coordinates for resolving way centroids
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Process elements into GeoJSON features
  const features: GeoJSONFeature[] = [];

  for (const el of data.elements) {
    // Only process nodes and ways that have tags (the skeleton nodes from `>; out skel` won't have tags)
    if (!el.tags) continue;

    const name = el.tags.name;
    if (!name) continue; // Skip unnamed venues

    const amenity = el.tags.amenity;
    if (!["bar", "restaurant", "cafe", "pub"].includes(amenity)) continue;

    // Determine coordinates
    let lng: number | undefined;
    let lat: number | undefined;

    if (el.type === "node") {
      lat = el.lat;
      lng = el.lon;
    } else if (el.type === "way" && el.nodes) {
      // Compute centroid from the way's member nodes
      const coords = el.nodes
        .map((nid) => nodeCoords.get(nid))
        .filter(
          (c): c is { lat: number; lon: number } => c !== undefined
        );

      if (coords.length > 0) {
        lat =
          coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
        lng =
          coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;
      }
    }

    if (lat === undefined || lng === undefined) continue;

    const outdoorRaw = el.tags.outdoor_seating;
    const outdoor_seating: "yes" | "no" | "unknown" =
      outdoorRaw === "yes" ? "yes" : outdoorRaw === "no" ? "no" : "unknown";

    const feature: GeoJSONFeature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        name,
        amenity,
        outdoor_seating,
        cuisine: el.tags.cuisine ?? null,
        opening_hours: el.tags.opening_hours ?? null,
        website: el.tags.website ?? null,
        osm_id: el.id,
        osm_type: el.type as "node" | "way",
      },
    };

    features.push(feature);
  }

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2));
  console.log(`\nSaved ${features.length} venues to ${OUTPUT_PATH}`);

  // --- Summary ---
  const withOutdoor = features.filter(
    (f) => f.properties.outdoor_seating === "yes"
  ).length;
  const withoutOutdoor = features.filter(
    (f) => f.properties.outdoor_seating === "no"
  ).length;
  const unknownOutdoor = features.filter(
    (f) => f.properties.outdoor_seating === "unknown"
  ).length;

  const byType: Record<string, number> = {};
  for (const f of features) {
    const t = f.properties.amenity;
    byType[t] = (byType[t] || 0) + 1;
  }

  console.log("\n=== Summary ===");
  console.log(`Total venues: ${features.length}`);
  console.log(`  outdoor_seating=yes:     ${withOutdoor}`);
  console.log(`  outdoor_seating=no:      ${withoutOutdoor}`);
  console.log(`  outdoor_seating=unknown: ${unknownOutdoor}`);
  console.log("\nBreakdown by type:");
  for (const [type, count] of Object.entries(byType).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
