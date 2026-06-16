"use client";

import { useMemo } from "react";
import { useVenueStore } from "@/state/venueStore";
import TimeSlider from "@/components/controls/TimeSlider";
import SunArcHUDContainer from "@/components/shell/SunArcHUDContainer";
import SunContextCard from "@/components/shell/SunContextCard";
import VenueDetail from "@/components/venue/VenueDetail";

/**
 * Overlays rendered on top of the map: sun-arc HUD (top-right), sun-context
 * card, time controls (bottom), and the venue detail panel (right) when a
 * venue is selected.
 */
export default function MapOverlays() {
  const venues = useVenueStore((s) => s.venues);
  const selectedVenueId = useVenueStore((s) => s.selectedVenueId);
  const setSelectedVenueId = useVenueStore((s) => s.setSelectedVenueId);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  return (
    <>
      <SunContextCard />
      <SunArcHUDContainer />
      <TimeSlider />
      {selectedVenue && (
        <div className="venue-detail-panel">
          <VenueDetail
            venue={selectedVenue}
            onClose={() => setSelectedVenueId(null)}
          />
        </div>
      )}
    </>
  );
}
