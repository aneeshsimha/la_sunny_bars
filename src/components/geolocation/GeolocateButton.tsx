"use client";

import { useState, useCallback } from "react";
import { useLocationStore } from "@/state/locationStore";
import { requestLocation } from "@/hooks/useGeolocation";
import { nearestNeighborhood } from "@/utils/geo";
import { neighborhoods } from "@/lib/neighborhoods";

type ButtonState = "idle" | "requesting" | "active" | "denied";

function stateFromPermission(
  perm: "unknown" | "granted" | "denied" | "prompt",
  requesting: boolean
): ButtonState {
  if (requesting) return "requesting";
  if (perm === "denied") return "denied";
  if (perm === "granted") return "active";
  return "idle";
}

export default function GeolocateButton() {
  const [requesting, setRequesting] = useState(false);

  const permissionState = useLocationStore((s) => s.permissionState);
  const setUserLocation = useLocationStore((s) => s.setUserLocation);
  const setNeighborhoodSlug = useLocationStore((s) => s.setNeighborhoodSlug);

  const buttonState = stateFromPermission(permissionState, requesting);

  const handleClick = useCallback(async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const coords = await requestLocation();
      if (coords) {
        setUserLocation(coords);
        const nearest = nearestNeighborhood(coords, neighborhoods);
        if (nearest) {
          setNeighborhoodSlug(nearest.slug);
        }
      }
    } finally {
      setRequesting(false);
    }
  }, [requesting, setUserLocation, setNeighborhoodSlug]);

  const label =
    buttonState === "requesting"
      ? "Locating…"
      : buttonState === "denied"
      ? "Location denied"
      : buttonState === "active"
      ? "Location active"
      : "Find my location";

  return (
    <button
      className={`geolocate-btn geolocate-btn--${buttonState}`}
      onClick={handleClick}
      disabled={buttonState === "denied" || buttonState === "requesting"}
      aria-label={label}
      title={label}
    >
      {buttonState === "requesting" ? (
        <SpinnerIcon />
      ) : buttonState === "active" ? (
        <ActiveDotIcon />
      ) : buttonState === "denied" ? (
        <DeniedIcon />
      ) : (
        <CrosshairIcon />
      )}
    </button>
  );
}

function CrosshairIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="geolocate-spinner"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ActiveDotIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="5" fill="currentColor" className="geolocate-pulse-dot" />
    </svg>
  );
}

function DeniedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}
