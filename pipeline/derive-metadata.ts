import type { VenueRecord } from './schema.js';
import { classifyRooftop } from './rooftopVenues.js';

export { classifyRooftop } from './rooftopVenues.js';

// High-precision rooftop name patterns (ANS-236). Deliberately conservative:
// no bare "terrace"/"penthouse"/"high" — those are ambiguous and would
// cause false positives on ground-level venues.
const ROOFTOP_NAME_PATTERN = /rooftop|sky bar|skybar|sky lounge|sky deck|roof/;

/**
 * True if the venue is a rooftop by either the high-precision name pattern
 * or the curated name+coord list (ANS-236). Exported separately from
 * `deriveSeatingType` so callers that only care about the rooftop signal
 * (e.g. the reclassify script, which must not touch non-rooftop
 * `seatingType` values) don't have to reimplement it.
 */
export function isRooftopVenue(record: Pick<VenueRecord, 'name' | 'coords'>): boolean {
  const name = record.name.toLowerCase();

  if (ROOFTOP_NAME_PATTERN.test(name)) {
    return true;
  }

  // Curated name+coord list (ANS-236) — catches known rooftop venues whose
  // names don't contain any rooftop-signaling word (e.g. "Perch").
  return classifyRooftop(record.name, record.coords);
}

export function deriveSeatingType(
  record: VenueRecord,
): 'patio' | 'sidewalk' | 'rooftop' | 'indoor' | null {
  const name = record.name.toLowerCase();

  if (isRooftopVenue(record)) {
    return 'rooftop';
  }

  if (record.outdoor_seating === 'sidewalk') {
    return 'sidewalk';
  }

  if (
    record.outdoor_seating === 'yes' ||
    /garden|courtyard|patio/.test(name)
  ) {
    return 'patio';
  }

  return null;
}

export function deriveDrinkTypes(record: VenueRecord): string[] {
  const amenity = record.amenity.toLowerCase();
  const cuisine = (record.cuisine ?? '').toLowerCase();
  const name = record.name.toLowerCase();

  const types = new Set<string>();

  if (amenity === 'bar') {
    types.add('Cocktails');
    types.add('Beer');
    types.add('Wine');
  } else if (amenity === 'cafe') {
    types.add('Coffee');
    types.add('Beer');
  } else if (amenity === 'restaurant') {
    types.add('Beer');
    types.add('Wine');
    if (/brewery|pub|beer/.test(cuisine)) {
      types.add('Craft Beer');
    }
  }

  if (/wine|winery|vineyard/.test(cuisine)) {
    types.add('Wine');
  }

  if (/tequila|mezcal/.test(name)) {
    types.add('Cocktails');
  }

  return Array.from(types);
}

export function enrichVenuesLocally(venues: VenueRecord[]): VenueRecord[] {
  return venues.map((venue) => {
    const seatingType =
      venue.seatingType !== null ? venue.seatingType : deriveSeatingType(venue);

    const drinkTypes =
      venue.drinkTypes.length > 0 ? venue.drinkTypes : deriveDrinkTypes(venue);

    return { ...venue, seatingType, drinkTypes };
  });
}
