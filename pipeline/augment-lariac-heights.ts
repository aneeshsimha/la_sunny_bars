#!/usr/bin/env tsx
/**
 * ANS-235: Augment existing OSM building footprints with LARIAC LiDAR
 * measured heights (+ ground elevation for the D6.2 slope work).
 *
 * AUGMENTS in place — does NOT re-fetch or re-derive OSM footprints. The
 * existing public/data/<slug>/buildings.json footprint set + order is
 * preserved exactly (B10 linkage, trees, and the manifest all depend on
 * it), only `height`, `heightSource`, and `baseElev` are updated per
 * occluder.
 *
 * For each existing occluder:
 *   1. Compute its footprint centroid.
 *   2. Look up the nearest LARIAC centroid within MATCH_RADIUS_METERS
 *      (pipeline/lariac.ts).
 *   3. If matched: height = HEIGHT(ft) * 0.3048, heightSource = 'measured',
 *      baseElev = ELEV(ft) * 0.3048.
 *   4. If not matched: height unchanged, heightSource is a proxy
 *      re-classification of the existing height value (no raw OSM tags
 *      survive in the shipped file — see classifyExistingHeight), and
 *      baseElev = null.
 *
 * Data source: LARIAC6_BUILDINGS_2020 (LA County), FeatureServer layer 0.
 * NOTE: `outSR=4326` is required in addition to `inSR=4326` — without it,
 * `returnCentroid=true` returns centroids in the service's default spatial
 * reference (Web Mercator, EPSG:3857 meters), not lng/lat degrees, which
 * would silently break the meters-based match radius. Verified live before
 * writing this fetcher.
 *
 * Usage:
 *   npx tsx pipeline/augment-lariac-heights.ts --slug pasadena
 *   npx tsx pipeline/augment-lariac-heights.ts --all
 *   npx tsx pipeline/augment-lariac-heights.ts --all --no-cache
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import Flatbush from 'flatbush';
import cache from './lib/cache.js';
import { fetchWithRetry } from './lib/rateLimit.js';
import { classifyExistingHeight, type HeightSource } from './heightClassification.js';
import {
  feetToMeters,
  polygonCentroid,
  findNearestLariacMatch,
  MATCH_RADIUS_METERS,
  type LariacRecord,
} from './lariac.js';

const LARIAC_URL =
  'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Countywide_Building_Outlines_(2020)/FeatureServer/0/query';
const PAGE_SIZE = 2000;
const PAGE_DELAY_MS = 250;
const METERS_PER_DEG_LAT = 111_320;
// Generous prefilter radius for the Flatbush neighbor search (raw degree
// distance, not meters-corrected) — the exact 20m match decision is made
// afterward in meters via findNearestLariacMatch.
const SEARCH_PREFILTER_METERS = 40;
const SEARCH_PREFILTER_CANDIDATES = 12;
// Report file size relative to the historical per-neighborhood gzip budget
// (ANS-126: silver-lake/venice/santa-monica were height-filtered to fit
// under 800KB gz).
const SIZE_BUDGET_GZ_KB = 800;
const FILE_SIZE_BUDGET_NOTE =
  'This script does not re-fetch OSM or drop footprints — the ANS-126 height filter already baked into these files is preserved untouched.';

interface Occluder {
  polygon: [number, number][];
  height: number;
  opacity?: number;
  heightSource?: HeightSource;
  baseElev?: number | null;
}

interface BuildingsFile {
  slug: string;
  generatedAt: string;
  count: number;
  occluders: Occluder[];
}

interface NeighborhoodEntry {
  slug: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
}

interface ArcGisFeature {
  attributes: { HEIGHT: number | null; ELEV: number | null };
  centroid?: { x: number; y: number };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// LARIAC HEIGHT/ELEV values carry 2 decimal places of feet precision at
// most; feet*0.3048 otherwise produces long floating-point tails (e.g.
// 7.290816000000001) that are meaningless precision and needlessly bloat
// the shipped JSON. Round to 2 decimal places of meters.
function roundMeters(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function fetchLariacPage(
  bbox: [number, number, number, number],
  offset: number
): Promise<ArcGisResponse> {
  const [west, south, east, north] = bbox;
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326', // required — see module docstring
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'HEIGHT,ELEV',
    returnGeometry: 'false',
    returnCentroid: 'true',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: 'json',
  });

  const url = `${LARIAC_URL}?${params.toString()}`;
  const response = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'la-sunny-bars/1.0 augment-lariac-heights (ANS-235)' },
  });

  if (!response.ok) {
    throw new Error(`LARIAC FeatureServer error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as ArcGisResponse;
  if (json.error) {
    throw new Error(`LARIAC FeatureServer error: ${JSON.stringify(json.error)}`);
  }
  return json;
}

async function fetchAllLariacRecords(
  slug: string,
  bbox: [number, number, number, number],
  useCache: boolean
): Promise<LariacRecord[]> {
  const cacheKey = `lariac-${slug}`;
  if (useCache && (await cache.has(cacheKey))) {
    const cached = (await cache.get(cacheKey)) as LariacRecord[];
    console.log(`[lariac] ${slug}: using ${cached.length} cached LARIAC records`);
    return cached;
  }

  const records: LariacRecord[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchLariacPage(bbox, offset);
    const features = page.features ?? [];
    for (const feature of features) {
      const { HEIGHT, ELEV } = feature.attributes;
      if (HEIGHT === null || ELEV === null || !feature.centroid) continue;
      records.push({ lng: feature.centroid.x, lat: feature.centroid.y, heightFt: HEIGHT, elevFt: ELEV });
    }
    console.log(
      `[lariac] ${slug}: page offset=${offset} -> ${features.length} features (${records.length} usable so far)`
    );

    if (!page.exceededTransferLimit || features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(PAGE_DELAY_MS);
  }

  await cache.set(cacheKey, records);
  return records;
}

function buildLariacIndex(records: LariacRecord[]): Flatbush {
  const index = new Flatbush(Math.max(records.length, 1));
  for (const record of records) {
    index.add(record.lng, record.lat, record.lng, record.lat);
  }
  if (records.length > 0) index.finish();
  return index;
}

interface AugmentResult {
  slug: string;
  count: number;
  beforeMeasuredPct: number;
  afterMeasuredPct: number;
  beforeMedian: number;
  afterMedian: number;
  matched: number;
  gzKB: number;
}

async function augmentNeighborhood(
  hood: NeighborhoodEntry,
  useCache: boolean
): Promise<AugmentResult | null> {
  const repoRoot = process.cwd();
  const buildingsPath = path.join(repoRoot, 'public', 'data', hood.slug, 'buildings.json');

  if (!fs.existsSync(buildingsPath)) {
    console.warn(`[lariac] ${hood.slug}: no buildings.json, skipping`);
    return null;
  }

  const before: BuildingsFile = JSON.parse(fs.readFileSync(buildingsPath, 'utf-8')) as BuildingsFile;
  const beforeCount = before.occluders.length;
  const beforeMeasuredCount = before.occluders.filter(
    (o) => (o.heightSource ?? classifyExistingHeight(o.height)) === 'measured'
  ).length;
  const beforeMedian = median(before.occluders.map((o) => o.height));

  console.log(`\n[lariac] ===== ${hood.name} (${hood.slug}) =====`);
  console.log(`[lariac] ${hood.slug}: ${beforeCount} existing footprints, fetching LARIAC records...`);

  const records = await fetchAllLariacRecords(hood.slug, hood.bbox, useCache);
  console.log(`[lariac] ${hood.slug}: ${records.length} LARIAC records with usable HEIGHT/ELEV`);

  const index = buildLariacIndex(records);
  const cosLat = Math.cos((hood.center[1] * Math.PI) / 180);
  const prefilterDeg = SEARCH_PREFILTER_METERS / (METERS_PER_DEG_LAT * cosLat);

  let matched = 0;
  const occluders: Occluder[] = before.occluders.map((occ) => {
    const centroid = polygonCentroid(occ.polygon);
    const candidateIndices =
      records.length > 0
        ? index.neighbors(centroid[0], centroid[1], SEARCH_PREFILTER_CANDIDATES, prefilterDeg)
        : [];
    const candidates = candidateIndices.map((i) => records[i]);
    const match = findNearestLariacMatch(centroid, candidates, MATCH_RADIUS_METERS);

    if (match) {
      matched++;
      return {
        ...occ,
        height: roundMeters(match.heightMeters),
        heightSource: 'measured',
        baseElev: roundMeters(match.baseElevMeters),
      };
    }

    return {
      ...occ,
      heightSource: occ.heightSource ?? classifyExistingHeight(occ.height),
      baseElev: null,
    };
  });

  if (occluders.length !== beforeCount) {
    throw new Error(
      `[lariac] ${hood.slug}: occluder count changed (${beforeCount} -> ${occluders.length}) — aborting write to avoid breaking B10 linkage`
    );
  }

  const output: BuildingsFile = {
    ...before,
    generatedAt: new Date().toISOString(),
    occluders,
  };

  const json = JSON.stringify(output);
  const gzKB = zlib.gzipSync(json).length / 1024;
  fs.writeFileSync(buildingsPath, json);

  const afterMeasuredPct = (matched / beforeCount) * 100;
  const beforeMeasuredPct = (beforeMeasuredCount / beforeCount) * 100;
  const afterMedian = median(occluders.map((o) => o.height));

  console.log(
    `[lariac] ${hood.slug}: matched ${matched}/${beforeCount} (${afterMeasuredPct.toFixed(1)}%) — ` +
      `measured ${beforeMeasuredPct.toFixed(1)}% -> ${afterMeasuredPct.toFixed(1)}%, ` +
      `median ${beforeMedian.toFixed(1)}m -> ${afterMedian.toFixed(1)}m, ${gzKB.toFixed(0)}KB gz`
  );

  if (gzKB > SIZE_BUDGET_GZ_KB) {
    console.warn(
      `[lariac] ${hood.slug}: WARNING — ${gzKB.toFixed(0)}KB gz exceeds the ${SIZE_BUDGET_GZ_KB}KB budget. ${FILE_SIZE_BUDGET_NOTE}`
    );
  }

  return {
    slug: hood.slug,
    count: beforeCount,
    beforeMeasuredPct,
    afterMeasuredPct,
    beforeMedian,
    afterMedian,
    matched,
    gzKB,
  };
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const neighborhoodsPath = path.join(repoRoot, 'public', 'data', 'neighborhoods.json');
  const allNeighborhoods: NeighborhoodEntry[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8')
  ) as NeighborhoodEntry[];

  const slugArgIdx = process.argv.indexOf('--slug');
  const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : null;
  const runAll = process.argv.includes('--all');
  const useCache = !process.argv.includes('--no-cache');

  if (!slug && !runAll) {
    console.error('Usage: npx tsx pipeline/augment-lariac-heights.ts (--slug <slug> | --all) [--no-cache]');
    process.exit(1);
  }

  const targets = runAll ? allNeighborhoods : allNeighborhoods.filter((n) => n.slug === slug);
  if (targets.length === 0) {
    console.error(`Unknown slug: ${slug}. Available: ${allNeighborhoods.map((n) => n.slug).join(', ')}`);
    process.exit(1);
  }

  const results: AugmentResult[] = [];
  const failed: string[] = [];

  for (const hood of targets) {
    try {
      const result = await augmentNeighborhood(hood, useCache);
      if (result) results.push(result);
    } catch (err) {
      console.error(`[lariac] ${hood.slug} failed:`, err);
      failed.push(hood.slug);
    }
  }

  console.log('\n[lariac] ===== summary =====');
  console.log('slug'.padEnd(16), 'measured before->after'.padEnd(24), 'median before->after');
  for (const r of results) {
    console.log(
      r.slug.padEnd(16),
      `${r.beforeMeasuredPct.toFixed(1)}% -> ${r.afterMeasuredPct.toFixed(1)}%`.padEnd(24),
      `${r.beforeMedian.toFixed(1)}m -> ${r.afterMedian.toFixed(1)}m`
    );
  }

  if (failed.length > 0) {
    console.error(`\n[lariac] failed neighborhoods: ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[lariac] fatal:', err);
  process.exit(1);
});
