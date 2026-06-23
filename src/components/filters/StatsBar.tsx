"use client";

import { useMemo } from "react";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";
import { useUIStore } from "@/state/uiStore";
import { venueInBounds } from "@/components/venue/venueFilters";

export default function StatsBar() {
  const venues = useVenueStore((s) => s.venues);
  const scoringMode = useFilterStore((s) => s.scoringMode);
  const mapBounds = useUIStore((s) => s.mapBounds);

  // Counts track the venues visible in the current map view.
  const visible = useMemo(
    () => (mapBounds ? venues.filter((v) => venueInBounds(v, mapBounds)) : venues),
    [venues, mapBounds]
  );

  const sunCount = useMemo(
    () => visible.filter((v) => v.directSun >= 0.5).length,
    [visible]
  );

  const shadeCount = useMemo(
    () => visible.filter((v) => v.directSun < 0.5).length,
    [visible]
  );

  if (scoringMode === "shade") {
    return (
      <div className="stats-counts">
        <span className="stat-shade">{shadeCount} in shade</span>
        <span className="stat-sun">{sunCount} in sun</span>
      </div>
    );
  }

  return (
    <div className="stats-counts">
      <span className="stat-sun">{sunCount} in sun</span>
      <span className="stat-shade">{shadeCount} shade</span>
    </div>
  );
}
