#!/usr/bin/env tsx
/**
 * Pipeline orchestrator.
 *
 * Usage:
 *   npx tsx pipeline/run.ts [--force] [--step <name>]
 *
 *   --force        Clear the cache before running
 *   --step <name>  Run only the step with the given name
 *
 * Each file in pipeline/steps/*.ts must export:
 *   name: string
 *   run(cache: Cache): Promise<void>
 */

import fs from 'fs';
import path from 'path';
import cache from './lib/cache.js';

interface Step {
  name: string;
  run(c: typeof cache): Promise<void>;
}

const args = process.argv.slice(2);
const forceFlag = args.includes('--force');
const stepArgIdx = args.indexOf('--step');
const onlyStep = stepArgIdx !== -1 ? args[stepArgIdx + 1] : null;

async function loadSteps(): Promise<Step[]> {
  const stepsDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'steps');
  if (!fs.existsSync(stepsDir)) {
    return [];
  }
  const files = fs
    .readdirSync(stepsDir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .sort();

  const steps: Step[] = [];
  for (const file of files) {
    const filePath = path.join(stepsDir, file);
    const mod = (await import(filePath)) as Partial<Step>;
    if (typeof mod.name !== 'string' || typeof mod.run !== 'function') {
      console.warn(`Skipping ${file}: missing 'name' or 'run' export`);
      continue;
    }
    steps.push({ name: mod.name, run: mod.run });
  }
  return steps;
}

async function main(): Promise<void> {
  if (forceFlag) {
    console.log('--force: clearing cache...');
    await cache.clear();
  }

  const steps = await loadSteps();

  if (steps.length === 0) {
    console.log('No steps found in pipeline/steps/.');
    return;
  }

  const stepsToRun = onlyStep
    ? steps.filter((s) => s.name === onlyStep)
    : steps;

  if (onlyStep && stepsToRun.length === 0) {
    console.error(`No step named '${onlyStep}'. Available: ${steps.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  for (const step of stepsToRun) {
    const cached = await cache.has(step.name);
    if (cached && !forceFlag) {
      console.log(`[skip] ${step.name} (cached)`);
      continue;
    }
    console.log(`[run]  ${step.name}...`);
    const t0 = Date.now();
    await step.run(cache);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[done] ${step.name} (${elapsed}s)`);
  }

  console.log('Pipeline complete.');
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
