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

interface VenueState {
  venues: VenueFeature[];
  scores: Record<string, number>;
  selectedVenueId: number | null;
  setVenues: (venues: VenueFeature[]) => void;
  updateScores: (newScores: Record<string, number>) => void;
  setSelectedVenueId: (id: number | null) => void;
  updateWalkTimes: (userLocation: [number, number] | null) => void;
}

export const useVenueStore = create<VenueState>((set) => ({
  venues: [],
  scores: {},
  selectedVenueId: null,
  setVenues: (venues) => set({ venues }),
  updateScores: (newScores) =>
    set((state) => ({ scores: { ...state.scores, ...newScores } })),
  setSelectedVenueId: (id) => set({ selectedVenueId: id }),
  updateWalkTimes: (userLocation) =>
    set((state) => ({
      venues: state.venues.map((v) => ({
        ...v,
        walkTimeMinutes: computeWalkTime(v.coordinates, userLocation),
      })),
    })),
}));
