"use client";

import { useMemo, useCallback } from "react";
import { useFilterStore } from "@/state/filterStore";
import { useVenueStore } from "@/state/venueStore";
import { useLocationStore } from "@/state/locationStore";
import { modeLabel } from "@/lib/scoringMode";
import { AmenityFilter, SeatingFilter } from "@/state/types";
import { requestLocation } from "@/hooks/useGeolocation";

function bestVenueCutoff(venues: { sunScore: number; outdoor_seating: string }[]) {
  const candidates = venues.filter((v) => v.outdoor_seating !== "no");
  if (candidates.length === 0) return 0;
  const topScore = Math.max(...candidates.map((v) => v.sunScore));
  return Math.max(35, Math.min(60, topScore - 15));
}

export default function FilterBar() {
  const activeFilter = useFilterStore((s) => s.activeFilter);
  const seatingFilter = useFilterStore((s) => s.seatingFilter);
  const sunOnly = useFilterStore((s) => s.sunOnly);
  const scoringMode = useFilterStore((s) => s.scoringMode);
  const setActiveFilter = useFilterStore((s) => s.setActiveFilter);
  const setSeatingFilter = useFilterStore((s) => s.setSeatingFilter);
  const setSunOnly = useFilterStore((s) => s.setSunOnly);
  const setScoringMode = useFilterStore((s) => s.setScoringMode);

  const venues = useVenueStore((s) => s.venues);
  const updateWalkTimes = useVenueStore((s) => s.updateWalkTimes);

  const userLocation = useLocationStore((s) => s.userLocation);
  const setUserLocation = useLocationStore((s) => s.setUserLocation);

  const handleNearMeClick = useCallback(async () => {
    if (userLocation) {
      setScoringMode("nearby");
      return;
    }
    const coords = await requestLocation();
    if (coords) {
      setUserLocation(coords);
      updateWalkTimes(coords);
      setScoringMode("nearby");
    }
  }, [userLocation, setScoringMode, setUserLocation, updateWalkTimes]);

  const bestCount = useMemo(() => {
    const cutoff = bestVenueCutoff(venues);
    return venues.filter((v) => v.outdoor_seating !== "no" && v.sunScore >= cutoff).length;
  }, [venues]);

  const filters: { key: AmenityFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "best", label: bestCount > 0 ? `Best ${bestCount}` : "Best" },
    { key: "bar", label: "Bars" },
    { key: "restaurant", label: "Restaurants" },
    { key: "cafe", label: "Cafes" },
  ];

  const seatingFilters: { key: SeatingFilter; label: string }[] = [
    { key: "all", label: "All seating" },
    { key: "patio", label: "Patio" },
    { key: "sidewalk", label: "Sidewalk" },
    { key: "rooftop", label: "Rooftop" },
  ];

  return (
    <>
      <div className="filter-bar">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-pill${activeFilter === f.key ? " active" : ""}`}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        {seatingFilters.map((f) => (
          <button
            key={f.key}
            className={`filter-pill${seatingFilter === f.key ? " active" : ""}`}
            onClick={() => setSeatingFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="stats-bar">
        <div className="mode-toggle" role="group" aria-label="Ranking mode">
          <button
            className={scoringMode === "sun" ? "active" : ""}
            onClick={() => setScoringMode("sun")}
            type="button"
            aria-pressed={scoringMode === "sun"}
          >
            {modeLabel("sun")}
          </button>
          <button
            className={scoringMode === "shade" ? "active" : ""}
            onClick={() => setScoringMode("shade")}
            type="button"
            aria-pressed={scoringMode === "shade"}
          >
            {modeLabel("shade")}
          </button>
          <button
            className={scoringMode === "nearby" ? "active" : ""}
            onClick={handleNearMeClick}
            type="button"
            aria-pressed={scoringMode === "nearby"}
          >
            {modeLabel("nearby")}
          </button>
        </div>
        <button
          className="sun-only-toggle"
          onClick={() => setSunOnly(!sunOnly)}
          type="button"
          aria-pressed={sunOnly}
        >
          <span>{scoringMode === "shade" ? "Shade only" : "Sun only"}</span>
          <div className={`toggle-switch${sunOnly ? " active" : ""}`} />
        </button>
      </div>
    </>
  );
}
