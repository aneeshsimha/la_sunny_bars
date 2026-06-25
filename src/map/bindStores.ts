import mapboxgl from "mapbox-gl";
import SunCalc from "suncalc";
import { useTimeStore } from "@/state/timeStore";
import { useVenueStore } from "@/state/venueStore";
import { useFilterStore } from "@/state/filterStore";
import { useUIStore } from "@/state/uiStore";
import { useLocationStore } from "@/state/locationStore";
import { updateSunLight } from "@/map/layers/buildingLayer";
import { updateVenueScores, updateVenueVisibility } from "@/map/layers/venueLayer";
import { updateShadowOverlay, updateShadowPolygons } from "@/map/layers/shadowLayer";
import { updateUserLocation } from "@/map/layers/userLayer";
import { loadBuildingOccluders } from "@/data/loaders";
import type { MapBounds } from "@/state/uiStore";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;
const SHADOW_THROTTLE_MS = 120;

function currentBbox(map: mapboxgl.Map): MapBounds | null {
  const b = map.getBounds();
  if (!b) return null;
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/**
 * Subscribe to all Zustand stores and drive the map accordingly.
 * Returns an unsubscribe/cleanup function.
 */
export function bindStores(map: mapboxgl.Map): () => void {
  // ── Sunlight simulator: project building shadows for the current sun +
  //    viewport. Recompute is throttled (leading + trailing) so scrubbing the
  //    time slider stays smooth. ──────────────────────────────────────────
  let shadowTimer: ReturnType<typeof setTimeout> | null = null;
  let shadowPending = false;

  async function recomputeShadows(): Promise<void> {
    if (!useUIStore.getState().shadowOverlayOn) return;
    const bbox = currentBbox(map);
    if (!bbox) return;
    const slug = useLocationStore.getState().neighborhoodSlug;
    let occluders;
    try {
      occluders = await loadBuildingOccluders(slug);
    } catch {
      return;
    }
    const sun = SunCalc.getPosition(
      useTimeStore.getState().currentTime,
      LA_LAT,
      LA_LNG
    );
    updateShadowPolygons(
      map,
      occluders,
      { azimuth: sun.azimuth, altitude: sun.altitude },
      bbox
    );
  }

  function scheduleShadows(): void {
    if (shadowTimer) {
      shadowPending = true;
      return;
    }
    void recomputeShadows();
    shadowTimer = setTimeout(() => {
      shadowTimer = null;
      if (shadowPending) {
        shadowPending = false;
        scheduleShadows();
      }
    }, SHADOW_THROTTLE_MS);
  }

  // ── Map move: update viewport bounds (drives viewport-aware rankings) and
  //    recompute shadows for the new view. ─────────────────────────────────
  const handleMoveEnd = () => {
    const bbox = currentBbox(map);
    if (bbox) useUIStore.getState().setMapBounds(bbox);
    scheduleShadows();
  };
  map.on("moveend", handleMoveEnd);

  // ── Bearing: keep uiStore in sync so the CompassButton needle reflects
  //    the current map rotation. Seed immediately, then update on each rotate.
  const onRotate = () => useUIStore.getState().setBearing(map.getBearing());
  map.on("rotate", onRotate);
  onRotate(); // seed initial bearing

  // ── Time store: lighting + scoring + shadows ────────────────────────────
  const unsubTime = useTimeStore.subscribe((state, prev) => {
    if (state.currentTime === prev.currentTime) return;

    const sunPos = SunCalc.getPosition(state.currentTime, LA_LAT, LA_LNG);
    updateSunLight(map, sunPos.azimuth, sunPos.altitude);
    scheduleShadows();

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
    // Turning shadows back on: recompute geometry for the current view/time.
    if (state.shadowOverlayOn) scheduleShadows();
  });

  // ── North-reset nonce: ease map back to north when CompassButton is clicked.
  //    Subscribe detects changes by comparing nonce; no initial-fire concern
  //    since the subscriber only runs when something changes.
  const unsubNorthReset = useUIStore.subscribe((state, prev) => {
    if (state.northResetNonce === prev.northResetNonce) return;
    map.easeTo({ bearing: 0, duration: 400 });
  });

  // Seed initial viewport bounds + shadows now that the map is loaded.
  const initBbox = currentBbox(map);
  if (initBbox) useUIStore.getState().setMapBounds(initBbox);
  scheduleShadows();

  return () => {
    map.off("moveend", handleMoveEnd);
    map.off("rotate", onRotate);
    if (shadowTimer) clearTimeout(shadowTimer);
    unsubTime();
    unsubVenues();
    unsubFilter();
    unsubLocation();
    unsubUI();
    unsubNorthReset();
  };
}
