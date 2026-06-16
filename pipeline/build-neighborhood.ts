#!/usr/bin/env tsx
/**
 * Build all pipeline data for a single neighborhood.
 *
 * Usage: npx tsx pipeline/build-neighborhood.ts --slug silver-lake
 *
 * Runs in sequence:
 *   1. fetch-venues-v2
 *   2. fetch-trees (optional — app handles missing trees gracefully)
 *   3. fetch-buildings
 *   4. derive-metadata (via steps/04-derive-metadata.ts driver)
 */

import path from 'path';
import { spawnSync } from 'child_process';

const slugArgIdx = process.argv.indexOf('--slug');
if (slugArgIdx === -1 || !process.argv[slugArgIdx + 1]) {
  console.error('Usage: npx tsx pipeline/build-neighborhood.ts --slug <slug>');
  process.exit(1);
}
const slug = process.argv[slugArgIdx + 1];

const pipelineDir = path.dirname(new URL(import.meta.url).pathname);

interface Step {
  label: string;
  script: string;
  args: string[];
  optional?: boolean;
}

const steps: Step[] = [
  {
    label: 'fetch-venues-v2',
    script: path.join(pipelineDir, 'fetch-venues-v2.ts'),
    args: ['--slug', slug],
  },
  {
    label: 'fetch-trees',
    script: path.join(pipelineDir, 'fetch-trees.ts'),
    args: ['--slug', slug],
    optional: true,
  },
  {
    label: 'fetch-buildings',
    script: path.join(pipelineDir, 'fetch-buildings.ts'),
    args: ['--slug', slug],
  },
  {
    label: 'derive-metadata',
    script: path.join(pipelineDir, 'steps', '04-derive-metadata.ts'),
    args: [],
  },
];

console.log(`[build-neighborhood] slug: ${slug}`);

for (const step of steps) {
  console.log(`\n[build-neighborhood] running ${step.label}...`);
  const result = spawnSync('npx', ['tsx', step.script, ...step.args], {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    if (step.optional) {
      console.warn(`[build-neighborhood] step '${step.label}' failed (optional — continuing without it)`);
    } else {
      console.error(`[build-neighborhood] step '${step.label}' failed with exit code ${result.status ?? 'null'}`);
      process.exit(1);
    }
  }
}

console.log(`\n[build-neighborhood] ${slug} complete.`);
