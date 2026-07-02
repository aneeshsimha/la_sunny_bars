import { describe, it, expect } from 'vitest';
import { deriveSeatingType, classifyRooftop } from './derive-metadata';
import type { VenueRecord } from './schema';

function makeRecord(overrides: Partial<VenueRecord>): VenueRecord {
  return {
    id: 'osm/node/1',
    name: 'Test Venue',
    coords: [-118.25, 34.05],
    amenity: 'bar',
    cuisine: null,
    outdoor_seating: 'no',
    website: null,
    phone: null,
    opening_hours: null,
    placesId: null,
    rating: null,
    priceLevel: null,
    reviewCount: null,
    photoRef: null,
    openNow: null,
    seatingType: null,
    drinkTypes: [],
    buildingId: null,
    buildingHeight: null,
    buildingCentroid: null,
    facadeAzimuths: [],
    ...overrides,
  };
}

describe('classifyRooftop', () => {
  it('matches a known curated rooftop by name + coord within ~200m', () => {
    // Perch, DTLA — exact coord from public/data/dtla/venues.json.
    expect(classifyRooftop('Perch', [-118.2513974, 34.0489443])).toBe(true);
  });

  it('matches even with punctuation/case differences (normalized match)', () => {
    expect(classifyRooftop('PERCH!!', [-118.2513974, 34.0489443])).toBe(true);
  });

  it('does not match a name collision more than ~200m from the listed coord', () => {
    // Same name as a curated entry, but ~2km away — a different venue entirely.
    expect(classifyRooftop('Perch', [-118.27, 34.06])).toBe(false);
  });

  it('does not match an unrelated venue name not on the curated list', () => {
    expect(
      classifyRooftop('The Dresden Restaurant & Lounge', [-118.2916325, 34.103174]),
    ).toBe(false);
  });
});

describe('deriveSeatingType — rooftop classification', () => {
  it('classifies a known rooftop name+coord as rooftop via the curated list', () => {
    const record = makeRecord({ name: 'Perch', coords: [-118.2513974, 34.0489443] });
    expect(deriveSeatingType(record)).toBe('rooftop');
  });

  it('classifies a high-precision rooftop name pattern ("Sky Lounge") as rooftop', () => {
    const record = makeRecord({ name: 'White Rabbit Sky Lounge' });
    expect(deriveSeatingType(record)).toBe('rooftop');
  });

  it('classifies the existing "rooftop"/"roof" pattern as rooftop (regression)', () => {
    const record = makeRecord({ name: 'Mama’s rooftop' });
    expect(deriveSeatingType(record)).toBe('rooftop');
  });

  it('does not classify a ground patio bar as rooftop', () => {
    const record = makeRecord({ name: 'Garden Patio Bar', outdoor_seating: 'yes' });
    expect(deriveSeatingType(record)).toBe('patio');
  });

  it('does not classify a name collision far from the curated coord as rooftop', () => {
    const record = makeRecord({ name: 'Perch', coords: [-118.27, 34.06] });
    expect(deriveSeatingType(record)).not.toBe('rooftop');
  });

  it('does not flag ambiguous bare terms like "terrace"/"penthouse" far from any curated coord', () => {
    const record = makeRecord({
      name: 'The Penthouse Terrace Bar',
      coords: [-118.9, 34.9],
    });
    expect(deriveSeatingType(record)).not.toBe('rooftop');
  });
});
