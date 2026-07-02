import fs from 'fs';
import path from 'path';
import cache from '../lib/cache.js';
import { linkVenueToBuilding, type Occluder } from '../linkBuildings.js';
import type { NeighborhoodVenueFile, VenueRecord } from '../schema.js';

export const name = 'link-buildings';

interface Neighborhood {
  slug: string;
  name: string;
}

interface BuildingsFile {
  slug: string;
  count: number;
  occluders: Occluder[];
}

interface LinkResult {
  matched: number;
  total: number;
}

function linkNeighborhood(slug: string): LinkResult | null {
  const repoRoot = process.cwd();
  const venuesPath = path.join(repoRoot, 'public', 'data', slug, 'venues.json');
  const buildingsPath = path.join(repoRoot, 'public', 'data', slug, 'buildings.json');

  if (!fs.existsSync(venuesPath)) {
    console.log(`[link-buildings] ${slug}: venues.json not found, skipping`);
    return null;
  }

  const venuesFile: NeighborhoodVenueFile = JSON.parse(
    fs.readFileSync(venuesPath, 'utf-8'),
  ) as NeighborhoodVenueFile;

  const occluders: Occluder[] = fs.existsSync(buildingsPath)
    ? (JSON.parse(fs.readFileSync(buildingsPath, 'utf-8')) as BuildingsFile).occluders
    : [];

  let matched = 0;
  const venues: VenueRecord[] = venuesFile.venues.map((venue) => {
    const link = linkVenueToBuilding(venue.coords, occluders);
    if (link.buildingId !== null) matched++;
    return { ...venue, ...link };
  });

  const updated: NeighborhoodVenueFile = { ...venuesFile, venues };
  fs.writeFileSync(venuesPath, JSON.stringify(updated, null, 2));

  const total = venues.length;
  const rate = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';
  console.log(`[link-buildings] ${slug}: ${matched}/${total} matched (${rate}%)`);

  return { matched, total };
}

export async function run(_cache: typeof cache, slugFilter?: string): Promise<void> {
  const repoRoot = process.cwd();
  const neighborhoodsPath = path.join(repoRoot, 'public', 'data', 'neighborhoods.json');
  const neighborhoods: Neighborhood[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8'),
  ) as Neighborhood[];

  const targets = slugFilter
    ? neighborhoods.filter((hood) => hood.slug === slugFilter)
    : neighborhoods;

  let totalMatched = 0;
  let totalVenues = 0;

  for (const hood of targets) {
    const result = linkNeighborhood(hood.slug);
    if (result) {
      totalMatched += result.matched;
      totalVenues += result.total;
    }
  }

  const aggregateRate = totalVenues > 0 ? ((totalMatched / totalVenues) * 100).toFixed(1) : '0.0';
  console.log(
    `[link-buildings] aggregate: ${totalMatched}/${totalVenues} matched (${aggregateRate}%), ${totalVenues - totalMatched} unmatched`,
  );
}

// Only auto-run when this file is executed directly (e.g. via
// `npx tsx pipeline/steps/06-link-buildings.ts --slug venice`), not when
// pipeline/run.ts dynamically imports it as a step module.
const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const slugArgIdx = process.argv.indexOf('--slug');
  const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : undefined;
  run(cache, slug).catch((err) => {
    console.error('[link-buildings] failed:', err);
    process.exit(1);
  });
}
