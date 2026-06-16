#!/usr/bin/env tsx
/**
 * Fetch venue data from Overpass API for a single neighborhood
 * and write to public/data/{slug}/venues.json as a NeighborhoodVenueFile.
 *
 * Usage: npx tsx pipeline/fetch-venues-v2.ts [--slug silver-lake]
 */

import fs from 'fs';
import path from 'path';
import { fetchWithRetry } from './lib/rateLimit.js';
import type { VenueRecord, NeighborhoodVenueFile } from './schema.js';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// Parse --slug arg
const slugArgIdx = process.argv.indexOf('--slug');
const slug = slugArgIdx !== -1 ? process.argv[slugArgIdx + 1] : 'silver-lake';

interface Neighborhood {
  slug: string;
  name: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  center: [number, number];
}

const neighborhoodsPath = path.join(process.cwd(), 'public', 'data', 'neighborhoods.json');
const neighborhoods: Neighborhood[] = JSON.parse(fs.readFileSync(neighborhoodsPath, 'utf-8')) as Neighborhood[];

const neighborhood = neighborhoods.find((n) => n.slug === slug);
if (!neighborhood) {
  const available = neighborhoods.map((n) => n.slug).join(', ');
  console.error('Unknown slug: ' + slug + '. Available: ' + available);
  process.exit(1);
}

// bbox is [west, south, east, north]; Overpass wants south,west,north,east
const [west, south, east, north] = neighborhood.bbox;

function buildQuery(s: number, w: number, n: number, e: number): string {
  const bbox = s + ',' + w + ',' + n + ',' + e;
  return '[out:json][timeout:90];\n' +
    '(\n' +
    '  node["amenity"="bar"]["name"](' + bbox + ');\n' +
    '  node["amenity"="restaurant"]["name"](' + bbox + ');\n' +
    '  node["amenity"="cafe"]["name"](' + bbox + ');\n' +
    '  node["amenity"="pub"]["name"](' + bbox + ');\n' +
    '  way["amenity"="bar"]["name"](' + bbox + ');\n' +
    '  way["amenity"="restaurant"]["name"](' + bbox + ');\n' +
    '  way["amenity"="cafe"]["name"](' + bbox + ');\n' +
    '  way["amenity"="pub"]["name"](' + bbox + ');\n' +
    ');\n' +
    'out body;\n' +
    '>;\n' +
    'out skel qt;';
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

async function fetchVenues(): Promise<void> {
  console.log('Fetching venues for ' + neighborhood!.name + ' (bbox: ' + neighborhood!.bbox.join(', ') + ')...');

  const query = buildQuery(south, west, north, east);

  const response = await fetchWithRetry(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'la-sunny-bars/1.0 fetch-venues-v2',
    },
    body: 'data=' + encodeURIComponent(query),
  });

  if (!response.ok) {
    throw new Error('Overpass API error: ' + response.status + ' ' + response.statusText);
  }

  const data = (await response.json()) as OverpassResponse;
  console.log('Received ' + data.elements.length + ' raw elements from Overpass');

  // Build node coordinate map for resolving way centroids
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const venues: VenueRecord[] = [];

  for (const el of data.elements) {
    if (!el.tags) continue;

    const name = el.tags.name;
    if (!name) continue;

    const amenity = el.tags.amenity;
    if (!['bar', 'restaurant', 'cafe', 'pub'].includes(amenity)) continue;

    let lng: number | undefined;
    let lat: number | undefined;

    if (el.type === 'node') {
      lat = el.lat;
      lng = el.lon;
    } else if (el.type === 'way' && el.nodes) {
      const coords = el.nodes
        .map((nid) => nodeCoords.get(nid))
        .filter((c): c is { lat: number; lon: number } => c !== undefined);
      if (coords.length > 0) {
        lat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
        lng = coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;
      }
    }

    if (lat === undefined || lng === undefined) continue;

    const osmType = el.type === 'way' ? 'way' : 'node';
    const id = 'osm/' + osmType + '/' + el.id;

    const venue: VenueRecord = {
      id,
      name,
      coords: [lng, lat],
      amenity,
      cuisine: el.tags.cuisine ?? null,
      outdoor_seating: el.tags.outdoor_seating ?? 'unknown',
      website: el.tags.website ?? null,
      phone: el.tags.phone ?? null,
      opening_hours: el.tags.opening_hours ?? null,
      // enrichment fields — filled by B3/B4
      placesId: null,
      rating: null,
      priceLevel: null,
      reviewCount: null,
      photoRef: null,
      openNow: null,
      seatingType: null,
      drinkTypes: [],
    };

    venues.push(venue);
  }

  const output: NeighborhoodVenueFile = {
    slug,
    generatedAt: new Date().toISOString(),
    count: venues.length,
    venues,
  };

  const outDir = path.join(process.cwd(), 'public', 'data', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'venues.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('');
  console.log('=== Summary ===');
  console.log('Slug: ' + slug);
  console.log('Total venues: ' + venues.length);

  const withOutdoor = venues.filter((v) => v.outdoor_seating === 'yes').length;
  console.log('  outdoor_seating=yes: ' + withOutdoor);

  const byType: Record<string, number> = {};
  for (const v of venues) {
    byType[v.amenity] = (byType[v.amenity] ?? 0) + 1;
  }
  console.log('Breakdown by type:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + type + ': ' + count);
  }

  console.log('');
  console.log('Written to ' + outPath);
}

fetchVenues().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
