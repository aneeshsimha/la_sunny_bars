import fs from 'fs';
import path from 'path';
import type cache from '../lib/cache.js';
import { enrichVenuesLocally } from '../derive-metadata.js';
import type { NeighborhoodVenueFile } from '../schema.js';

export const name = 'derive-metadata';

interface Neighborhood {
  slug: string;
  name: string;
}

export async function run(_cache: typeof cache): Promise<void> {
  const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
  const neighborhoods: Neighborhood[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8'),
  ) as Neighborhood[];

  console.log(`[derive-metadata] enriching ${neighborhoods.length} neighborhoods...`);

  for (const hood of neighborhoods) {
    const venuesPath = path.join(
      process.cwd(),
      'public',
      'data',
      hood.slug,
      'venues.json',
    );

    if (!fs.existsSync(venuesPath)) {
      console.log(`[derive-metadata] ${hood.slug}: venues.json not found, skipping`);
      continue;
    }

    const file: NeighborhoodVenueFile = JSON.parse(
      fs.readFileSync(venuesPath, 'utf-8'),
    ) as NeighborhoodVenueFile;

    const enriched = enrichVenuesLocally(file.venues);

    const updated: NeighborhoodVenueFile = {
      ...file,
      venues: enriched,
    };

    fs.writeFileSync(venuesPath, JSON.stringify(updated, null, 2));
    console.log(`[derive-metadata] ${hood.slug}: ${enriched.length} venues enriched`);
  }

  console.log('[derive-metadata] done.');
}
