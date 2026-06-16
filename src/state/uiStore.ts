import { create } from "zustand";

type SheetSnap = "peek" | "half" | "full";

interface UIState {
  mapReady: boolean;
  shadowOverlayOn: boolean;
  focusedNeighborhood: string | null;
  shadeMode: boolean;
  sheetSnap: SheetSnap;
  setMapReady: (ready: boolean) => void;
  setShadowOverlayOn: (on: boolean) => void;
  setFocusedNeighborhood: (neighborhood: string | null) => void;
  setShadeMode: (on: boolean) => void;
  setSheetSnap: (snap: SheetSnap) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mapReady: false,
  shadowOverlayOn: true,
  focusedNeighborhood: null,
  shadeMode: false,
  sheetSnap: "peek",
  setMapReady: (ready) => set({ mapReady: ready }),
  setShadowOverlayOn: (on) => set({ shadowOverlayOn: on }),
  setFocusedNeighborhood: (neighborhood) =>
    set({ focusedNeighborhood: neighborhood }),
  setShadeMode: (on) => set({ shadeMode: on }),
  setSheetSnap: (snap) => set({ sheetSnap: snap }),
}));
