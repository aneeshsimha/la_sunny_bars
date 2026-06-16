import { create } from "zustand";
import { AmenityFilter, SeatingFilter, ScoringMode } from "./types";

interface FilterState {
  searchQuery: string;
  activeFilter: AmenityFilter;
  seatingFilter: SeatingFilter;
  sunOnly: boolean;
  scoringMode: ScoringMode;
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: AmenityFilter) => void;
  setSeatingFilter: (filter: SeatingFilter) => void;
  setSunOnly: (sunOnly: boolean) => void;
  setScoringMode: (mode: ScoringMode) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  searchQuery: "",
  activeFilter: "all",
  seatingFilter: "all",
  sunOnly: false,
  scoringMode: "sun",
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSeatingFilter: (filter) => set({ seatingFilter: filter }),
  setSunOnly: (sunOnly) => set({ sunOnly }),
  setScoringMode: (mode) => set({ scoringMode: mode }),
}));
