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

      <footer className="sidebar-github-credit">
        <a
          href="https://github.com/aneeshsimha"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View this project's author on GitHub"
          className="sidebar-github-link"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="sidebar-github-icon"
            fill="currentColor"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          aneeshsimha
        </a>
      </footer>
    </>
  );
}
