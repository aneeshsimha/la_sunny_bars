"use client";

import { useMemo } from "react";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";
import { useUIStore } from "@/state/uiStore";
import { VenueFeature } from "@/state/types";
import { filterAndSortVenues } from "@/components/venue/venueFilters";

interface TopPickCardProps {
  onVenueClick: (venue: VenueFeature) => void;
}

export default function TopPickCard({ onVenueClick }: TopPickCardProps) {
  const venues = useVenueStore((s) => s.venues);
  const { searchQuery, activeFilter, seatingFilter, sunOnly, scoringMode } = useFilterStore();
  const mapBounds = useUIStore((s) => s.mapBounds);

  const bestVenue = useMemo(() => {
    const sorted = filterAndSortVenues(
      venues,
      searchQuery,
      activeFilter,
      sunOnly,
      scoringMode,
      seatingFilter,
      mapBounds
    );
    return sorted[0] ?? null;
  }, [venues, searchQuery, activeFilter, seatingFilter, sunOnly, scoringMode, mapBounds]);

  if (!bestVenue) {
    return (
      <div className="top-pick-card empty">
        <div className="top-pick-label">Best right now</div>
        <div className="top-pick-name">Move the map to explore patios</div>
        <div className="top-pick-meta">
          Rankings only show venues inside the current map view.
        </div>
      </div>
    );
  }

  return (
    <button
      className="top-pick-card"
      type="button"
      onClick={() => onVenueClick(bestVenue)}
    >
      <div className="top-pick-label">Best right now</div>
      <div className="top-pick-name">{bestVenue.name}</div>
      <div className="top-pick-meta">
        {Math.round(bestVenue.sunScore)}/100 score
        {bestVenue.sunUntil ? ` · sunny until ${bestVenue.sunUntil}` : ""}
      </div>
      <div className="top-pick-breakdown">
        <span>Now {Math.round(bestVenue.directSun * 100)}%</span>
        <span>Next {Math.round(bestVenue.futureSun * 100)}%</span>
        <span>Open sky {Math.round(bestVenue.skyExposure * 100)}%</span>
      </div>
    </button>
  );
}
