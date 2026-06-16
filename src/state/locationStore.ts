import { create } from "zustand";

type PermissionState = "unknown" | "granted" | "denied" | "prompt";

interface LocationState {
  userLocation: [number, number] | null;
  neighborhoodSlug: string;
  permissionState: PermissionState;
  setUserLocation: (location: [number, number] | null) => void;
  setNeighborhoodSlug: (slug: string) => void;
  setPermissionState: (state: PermissionState) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  userLocation: null,
  neighborhoodSlug: "silver-lake",
  permissionState: "unknown",
  setUserLocation: (location) => set({ userLocation: location }),
  setNeighborhoodSlug: (slug) => set({ neighborhoodSlug: slug }),
  setPermissionState: (state) => set({ permissionState: state }),
}));
