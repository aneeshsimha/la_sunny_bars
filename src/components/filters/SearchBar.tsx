"use client";

import { useEffect, useRef, useState } from "react";
import { useFilterStore } from "@/state/filterStore";

const DEBOUNCE_MS = 200;

export default function SearchBar() {
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const storeQuery = useFilterStore((s) => s.searchQuery);

  // Local state for instant input response; debounce the store write
  const [localValue, setLocalValue] = useState(storeQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local value in sync if the store is cleared externally
  useEffect(() => {
    setLocalValue(storeQuery);
  }, [storeQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchQuery(val);
    }, DEBOUNCE_MS);
  };

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="search-container">
      <div className="search-wrapper">
        <svg
          className="search-icon"
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
          className="search-input"
          type="text"
          placeholder="Search this map view..."
          value={localValue}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
