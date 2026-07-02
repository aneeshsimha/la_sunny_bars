import type { ConfidenceLevel } from '@/engine/confidence';

export interface VenueFeature {
  id: string;
  name: string;
  amenity: string;
  cuisine: string | null;
  outdoor_seating: string;
  website: string | null;
  sunScore: number;
  directSun: number;
  futureSun: number;
  skyExposure: number;
  sunUntil: string | null;
  coordinates: [number, number];
  // enrichment fields (from B3/B4 pipeline; null when not yet enriched)
  rating: number | null;
  priceLevel: number | null;
  reviewCount: number | null;
  photoRef: string | null;
  openNow: boolean | null;
  seatingType: 'patio' | 'sidewalk' | 'rooftop' | 'indoor' | null;
  drinkTypes: string[];
  buildingHeight: number | null;
  buildingCentroid: [number, number] | null;
  facadeAzimuths: number[];
  confidence: ConfidenceLevel;
  walkTimeMinutes: number | null;
}

export type AmenityFilter = "all" | "bar" | "restaurant" | "cafe" | "best";

export type SeatingFilter = "all" | "patio" | "sidewalk" | "rooftop";

export type { ScoringMode } from "@/lib/scoringMode";
