"use client";

import { useMemo } from "react";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";

export default function StatsBar() {
  const venues = useVenueStore((s) => s.venues);
  const scoringMode = useFilterStore((s) => s.scoringMode);

  const sunCount = useMemo(
    () => venues.filter((v) => v.directSun >= 0.5).length,
    [venues]
  );

  const shadeCount = useMemo(
    () => venues.filter((v) => v.directSun < 0.5).length,
    [venues]
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
