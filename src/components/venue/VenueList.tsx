"use client";

import { useMemo } from "react";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";
import { useUIStore } from "@/state/uiStore";
import { VenueFeature } from "@/state/types";
import { filterAndSortVenues } from "@/components/venue/venueFilters";
import VenueCard from "@/components/venue/VenueCard";
import TopPickCard from "@/components/venue/TopPickCard";

interface VenueListProps {
  onVenueClick: (venue: VenueFeature) => void;
}

export default function VenueList({ onVenueClick }: VenueListProps) {
  const venues = useVenueStore((s) => s.venues);
  const selectedVenueId = useVenueStore((s) => s.selectedVenueId);
  const { searchQuery, activeFilter, seatingFilter, sunOnly, scoringMode } = useFilterStore();
  const mapBounds = useUIStore((s) => s.mapBounds);

  const filteredVenues = useMemo(
    () =>
      filterAndSortVenues(venues, searchQuery, activeFilter, sunOnly, scoringMode, seatingFilter, mapBounds),
    [venues, searchQuery, activeFilter, seatingFilter, sunOnly, scoringMode, mapBounds]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || activeFilter !== "all" || seatingFilter !== "all" || sunOnly;

  const hasVenueData = venues.length > 0;

  const { setSearchQuery, setActiveFilter, setSeatingFilter, setSunOnly } = useFilterStore();

  function clearFilters() {
    setSearchQuery("");
    setActiveFilter("all");
    setSeatingFilter("all");
    setSunOnly(false);
  }

  return (
    <>
      <TopPickCard onVenueClick={onVenueClick} />

      <div className="venue-list">
        {filteredVenues.length === 0 ? (
          <div className="empty-state">
            <p>
              {!hasVenueData
                ? "Loading venues..."
                : hasActiveFilters
                  ? "No venues match these filters in the current view."
                  : "No venues in this map view yet. Pan or zoom to a busier block."}
            </p>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredVenues.map((venue, index) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              rank={index + 1}
              isSelected={selectedVenueId === venue.id}
              onClick={() => onVenueClick(venue)}
            />
          ))
        )}
      </div>
    </>
  );
}
