# Sunlight-on-Buildings: Design Exploration Synthesis

LA Sunny Bars — extending the existing ground-shadow + venue-scoring + time-slider sim to make sunlight visibly fall on the 3D buildings. Next.js 16 + Mapbox GL 3.20, no three.js.

## What already exists (verified against source)

Before comparing options, here is the ground truth I confirmed by reading the code — some of it diverges from the research summaries, and the divergences matter:

- **`src/map/layers/buildingLayer.ts`** already renders a `fill-extrusion` layer `"3d-buildings"` (source `composite`, source-layer `building`), `fill-extrusion-color: "#aaa"`, opacity `0.85`, minzoom 12 (`buildingLayer.ts:16-52`).
- **`updateSunLight()`** (`buildingLayer.ts:55-78`) already calls the **legacy** `map.setLight({ anchor:"map", position:[1.15, azimuthDeg, altitudeDeg], intensity:0.5, color:"white" })`. So directional facade shading already works today. The research finding #1 is correct that this is an *upgrade* not a new feature. Note the actual call uses the legacy `position: [radial, azimuth, polar]` form, **not** the `setLights` 3D-lights form yet.
- **The sky sun is already animated** inside `updateSunLight()` (`buildingLayer.ts:74-77`) via `setPaintProperty("sky","sky-atmosphere-sun",[azimuthDeg, polarDeg])`. Finding #3's claim that this is "under-exploited" is partly stale — sun *position* already tracks; only sun *intensity/color* is static.
- **`setFog()`** is called once at `style.load` in **`src/map/createMap.ts:26-46`** and is never updated afterward — finding #3's reactive-fog claim holds.
- **`updateSunLight` is driven by the time store** subscription in **`src/map/bindStores.ts:85-98`** (SunCalc `getPosition` → `updateSunLight(map, azimuth, altitude)`), throttled indirectly alongside `scheduleShadows()` (the `SHADOW_THROTTLE_MS = 120` throttle at `bindStores.ts:17,60-73` gates the *shadow polygon* recompute; `updateSunLight` itself is called on every time tick, unthrottled, but it is only cheap GPU state updates).
- **Ground-shadow engine** lives in **`src/engine/shadows.ts`**: `computeShadowPolygon(occluder, sun)` (`shadows.ts:64-105`) projects footprint vertices by `shadowLength = height / tan(altitude)`; `isPointInPolygon` (`shadows.ts:237-258`). The viewport cap (`cap = 2500`, nearest-to-center) lives in **`src/map/layers/shadowLayer.ts:34-92`**.
- **Spatial index**: `src/engine/spatial.ts` (Flatbush) — `getCandidateOccluders(index, point, radius)` (`spatial.ts:44-64`).
- **Occluder data**: `{ polygon: [lng,lat][], height, opacity? }` from `/data/<slug>/buildings.json`, loaded + cached by `loadBuildingOccluders` in **`src/data/loaders.ts:34-43`**. Buildings carry **no Mapbox tile feature IDs** — this is the crux of finding #2's blocker.
- **Scoring worker** (`src/worker/protocol.ts`, `scoring.worker.ts`) operates on **venues**, not buildings — message types are `init`/`score`/`plan`, all venue-keyed.

### Mapbox 3.20 API claims I verified in `node_modules/mapbox-gl/dist/mapbox-gl.d.ts`

- `setLights(lights?: Array<LightsSpecification>)` — **confirmed**, `d.ts:10540` and `:20231`.
- `DirectionalLightSpecification` with `properties.direction: [number, number]`, `cast-shadows?: boolean`, `shadow-intensity`, and `shadow-quality` (marked `@experimental`) — **confirmed**, `d.ts:1039-1065`. **Important:** the `direction` tuple unit/order (`[azimuth°, polar°]`) is **not documented in the type** — it is inferred from the docstring example at `d.ts:20219-20226`. Treat the exact convention as unverified until tested in the browser.
- `fill-extrusion-cast-shadows?: boolean` — **confirmed**, `d.ts:1609` / `:12274`.
- Legacy `setLight` is explicitly annotated "prefer using `Map#setLights`" — **confirmed**, `d.ts:20243-20256`.
- `fill-extrusion-emissive-strength` exists in types but the app uses **dark-v11 (Classic)**; emissive-strength / `light-preset` are Standard-style features. Finding #3's warning to avoid it is correct.

## The three dimensions compared

### Dimension 1 — Facade lighting (`setLights` ambient + directional)
Replace the one legacy `setLight()` call with `setLights([ambient, directional])`, mapping the same SunCalc azimuth/altitude to the directional `direction`. Optionally enable `fill-extrusion-cast-shadows` + `cast-shadows` for GPU building-to-building face shadows.

### Dimension 2 — Building-on-building vertical occlusion (per-facade shadow fraction)
Extend `computeShadowPolygon` with an effective height `(casterH - receiverSliceZ)` and test receiver centroids per height-slice via Flatbush, producing a per-building shadow fraction, then tint each building.

### Dimension 3 — Illuminance / golden-hour glow
Interpolate `setLight` color, `setFog` colors, `fill-extrusion-color`, and sky sun-intensity through a warm palette keyed to sun altitude.

| Criterion | 1. Facade lighting (`setLights`) | 2. Building-on-building occlusion | 3. Golden-hour glow |
|---|---|---|---|
| **Visual realism** | High — sharp lit/shadowed wall split that rotates with the sun; optional real inter-building face shadows via GPU shadow maps | High *in theory*, but **blocky** (per-feature uniform tint, no crisp shadow line — fill-extrusion can't gradient per-vertex); payoff often subtle at pitch 45 | Medium — atmospheric warmth/mood; complements shadows but doesn't add geometric realism |
| **Performance** | `setLights` without cast-shadows = negligible GPU uniform update. `cast-shadows: true` adds a shadow-map prepass (est. 5-15ms GPU on mobile, dense views); the 2500 JS cap does **not** govern Mapbox's internal shadow map | Adds nested JS loop (~25k point-in-poly tests/recompute at avg; spikes to 50-150ms in dense downtown views, **exceeding** the 120ms throttle) unless moved to the worker | Negligible — all single JS object updates, fits inside existing cadence |
| **Implementation effort** | **Small** — swap one call, add direction mapping. cast-shadows is one extra paint prop + light prop | **Medium-Large** — blocked on ID linkage OR a parallel GeoJSON extrusion layer; new worker message type; sync risk | **Small** — ~30-40 lines of color lerp in `updateSunLight` + reactive fog |
| **Stack fit (Mapbox-only, no three.js)** | **Excellent** — native config-only, confirmed in installed 3.20 types | Poor-Medium — no native inter-building shadow API; per-feature coloring needs `setFeatureState` (requires tile feature IDs the app lacks) or a duplicate extrusion layer; a true custom-WebGL solution would need three.js (out of scope) | **Excellent** — uses APIs already in the file |

## Recommendation

**Build Dimension 1 (facade lighting via `setLights`) first, then immediately fold in Dimension 3 (golden-hour color) as a fast follow within the same `updateSunLight` rewrite.** Defer Dimension 2.

Rationale:

1. **Highest realism-per-effort, lowest risk.** Dimension 1 is a near-drop-in replacement of one already-wired call. It directly satisfies the brief ("sunlight falling on the buildings") with a sharper, physically-grounded lit/shadowed wall split that rotates with the time slider — and the time-store wiring, SunCalc inputs, and 120ms shadow throttle are all already in place.
2. **Dimensions 1 and 3 share the exact same touch point** (`updateSunLight` in `buildingLayer.ts`) and the same input (SunCalc altitude already in hand at `bindStores.ts:88`). Doing them together avoids editing the same function twice and lets the warm directional color reinforce the directional shading — long cool shadows + warm low-angle light is the golden-hour combination.
3. **Dimension 2 is the weakest bet right now.** Its blocker is real and structural: the app's Occluder polygons (from Overpass) have **no link** to Mapbox composite tile feature IDs, so `setFeatureState`-based per-building tinting is not possible without either an ID-matching pipeline that doesn't exist, or a duplicate GeoJSON extrusion layer that risks z-fighting with `"3d-buildings"`. And even if built, fill-extrusion can't draw a crisp shadow line on a face (per-feature uniform color only), so the visual gain over `cast-shadows: true` (which gives *real* GPU inter-building shadows for free in Dimension 1) is marginal. **`cast-shadows` from Dimension 1 is the better, cheaper path to inter-building shadows.**

Be decisive: ship `setLights` (no cast-shadows) + golden-hour color as Phase 1; gate `cast-shadows` behind a desktop-only flag as Phase 2; only revisit Dimension 2 if Phase 2's GPU shadows prove insufficient.

## Prototype plan (ready to execute)

### Files to modify
- **`src/map/layers/buildingLayer.ts`** — primary change: rewrite `updateSunLight` to call `setLights`; add color/intensity interpolation; add a small `sunPalette(altitudeDeg)` helper. Optionally add `"fill-extrusion-cast-shadows"` to the layer paint (Phase 2, flagged).
- **`src/map/createMap.ts`** — no longer set `setLights`/lights here (dark-v11 has no `lights` block; `setLights` lazily inits one — acceptable). Phase 1.5: leave `setFog` initial values, but expose them so the reactive update in `updateSunLight` can override.
- **`src/map/bindStores.ts`** — already calls `updateSunLight(map, azimuth, altitude)` (`:89`). No structural change needed for Phase 1; the new signature stays `(map, azimuthRad, altitudeRad)`. (If reactive fog is added, `updateSunLight` will internally call `setFog` — guard with `map.isStyleLoaded()`, which it already checks at `:60`.)

### Utilities to reuse (do NOT reinvent)
- SunCalc azimuth/altitude already computed at `bindStores.ts:88` — pass through unchanged.
- The existing `azimuthDeg`/`altitudeDeg` derivation at `buildingLayer.ts:62-63`.
- The existing `map.isStyleLoaded()` guard (`buildingLayer.ts:60`) and the sky-sun update block (`:74-77`) — keep as-is.
- No Occluder data, no Flatbush, no scoring worker needed for the recommended phases.

### Ordered steps

**Phase 1 — `setLights` directional facade shading (small)**
1. In `updateSunLight`, replace the `map.setLight({...})` call with:
   - `map.setLights([{ id:"ambient", type:"ambient", properties:{ color:"white", intensity:0.4 } }, { id:"sun", type:"directional", properties:{ direction:[azimuthDeg, polarDeg], color:"white", intensity:0.5 } }])` where `polarDeg = 90 - altitudeDeg` (clamped ≥ 0). Keep the existing `azimuthDeg` (with the `+180` offset already there) and **verify the direction convention in-browser** before trusting it.
2. Add a night branch: when `altitudeDeg <= 0`, set a cool low-intensity ambient (dark blue-grey, intensity ~0.15) and zero/low directional, so buildings don't render flat-bright at night (the ground-shadow layer already clears at night via `shadowLayer.ts:46-49`).
3. Run, scrub the slider, confirm the lit wall flips from east-facing (morning) to west-facing (evening). Tune ambient intensity + `fill-extrusion-color` so shadowed walls stay readable on dark-v11 (the `#aaa` base may need to lift to ~`#888`–`#bbb`).

**Phase 1.5 — golden-hour color (small, same function)**
4. Add `sunPalette(altitudeDeg)` returning `{ lightColor, ambientColor, fogColor, fogHighColor, buildingTint }` — lerp two hex endpoints by an altitude ratio (warm amber in the 0–15° golden band → neutral white by ~40°+; cool blue at night). Pure JS, unit-testable.
5. Apply: directional `color` = `lightColor`; `map.setPaintProperty("3d-buildings","fill-extrusion-color", buildingTint)`; reactive `map.setFog({ color, "high-color", "horizon-blend" })` guarded by `isStyleLoaded()`.
6. Iterate the palette visually (expect several aesthetic passes).

**Phase 2 — building-to-building shadows (flagged, desktop-only)**
7. Add `"fill-extrusion-cast-shadows": true` to the `"3d-buildings"` paint and `"cast-shadows": true` (+ `"shadow-intensity": 0.5`, leave `shadow-quality` default) on the directional light. Gate behind a simple capability/desktop check; do not enable on mobile by default.
8. Measure GPU frame time at zoom 13, pitch 45, in a dense neighborhood; back out if it drops frames.

### Key risks
- **Direction convention unverified.** `DirectionalLightSpecification.direction` is `[number, number]` with no in-type doc; the `[azimuth°, polar°]` mapping is inferred from the docstring example. **Verify visually before shipping** — if walls light from the wrong side, swap/negate components.
- **Light-model regression.** Switching from the legacy flat light to ambient+directional changes how `#aaa` buildings look; expect to re-tune `fill-extrusion-color` and ambient intensity to avoid washed-out or over-dark facades.
- **dark-v11 has no `lights` block**; `setLights` lazily creates one. This path works but is less battle-tested than on Standard style — QA the night and noon extremes.
- **`cast-shadows` is `@experimental`** and the internal shadow map ignores the app's 2500 JS cap (it covers the GPU tile set) — real mobile-perf risk; keep it Phase 2 and flagged.
- **Reactive fog jarring on dark base tiles** — base streets/labels stay dark regardless of fog color; tune conservatively.

### How to verify
1. `npm run dev`, open the LA map (default center `[-118.4912, 34.0195]`, zoom 13, pitch 45).
2. **Scrub the time slider** across a full day. Watch: (a) the sunlit building wall should rotate — east-facing bright at sunrise, south at noon, west at sunset; (b) shadowed walls darken but stay legible; (c) at low sun the buildings warm to amber while the existing ground shadows lengthen and turn cool (the two effects should reinforce, not fight).
3. **Night check** (drag past sunset): buildings should go cool/dim, ground shadows clear (existing behavior), no flat-bright artifact.
4. Confirm no new console errors and the sky sun still tracks (existing `setPaintProperty("sky",...)`).
5. Existing tests stay green: `npm test` (engine tests in `src/engine/*.test.ts` are unaffected — none of this touches `computeShadowPolygon`).
6. Phase 2 only: enable cast-shadows, eyeball inter-building face shadows at low sun, and profile GPU frame time in DevTools on a throttled mobile profile before enabling by default.
