"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/shell/AppShell";
import Sidebar from "@/components/shell/Sidebar";
import MapOverlays from "@/components/shell/MapOverlays";
import { BottomSheet } from "@/components/sheet";

/**
 * Client-only root. The app is map-heavy and time-aware (stores seed from
 * `new Date()`), so it can't render meaningfully on the server without a
 * hydration mismatch. We render a stable empty shell during SSR + the first
 * client paint, then mount the real app once on the client.
 */
export default function AppRoot() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="app-container" />;

  return (
    <AppShell
      sidebarContent={<Sidebar />}
      mapOverlays={<MapOverlays />}
      bottomSheet={
        <BottomSheet>
          <Sidebar />
        </BottomSheet>
      }
    />
  );
}
