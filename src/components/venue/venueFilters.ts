import { VenueFeature, AmenityFilter, SeatingFilter } from "@/state/types";
import { ScoringMode, modeSortKey } from "@/lib/scoringMode";
import type { MapBounds } from "@/state/uiStore";

/** True if a venue's [lng, lat] falls within the [west, south, east, north] bbox. */
export function venueInBounds(venue: VenueFeature, bounds: MapBounds): boolean {
  const [lng, lat] = venue.coordinates;
  const [west, south, east, north] = bounds;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function hasOutdoorConfidence(
  venue: Pick<VenueFeature, "outdoor_seating">
): boolean {
  return venue.outdoor_seating !== "no";
}

export function bestVenueCutoff(venues: VenueFeature[]): number {
  const candidates = venues.filter(hasOutdoorConfidence);
  if (candidates.length === 0) return 0;
  const topScore = Math.max(...candidates.map((v) => v.sunScore));
  return Math.max(35, Math.min(60, topScore - 15));
}

export function filterAndSortVenues(
  venues: VenueFeature[],
  searchQuery: string,
  activeFilter: AmenityFilter,
  sunOnly: boolean,
  scoringMode: ScoringMode,
  seatingFilter: SeatingFilter = "all",
  bounds: MapBounds | null = null
): VenueFeature[] {
  let list = venues;

  // Only rank venues inside the current map view (updates on zoom/pan).
  if (bounds) {
    list = list.filter((v) => venueInBounds(v, bounds));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.cuisine && v.cuisine.toLowerCase().includes(q))
    );
  }

  if (activeFilter !== "all") {
    const bestCutoff = activeFilter === "best" ? bestVenueCutoff(list) : 0;
    list = list.filter((v) => {
      if (activeFilter === "bar")
        return v.amenity === "bar" || v.amenity === "pub";
      if (activeFilter === "best")
        return hasOutdoorConfidence(v) && v.sunScore >= bestCutoff;
      return v.amenity === activeFilter;
    });
  }

  if (seatingFilter !== "all") {
    list = list.filter((v) => v.seatingType === seatingFilter);
  }

  if (sunOnly) {
    list = list.filter((v) =>
      scoringMode === "shade" ? v.directSun < 0.5 : v.directSun >= 0.5
    );
  }

  return [...list].sort((a, b) => {
    const keyDiff =
      modeSortKey(b.sunScore, scoringMode, b.futureSun, b.walkTimeMinutes ?? undefined, b.openNow) -
      modeSortKey(a.sunScore, scoringMode, a.futureSun, a.walkTimeMinutes ?? undefined, a.openNow);
    if (keyDiff !== 0) return keyDiff;
    if (b.directSun !== a.directSun) return b.directSun - a.directSun;
    return a.name.localeCompare(b.name);
  });
}
