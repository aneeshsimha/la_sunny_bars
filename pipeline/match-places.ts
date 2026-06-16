#!/usr/bin/env tsx
/**
 * Google Places matching + enrichment for a single neighborhood's venues,
 * or all neighborhoods when --all-neighborhoods is passed.
 * Runs at build time — NOT called at runtime.
 *
 * Usage:
 *   npx tsx pipeline/match-places.ts --slug silver-lake
 *   npx tsx pipeline/match-places.ts --all-neighborhoods
 *
 * Requires GOOGLE_PLACES_API_KEY in env.
 * If the key is not set, venues.json is left unchanged and a warning is logged.
 */

import fs from 'fs';
import path from 'path';
import type { VenueRecord, NeighborhoodVenueFile } from './schema.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const allNeighborhoods = process.argv.includes('--all-neighborhoods');
const slugArgIdx = process.argv.indexOf('--slug');
const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : 'silver-lake';

// ---------------------------------------------------------------------------
// Types for Places API responses
// ---------------------------------------------------------------------------

interface PlacesLatLng {
  latitude: number;
  longitude: number;
}

interface PlacesOpeningHours {
  openNow: boolean;
}

interface PlacesPhoto {
  name: string;
}

interface PlacesResult {
  id: string;
  rating?: number;
  priceLevel?: number;
  userRatingCount?: number;
  currentOpeningHours?: PlacesOpeningHours;
  photos?: PlacesPhoto[];
  location?: PlacesLatLng;
}

interface PlacesSearchResponse {
  places?: PlacesResult[];
}

interface ReviewEntry {
  venueId: string;
  venueName: string;
  coords: [number, number];
  reason: string;
  candidatePlacesId?: string;
  candidateDistanceM?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Places API call
// ---------------------------------------------------------------------------

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.id,places.rating,places.priceLevel,places.userRatingCount,places.currentOpeningHours,places.photos,places.location';
const MATCH_RADIUS_M = 200;
const RATE_LIMIT_MS = 100;

async function searchPlace(
  name: string,
  lat: number,
  lng: number,
  apiKey: string,
): Promise<PlacesSearchResponse> {
  const body = {
    textQuery: `${name} Los Angeles`,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: MATCH_RADIUS_M,
      },
    },
  };

  const response = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Places API error ${response.status}: ${text}`);
  }

  return (await response.json()) as PlacesSearchResponse;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function matchPlaces(targetSlug: string): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[match-places] WARNING: GOOGLE_PLACES_API_KEY not set — skipping enrichment, venues.json left unchanged.');
    return;
  }

  const venuesPath = path.join(process.cwd(), 'public', 'data', targetSlug, 'venues.json');
  if (!fs.existsSync(venuesPath)) {
    console.error(`[match-places] venues.json not found at ${venuesPath}`);
    process.exit(1);
  }

  const file = JSON.parse(fs.readFileSync(venuesPath, 'utf-8')) as NeighborhoodVenueFile;
  const venues: VenueRecord[] = file.venues;

  const toEnrich = venues.filter((v) => v.placesId === null);
  console.log(`[match-places] ${targetSlug}: ${venues.length} venues, ${toEnrich.length} need Places matching`);

  const reviewQueue: ReviewEntry[] = [];
  let enriched = 0;
  let skipped = 0;

  for (const venue of toEnrich) {
    const [lng, lat] = venue.coords;

    let result: PlacesSearchResponse;
    try {
      result = await searchPlace(venue.name, lat, lng, apiKey);
    } catch (err) {
      console.error(`[match-places] API error for "${venue.name}": ${String(err)}`);
      reviewQueue.push({
        venueId: venue.id,
        venueName: venue.name,
        coords: venue.coords,
        reason: `API error: ${String(err)}`,
      });
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const places = result.places ?? [];

    if (places.length === 0) {
      console.log(`[match-places] no results for "${venue.name}" — queued for review`);
      reviewQueue.push({
        venueId: venue.id,
        venueName: venue.name,
        coords: venue.coords,
        reason: 'No Places results returned',
      });
      skipped++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const candidate = places[0];

    // Validate distance if location is returned
    if (candidate.location) {
      const distM = haversineMeters(
        lat,
        lng,
        candidate.location.latitude,
        candidate.location.longitude,
      );

      if (distM > MATCH_RADIUS_M) {
        console.log(`[match-places] "${venue.name}" candidate too far (${distM.toFixed(0)}m) — queued for review`);
        reviewQueue.push({
          venueId: venue.id,
          venueName: venue.name,
          coords: venue.coords,
          reason: `Candidate ${candidate.id} is ${distM.toFixed(0)}m away (>${MATCH_RADIUS_M}m threshold)`,
          candidatePlacesId: candidate.id,
          candidateDistanceM: distM,
        });
        skipped++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }
    }

    // Apply enrichment in-place
    venue.placesId = candidate.id;
    venue.rating = candidate.rating ?? null;
    // priceLevel from Places API v1 is a string enum; map to numeric 1-4
    venue.priceLevel = typeof candidate.priceLevel === 'number' ? candidate.priceLevel : null;
    venue.reviewCount = candidate.userRatingCount ?? null;
    venue.photoRef = candidate.photos?.[0]?.name ?? null;
    venue.openNow = candidate.currentOpeningHours?.openNow ?? null;

    enriched++;
    console.log(`[match-places] matched "${venue.name}" → ${candidate.id}`);

    await sleep(RATE_LIMIT_MS);
  }

  // Write updated venues.json
  const updated: NeighborhoodVenueFile = {
    ...file,
    generatedAt: new Date().toISOString(),
    venues,
  };
  fs.writeFileSync(venuesPath, JSON.stringify(updated, null, 2));
  console.log(`[match-places] wrote ${venuesPath}`);

  // Write review queue if any
  if (reviewQueue.length > 0) {
    const reviewPath = path.join(process.cwd(), 'pipeline', 'review.json');
    let existing: ReviewEntry[] = [];
    if (fs.existsSync(reviewPath)) {
      existing = JSON.parse(fs.readFileSync(reviewPath, 'utf-8')) as ReviewEntry[];
    }
    const merged = [
      ...existing.filter((e) => !reviewQueue.some((r) => r.venueId === e.venueId)),
      ...reviewQueue,
    ];
    fs.writeFileSync(reviewPath, JSON.stringify(merged, null, 2));
    console.log(`[match-places] ${reviewQueue.length} venue(s) added to pipeline/review.json for manual review`);
  }

  console.log(`[match-places] done: ${enriched} enriched, ${skipped} queued for review`);
}

async function main(): Promise<void> {
  if (allNeighborhoods) {
    const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
    const neighborhoods = JSON.parse(fs.readFileSync(neighborhoodsPath, 'utf-8')) as Array<{ slug: string }>;
    for (const n of neighborhoods) {
      await matchPlaces(n.slug);
    }
  } else {
    await matchPlaces(slug);
  }
}

main().catch((err) => {
  console.error('[match-places] Failed:', err);
  process.exit(1);
});
