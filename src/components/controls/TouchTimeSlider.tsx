"use client";

import { useMemo, useRef, useCallback } from "react";
import SunCalc from "suncalc";
import { useTimeStore } from "@/state/timeStore";
import { goldenHourGradient } from "@/lib/sliderGradient";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeShort(date: Date): string {
  const h = date.getHours();
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return `${hour}${ampm}`;
}

interface SnapMarker {
  label: string;
  value: number; // 0–1000
}

export default function TouchTimeSlider() {
  const sunrise = useTimeStore((s) => s.sunrise);
  const sunset = useTimeStore((s) => s.sunset);
  const sliderValue = useTimeStore((s) => s.sliderValue);
  const currentTime = useTimeStore((s) => s.currentTime);
  const isLiveMode = useTimeStore((s) => s.isLiveMode);
  const setSliderValue = useTimeStore((s) => s.setSliderValue);
  const setIsPlaying = useTimeStore((s) => s.setIsPlaying);
  const setIsLiveMode = useTimeStore((s) => s.setIsLiveMode);
  const setCurrentTime = useTimeStore((s) => s.setCurrentTime);
  const setSunTimes = useTimeStore((s) => s.setSunTimes);

  const trackRef = useRef<HTMLDivElement>(null);

  const sliderGradient = useMemo(
    () => goldenHourGradient(sunrise, sunset, sunrise, sunset),
    [sunrise, sunset]
  );

  const totalRange = sunset.getTime() - sunrise.getTime();

  // Build snap markers: Now, sunrise (0), golden hour start, sunset (1000)
  const snapMarkers = useMemo((): SnapMarker[] => {
    const markers: SnapMarker[] = [];

    // Sunrise — always at position 0
    markers.push({ label: formatTimeShort(sunrise), value: 0 });

    // Golden hour start (1 hour before sunset)
    const goldenStart = new Date(sunset.getTime() - 60 * 60 * 1000);
    if (goldenStart > sunrise && goldenStart < sunset) {
      const pct = ((goldenStart.getTime() - sunrise.getTime()) / totalRange) * 1000;
      markers.push({ label: "GH", value: Math.round(pct) });
    }

    // Now
    const now = new Date();
    if (now >= sunrise && now <= sunset) {
      const pct = ((now.getTime() - sunrise.getTime()) / totalRange) * 1000;
      markers.push({ label: "Now", value: Math.round(pct) });
    }

    // Sunset — always at position 1000
    markers.push({ label: formatTimeShort(sunset), value: 1000 });

    return markers;
  }, [sunrise, sunset, totalRange]);

  const valueToTime = useCallback(
    (val: number): Date => {
      return new Date(sunrise.getTime() + (val / 1000) * totalRange);
    },
    [sunrise, totalRange]
  );

  const positionToValue = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return sliderValue;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * 1000);
    },
    [sliderValue]
  );

  const applyValue = useCallback(
    (val: number) => {
      setSliderValue(val);
      setIsPlaying(false);
      setIsLiveMode(false);
      setCurrentTime(valueToTime(val));
    },
    [setSliderValue, setIsPlaying, setIsLiveMode, setCurrentTime, valueToTime]
  );

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      applyValue(positionToValue(touch.clientX));
    },
    [applyValue, positionToValue]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      applyValue(positionToValue(touch.clientX));
    },
    [applyValue, positionToValue]
  );

  // Mouse fallback
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      applyValue(positionToValue(e.clientX));

      const onMove = (ev: MouseEvent) => applyValue(positionToValue(ev.clientX));
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applyValue, positionToValue]
  );

  const handleNowClick = useCallback(() => {
    setIsPlaying(false);
    setIsLiveMode(true);
    const now = new Date();
    const times = SunCalc.getTimes(now, LA_LAT, LA_LNG);
    setSunTimes(times.sunrise, times.sunset);

    if (now >= times.sunrise && now <= times.sunset) {
      const range = times.sunset.getTime() - times.sunrise.getTime();
      const elapsed = now.getTime() - times.sunrise.getTime();
      setSliderValue(Math.round((elapsed / range) * 1000));
      setCurrentTime(now);
    } else {
      const fallback = new Date(times.sunrise);
      fallback.setHours(16, 0, 0, 0);
      const clamped =
        fallback < times.sunrise
          ? times.sunrise
          : fallback > times.sunset
          ? times.sunset
          : fallback;
      const range = times.sunset.getTime() - times.sunrise.getTime();
      const elapsed = clamped.getTime() - times.sunrise.getTime();
      setSliderValue(Math.round((elapsed / range) * 1000));
      setCurrentTime(clamped);
    }
  }, [setIsPlaying, setIsLiveMode, setSunTimes, setSliderValue, setCurrentTime]);

  const thumbPercent = (sliderValue / 1000) * 100;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(10, 10, 10, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "12px 16px 20px",
        zIndex: 1000,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Top row: time display + Now button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#fff",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.02em",
            }}
          >
            {formatTime(currentTime)}
          </span>
          {isLiveMode && (
            <span
              style={{
                fontSize: "9px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                color: "var(--color-sun, #f5a623)",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              ● LIVE
            </span>
          )}
        </div>
        <button
          onTouchStart={(e) => {
            e.stopPropagation();
            handleNowClick();
          }}
          onClick={handleNowClick}
          style={{
            minHeight: "44px",
            minWidth: "64px",
            padding: "0 16px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "22px",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          Now
        </button>
      </div>

      {/* Slider track */}
      <div style={{ position: "relative" }}>
        {/* End labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
            {formatTimeShort(sunrise)}
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
            {formatTimeShort(sunset)}
          </span>
        </div>

        {/* Touch target + track */}
        <div
          ref={trackRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onMouseDown={handleMouseDown}
          style={{
            position: "relative",
            height: "44px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {/* Track bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "6px",
              borderRadius: "3px",
              background: sliderGradient,
            }}
          />

          {/* Snap marker dots */}
          {snapMarkers.map((marker) => (
            <div
              key={marker.label}
              style={{
                position: "absolute",
                left: `${(marker.value / 1000) * 100}%`,
                transform: "translateX(-50%)",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.6)",
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Thumb with time label */}
          <div
            style={{
              position: "absolute",
              left: `${thumbPercent}%`,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: "#fff",
                color: "#111",
                fontSize: "11px",
                fontWeight: "700",
                borderRadius: "6px",
                padding: "2px 5px",
                marginBottom: "4px",
                whiteSpace: "nowrap",
              }}
            >
              {formatTime(currentTime)}
            </div>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
