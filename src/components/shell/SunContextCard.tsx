"use client";

import { useTimeStore } from "@/state/timeStore";
import { useVenueStore } from "@/state/venueStore";
import { formatLATime as formatTime } from "@/lib/formatTime";

export default function SunContextCard() {
  const sunrise = useTimeStore((s) => s.sunrise);
  const sunset = useTimeStore((s) => s.sunset);
  const currentTime = useTimeStore((s) => s.currentTime);
  const venues = useVenueStore((s) => s.venues);

  const sunCount = venues.filter((v) => v.directSun >= 0.5).length;
  const shadeCount = venues.filter((v) => v.directSun < 0.5).length;

  return (
    <div className="sun-context-card">
      <div className="sun-context-row">
        <div>
          <div className="sun-context-label">Sun context</div>
          <div className="sun-context-meta">{formatTime(currentTime)}</div>
        </div>
      </div>
      <div className="sun-context-stats">
        <span>Sunrise {formatTime(sunrise)}</span>
        <span>Sunset {formatTime(sunset)}</span>
        <span>{sunCount} in sun · {shadeCount} in shade</span>
      </div>
    </div>
  );
}
