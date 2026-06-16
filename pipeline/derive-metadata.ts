import type { VenueRecord } from './schema.js';

export function deriveSeatingType(
  record: VenueRecord,
): 'patio' | 'sidewalk' | 'rooftop' | 'indoor' | null {
  const name = record.name.toLowerCase();

  if (/rooftop|sky bar|skybar|roof/.test(name)) {
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
