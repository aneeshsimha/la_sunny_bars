import type { VenueFeature } from "@/state/types";
import { getConfidence } from "@/engine/confidence";

/** Shape of each record inside public/data/{slug}/venues.json */
interface VenueRecord {
  id: string;
  name: string;
  coords: [number, number];
  amenity: string;
  cuisine: string | null;
  outdoor_seating: string;
  website: string | null;
  placesId: string | null;
  rating: number | null;
  priceLevel: number | null;
  reviewCount: number | null;
  photoRef: string | null;
  openNow: boolean | null;
  seatingType: "patio" | "sidewalk" | "rooftop" | "indoor" | null;
  drinkTypes: string[];
  buildingHeight: number | null;
  buildingCentroid: [number, number] | null;
  facadeAzimuths: number[];
}

interface VenueFile {
  slug: string;
  generatedAt: string;
  count: number;
  venues: VenueRecord[];
}

/**
 * Open-sky heuristic by seating type. Used for the "Open sky %" stat and as the
 * sky-exposure term in the composite score. Rooftops see the most sky; sidewalk
 * tables are partly tucked under awnings/buildings.
 */
function skyExposureFor(seating: VenueRecord["seatingType"]): number {
  switch (seating) {
    case "rooftop":
      return 0.92;
    case "patio":
      return 0.78;
    case "sidewalk":
      return 0.68;
    case "indoor":
      return 0.5;
    default:
      return 0.62;
  }
}

/**
 * Fetch a neighborhood's venues.json and map each record to a VenueFeature.
 * Sun fields (sunScore/directSun/futureSun/sunUntil) start at 0/null and are
 * filled in by the scoring pass once the worker is initialized.
 */
export async function loadVenueFeatures(slug: string): Promise<VenueFeature[]> {
  const res = await fetch(`/data/${slug}/venues.json`);
  if (!res.ok) return [];
  const file = (await res.json()) as VenueFile;

  return file.venues.map((r) => ({
    id: r.id,
    name: r.name,
    amenity: r.amenity,
    cuisine: r.cuisine,
    outdoor_seating: r.outdoor_seating,
    website: r.website,
    sunScore: 0,
    directSun: 0,
    futureSun: 0,
    skyExposure: skyExposureFor(r.seatingType),
    sunUntil: null,
    coordinates: r.coords,
    rating: r.rating,
    priceLevel: r.priceLevel,
    reviewCount: r.reviewCount,
    photoRef: r.photoRef,
    openNow: r.openNow,
    seatingType: r.seatingType,
    drinkTypes: r.drinkTypes ?? [],
    buildingHeight: r.buildingHeight ?? null,
    buildingCentroid: r.buildingCentroid ?? null,
    facadeAzimuths: r.facadeAzimuths ?? [],
    confidence: getConfidence({ seatingType: r.seatingType }),
    walkTimeMinutes: null,
  }));
}
