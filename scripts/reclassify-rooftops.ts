#!/usr/bin/env tsx
/**
 * ANS-236: Reclassify rooftop venues.
 *
 * Activates the D6 roof-height scoring path (and ANS-238 slope), which has
 * been dormant because `deriveSeatingType` was matching 0 rooftop venues
 * across all 15 neighborhoods. This script re-checks every venue in every
 * public/data/<slug>/venues.json against the rooftop signal (high-precision
 * name pattern + curated name/coord list, see pipeline/derive-metadata.ts
 * and pipeline/rooftopVenues.ts) and upgrades matches to
 * `seatingType: 'rooftop'`.
 *
 * Only ever upgrades TO 'rooftop' — an existing non-null `seatingType`
 * (e.g. 'patio', 'indoor') is left untouched unless the venue matches the
 * rooftop signal, in which case rooftop wins (rooftop is a more specific
 * classification than the ground-level heuristics that produced 'patio').
 * This does not require re-running the B10 building-link step: linkage
 * fields (buildingId/buildingHeight/buildingCentroid/facadeAzimuths) are
 * untouched.
 *
 * Offline — no network calls.
 *
 * Usage: npx tsx scripts/reclassify-rooftops.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { isRooftopVenue } from '../pipeline/derive-metadata.js';
import type { NeighborhoodVenueFile } from '../pipeline/schema.js';

interface NeighborhoodEntry {
  slug: string;
  name: string;
}

function main(): void {
  const repoRoot = process.cwd();
  const neighborhoodsPath = path.join(repoRoot, 'public', 'data', 'neighborhoods.json');
  const neighborhoods: NeighborhoodEntry[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8'),
  ) as NeighborhoodEntry[];

  const perNeighborhoodCounts: { slug: string; rooftopCount: number; total: number }[] = [];
  let totalRooftops = 0;

  for (const hood of neighborhoods) {
    const venuesPath = path.join(repoRoot, 'public', 'data', hood.slug, 'venues.json');
    if (!fs.existsSync(venuesPath)) {
      console.log(`[reclassify-rooftops] ${hood.slug}: venues.json not found, skipping`);
      continue;
    }

    const file: NeighborhoodVenueFile = JSON.parse(
      fs.readFileSync(venuesPath, 'utf-8'),
    ) as NeighborhoodVenueFile;

    let upgraded = 0;
    let rooftopCount = 0;

    const venues = file.venues.map((venue) => {
      if (venue.seatingType === 'rooftop') {
        rooftopCount++;
        return venue;
      }

      if (isRooftopVenue(venue)) {
        upgraded++;
        rooftopCount++;
        return { ...venue, seatingType: 'rooftop' as const };
      }

      return venue;
    });

    if (upgraded > 0) {
      const updated: NeighborhoodVenueFile = { ...file, venues };
      fs.writeFileSync(venuesPath, JSON.stringify(updated, null, 2) + '\n');
    }

    perNeighborhoodCounts.push({ slug: hood.slug, rooftopCount, total: file.venues.length });
    totalRooftops += rooftopCount;

    console.log(
      `[reclassify-rooftops] ${hood.slug}: ${upgraded} upgraded, ${rooftopCount}/${file.venues.length} rooftop total`,
    );
  }

  console.log('\n[reclassify-rooftops] ===== summary =====');
  for (const { slug, rooftopCount, total } of perNeighborhoodCounts) {
    console.log(`  ${slug.padEnd(16)} ${rooftopCount}/${total}`);
  }
  console.log(`  ${'TOTAL'.padEnd(16)} ${totalRooftops}`);

  // Count guard: 0 rooftops across all 15 datasets means the D6 roof-height
  // path stays dormant — that's exactly the bug this script exists to fix.
  if (totalRooftops === 0) {
    console.error(
      '\n[reclassify-rooftops] FATAL: 0 rooftop venues classified across all neighborhoods. ' +
        'This would leave D6 roof-height scoring dormant — refusing to treat this as success.',
    );
    process.exit(1);
  }
}

main();
