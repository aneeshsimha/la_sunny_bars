"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { createMap } from "@/map/createMap";
import { addBuildingLayer } from "@/map/layers/buildingLayer";
import { addVenueLayer, setVenueSourceData } from "@/map/layers/venueLayer";
import { addShadowLayer } from "@/map/layers/shadowLayer";
import { addUserLayer } from "@/map/layers/userLayer";
import { bindStores } from "@/map/bindStores";
import { useUIStore } from "@/state/uiStore";
import { useTimeStore } from "@/state/timeStore";
import { useLocationStore } from "@/state/locationStore";
import { useVenueStore } from "@/state/venueStore";
import { loadVenueFeatures } from "@/data/venueLoad";
import { loadAllOccluders } from "@/data/loaders";
import { getDefaultScoringClient } from "@/worker/client";
import { scoreAndApply } from "@/worker/scoreAndApply";
import { neighborhoods } from "@/lib/neighborhoods";
import MapContainer from "./MapContainer";
import GeolocateButton from "@/components/geolocation/GeolocateButton";
import PlanningBanner from "@/components/controls/PlanningBanner";
import NeighborhoodSelector from "@/components/NeighborhoodSelector";
import type mapboxgl from "mapbox-gl";

interface AppShellProps {
  /** Content rendered inside the sidebar */
  sidebarContent?: React.ReactNode;
  /** Overlays rendered inside the map section (time controls, HUD, etc.) */
  mapOverlays?: React.ReactNode;
  /** Mobile bottom sheet rendered below the map (C2 slot) */
  bottomSheet?: React.ReactNode;
}

export default function AppShell({
  sidebarContent,
  mapOverlays,
  bottomSheet,
}: AppShellProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const unbindRef = useRef<(() => void) | null>(null);
  const focusAppliedRef = useRef(false);
  const focusBboxRef = useRef<[number, number, number, number] | null>(null);

  const [neighborhoodLoading, setNeighborhoodLoading] = useState(false);

  const setMapReady = useUIStore((s) => s.setMapReady);
  const mapReady = useUIStore((s) => s.mapReady);
  const setFocusedNeighborhood = useUIStore((s) => s.setFocusedNeighborhood);
  const focusedNeighborhood = useUIStore((s) => s.focusedNeighborhood);
  const setSunTimes = useTimeStore((s) => s.setSunTimes);
  const setSliderValue = useTimeStore((s) => s.setSliderValue);
  const setCurrentTime = useTimeStore((s) => s.setCurrentTime);
  const isPlanningMode = useTimeStore((s) => s.isPlanningMode);

  const storeSlug = useLocationStore((s) => s.neighborhoodSlug);
  const setNeighborhoodSlug = useLocationStore((s) => s.setNeighborhoodSlug);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let destroyed = false;

    createMap(mapContainerRef.current)
      .then((map) => {
        if (destroyed) {
          map.remove();
          return;
        }

        mapRef.current = map;

        map.on("style.load", () => {
          addBuildingLayer(map);
          addShadowLayer(map);
          addVenueLayer(map, []);
          addUserLayer(map);

          unbindRef.current = bindStores(map);

          setMapReady(true);

          // Seed time-of-day: sun times for today + position the slider at "now"
          // (clamped into the daylight window). Venue loading + scoring is driven
          // by the slug effect below once mapReady flips true.
          import("suncalc").then(({ default: SunCalc }) => {
            const now = new Date();
            const times = SunCalc.getTimes(now, 34.0195, -118.4912);
            setSunTimes(times.sunrise, times.sunset);

            let target = now;
            if (now < times.sunrise || now > times.sunset) {
              target = new Date(times.sunrise);
              target.setHours(16, 0, 0, 0);
              if (target < times.sunrise) target = times.sunrise;
              if (target > times.sunset) target = times.sunset;
            }
            const range = times.sunset.getTime() - times.sunrise.getTime();
            const elapsed = target.getTime() - times.sunrise.getTime();
            setSliderValue(range > 0 ? Math.round((elapsed / range) * 1000) : 500);
            setCurrentTime(target);
          });
        });
      })
      .catch(() => {
        // Token missing or mapbox failed to load — leave the container empty.
      });

    return () => {
      destroyed = true;
      if (unbindRef.current) {
        unbindRef.current();
        unbindRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?focus=<slug> query param: pan to neighborhood bbox on map ready
  useEffect(() => {
    if (!mapReady) return;
    if (focusAppliedRef.current) return;
    const map = mapRef.current;
    if (!map) return;

    const params = new URLSearchParams(window.location.search);
    const focusSlug = params.get("focus");
    if (!focusSlug) return;

    const neighborhood = neighborhoods.find((item) => item.slug === focusSlug);
    if (!neighborhood) return;

    setFocusedNeighborhood(neighborhood.name);
    focusAppliedRef.current = true;
    focusBboxRef.current = neighborhood.bbox;
    const [west, south, east, north] = neighborhood.bbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: { top: 120, right: 80, bottom: 160, left: 420 },
        pitch: 45,
        bearing: map.getBearing(),
        duration: 900,
      }
    );
  }, [mapReady, setFocusedNeighborhood]);

  // On mount: read ?n=<slug> and seed locationStore
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("n");
    if (n && neighborhoods.some((nb) => nb.slug === n)) {
      setNeighborhoodSlug(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL when storeSlug changes
  useEffect(() => {
    window.history.replaceState(null, "", "?n=" + storeSlug);
  }, [storeSlug]);

  // Load a neighborhood's venues + occluders: populate the store, feed the map
  // source, (re)initialize the scoring worker with the venue coords, and score.
  const loadNeighborhood = useCallback(async (slug: string) => {
    setNeighborhoodLoading(true);
    const [venues, occluders] = await Promise.all([
      loadVenueFeatures(slug),
      loadAllOccluders(slug).catch((): import("@/data/loaders").Occluder[] => []),
    ]);

    useVenueStore.getState().setVenues(venues);
    useVenueStore.getState().setSelectedVenueId(null);

    const map = mapRef.current;
    if (map) {
      setVenueSourceData(map, venues);
      // Frame the neighborhood so its venues are in view. The map's default
      // center is generic LA, so without this the viewport-filtered list would
      // be empty until the user pans to the neighborhood.
      const nb = neighborhoods.find((n) => n.slug === slug);
      if (nb) {
        const [west, south, east, north] = nb.bbox;
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: { top: 70, bottom: 120, left: 50, right: 50 }, pitch: 45, bearing: map.getBearing(), duration: 600 }
        );
      }
    }

    const client = getDefaultScoringClient();
    await client
      .init(
        occluders,
        venues.map((v) => ({
          id: v.id,
          coords: v.coordinates,
          // Only bias the sample grid for ground-level outdoor seating; rooftop
          // is orientation-agnostic (ANS-217 D6) and indoor/unknown seating has
          // no meaningful patio location to orient toward.
          facadeAzimuths:
            v.seatingType === 'patio' || v.seatingType === 'sidewalk'
              ? v.facadeAzimuths
              : [],
          // Lets the worker score rooftop venues at their real roof elevation
          // instead of ground level (ANS-218 D6).
          seatingType: v.seatingType,
          buildingHeight: v.buildingHeight,
        }))
      )
      .catch(() => {
        // Worker may already be initialized — ignore double-init errors.
      });

    await scoreAndApply(useTimeStore.getState().currentTime);
    setNeighborhoodLoading(false);
  }, []);

  // Load venues whenever the map becomes ready or the active neighborhood changes.
  useEffect(() => {
    if (!mapReady || !storeSlug) return;
    loadNeighborhood(storeSlug);
  }, [mapReady, storeSlug, loadNeighborhood]);

  // Handle neighborhood switch: update the store slug. The effect above reloads
  // venues/occluders/scores and frames the map (via loadNeighborhood) in
  // response to the slug change.
  const handleNeighborhoodSelect = useCallback(
    (slug: string) => {
      setNeighborhoodSlug(slug);
    },
    [setNeighborhoodSlug]
  );

  return (
    <div className="app-container">
      <aside className="sidebar">
        {sidebarContent}
      </aside>

      <main
        className="map-section"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <MapContainer ref={mapContainerRef} />
        <div className="map-tint" aria-hidden />
        {isPlanningMode && <PlanningBanner />}
        {focusedNeighborhood && (
          <div className="focus-chip" role="status">
            Showing {focusedNeighborhood}
          </div>
        )}
        <NeighborhoodSelector onSelect={handleNeighborhoodSelect} />
        {neighborhoodLoading && (
          <div
            role="status"
            aria-label="Loading neighborhood"
            style={{
              position: "absolute",
              top: 52,
              left: 12,
              background: "rgba(20,20,20,0.82)",
              color: "#fff",
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              backdropFilter: "blur(6px)",
              pointerEvents: "none",
            }}
          >
            Loading...
          </div>
        )}
        <GeolocateButton />
        {mapOverlays}
      </main>

      {bottomSheet && (
        <div className="bottom-sheet-slot">
          {bottomSheet}
        </div>
      )}
    </div>
  );
}
