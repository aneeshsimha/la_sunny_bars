"use client";

import { useCallback } from "react";
import SunCalc from "suncalc";
import { useTimeStore } from "@/state/timeStore";
import SunArcHUD from "@/components/SunArcHUD";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

/** Wires the SunArcHUD to the time store; scrubbing sets currentTime + slider. */
export default function SunArcHUDContainer() {
  const currentTime = useTimeStore((s) => s.currentTime);
  const sunrise = useTimeStore((s) => s.sunrise);
  const sunset = useTimeStore((s) => s.sunset);
  const setCurrentTime = useTimeStore((s) => s.setCurrentTime);
  const setSliderValue = useTimeStore((s) => s.setSliderValue);
  const setIsLiveMode = useTimeStore((s) => s.setIsLiveMode);
  const setIsPlaying = useTimeStore((s) => s.setIsPlaying);

  const handleScrub = useCallback(
    (time: Date) => {
      setIsPlaying(false);
      setIsLiveMode(false);
      setCurrentTime(time);
      const range = sunset.getTime() - sunrise.getTime();
      const elapsed = time.getTime() - sunrise.getTime();
      setSliderValue(range > 0 ? Math.round((elapsed / range) * 1000) : 500);
    },
    [sunrise, sunset, setCurrentTime, setSliderValue, setIsLiveMode, setIsPlaying]
  );

  return (
    <SunArcHUD
      currentTime={currentTime}
      sunrise={sunrise}
      sunset={sunset}
      lat={LA_LAT}
      lng={LA_LNG}
      onScrub={handleScrub}
    />
  );
}
