"use client";

import { useMemo } from "react";
import SunCalc from "suncalc";
import { useTimeStore } from "@/state/timeStore";
import { goldenHourGradient } from "@/lib/sliderGradient";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatLATime, formatLATimeShort } from "@/lib/formatTime";
import PlayButton from "./PlayButton";
import TouchTimeSlider from "./TouchTimeSlider";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

const formatTime = formatLATime;
const formatTimeShort = formatLATimeShort;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DesktopTimeSlider() {
  const sunrise = useTimeStore((s) => s.sunrise);
  const sunset = useTimeStore((s) => s.sunset);
  const sliderValue = useTimeStore((s) => s.sliderValue);
  const currentTime = useTimeStore((s) => s.currentTime);
  const isLiveMode = useTimeStore((s) => s.isLiveMode);
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const setSliderValue = useTimeStore((s) => s.setSliderValue);
  const setIsPlaying = useTimeStore((s) => s.setIsPlaying);
  const setIsLiveMode = useTimeStore((s) => s.setIsLiveMode);
  const setCurrentTime = useTimeStore((s) => s.setCurrentTime);
  const setSelectedDate = useTimeStore((s) => s.setSelectedDate);
  const setSunTimes = useTimeStore((s) => s.setSunTimes);

  const sliderGradient = useMemo(
    () => goldenHourGradient(sunrise, sunset, sunrise, sunset),
    [sunrise, sunset]
  );

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    setIsPlaying(false);
    setIsLiveMode(false);

    const totalRange = sunset.getTime() - sunrise.getTime();
    const newTime = new Date(sunrise.getTime() + (val / 1000) * totalRange);
    setCurrentTime(newTime);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parts = e.target.value.split("-");
    const newDate = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );
    setSelectedDate(newDate);
    setIsPlaying(false);

    const times = SunCalc.getTimes(newDate, LA_LAT, LA_LNG);
    setSunTimes(times.sunrise, times.sunset);

    // Re-initialize slider to 4pm or now
    const now = new Date();
    let targetTime: Date;
    if (now >= times.sunrise && now <= times.sunset) {
      targetTime = now;
    } else {
      targetTime = new Date(times.sunrise);
      targetTime.setHours(16, 0, 0, 0);
      if (targetTime < times.sunrise) targetTime = times.sunrise;
      if (targetTime > times.sunset) targetTime = times.sunset;
    }
    const totalRange = times.sunset.getTime() - times.sunrise.getTime();
    const elapsed = targetTime.getTime() - times.sunrise.getTime();
    const pct = totalRange > 0 ? (elapsed / totalRange) * 1000 : 500;
    setSliderValue(Math.round(pct));
    setCurrentTime(targetTime);
  };

  const handleNowClick = () => {
    setIsPlaying(false);
    setIsLiveMode(true);
    const now = new Date();
    setSelectedDate(now);

    const times = SunCalc.getTimes(now, LA_LAT, LA_LNG);
    setSunTimes(times.sunrise, times.sunset);

    if (now >= times.sunrise && now <= times.sunset) {
      const totalRange = times.sunset.getTime() - times.sunrise.getTime();
      const elapsed = now.getTime() - times.sunrise.getTime();
      setSliderValue(Math.round((elapsed / totalRange) * 1000));
      setCurrentTime(now);
    } else {
      let targetTime = new Date(times.sunrise);
      targetTime.setHours(16, 0, 0, 0);
      if (targetTime < times.sunrise) targetTime = times.sunrise;
      if (targetTime > times.sunset) targetTime = times.sunset;
      const totalRange = times.sunset.getTime() - times.sunrise.getTime();
      const elapsed = targetTime.getTime() - times.sunrise.getTime();
      setSliderValue(Math.round((elapsed / totalRange) * 1000));
      setCurrentTime(targetTime);
    }
  };

  return (
    <div className="time-controls animate-slide-up">
      <div className="time-display-row">
        <PlayButton />

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            className="time-display"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {formatTime(currentTime)}
          </span>
          {isLiveMode && (
            <span
              style={{
                fontSize: "9px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                color: "var(--color-sun)",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              ● LIVE
            </span>
          )}
        </div>

        <button className="now-btn" onClick={handleNowClick}>
          Now
        </button>

        <div className="date-btn" title="Change date">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <input
            type="date"
            value={toDateInputValue(selectedDate)}
            onChange={handleDateChange}
          />
        </div>
      </div>

      <div className="slider-row">
        <span className="slider-label">{formatTimeShort(sunrise)}</span>
        <input
          className="time-slider"
          type="range"
          min={0}
          max={1000}
          value={sliderValue}
          onChange={handleSliderChange}
          style={{ background: sliderGradient }}
        />
        <span className="slider-label">{formatTimeShort(sunset)}</span>
      </div>
    </div>
  );
}

export default function TimeSlider() {
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile) {
    return <TouchTimeSlider />;
  }

  return <DesktopTimeSlider />;
}
