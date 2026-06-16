import { create } from "zustand";
import { VenueFeature } from "./types";
import { haversineDistanceKm } from "@/utils/geo";

const WALKING_SPEED_KM_PER_MIN = 0.08; // 80 m/min

function computeWalkTime(
  venueCoords: [number, number],
  userLocation: [number, number] | null
): number | null {
  if (!userLocation) return null;
  const distKm = haversineDistanceKm(userLocation, venueCoords);
  return distKm / WALKING_SPEED_KM_PER_MIN;
}

/** Composite sun score (0–100) from the direct/future/sky breakdown. */
function compositeScore(
  directSun: number,
  futureSun: number,
  skyExposure: number
): number {
  return Math.round(
    Math.min(100, (0.58 * directSun + 0.24 * futureSun + 0.18 * skyExposure) * 100)
  );
}

interface VenueState {
  venues: VenueFeature[];
  scores: Record<string, number>;
  selectedVenueId: string | null;
  setVenues: (venues: VenueFeature[]) => void;
  updateScores: (newScores: Record<string, number>) => void;
  /**
   * Merge worker score results into the venue objects. `direct` and `future`
   * map venue id → sun fraction (0–1) now and 90 min ahead. Recomputes each
   * venue's composite sunScore and republishes the 0–100 scores map that the
   * map layer reads for feature-state.
   */
  applyScores: (
    direct: Record<string, number>,
    future: Record<string, number>
  ) => void;
  setSelectedVenueId: (id: string | null) => void;
  updateWalkTimes: (userLocation: [number, number] | null) => void;
}

export const useVenueStore = create<VenueState>((set) => ({
  venues: [],
  scores: {},
  selectedVenueId: null,
  setVenues: (venues) => set({ venues }),
  updateScores: (newScores) =>
    set((state) => ({ scores: { ...state.scores, ...newScores } })),
  applyScores: (direct, future) =>
    set((state) => {
      const scores: Record<string, number> = {};
      const venues = state.venues.map((v) => {
        const directSun = direct[v.id] ?? v.directSun;
        const futureSun = future[v.id] ?? v.futureSun;
        const sunScore = compositeScore(directSun, futureSun, v.skyExposure);
        scores[v.id] = sunScore;
        return { ...v, directSun, futureSun, sunScore };
      });
      return { venues, scores };
    }),
  setSelectedVenueId: (id) => set({ selectedVenueId: id }),
  updateWalkTimes: (userLocation) =>
    set((state) => ({
      venues: state.venues.map((v) => ({
        ...v,
        walkTimeMinutes: computeWalkTime(v.coordinates, userLocation),
      })),
    })),
}));
