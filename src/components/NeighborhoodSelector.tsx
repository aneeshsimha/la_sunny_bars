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
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const neighborhoodSlug = useLocationStore((s) => s.neighborhoodSlug);

  useEffect(() => {
    loadNeighborhoodManifest().then(setNeighborhoods).catch(console.error);
  }, []);

  const current = neighborhoods.find((n) => n.slug === neighborhoodSlug);

  const filtered = query
    ? neighborhoods.filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
    : neighborhoods;

  // Auto-focus input and reset state when menu opens; reset on close
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlight(0);
  }, [query]);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) {
        handleSelect(filtered[highlight].slug);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const listboxId = "neighborhood-selector-listbox";

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
        <div className="neighborhood-selector__dropdown">
          <div className="neighborhood-selector__search">
            <svg
              className="neighborhood-selector__search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className="neighborhood-selector__search-input"
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={
                filtered[highlight] ? `ns-option-${filtered[highlight].slug}` : undefined
              }
              placeholder="Search neighborhoods…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>

          <ul
            id={listboxId}
            className="neighborhood-selector__menu lsb-scroll"
            role="listbox"
            aria-label="Neighborhood"
          >
            {filtered.length === 0 ? (
              <li className="neighborhood-selector__empty">No neighborhoods found</li>
            ) : (
              filtered.map((n, i) => {
                const isActive = n.slug === neighborhoodSlug;
                const isHighlighted = i === highlight;
                return (
                  <li
                    key={n.slug}
                    id={`ns-option-${n.slug}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(n.slug)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`neighborhood-selector__option${isActive ? " active" : ""}${isHighlighted ? " highlighted" : ""}`}
                  >
                    <span>{n.name}</span>
                    <span className="neighborhood-selector__option-count">
                      {n.venueCount}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
