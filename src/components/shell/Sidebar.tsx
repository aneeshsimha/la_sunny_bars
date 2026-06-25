"use client";

import { useCallback } from "react";
import { useVenueStore } from "@/state/venueStore";
import { useUIStore } from "@/state/uiStore";
import type { VenueFeature } from "@/state/types";
import SearchBar from "@/components/filters/SearchBar";
import FilterBar from "@/components/filters/FilterBar";
import StatsBar from "@/components/filters/StatsBar";
import VenueList from "@/components/venue/VenueList";

/**
 * Desktop sidebar: brand, search, filters, stats, top pick, and the ranked
 * venue list. Selecting a venue opens the detail panel (rendered over the map).
 */
export default function Sidebar() {
  const setSelectedVenueId = useVenueStore((s) => s.setSelectedVenueId);
  const setSheetSnap = useUIStore((s) => s.setSheetSnap);

  const handleVenueClick = useCallback(
    (venue: VenueFeature) => {
      setSelectedVenueId(venue.id);
      setSheetSnap("full");
    },
    [setSelectedVenueId, setSheetSnap]
  );

  return (
    <>
      <div className="sidebar-top">
        <div className="sidebar-header">
          <div className="sidebar-title">LA · Golden Hour</div>
          <div
            className="sidebar-brand"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sunny Bars
          </div>
        </div>
        <SearchBar />
        <FilterBar />
        <div className="stats-bar">
          <StatsBar />
        </div>
      </div>

      <VenueList onVenueClick={handleVenueClick} />
    </>
  );
}
