#!/usr/bin/env tsx
/**
 * Build all neighborhoods and write public/data/index.json manifest.
 *
 * Usage:
 *   npx tsx pipeline/build-all.ts
 *   npx tsx pipeline/build-all.ts --slugs silver-lake,venice
 *
 * For each neighborhood, runs build-neighborhood.ts --slug <slug>.
 * Failures are logged but other neighborhoods continue.
 * After all complete, writes public/data/index.json.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

interface Neighborhood {
  slug: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
}

interface VenuesFile {
  count: number;
  venues?: { placesId: string | null }[];
}

interface BuildingsFile {
  count: number;
}

interface ManifestEntry {
  slug: string;
  name: string;
  venueCount: number;
  buildingCount: number;
}

interface Manifest {
  generatedAt: string;
  neighborhoods: ManifestEntry[];
}

const pipelineDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = process.cwd();

// Parse --slugs arg
const slugsArgIdx = process.argv.indexOf('--slugs');
const slugsFilter: string[] | null =
  slugsArgIdx !== -1 && process.argv[slugsArgIdx + 1]
    ? process.argv[slugsArgIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
    : null;

// Parse --max-venues <n> (default: 500) — skip neighborhoods that would exceed this
const maxVenuesArgIdx = process.argv.indexOf('--max-venues');
const maxVenues: number =
  maxVenuesArgIdx !== -1 && process.argv[maxVenuesArgIdx + 1]
    ? parseInt(process.argv[maxVenuesArgIdx + 1], 10)
    : 500;

// Parse --min-match-rate <n> (default: 0) — skip if Places match rate too low (0–100)
const minMatchRateArgIdx = process.argv.indexOf('--min-match-rate');
const minMatchRate: number =
  minMatchRateArgIdx !== -1 && process.argv[minMatchRateArgIdx + 1]
    ? parseFloat(process.argv[minMatchRateArgIdx + 1])
    : 0;

const neighborhoodsPath = path.join(repoRoot, 'public', 'data', 'neighborhoods.json');
const allNeighborhoods: Neighborhood[] = JSON.parse(
  fs.readFileSync(neighborhoodsPath, 'utf-8'),
) as Neighborhood[];

const neighborhoods = slugsFilter
  ? allNeighborhoods.filter((n) => slugsFilter.includes(n.slug))
  : allNeighborhoods;

if (slugsFilter) {
  const unknown = slugsFilter.filter((s) => !allNeighborhoods.some((n) => n.slug === s));
  if (unknown.length > 0) {
    console.warn(`[build-all] warning: unknown slugs: ${unknown.join(', ')}`);
  }
}

console.log(`[build-all] building ${neighborhoods.length} neighborhoods...`);
console.log(`[build-all] max-venues: ${maxVenues}, min-match-rate: ${minMatchRate}`);

const buildNeighborhoodScript = path.join(pipelineDir, 'build-neighborhood.ts');
const failed: string[] = [];
const skipped: string[] = [];

for (const hood of neighborhoods) {
  console.log(`\n[build-all] ===== ${hood.slug} =====`);

  // Pre-flight: if a venues file already exists, check --max-venues and --min-match-rate
  const venuesPath = path.join(repoRoot, 'public', 'data', hood.slug, 'venues.json');
  if (fs.existsSync(venuesPath)) {
    const venuesFile = JSON.parse(fs.readFileSync(venuesPath, 'utf-8')) as VenuesFile;
    const existingCount = venuesFile.count ?? 0;
    if (existingCount > maxVenues) {
      console.log(
        `[build-all] skipping ${hood.slug}: existing venue count ${existingCount} > max-venues ${maxVenues}`,
      );
      skipped.push(hood.slug);
      continue;
    }
    if (minMatchRate > 0 && venuesFile.venues) {
      const matched = venuesFile.venues.filter((v) => v.placesId !== null).length;
      const rate = venuesFile.venues.length > 0 ? (matched / venuesFile.venues.length) * 100 : 0;
      if (rate < minMatchRate) {
        console.log(
          `[build-all] skipping ${hood.slug}: match rate ${rate.toFixed(1)}% < min-match-rate ${minMatchRate}%`,
        );
        skipped.push(hood.slug);
        continue;
      }
    }
  }

  const result = spawnSync('npx', ['tsx', buildNeighborhoodScript, '--slug', hood.slug], {
    stdio: 'inherit',
    shell: false,
    cwd: repoRoot,
  });
  if (result.status !== 0) {
    console.error(`[build-all] ${hood.slug} failed with exit code ${result.status ?? 'null'}`);
    failed.push(hood.slug);
  } else {
    // Log stats after successful build
    const buildingsPath = path.join(repoRoot, 'public', 'data', hood.slug, 'buildings.json');
    let venueCount = 0;
    let buildingCount = 0;
    let matchRate = 'n/a';
    if (fs.existsSync(venuesPath)) {
      const vf = JSON.parse(fs.readFileSync(venuesPath, 'utf-8')) as VenuesFile;
      venueCount = vf.count ?? 0;
      if (vf.venues) {
        const matched = vf.venues.filter((v) => v.placesId !== null).length;
        matchRate = vf.venues.length > 0
          ? `${((matched / vf.venues.length) * 100).toFixed(1)}%`
          : '0.0%';
      }
    }
    if (fs.existsSync(buildingsPath)) {
      const bf = JSON.parse(
        fs.readFileSync(buildingsPath, 'utf-8'),
      ) as BuildingsFile;
      buildingCount = bf.count ?? 0;
    }
    console.log(
      `[build-all] ${hood.slug}: venues=${venueCount}, buildings=${buildingCount}, matchRate=${matchRate}`,
    );
  }
}

if (skipped.length > 0) {
  console.log(`\n[build-all] skipped neighborhoods: ${skipped.join(', ')}`);
}

if (failed.length > 0) {
  console.error(`\n[build-all] failed neighborhoods: ${failed.join(', ')}`);
}

// Write manifest for all neighborhoods (including failed ones with best-effort counts)
console.log('\n[build-all] writing manifest...');

const entries: ManifestEntry[] = allNeighborhoods.map((hood) => {
  const venuesPath = path.join(repoRoot, 'public', 'data', hood.slug, 'venues.json');
  const buildingsPath = path.join(repoRoot, 'public', 'data', hood.slug, 'buildings.json');

  let venueCount = 0;
  let buildingCount = 0;

  if (fs.existsSync(venuesPath)) {
    const file = JSON.parse(fs.readFileSync(venuesPath, 'utf-8')) as VenuesFile;
    venueCount = file.count ?? 0;
  }

  if (fs.existsSync(buildingsPath)) {
    const file = JSON.parse(fs.readFileSync(buildingsPath, 'utf-8')) as BuildingsFile;
    buildingCount = file.count ?? 0;
  }

  return { slug: hood.slug, name: hood.name, venueCount, buildingCount };
});

const manifest: Manifest = {
  generatedAt: new Date().toISOString(),
  neighborhoods: entries,
};

const outPath = path.join(repoRoot, 'public', 'data', 'index.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`[build-all] manifest written to ${outPath}`);

if (failed.length > 0) {
  process.exit(1);
}
