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
    <div ref={containerRef} className="neighborhood-selector">
      <button
        className="neighborhood-selector__chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="neighborhood-selector__name">
          {current?.name ?? "Select neighborhood"}
        </span>
        {current && (
          <span className="neighborhood-selector__count">{current.venueCount}</span>
        )}
        <span
          className="neighborhood-selector__caret"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {open && (
        <ul
          className="neighborhood-selector__menu lsb-scroll"
          role="listbox"
          aria-label="Neighborhood"
        >
          {neighborhoods.map((n) => {
            const isActive = n.slug === neighborhoodSlug;
            return (
              <li
                key={n.slug}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(n.slug)}
                className={`neighborhood-selector__option${isActive ? " active" : ""}`}
              >
                <span>{n.name}</span>
                <span className="neighborhood-selector__option-count">
                  {n.venueCount}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
