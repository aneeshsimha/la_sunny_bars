"use client";

import { useTimeStore } from "@/state/timeStore";
import { useWeather } from "@/hooks/useWeather";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

function formatBannerDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PlanningBanner() {
  const isPlanningMode = useTimeStore((s) => s.isPlanningMode);
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const currentTime = useTimeStore((s) => s.currentTime);
  const setSelectedDate = useTimeStore((s) => s.setSelectedDate);
  const setIsLiveMode = useTimeStore((s) => s.setIsLiveMode);

  const { forecastAvailable, loading } = useWeather(LA_LAT, LA_LNG, currentTime);

  if (!isPlanningMode) return null;

  const handleBackToNow = () => {
    setSelectedDate(new Date());
    setIsLiveMode(true);
  };

  let forecastLabel: string;
  if (loading) {
    forecastLabel = "Checking forecast…";
  } else if (forecastAvailable) {
    forecastLabel = "Forecast available";
  } else {
    forecastLabel = "No forecast (>7 days)";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 14px",
        background: "rgba(20, 30, 48, 0.88)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontSize: "13px",
        color: "var(--color-text, #e8e8e8)",
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontWeight: 600 }}>
        Planning mode &mdash; {formatBannerDate(selectedDate)}
      </span>

      <span
        style={{
          fontSize: "11px",
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        {forecastLabel}
      </span>

      <button
        onClick={handleBackToNow}
        style={{
          flexShrink: 0,
          padding: "4px 10px",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.08)",
          color: "inherit",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.02em",
        }}
      >
        Back to now
      </button>
    </div>
  );
}
