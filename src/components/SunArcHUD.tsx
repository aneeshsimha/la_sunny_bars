"use client";

import { useRef, useCallback, useMemo } from "react";
import SunCalc from "suncalc";

// SVG viewport dimensions
const W = 220;
const H = 120;
// Horizontal margins for sunrise/sunset tick marks
const PAD_X = 18;
// Horizon line y-position (bottom of dome)
const HORIZON_Y = H - 16;
// Apex y-position (top of dome)
const APEX_Y = 10;

interface Props {
  currentTime: Date;
  sunrise: Date;
  sunset: Date;
  lat: number;
  lng: number;
  onScrub: (time: Date) => void;
}

/**
 * Project a sun position (azimuth, altitude) into the SVG coordinate space.
 *
 * We sample positions from sunrise→sunset. The altitude at solar noon is
 * the maximum altitude for the day. We normalise horizontal position by the
 * azimuth range across the day, and vertical position by the max altitude,
 * so the arc always fills the dome cleanly regardless of season/latitude.
 */
function projectPosition(
  azimuth: number,
  altitude: number,
  azMin: number,
  azMax: number,
  altMax: number
): { x: number; y: number } {
  const azRange = azMax - azMin || 1;
  const tx = (azimuth - azMin) / azRange; // 0 at sunrise, 1 at sunset
  const x = PAD_X + tx * (W - 2 * PAD_X);
  // altitude 0 → HORIZON_Y, altMax → APEX_Y
  const ty = Math.max(0, altitude) / (altMax || 1);
  const y = HORIZON_Y - ty * (HORIZON_Y - APEX_Y);
  return { x, y };
}

/**
 * Sample sun positions at N evenly-spaced times from sunrise→sunset.
 */
function samplePath(
  sunrise: Date,
  sunset: Date,
  lat: number,
  lng: number,
  n = 12
): Array<{ time: Date; azimuth: number; altitude: number }> {
  const totalMs = sunset.getTime() - sunrise.getTime();
  const samples = [];
  for (let i = 0; i <= n; i++) {
    const t = new Date(sunrise.getTime() + (i / n) * totalMs);
    const pos = SunCalc.getPosition(t, lat, lng);
    samples.push({ time: t, azimuth: pos.azimuth, altitude: pos.altitude });
  }
  return samples;
}

export default function SunArcHUD({
  currentTime,
  sunrise,
  sunset,
  lat,
  lng,
  onScrub,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  // Build the arc path points — only recompute when the day changes, not on every currentTime tick
  const { azMin, azMax, altMax, points, polylinePoints } = useMemo(() => {
    const samples = samplePath(sunrise, sunset, lat, lng);
    const azMin = samples[0].azimuth;
    const azMax = samples[samples.length - 1].azimuth;
    const altMax = Math.max(...samples.map((s) => s.altitude), 0.01);
    const points = samples.map((s) =>
      projectPosition(s.azimuth, s.altitude, azMin, azMax, altMax)
    );
    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
    return { azMin, azMax, altMax, points, polylinePoints };
  }, [sunrise, sunset, lat, lng]);

  // Current sun position
  const currentPos = SunCalc.getPosition(currentTime, lat, lng);
  const belowHorizon = currentPos.altitude < 0;
  const beadPt = belowHorizon
    ? { x: PAD_X, y: HORIZON_Y }
    : projectPosition(currentPos.azimuth, currentPos.altitude, azMin, azMax, altMax);

  // Convert SVG x → scrubbed time
  const xToTime = useCallback(
    (x: number): Date => {
      const clamped = Math.max(PAD_X, Math.min(W - PAD_X, x));
      const frac = (clamped - PAD_X) / (W - 2 * PAD_X);
      const totalMs = sunset.getTime() - sunrise.getTime();
      return new Date(sunrise.getTime() + frac * totalMs);
    },
    [sunrise, sunset]
  );

  const getSvgX = (e: React.PointerEvent<SVGSVGElement>): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    return (e.clientX - rect.left) * scaleX;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    onScrub(xToTime(getSvgX(e)));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    onScrub(xToTime(getSvgX(e)));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Format for tick labels
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  // Dome semicircle path: left horizon → arc up → right horizon
  const domeD = `M ${PAD_X} ${HORIZON_Y} Q ${W / 2} ${APEX_Y - 10} ${W - PAD_X} ${HORIZON_Y}`;

  return (
    <div
      className="sun-arc-hud"
      style={{ opacity: belowHorizon ? 0.55 : 1, transition: "opacity 0.4s ease" }}
    >
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", cursor: "ew-resize", userSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Horizon line */}
        <line
          x1={PAD_X}
          y1={HORIZON_Y}
          x2={W - PAD_X}
          y2={HORIZON_Y}
          stroke="var(--color-border-hover)"
          strokeWidth="1"
        />

        {/* Background dome arc */}
        <path
          d={domeD}
          fill="none"
          stroke="var(--color-border-hover)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Sun path polyline */}
        {points.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--color-sun)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        )}

        {/* Sunrise tick */}
        <line
          x1={PAD_X}
          y1={HORIZON_Y - 4}
          x2={PAD_X}
          y2={HORIZON_Y + 4}
          stroke="var(--color-sun-soft)"
          strokeWidth="1.5"
        />
        {/* Sunset tick */}
        <line
          x1={W - PAD_X}
          y1={HORIZON_Y - 4}
          x2={W - PAD_X}
          y2={HORIZON_Y + 4}
          stroke="var(--color-sun-soft)"
          strokeWidth="1.5"
        />

        {/* Sunrise label */}
        <text
          x={PAD_X}
          y={H - 2}
          textAnchor="middle"
          fontSize="8"
          fill="var(--color-text-muted)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmt(sunrise)}
        </text>
        {/* Sunset label */}
        <text
          x={W - PAD_X}
          y={H - 2}
          textAnchor="middle"
          fontSize="8"
          fill="var(--color-text-muted)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmt(sunset)}
        </text>

        {/* Bead — current sun position */}
        <circle
          cx={beadPt.x}
          cy={beadPt.y}
          r="5"
          fill="var(--color-sun)"
          stroke="rgba(254,249,238,0.9)"
          strokeWidth="1.5"
          style={{ pointerEvents: "none" }}
        />
        {/* Bead glow */}
        {!belowHorizon && (
          <circle
            cx={beadPt.x}
            cy={beadPt.y}
            r="9"
            fill="var(--color-sun-glow)"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>
    </div>
  );
}
