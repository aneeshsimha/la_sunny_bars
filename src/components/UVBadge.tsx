"use client";

import { burnMinutes } from "@/lib/weather";

interface UVBadgeProps {
  uvIndex: number | null;
  cloudCoverPct: number | null;
}

export default function UVBadge({ uvIndex, cloudCoverPct }: UVBadgeProps) {
  if (uvIndex === null && cloudCoverPct === null) return null;

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    backgroundColor: "rgba(245,158,11,0.15)",
    color: "#F59E0B",
    marginTop: "6px",
  };

  const cloudCover = cloudCoverPct ?? 0;
  const cloudy = cloudCover >= 60;

  if (cloudy) {
    return (
      <div style={pillStyle}>
        Cloudy {Math.round(cloudCover)}%
      </div>
    );
  }

  if (uvIndex !== null) {
    const burn = burnMinutes(uvIndex);
    const burnText = burn === Infinity ? "no burn risk" : `~${burn} min`;
    return (
      <div style={pillStyle}>
        UV {Math.round(uvIndex)} · {burnText}
      </div>
    );
  }

  return null;
}
