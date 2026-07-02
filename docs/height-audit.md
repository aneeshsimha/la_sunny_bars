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

## v2 — LARIAC measured-height augmentation (ANS-235)

Generated 2026-07-02 by `pipeline/augment-lariac-heights.ts` against LA County's `LARIAC6_BUILDINGS_2020` FeatureServer (`Countywide_Building_Outlines_(2020)`, layer 0). This is a real, LiDAR-measured `HEIGHT`/`ELEV` (feet) dataset, matched against each existing OSM footprint's centroid within a 20m radius — **not** the heuristic proxy the v1 audit above used. Matched footprints get `heightSource: 'measured'`, a `height` in meters (`HEIGHT_ft * 0.3048`), and `baseElev` in meters (`ELEV_ft * 0.3048`, stored for the upcoming D6.2 slope work but **not yet wired into scoring**). Unmatched footprints keep their existing height and fall back to the v1 proxy heuristic (`classifyExistingHeight`) for `heightSource`, since the shipped files predate raw OSM tags being preserved.

**Unit verification:** LARIAC `HEIGHT`/`ELEV` are in feet. Verified live against US Bank Tower (LARIAC `HEIGHT` = 1016.83, i.e. its known ~1018ft height) — `1016.83 * 0.3048 = 309.93m`, not ~1000m. This exact value is a golden-assertion unit test in `pipeline/lariac.test.ts`.

**Fetcher note:** the ArcGIS query needs `outSR=4326` in addition to `inSR=4326` — without it, `returnCentroid=true` returns centroids in the service's default spatial reference (Web Mercator / EPSG:3857 meters), not lng/lat degrees, which would silently produce nonsense distances against the 20m match radius. Confirmed via a live query before writing the fetcher.

### Per-neighborhood: measured-coverage before -> after

"Before" is the v1 proxy heuristic on the pre-LARIAC shipped heights; "after" reads the real `heightSource` field post-augmentation.

| Neighborhood | Count | Measured before | Measured after | Median before | Median after |
|---|---|---|---|---|---|
| Silver Lake | 7,720 | 91.5% | 99.3% | 7.7m | 7.6m |
| Venice | 9,415 | 96.2% | 99.9% | 6.6m | 6.7m |
| Downtown LA | 3,857 | 89.8% | 97.0% | 8.0m | 8.1m |
| West Hollywood | 9,971 | 91.4% | 99.7% | 5.9m | 5.9m |
| Santa Monica | 7,862 | 93.7% | 99.0% | 7.4m | 7.4m |
| Echo Park | 7,430 | 95.1% | 99.9% | 5.8m | 5.8m |
| Los Feliz | 9,840 | 96.3% | 99.8% | 6.2m | 6.2m |
| Hollywood | 6,290 | 90.2% | 98.8% | 6.6m | 6.4m |
| Koreatown | 4,870 | 93.5% | 99.4% | 7.8m | 7.7m |
| Beverly Hills | 9,156 | 90.8% | 99.7% | 6.9m | 6.8m |
| Eagle Rock | 8,907 | 95.8% | 99.2% | 4.7m | 4.7m |
| Culver City | 5,699 | 93.3% | 99.4% | 5.0m | 5.0m |
| Mid-Wilshire | 7,468 | 96.0% | 99.9% | 6.3m | 6.3m |
| Sawtelle | 9,025 | 94.2% | 99.8% | 5.0m | 5.0m |
| **Pasadena** | 6,373 | **0.7%** | **29.9%** (NOT shipped — see below) | 8.0m | 8.0m (unchanged) |

**Aggregate (14 shipped neighborhoods, excluding Pasadena):** 107,510 footprints, 93.6% -> 99.4% measured.

**Aggregate (all 15, as actually shipped — Pasadena withheld/unchanged):** 113,883 footprints, 88.4% -> 93.9% measured. (For reference, if Pasadena's 29.9%-matched-but-unshipped result were included instead of left unchanged, the all-15 aggregate would be 95.6% — this is not what's in the shipped data.)

### Pasadena: acceptance gate NOT met — data withheld

The ANS-235 brief's acceptance gate required Pasadena to jump from ~2% measured to "a large majority," with an explicit instruction to **stop and not ship** if it didn't, since a shortfall was expected to mean the match radius or query was wrong. It reached only **29.9%** (1,903/6,373), so per that guardrail, Pasadena's `buildings.json` was **not regenerated in this change** — `git checkout` reverted it back to the pre-LARIAC file, and `venues.json`/`buildingHeight` for Pasadena is likewise untouched.

This was investigated and is **not a bug** in the fetcher, units, or match radius:

1. **The 20m match radius and query are correct** — verified against DTLA/Santa Monica/Silver Lake, which all land at 97–99.9% measured with the identical code path.
2. **LARIAC's height coverage for Pasadena's bbox is itself sparse**: of 15,652 `CODE='Building'` polygons in the Pasadena bbox, only 882 (5.6%) have any non-null `HEIGHT`/`ELEV` at all — confirmed via `returnCountOnly` queries with a `HEIGHT IS NOT NULL` filter. The same check for DTLA/Santa Monica/Silver Lake bboxes shows 93–98% non-null coverage. Many of Pasadena's null-height records carry `SOURCE: "Pasadena", DATE_: "2008"` (the city's own 2008 footprint survey, contributed without height attribution), unlike the LARIAC4/5/6 countywide LiDAR passes used elsewhere.
3. **A wider match radius doesn't rescue this** — it was tested up to 500m, where the match rate approaches 100% only because Pasadena's few height-bearing buildings become "close enough" to nearly everything by chance, which would assign essentially random/wrong heights, not real ones. Radius sensitivity: 20m -> 29.9%, 50m -> 70.3%, 100m -> 94.1%, 200m -> 99.9%. There's no radius that's both accurate and gets a "large majority."
4. **Point-in-polygon containment (fetching full LARIAC geometry, not just centroids) was also tested** as an alternative to centroid-distance matching, in case footprint-centroid mismatch (not radius) was the cause — it performed *worse* (10.2%), ruling that out and confirming the 20m centroid match is already the more effective method available.

**Conclusion:** Pasadena's low match rate reflects a genuine, verified gap in the source dataset (most Pasadena building polygons in LARIAC simply have no measured height), not a fetcher defect. Reaching "large majority" for Pasadena would need a different data source (e.g. Google Open Buildings, or the City of Pasadena's own building height data if it publishes one) — carried forward as a follow-up, distinct from the general LARIAC swap this change ships for the other 14 neighborhoods.

### File-size check

All 15 `buildings.json` remain under the existing ~800KB-gzip-per-neighborhood budget (the ANS-126 height filter baked into silver-lake/venice/santa-monica's footprint sets was untouched — this change augments fields on existing footprints, it does not re-fetch or add/drop any). Highest post-augmentation: Los Feliz at 795KB gz (was 737KB). An early version of the augmentation left LARIAC feet->meters conversion unrounded (e.g. `height: 7.290816000000001`), which pushed venice/weho/los-feliz over budget; rounding `height`/`baseElev` to 2 decimal places of meters fixed this and is well within LARIAC's own measurement precision.
