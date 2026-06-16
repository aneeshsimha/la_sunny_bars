import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type cache from '../lib/cache.js';

export const name = 'match-places';

interface Neighborhood {
  slug: string;
  name: string;
}

function spawnMatch(slug: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      'match-places.ts',
    );
    const child = spawn('npx', ['tsx', scriptPath, '--slug', slug], {
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`match-places exited with code ${code} for slug ${slug}`));
      }
    });
    child.on('error', reject);
  });
}

export async function run(_cache: typeof cache): Promise<void> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[match-places] GOOGLE_PLACES_API_KEY not set — skipping step');
    return;
  }

  const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
  const neighborhoods: Neighborhood[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8'),
  ) as Neighborhood[];

  console.log(`[match-places] enriching ${neighborhoods.length} neighborhoods...`);

  for (const hood of neighborhoods) {
    console.log(`[match-places] ${hood.slug}...`);
    await spawnMatch(hood.slug);
  }

  console.log('[match-places] all neighborhoods enriched.');
}
