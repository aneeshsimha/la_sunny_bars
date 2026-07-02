/**
 * Shared venue schema for the LA Sunny Bars pipeline.
 */

export interface VenueRecord {
  id: string;                        // stable: "osm/{type}/{id}" e.g. "osm/node/12345"
  name: string;
  coords: [number, number];          // [lng, lat]
  amenity: string;
  cuisine: string | null;
  outdoor_seating: string;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  // enrichment fields (filled by B3/B4, null until then):
  placesId: string | null;
  rating: number | null;
  priceLevel: number | null;
  reviewCount: number | null;
  photoRef: string | null;
  openNow: boolean | null;
  seatingType: 'patio' | 'sidewalk' | 'rooftop' | 'indoor' | null;
  drinkTypes: string[];
  // building linkage fields (filled by B10, null until then):
  buildingId: number | null;
  buildingHeight: number | null;
  buildingCentroid: [number, number] | null;
  facadeAzimuths: number[];
}

export interface NeighborhoodVenueFile {
  slug: string;
  generatedAt: string;
  count: number;
  venues: VenueRecord[];
}
