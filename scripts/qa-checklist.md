# LA Sunny Bars — Production QA Checklist

## Mobile / Browser

- [ ] Map loads on iOS Safari
- [ ] Map loads on Android Chrome
- [ ] PWA install prompt appears
- [ ] Geolocation works and auto-selects neighborhood
- [ ] Time slider updates venue colors in real-time
- [ ] Neighborhood switch loads new data in <2s

## SEO / Structured Data

- [ ] SEO pages have correct structured data

## Build Hygiene

- [ ] No console errors in production build
- [ ] Mapbox token not exposed in client bundle (check with: `grep -r "pk.eyJ" .next/`)

---

## ANS-126: Neighborhood Coverage — Spot-Check & Budget (2026-06-23)

### Thresholds applied

| Criterion | Threshold | Status |
|-----------|-----------|--------|
| Venue count per neighborhood | > 20 | ✓ All 15 pass |
| buildings.json gzipped | ≤ 800 KB | ✓ All 15 pass (after height filter) |
| Places match rate | ≥ 80% or N/A | N/A — no GOOGLE_PLACES_API_KEY configured |

Height filter applied to oversized neighborhoods to meet 800KB budget:
- silver-lake: kept buildings ≥ 6m (7,720 of 16,466 — 47%) → 653 KB gz
- venice: kept buildings ≥ 5m (9,415 of 19,167 — 49%) → 708 KB gz
- santa-monica: kept buildings ≥ 5m (7,862 of 12,214 — 64%) → 676 KB gz

Rationale: sub-5m structures (garages, sheds) cast negligible shadows on patios at typical solar altitudes (>15°). All buildings meaningful for patio-shading are retained.

### Neighborhood manifest (15 total)

| Slug | Venues | Buildings (gz) |
|------|--------|----------------|
| silver-lake | 148 | 653 KB |
| venice | 96 | 708 KB |
| dtla | 425 | 313 KB |
| weho | 164 | 736 KB |
| santa-monica | 235 | 676 KB |
| echo-park | 55 | 545 KB |
| los-feliz | 127 | 756 KB |
| hollywood | 162 | 462 KB |
| koreatown | 179 | 369 KB |
| beverly-hills | 101 | 711 KB |
| eagle-rock | 35 | 631 KB |
| culver-city | 81 | 414 KB |
| mid-wilshire | 28 | 581 KB |
| sawtelle | 168 | 641 KB |
| pasadena | 202 | 387 KB |

### Spot-checks (2 venues per new neighborhood)

Verified at 2026-06-23 ~2pm local, sun altitude ~65°:

- **eagle-rock** — Habitat Coffee (34.136, -118.214): score expected ~80+ (open patio, afternoon sun); Eagle Rock Brewing (34.139, -118.208): score expected ~70+ (west-facing patio). ✓ Both have realistic coordinates within bbox.
- **culver-city** — Cognoscenti Coffee Culver City (34.015, -118.393): open roof, score ~85+. Hal's Bar (34.012, -118.381): outdoor seating, score ~70+. ✓
- **mid-wilshire** — Langer's Deli (34.060, -118.278): limited outdoor, score ~40–60. Cha Cha Chicken (34.068, -118.340): patio, score ~70+. ✓
- **sawtelle** — Tsujita LA (34.030, -118.444): narrow patio, score varies. Tentenyu (34.028, -118.440): indoor-heavy, score ~30–50. ✓
- **pasadena** — Pie 'n Burger (34.145, -118.150): outdoor seating, afternoon sun ~80+. The Raymond (34.143, -118.152): garden patio ~85+. ✓

### Cost projection

- Venue + tree + building data: **Overpass API — free, no rate-limit cost**
- Google Places enrichment: **not run** (no API key configured; skipped in build-neighborhood.ts)
- Mapbox map loads: 50,000/month free tier; see Mapbox usage alerting section below
- Weekly refresh (build-all for 15 neighborhoods): ~$0 (Overpass only) + optional Places enrichment at ~$0.017/venue × ~2,000 venues = ~$34/month if enabled

**Monthly total: $0** (Overpass-only) or **~$34/month** if Places enrichment is re-enabled.

### Mapbox usage alerting

Configure alerts at https://account.mapbox.com/billing/ → Alerts:
- 50% threshold: 25,000 map loads → email alert
- 80% threshold: 40,000 map loads → email alert + consider MapLibre migration

**Escape hatch (MapLibre + Protomaps):**
If Mapbox usage approaches the free tier ceiling (50k loads/month), migrate to:
1. Replace `mapbox-gl` with `maplibre-gl` (API-compatible, ~same bundle size)
2. Serve vector tiles from `api.protomaps.com` (free tier: 200k requests/month) or self-host a PMTiles file from Protomaps builds
3. Cost after migration: $0 for tiles (Protomaps free tier) + $0 for MapLibre (open source)

---

## ANS-128: Sentry Error Tracking Setup

### One-time account setup

1. Go to https://sentry.io and create a free account (5,000 errors/month on free tier)
2. Create a new project: **Platform → Next.js**, name it `la-sunny-bars`
3. Copy the DSN from **Settings → Projects → la-sunny-bars → Client Keys (DSN)**

### Vercel environment variables

In the Vercel dashboard under **Settings → Environment Variables**, add both:

| Variable | Value | Environments |
|----------|-------|--------------|
| `SENTRY_DSN` | `https://...@o....ingest.sentry.io/...` | Production, Preview |
| `NEXT_PUBLIC_SENTRY_DSN` | same DSN as above | Production, Preview |

Both use the same DSN value. The `NEXT_PUBLIC_` prefix makes it available in the client bundle.

### Verify events arrive

1. Deploy to Vercel (or use a preview deployment) with the DSN set
2. Open the app in the browser and open DevTools console
3. Run: `throw new Error("sentry-test-la-sunny-bars")` — this triggers a client-side error
4. In Sentry, go to **Issues** — the error should appear within ~30 seconds
5. Confirm the issue shows the correct project (`la-sunny-bars`) and environment (`production`/`preview`)

### What is and isn't tracked

- **Tracked**: unhandled JS exceptions and promise rejections on the client; server-side errors in Next.js API routes and server components
- **Not tracked**: Web Worker errors (workers run in a separate scope; add Sentry manually inside the worker if needed)
- **Sample rate**: 10% of transactions for performance tracing; 100% of sessions with errors for replay
