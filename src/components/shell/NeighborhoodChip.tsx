"use client";

import { useLocationStore } from "@/state/locationStore";
import { useUIStore } from "@/state/uiStore";

/**
 * Chip overlay rendered on top of the map showing the focused neighborhood.
 * Reads the active slug from locationStore and the display name from uiStore.
 * Dismissable — clicking × clears focusedNeighborhood in uiStore.
 */
export default function NeighborhoodChip() {
  const neighborhoodSlug = useLocationStore((s) => s.neighborhoodSlug);
  const focusedNeighborhood = useUIStore((s) => s.focusedNeighborhood);
  const setFocusedNeighborhood = useUIStore((s) => s.setFocusedNeighborhood);

  // Show only when there is an active neighborhood slug and a focused name
  if (!neighborhoodSlug || !focusedNeighborhood) return null;

  return (
    <div className="neighborhood-chip" role="status" aria-label={`Showing ${focusedNeighborhood}`}>
      <span className="neighborhood-chip__label">{focusedNeighborhood}</span>
      <button
        className="neighborhood-chip__dismiss"
        aria-label="Dismiss neighborhood focus"
        onClick={() => setFocusedNeighborhood(null)}
      >
        ×
      </button>
    </div>
  );
}
