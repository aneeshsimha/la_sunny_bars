"use client";

import { useUIStore } from "@/state/uiStore";

/**
 * Compass button that shows the current map bearing and resets to north on
 * click. The needle SVG rotates by -bearing so it always points to true north
 * as the map turns — matching the Mapbox compass convention.
 *
 * Map access is intentionally kept out of this component (no @/map imports).
 * Clicking increments `northResetNonce` in uiStore; bindStores.ts subscribes
 * and calls `map.easeTo({ bearing: 0 })`.
 */
export default function CompassButton() {
  const bearing = useUIStore((s) => s.bearing);
  const requestNorthReset = useUIStore((s) => s.requestNorthReset);

  return (
    <button
      type="button"
      className="compass-btn"
      onClick={requestNorthReset}
      aria-label="Reset map to north"
      title="Reset map to north"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 0.05s linear" }}
      >
        {/* North arrow (red) */}
        <polygon points="10,2 7,10 10,8.5 13,10" fill="#E53E3E" />
        {/* South arrow (muted) */}
        <polygon points="10,18 7,10 10,11.5 13,10" fill="#9CA3AF" />
        {/* Centre dot */}
        <circle cx="10" cy="10" r="1.5" fill="#374151" />
      </svg>
    </button>
  );
}
