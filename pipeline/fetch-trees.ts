#!/usr/bin/env tsx
/**
 * Fetch tree canopies and awning-like structures for a neighborhood from Overpass API
 * and write to public/data/{slug}/trees.json as Occluder objects.
 *
 * Usage: npx tsx pipeline/fetch-trees.ts [--slug silver-lake]
 */

import fs from 'fs';
import path from 'path';
import { fetchWithRetry } from './lib/rateLimit.js';
import type { Occluder } from '../src/engine/shadows.js';

interface TreesOutput {
  slug: string;
  generatedAt: string;
  count: number;
  occluders: Occluder[];
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
};

// Parse --slug arg
const slugArgIdx = process.argv.indexOf('--slug');
const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : 'silver-lake';

const NEIGHBORHOODS: Record<string, [number, number, number, number]> = {
  'silver-lake': [-118.295, 34.069, -118.259, 34.099],
  'venice': [-118.48, 33.985, -118.445, 34.015],
  'dtla': [-118.268, 34.033, -118.232, 34.063],
  'weho': [-118.4, 34.075, -118.36, 34.095],
  'santa-monica': [-118.518, 33.996, -118.468, 34.032],
  'echo-park': [-118.278, 34.067, -118.252, 34.083],
  'los-feliz': [-118.308, 34.097, -118.269, 34.115],
  'hollywood': [-118.345, 34.088, -118.31, 34.108],
  'koreatown': [-118.32, 34.055, -118.286, 34.072],
  'beverly-hills': [-118.421, 34.056, -118.386, 34.082],
};

const bbox = NEIGHBORHOODS[slug];
if (!bbox) {
  console.error(`Unknown slug: ${slug}. Available: ${Object.keys(NEIGHBORHOODS).join(', ')}`);
  process.exit(1);
}

const [west, south, east, north] = bbox;

const METERS_PER_DEG_LAT = 111_320;
const DEFAULT_TREE_RADIUS_M = 6;
const CIRCLE_VERTICES = 12;
const TREE_HEIGHT_M = 8;
const AWNING_HEIGHT_M = 3;
const TREE_OPACITY = 0.5;
const AWNING_OPACITY = 0.8;

/**
 * Create a circular polygon approximation around a [lng, lat] center.
 * Returns CIRCLE_VERTICES [lng, lat] points evenly spaced around the perimeter.
 */
export function circlePolygon(
  center: [number, number],
  radiusMeters: number
): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

  const vertices: [number, number][] = [];
  for (let i = 0; i < CIRCLE_VERTICES; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_VERTICES;
    vertices.push([
      lng + dLng * Math.cos(angle),
      lat + dLat * Math.sin(angle),
    ]);
  }
  return vertices;
}

function buildQuery(s: number, w: number, n: number, e: number): string {
  return `[out:json][timeout:90];
(
  node["natural"="tree"](${s},${w},${n},${e});
  node["natural"="tree_row"](${s},${w},${n},${e});
  way["building"="yes"]["roof:shape"="flat"](${s},${w},${n},${e});
  way["amenity"="shelter"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;`;
}

async function fetchTrees(): Promise<void> {
  console.log(`Fetching trees/awnings for ${slug} (bbox: ${bbox.join(', ')})...`);

  const query = buildQuery(south, west, north, east);

  const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'la-sunny-bars/1.0 fetch-trees',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { elements: OverpassElement[] };

  // Build node map for way coordinate lookup
  const nodeMap = new Map<number, [number, number]>();
  for (const el of data.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }

  const occluders: Occluder[] = [];

  for (const el of data.elements) {
    const tags = el.tags ?? {};

    if (el.type === 'node') {
      // Tree or tree_row node
      const isTree = tags['natural'] === 'tree' || tags['natural'] === 'tree_row';
      if (!isTree) continue;
      if (el.lat === undefined || el.lon === undefined) continue;

      // Use diameter_crown tag if present (in meters), else default
      let radiusM = DEFAULT_TREE_RADIUS_M;
      if (tags['diameter_crown']) {
        const d = parseFloat(tags['diameter_crown']);
        if (!isNaN(d) && d > 0) radiusM = d / 2;
      }

      const polygon = circlePolygon([el.lon, el.lat], radiusM);
      occluders.push({ polygon, height: TREE_HEIGHT_M, opacity: TREE_OPACITY });

    } else if (el.type === 'way') {
      // Awning-like structure (flat-roof building or shelter)
      if (!el.nodes || el.nodes.length < 3) continue;

      const polygon: [number, number][] = [];
      for (const nodeId of el.nodes) {
        const coords = nodeMap.get(nodeId);
        if (coords) polygon.push(coords);
      }
      if (polygon.length < 3) continue;

      occluders.push({ polygon, height: AWNING_HEIGHT_M, opacity: AWNING_OPACITY });
    }
  }

  const output: TreesOutput = {
    slug,
    generatedAt: new Date().toISOString(),
    count: occluders.length,
    occluders,
  };

  const json = JSON.stringify(output);
  const sizeKB = Buffer.byteLength(json) / 1024;

  const treeCount = occluders.filter((o) => o.opacity === TREE_OPACITY).length;
  const awningCount = occluders.filter((o) => o.opacity === AWNING_OPACITY).length;
  console.log(
    `Found ${occluders.length} occluders: ${treeCount} trees, ${awningCount} awning structures (${sizeKB.toFixed(1)} KB uncompressed)`
  );

  const outDir = path.join(process.cwd(), 'public', 'data', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'trees.json');
  fs.writeFileSync(outPath, json);
  console.log(`Written to ${outPath}`);
}

fetchTrees().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
