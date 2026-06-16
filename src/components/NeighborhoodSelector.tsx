"use client";

import { useState, useRef, useEffect } from "react";
import { loadNeighborhoodManifest, NeighborhoodManifestEntry } from "@/data/loaders";
import { useLocationStore } from "@/state/locationStore";

interface NeighborhoodSelectorProps {
  onSelect: (slug: string) => void;
}

export default function NeighborhoodSelector({ onSelect }: NeighborhoodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodManifestEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const neighborhoodSlug = useLocationStore((s) => s.neighborhoodSlug);

  useEffect(() => {
    loadNeighborhoodManifest().then(setNeighborhoods).catch(console.error);
  }, []);

  const current = neighborhoods.find((n) => n.slug === neighborhoodSlug);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(slug: string) {
    setOpen(false);
    if (slug !== neighborhoodSlug) {
      onSelect(slug);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        fontFamily: "inherit",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          background: "rgba(20,20,20,0.88)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {current?.name ?? "Select neighborhood"}
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            fontSize: 10,
            opacity: 0.7,
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Neighborhood"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            margin: 0,
            padding: "4px 0",
            listStyle: "none",
            background: "rgba(20,20,20,0.94)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            minWidth: 180,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {neighborhoods.map((n) => {
            const isActive = n.slug === neighborhoodSlug;
            return (
              <li
                key={n.slug}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(n.slug)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  color: isActive ? "#FFD700" : "#fff",
                  background: isActive ? "rgba(255,215,0,0.08)" : "transparent",
                  cursor: "pointer",
                  fontWeight: isActive ? 700 : 400,
                  userSelect: "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {n.name}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
