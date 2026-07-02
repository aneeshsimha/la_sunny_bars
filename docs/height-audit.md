# Building-height data-quality audit (ANS-213 B9)

Generated 2026-07-02T00:11:57.662Z by `scripts/audit-heights.ts` against the shipped `public/data/{slug}/buildings.json` files (15 neighborhoods, 113,883 footprints total).

**Note on methodology:** these buildings.json files predate the `heightSource` provenance field added in this change, so there is no ground-truth tag to read here — the numbers below are heuristic proxies computed from the final height value alone: exactly `8` implies the bare default; an integer multiple of `4` implies a `building:levels` derivation; anything else (fractional, or an integer that is not a multiple of 4) implies a real OSM `height` tag. A genuinely measured height that happens to land on a multiple of 4 (e.g. a 12m building) is indistinguishable from a levels-derived one under this heuristic, so `pctLevelsProxy` is an upper bound on how many heights are actually levels-derived, and `pctMeasuredProxy` is a lower bound on how many are actually measured.

## Aggregate

- Footprint count: 113,883
- At bare default (exactly 8m): 9.8%
- Levels-derived proxy (integer, multiple of 4m): 11.6%
- Measured/other proxy (fractional or non-multiple-of-4 integer): 88.4%
- Height range across all neighborhoods: 0m – 335.3m

## Per neighborhood

| Neighborhood | Count | Bare default (8m) | Levels proxy | Measured/other proxy | Min | Median | P90 | Max |
|---|---|---|---|---|---|---|---|---|
| Silver Lake | 7,720 | 8.0% | 8.5% | 91.5% | 6m | 7.7m | 10m | 52.5m |
| Venice | 9,415 | 3.7% | 3.8% | 96.2% | 5m | 6.6m | 9.2m | 72m |
| Downtown LA | 3,857 | 7.0% | 10.2% | 89.8% | 0.5m | 8m | 29.4m | 335.3m |
| West Hollywood | 9,971 | 6.3% | 8.6% | 91.4% | 0.4m | 5.9m | 9.3m | 115.4m |
| Santa Monica | 7,862 | 6.0% | 6.3% | 93.7% | 5m | 7.4m | 10.6m | 93.4m |
| Echo Park | 7,430 | 3.1% | 4.9% | 95.1% | 0.3m | 5.8m | 8.9m | 45.4m |
| Los Feliz | 9,840 | 2.4% | 3.7% | 96.3% | 0.3m | 6.2m | 10.1m | 52.5m |
| Hollywood | 6,290 | 7.5% | 9.8% | 90.2% | 0.3m | 6.6m | 11.1m | 93.6m |
| Koreatown | 4,870 | 4.4% | 6.5% | 93.5% | 0.8m | 7.8m | 13.9m | 134m |
| Beverly Hills | 9,156 | 7.1% | 9.2% | 90.8% | 1.6m | 6.9m | 9.8m | 175.2m |
| Eagle Rock | 8,907 | 2.1% | 4.2% | 95.8% | 0.3m | 4.7m | 8m | 39m |
| Culver City | 5,699 | 3.6% | 6.7% | 93.3% | 1.7m | 5m | 8.1m | 46.9m |
| Mid-Wilshire | 7,468 | 2.1% | 4.0% | 96.0% | 0m | 6.3m | 9.5m | 55.9m |
| Sawtelle | 9,025 | 3.0% | 5.8% | 94.2% | 0.5m | 5m | 8.6m | 99.3m |
| Pasadena | 6,373 | 98.0% | 99.3% | 0.7% | 2.3m | 8m | 8m | 65m |

## Interpretation

Roughly 9.8% of shipped footprints carry no real OSM height data at all and are silently using the bare 8m fallback; since shadow length is linear in height (`shadowLength = height / tan(altitude)`, `src/engine/shadows.ts`), every one of those footprints is producing a shadow-score estimate with essentially no grounding in the actual building. Of the remainder, up to 11.6% of all footprints look levels-derived (coarse, 4m-per-story estimates) and at least 88.4% look like real measured OSM `height` tags. This split argues that a future measured-height data source (LARIAC LiDAR or Google Open Buildings — see Deferred follow-ups) would meaningfully improve accuracy for a large fraction of footprints, not just a long tail.

The aggregate number hides a wide per-neighborhood spread (2.1% to 98.0% at bare default). Most neighborhoods sit in a healthy single-digit-percent default range, but **Pasadena is a severe outlier: 98.0% of its 6,373 footprints (6,244 of them) are at the bare 8m default**, i.e. OSM building coverage in that bbox is almost entirely untagged for height/levels. Every Pasadena sun score is effectively computed against a flat 8m assumption regardless of true building height, which makes Pasadena the single strongest argument for prioritizing a measured-height swap.

## Deferred follow-ups (out of scope for this change)

- **Swap in LARIAC LiDAR or Google Open Buildings measured heights.** Needs network access to download/query those datasets, and the decision of *which* source to use should be driven by the numbers above (a large default/levels fraction makes the swap worth prioritizing).
- **Regenerate `buildings.json` via a fresh Overpass fetch** so the new `heightSource` provenance field (`pipeline/fetch-buildings.ts` + `pipeline/heightClassification.ts`) actually lands in the shipped data — the pipeline change in this commit is dormant until that refresh runs. This needs network access and was explicitly out of scope here.
- **Re-run the A10/D4 score-validation harness** once heights change, since this audit did not modify any shipped data — current scores are unaffected by this change.
