import fs from 'fs';
import path from 'path';
import type cache from '../lib/cache.js';

export const name = 'build-manifest';

interface Neighborhood {
  slug: string;
  name: string;
}

interface VenuesFile {
  count: number;
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

export async function run(_cache: typeof cache): Promise<void> {
  const repoRoot = process.cwd();
  const neighborhoodsPath = path.join(repoRoot, 'public', 'data', 'neighborhoods.json');
  const neighborhoods: Neighborhood[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8'),
  ) as Neighborhood[];

  const entries: ManifestEntry[] = neighborhoods.map((hood) => {
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
  console.log(`[build-manifest] written to ${outPath} (${entries.length} neighborhoods)`);
}
