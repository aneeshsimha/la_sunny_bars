"use client";

import { useTimeStore } from "@/state/timeStore";

export default function PlayButton() {
  const isPlaying = useTimeStore((s) => s.isPlaying);
  const setIsPlaying = useTimeStore((s) => s.setIsPlaying);

  return (
    <button
      className={`play-btn${isPlaying ? " playing" : ""}`}
      onClick={() => setIsPlaying(!isPlaying)}
      title={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      )}
    </button>
  );
}
