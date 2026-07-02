/**
 * Building-height provenance classification (ANS-213 B9).
 *
 * Pure logic extracted from `fetch-buildings.ts` so it can be unit-tested
 * without hitting the Overpass API. Mirrors the height-derivation rules
 * that have always been used when fetching OSM building footprints:
 * prefer a measured `height` tag, else derive from `building:levels`,
 * else fall back to DEFAULT_BUILDING_HEIGHT_METERS.
 */

export type HeightSource = 'measured' | 'levels' | 'default';

export interface HeightClassification {
  height: number;
  heightSource: HeightSource;
}

// Fallback building height (meters) used when OSM has neither a `height`
// tag nor a `building:levels` tag (or neither is parseable). This is the
// single source of truth for the building-height default — see
// docs/height-audit.md for how often footprints actually fall back to it.
export const DEFAULT_BUILDING_HEIGHT_METERS = 8;

// Assumed meters per building:levels story, used to derive a height when
// only a level count is available.
const METERS_PER_LEVEL = 4;

/**
 * Classify a building height + provenance from raw OSM tags.
 *   - `height` tag present and parseable -> 'measured'
 *   - else `building:levels` present and parseable -> 'levels'
 *   - else -> 'default' (DEFAULT_BUILDING_HEIGHT_METERS)
 */
export function classifyHeight(tags: Record<string, string>): HeightClassification {
  if (tags['height']) {
    const parsed = parseFloat(tags['height']);
    if (!isNaN(parsed)) {
      return { height: parsed, heightSource: 'measured' };
    }
  } else if (tags['building:levels']) {
    const levels = parseFloat(tags['building:levels']);
    if (!isNaN(levels)) {
      return { height: levels * METERS_PER_LEVEL, heightSource: 'levels' };
    }
  }

  return { height: DEFAULT_BUILDING_HEIGHT_METERS, heightSource: 'default' };
}
