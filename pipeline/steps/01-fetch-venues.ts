import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type cache from '../lib/cache.js';

export const name = 'fetch-venues';

interface Neighborhood {
  slug: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
}

function spawnFetch(slug: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fetch-venues-v2.ts');
    const child = spawn('npx', ['tsx', scriptPath, '--slug', slug], {
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('fetch-venues-v2 exited with code ' + code + ' for slug ' + slug));
      }
    });
    child.on('error', reject);
  });
}

export async function run(_cache: typeof cache): Promise<void> {
  const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
  const neighborhoods: Neighborhood[] = JSON.parse(
    fs.readFileSync(neighborhoodsPath, 'utf-8')
  ) as Neighborhood[];

  console.log('Fetching venues for ' + neighborhoods.length + ' neighborhoods...');

  for (const hood of neighborhoods) {
    console.log('[fetch-venues] ' + hood.slug + '...');
    await spawnFetch(hood.slug);
  }

  console.log('All neighborhood venue files written.');
}
