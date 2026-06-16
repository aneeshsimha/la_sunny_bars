import mapboxgl from "mapbox-gl";
import SunCalc from "suncalc";
import { useTimeStore } from "@/state/timeStore";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";
import { useUIStore } from "@/state/uiStore";
import { useLocationStore } from "@/state/locationStore";
import { updateSunLight } from "@/map/layers/buildingLayer";
import { updateVenueScores, updateVenueVisibility } from "@/map/layers/venueLayer";
import { updateShadowOverlay } from "@/map/layers/shadowLayer";
import { updateUserLocation } from "@/map/layers/userLayer";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

/**
 * Subscribe to all Zustand stores and drive the map accordingly.
 * Returns an unsubscribe/cleanup function.
 */
export function bindStores(map: mapboxgl.Map): () => void {
  // ── Time store: lighting + trigger scoring ──────────────────────────────
  const unsubTime = useTimeStore.subscribe((state, prev) => {
    if (state.currentTime === prev.currentTime) return;

    const sunPos = SunCalc.getPosition(state.currentTime, LA_LAT, LA_LNG);
    updateSunLight(map, sunPos.azimuth, sunPos.altitude);

    // Re-score every venue (now + 90 min ahead) and merge into the store.
    // venueLayer reacts via the scores subscription below; the venue list /
    // cards read the merged directSun/futureSun/sunScore off the venue objects.
    import("@/worker/scoreAndApply").then(({ scoreAndApply }) => {
      scoreAndApply(state.currentTime);
    });
  });

  // ── Venue store: score display ──────────────────────────────────────────
  const unsubVenues = useVenueStore.subscribe((state, prev) => {
    if (state.scores === prev.scores) return;
    updateVenueScores(map, state.scores);
  });

  // ── Filter store: visibility filter ────────────────────────────────────
  const unsubFilter = useFilterStore.subscribe((state, prev) => {
    if (
      state.activeFilter === prev.activeFilter &&
      state.seatingFilter === prev.seatingFilter &&
      state.sunOnly === prev.sunOnly &&
      state.searchQuery === prev.searchQuery
    ) {
      return;
    }
    updateVenueVisibility(
      map,
      state.activeFilter,
      state.sunOnly,
      state.searchQuery,
      state.seatingFilter
    );
  });

  // ── Location store: user puck + walk times ─────────────────────────────
  const unsubLocation = useLocationStore.subscribe((state, prev) => {
    if (state.userLocation === prev.userLocation) return;
    updateUserLocation(map, state.userLocation);
    useVenueStore.getState().updateWalkTimes(state.userLocation);
  });

  // ── UI store: shadow overlay toggle ────────────────────────────────────
  const unsubUI = useUIStore.subscribe((state, prev) => {
    if (state.shadowOverlayOn === prev.shadowOverlayOn) return;
    updateShadowOverlay(map, state.shadowOverlayOn);
  });

  return () => {
    unsubTime();
    unsubVenues();
    unsubFilter();
    unsubLocation();
    unsubUI();
  };
}
