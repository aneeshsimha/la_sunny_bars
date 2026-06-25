import { create } from "zustand";

type SheetSnap = "peek" | "half" | "full";

/** Current map viewport as a [west, south, east, north] bbox. */
export type MapBounds = [number, number, number, number];

interface UIState {
  mapReady: boolean;
  shadowOverlayOn: boolean;
  focusedNeighborhood: string | null;
  shadeMode: boolean;
  sheetSnap: SheetSnap;
  mapBounds: MapBounds | null;
  bearing: number;
  northResetNonce: number;
  setMapReady: (ready: boolean) => void;
  setShadowOverlayOn: (on: boolean) => void;
  setFocusedNeighborhood: (neighborhood: string | null) => void;
  setShadeMode: (on: boolean) => void;
  setSheetSnap: (snap: SheetSnap) => void;
  setMapBounds: (bounds: MapBounds | null) => void;
  setBearing: (b: number) => void;
  requestNorthReset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  mapReady: false,
  shadowOverlayOn: true,
  focusedNeighborhood: null,
  shadeMode: false,
  sheetSnap: "peek",
  mapBounds: null,
  bearing: 0,
  northResetNonce: 0,
  setMapReady: (ready) => set({ mapReady: ready }),
  setShadowOverlayOn: (on) => set({ shadowOverlayOn: on }),
  setFocusedNeighborhood: (neighborhood) =>
    set({ focusedNeighborhood: neighborhood }),
  setShadeMode: (on) => set({ shadeMode: on }),
  setSheetSnap: (snap) => set({ sheetSnap: snap }),
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  setBearing: (b) => set({ bearing: b }),
  requestNorthReset: () =>
    set((s) => ({ northResetNonce: s.northResetNonce + 1 })),
}));
