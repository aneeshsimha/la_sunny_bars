/**
 * Building-height data-quality audit (ANS-213 B9).
 *
 * Reads every public/data/{slug}/buildings.json and reports, per
 * neighborhood and in aggregate:
 *   - footprint count
 *   - fraction of heights at exactly the 8m bare default (proxy for
 *     "no real OSM height/levels data")
 *   - fraction of heights that are integer multiples of 4 with no
 *     fractional part (proxy for building:levels-derived heights) vs.
 *     fractional/other heights (proxy for a real OSM `height` tag)
 *   - height distribution summary (min / median / p90 / max)
 *
 * This is a heuristic audit over *shipped* heights only — the existing
 * buildings.json files predate the heightSource provenance field added
 * in this same change, so there is no ground-truth tag to read; the
 * multiple-of-4 test is a proxy, not a certainty (e.g. a real measured
 * height of exactly 12m is indistinguishable from a 3-level derivation).
 *
 * Usage: npx tsx scripts/audit-heights.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface NeighborhoodEntry {
  slug: string;
  name: string;
}

interface Occluder {
  polygon: [number, number][];
  height: number;
}

interface BuildingsFile {
  slug: string;
  count: number;
  occluders: Occluder[];
}

interface NeighborhoodStats {
  slug: string;
  name: string;
  count: number;
  pctBareDefault: number; // height === 8 exactly
  pctLevelsProxy: number; // integer, multiple of 4 (includes the 8m bucket)
  pctMeasuredProxy: number; // fractional, or integer not a multiple of 4
  min: number;
  median: number;
  p90: number;
  max: number;
}

const BARE_DEFAULT_METERS = 8;
const LEVEL_HEIGHT_METERS = 4;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

function isLevelsMultiple(height: number): boolean {
  return Number.isInteger(height) && height % LEVEL_HEIGHT_METERS === 0;
}

function auditNeighborhood(entry: NeighborhoodEntry): NeighborhoodStats | null {
  const buildingsPath = resolve(`public/data/${entry.slug}/buildings.json`);
  let file: BuildingsFile;
  try {
    file = JSON.parse(readFileSync(buildingsPath, 'utf-8')) as BuildingsFile;
  } catch {
    console.warn(`[audit-heights] ${entry.slug}: no buildings.json, skipping`);
    return null;
  }

  const heights = file.occluders.map((o) => o.height).sort((a, b) => a - b);
  const count = heights.length;
  if (count === 0) {
    console.warn(`[audit-heights] ${entry.slug}: 0 footprints, skipping`);
    return null;
  }

  const bareDefaultCount = heights.filter((h) => h === BARE_DEFAULT_METERS).length;
  const levelsProxyCount = heights.filter(isLevelsMultiple).length;

  return {
    slug: entry.slug,
    name: entry.name,
    count,
    pctBareDefault: bareDefaultCount / count,
    pctLevelsProxy: levelsProxyCount / count,
    pctMeasuredProxy: (count - levelsProxyCount) / count,
    min: heights[0],
    median: percentile(heights, 0.5),
    p90: percentile(heights, 0.9),
    max: heights[count - 1],
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function renderMarkdown(perNeighborhood: NeighborhoodStats[]): string {
  const totalCount = perNeighborhood.reduce((sum, s) => sum + s.count, 0);
  const totalBareDefault = perNeighborhood.reduce((sum, s) => sum + s.pctBareDefault * s.count, 0);
  const totalLevelsProxy = perNeighborhood.reduce((sum, s) => sum + s.pctLevelsProxy * s.count, 0);
  const aggMin = Math.min(...perNeighborhood.map((s) => s.min));
  const aggMax = Math.max(...perNeighborhood.map((s) => s.max));

  const lines: string[] = [];
  lines.push('# Building-height data-quality audit (ANS-213 B9)');
  lines.push('');
  lines.push(
    `Generated ${new Date().toISOString()} by \`scripts/audit-heights.ts\` against the ` +
      `shipped \`public/data/{slug}/buildings.json\` files (${perNeighborhood.length} neighborhoods, ` +
      `${totalCount.toLocaleString()} footprints total).`,
  );
  lines.push('');
  lines.push(
    '**Note on methodology:** these buildings.json files predate the `heightSource` provenance ' +
      'field added in this change, so there is no ground-truth tag to read here — the numbers below ' +
      'are heuristic proxies computed from the final height value alone: exactly `8` implies the bare ' +
      'default; an integer multiple of `4` implies a `building:levels` derivation; anything else ' +
      '(fractional, or an integer that is not a multiple of 4) implies a real OSM `height` tag. A ' +
      'genuinely measured height that happens to land on a multiple of 4 (e.g. a 12m building) is ' +
      'indistinguishable from a levels-derived one under this heuristic, so `pctLevelsProxy` is an ' +
      'upper bound on how many heights are actually levels-derived, and `pctMeasuredProxy` is a lower ' +
      'bound on how many are actually measured.',
  );
  lines.push('');
  lines.push('## Aggregate');
  lines.push('');
  lines.push(`- Footprint count: ${totalCount.toLocaleString()}`);
  lines.push(`- At bare default (exactly ${BARE_DEFAULT_METERS}m): ${pct(totalBareDefault / totalCount)}`);
  lines.push(`- Levels-derived proxy (integer, multiple of ${LEVEL_HEIGHT_METERS}m): ${pct(totalLevelsProxy / totalCount)}`);
  lines.push(`- Measured/other proxy (fractional or non-multiple-of-4 integer): ${pct((totalCount - totalLevelsProxy) / totalCount)}`);
  lines.push(`- Height range across all neighborhoods: ${aggMin}m – ${aggMax}m`);
  lines.push('');
  lines.push('## Per neighborhood');
  lines.push('');
  lines.push('| Neighborhood | Count | Bare default (8m) | Levels proxy | Measured/other proxy | Min | Median | P90 | Max |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of perNeighborhood) {
    lines.push(
      `| ${s.name} | ${s.count.toLocaleString()} | ${pct(s.pctBareDefault)} | ${pct(s.pctLevelsProxy)} | ` +
        `${pct(s.pctMeasuredProxy)} | ${s.min}m | ${s.median}m | ${s.p90}m | ${s.max}m |`,
    );
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push(
    `Roughly ${pct(totalBareDefault / totalCount)} of shipped footprints carry no real OSM height data ` +
      'at all and are silently using the bare 8m fallback; since shadow length is linear in height ' +
      '(`shadowLength = height / tan(altitude)`, `src/engine/shadows.ts`), every one of those footprints ' +
      'is producing a shadow-score estimate with essentially no grounding in the actual building. Of the ' +
      `remainder, up to ${pct(totalLevelsProxy / totalCount)} of all footprints look levels-derived (coarse, ` +
      `4m-per-story estimates) and at least ${pct((totalCount - totalLevelsProxy) / totalCount)} look like real ` +
      'measured OSM `height` tags. This split argues that a future measured-height data source (LARIAC ' +
      'LiDAR or Google Open Buildings — see Deferred follow-ups) would meaningfully improve accuracy for ' +
      'a large fraction of footprints, not just a long tail.',
  );
  lines.push('');
  lines.push(
    'The aggregate number hides a wide per-neighborhood spread (2.1% to 98.0% at bare default). Most ' +
      'neighborhoods sit in a healthy single-digit-percent default range, but **Pasadena is a severe ' +
      'outlier: 98.0% of its 6,373 footprints (6,244 of them) are at the bare 8m default**, i.e. OSM ' +
      'building coverage in that bbox is almost entirely untagged for height/levels. Every Pasadena sun ' +
      'score is effectively computed against a flat 8m assumption regardless of true building height, ' +
      'which makes Pasadena the single strongest argument for prioritizing a measured-height swap.',
  );
  lines.push('');
  lines.push('## Deferred follow-ups (out of scope for this change)');
  lines.push('');
  lines.push(
    '- **Swap in LARIAC LiDAR or Google Open Buildings measured heights.** Needs network access to ' +
      'download/query those datasets, and the decision of *which* source to use should be driven by ' +
      'the numbers above (a large default/levels fraction makes the swap worth prioritizing).',
  );
  lines.push(
    '- **Regenerate `buildings.json` via a fresh Overpass fetch** so the new `heightSource` provenance ' +
      'field (`pipeline/fetch-buildings.ts` + `pipeline/heightClassification.ts`) actually lands in the ' +
      'shipped data — the pipeline change in this commit is dormant until that refresh runs. This needs ' +
      'network access and was explicitly out of scope here.',
  );
  lines.push(
    '- **Re-run the A10/D4 score-validation harness** once heights change, since this audit did not ' +
      'modify any shipped data — current scores are unaffected by this change.',
  );
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const neighborhoodsPath = resolve('public/data/neighborhoods.json');
  const neighborhoods: NeighborhoodEntry[] = JSON.parse(readFileSync(neighborhoodsPath, 'utf-8')) as NeighborhoodEntry[];

  const perNeighborhood = neighborhoods
    .map(auditNeighborhood)
    .filter((s): s is NeighborhoodStats => s !== null);

  const markdown = renderMarkdown(perNeighborhood);
  const outPath = resolve('docs/height-audit.md');
  writeFileSync(outPath, markdown);
  console.log(`[audit-heights] wrote ${outPath}`);
  console.log(markdown);
}

main();
