#!/usr/bin/env tsx
/**
 * Fetch building footprints for a neighborhood from Overpass API
 * and write to public/data/{slug}/buildings.json.
 *
 * Usage: npx tsx pipeline/fetch-buildings.ts [--slug silver-lake]
 */

import fs from 'fs';
import path from 'path';
import { fetchWithRetry } from './lib/rateLimit.js';
import { classifyHeight, type HeightSource } from './heightClassification.js';

interface Occluder {
  polygon: [number, number][];
  height: number;
  heightSource: HeightSource;
  baseElev?: number | null; // ground elevation in meters, from LARIAC ELEV when matched (ANS-235); null if unmatched
}

interface BuildingsOutput {
  slug: string;
  generatedAt: string;
  count: number;
  occluders: Occluder[];
}

// Parse --slug arg
const slugArgIdx = process.argv.indexOf('--slug');
const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : 'silver-lake';

interface NeighborhoodEntry {
  slug: string;
  name: string;
  bbox: [number, number, number, number];
}

const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
const allNeighborhoods: NeighborhoodEntry[] = JSON.parse(fs.readFileSync(neighborhoodsPath, 'utf-8')) as NeighborhoodEntry[];
const neighborhood = allNeighborhoods.find((n) => n.slug === slug);
if (!neighborhood) {
  console.error(`Unknown slug: ${slug}. Available: ${allNeighborhoods.map((n) => n.slug).join(', ')}`);
  process.exit(1);
}

const bbox = neighborhood.bbox;
const [west, south, east, north] = bbox;

function buildQuery(s: number, w: number, n: number, e: number): string {
  return `[out:json][timeout:60];
(
  way["building"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;`;
}

async function fetchBuildings(): Promise<void> {
  console.log(`Fetching buildings for ${neighborhood!.name} (bbox: ${bbox.join(', ')})...`);

  const query = buildQuery(south, west, north, east);

  const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'la-sunny-bars/1.0 fetch-buildings',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    elements: Array<{
      type: string;
      id: number;
      nodes?: number[];
      tags?: Record<string, string>;
      lat?: number;
      lon?: number;
    }>;
  };

  // Build node map for coordinate lookup
  const nodeMap = new Map<number, [number, number]>();
  for (const el of data.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }

  const occluders: Occluder[] = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 3) continue;

    const polygon: [number, number][] = [];
    for (const nodeId of el.nodes) {
      const coords = nodeMap.get(nodeId);
      if (coords) polygon.push(coords);
    }
    if (polygon.length < 3) continue;

    const tags = el.tags ?? {};
    const { height, heightSource } = classifyHeight(tags);

    occluders.push({ polygon, height, heightSource });
  }

  // Budget check
  const output: BuildingsOutput = {
    slug,
    generatedAt: new Date().toISOString(),
    count: occluders.length,
    occluders,
  };

  const json = JSON.stringify(output);
  const sizeKB = Buffer.byteLength(json) / 1024;
  console.log(`Found ${occluders.length} buildings (${sizeKB.toFixed(1)} KB uncompressed)`);

  if (sizeKB > 3000) {
    console.warn(`WARNING: Output is ${sizeKB.toFixed(0)}KB — consider simplifying polygons for production`);
  }

  const outDir = path.join(process.cwd(), 'public', 'data', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'buildings.json');
  fs.writeFileSync(outPath, json);
  console.log(`Written to ${outPath}`);
}

fetchBuildings().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
