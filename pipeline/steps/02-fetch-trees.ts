import { execFileSync } from 'child_process';
import path from 'path';
import type cache from '../lib/cache.js';

export const name = 'fetch-trees';

const SLUGS = [
  'silver-lake',
  'venice',
  'dtla',
  'weho',
  'santa-monica',
  'echo-park',
  'los-feliz',
  'hollywood',
  'koreatown',
  'beverly-hills',
];

export async function run(_cache: typeof cache): Promise<void> {
  const scriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'fetch-trees.ts'
  );

  for (const slug of SLUGS) {
    console.log(`  fetch-trees: ${slug}`);
    execFileSync('npx', ['tsx', scriptPath, '--slug', slug], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  }
}
