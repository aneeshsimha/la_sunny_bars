"use client";

import { useEffect, useState } from "react";
import SunCalc from "suncalc";
import { defaultScoringClient } from "@/worker/client";
import { useTimeStore } from "@/state/timeStore";
import type { SunPosition } from "@/engine/shadows";

const PLAN_STEP_MINUTES = 5;
const PLAN_MAX_MINUTES = 240; // 4 hours forward

interface SunTimelineProps {
  venueId: string;
  venueLat: number;
  venueLng: number;
  date: Date;
}

interface TimelineData {
  /** Fraction of day (0–1) when sun rises */
  sunriseFrac: number;
  /** Fraction of day (0–1) when sun sets */
  sunsetFrac: number;
  /** Fraction of day (0–1) corresponding to currentTime */
  nowFrac: number;
  /** Fraction of day when the venue goes into shadow (null = stays sunny) */
  shadowFrac: number | null;
  /** Golden hour window fractions */
  goldenHourStart: number;
  goldenHourEnd: number;
}

export default function SunTimeline({
  venueId,
  venueLat,
  venueLng,
  date,
}: SunTimelineProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentTime = useTimeStore((s) => s.currentTime);
  const sunrise = useTimeStore((s) => s.sunrise);
  const sunset = useTimeStore((s) => s.sunset);

  const dayMs = 24 * 60 * 60_000;
  const midnightMs = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      const lat = isFinite(venueLat) ? venueLat : 34.0195;
      const lng = isFinite(venueLng) ? venueLng : -118.4912;

      const todayMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const todayMidnightMs = todayMidnight.getTime();

      const times = SunCalc.getTimes(date, lat, lng);
      const srMs = times.sunrise.getTime();
      const ssMs = times.sunset.getTime();

      const sunriseFrac = (srMs - todayMidnightMs) / dayMs;
      const sunsetFrac = (ssMs - todayMidnightMs) / dayMs;
      // Golden hour: 1 hour before sunset
      const goldenHourStart = Math.max(sunriseFrac, (ssMs - 60 * 60_000 - todayMidnightMs) / dayMs);
      const goldenHourEnd = sunsetFrac;

      // Get current sun position at currentTime
      const nowPos = SunCalc.getPosition(currentTime, lat, lng);
      const sun: SunPosition = { azimuth: nowPos.azimuth, altitude: nowPos.altitude };

      let shadowFrac: number | null = null;

      try {
        const sunUntilMinutes = await defaultScoringClient.planVenue(
          venueId,
          sun,
          currentTime.getTime(),
          lat,
          lng,
          PLAN_STEP_MINUTES,
          PLAN_MAX_MINUTES
        );

        if (sunUntilMinutes !== null) {
          const shadowMs = currentTime.getTime() + sunUntilMinutes * 60_000;
          shadowFrac = (shadowMs - todayMidnightMs) / dayMs;
        }
      } catch {
        // Worker not ready yet — leave shadowFrac as null
      }

      const nowFrac = (currentTime.getTime() - todayMidnightMs) / dayMs;

      if (!cancelled) {
        setData({
          sunriseFrac,
          sunsetFrac,
          nowFrac: Math.min(1, Math.max(0, nowFrac)),
          shadowFrac,
          goldenHourStart,
          goldenHourEnd,
        });
        setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  // Re-run when currentTime changes (so "now" and sunUntil stay fresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, venueLat, venueLng, date, currentTime]);

  if (loading || !data) {
    return <div className="sun-timeline sun-timeline--loading" aria-hidden="true" />;
  }

  const {
    sunriseFrac,
    sunsetFrac,
    nowFrac,
    shadowFrac,
    goldenHourStart,
    goldenHourEnd,
  } = data;

  // Determine where sun ends for this venue
  const sunEndFrac = shadowFrac !== null ? shadowFrac : sunsetFrac;

  return (
    <div className="sun-timeline" aria-label="Sun timeline for today">
      <div className="sun-timeline-track">
        {/* Night before sunrise */}
        <div
          className="sun-timeline-segment night"
          style={{ left: "0%", width: `${sunriseFrac * 100}%` }}
        />

        {/* Sun from sunrise until venue goes into shadow (or sunset) */}
        {sunEndFrac > sunriseFrac && (
          <div
            className="sun-timeline-segment sun"
            style={{
              left: `${sunriseFrac * 100}%`,
              width: `${(sunEndFrac - sunriseFrac) * 100}%`,
            }}
          />
        )}

        {/* Golden hour band (overlay on sun segment) */}
        {goldenHourEnd > goldenHourStart && sunEndFrac > goldenHourStart && (
          <div
            className="sun-timeline-segment golden-hour"
            style={{
              left: `${goldenHourStart * 100}%`,
              width: `${(Math.min(goldenHourEnd, sunEndFrac) - goldenHourStart) * 100}%`,
            }}
          />
        )}

        {/* Shade from shadow start to sunset */}
        {shadowFrac !== null && sunsetFrac > shadowFrac && (
          <div
            className="sun-timeline-segment shade"
            style={{
              left: `${shadowFrac * 100}%`,
              width: `${(sunsetFrac - shadowFrac) * 100}%`,
            }}
          />
        )}

        {/* Night after sunset */}
        <div
          className="sun-timeline-segment night"
          style={{
            left: `${sunsetFrac * 100}%`,
            width: `${(1 - sunsetFrac) * 100}%`,
          }}
        />

        {/* Now indicator */}
        <div
          className="sun-timeline-now"
          style={{ left: `${nowFrac * 100}%` }}
          aria-label="Current time"
        />
      </div>

      <div className="sun-timeline-labels">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>12am</span>
      </div>

      {shadowFrac !== null && (
        <div className="sun-timeline-caption">
          Sunny until {formatFracTime(shadowFrac)}
          {goldenHourStart < shadowFrac && (
            <span className="sun-timeline-golden">
              {" · "}Golden hour {formatFracTime(goldenHourStart)}
              {"–"}
              {formatFracTime(Math.min(goldenHourEnd, shadowFrac))}
            </span>
          )}
        </div>
      )}
      {shadowFrac === null && (
        <div className="sun-timeline-caption">
          Stays sunny past {formatFracTime(Math.min(1, nowFrac + PLAN_MAX_MINUTES / (24 * 60)))}
          {goldenHourStart < sunsetFrac && (
            <span className="sun-timeline-golden">
              {" · "}Golden hour {formatFracTime(goldenHourStart)}
              {"–"}
              {formatFracTime(goldenHourEnd)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatFracTime(frac: number): string {
  const totalMin = Math.round(frac * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "am" : "pm";
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}${ampm}`;
}
