"use client";

import { useUIStore } from "@/state/uiStore";

/**
 * Map control that toggles the on-map shadow simulator (the dark ground
 * shadows cast by buildings). Shadows are on by default.
 */
export default function ShadowToggle() {
  const on = useUIStore((s) => s.shadowOverlayOn);
  const setOn = useUIStore((s) => s.setShadowOverlayOn);

  return (
    <button
      type="button"
      className={`shadow-toggle${on ? " active" : ""}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={on ? "Hide building shadows" : "Show building shadows"}
    >
      <span aria-hidden>☼</span>
      Shadows
    </button>
  );
}
