"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { createMap } from "@/map/createMap";
import { addBuildingLayer } from "@/map/layers/buildingLayer";
import { addVenueLayer } from "@/map/layers/venueLayer";
import { addShadowLayer } from "@/map/layers/shadowLayer";
import { addUserLayer } from "@/map/layers/userLayer";
import { bindStores } from "@/map/bindStores";
import { useUIStore } from "@/state/uiStore";
import { useTimeStore } from "@/state/timeStore";
import { useLocationStore } from "@/state/locationStore";
import { neighborhoods } from "@/lib/neighborhoods";
import MapContainer from "./MapContainer";
import GeolocateButton from "@/components/geolocation/GeolocateButton";
import PlanningBanner from "@/components/controls/PlanningBanner";
import NeighborhoodSelector from "@/components/NeighborhoodSelector";
import type mapboxgl from "mapbox-gl";

interface AppShellProps {
  /** Neighborhood slug used to fetch venues on mount */
  neighborhoodSlug?: string;
  /** Content rendered inside the sidebar */
  sidebarContent?: React.ReactNode;
  /** Overlays rendered inside the map section (time controls, HUD, etc.) */
  mapOverlays?: React.ReactNode;
  /** Mobile bottom sheet rendered below the map (C2 slot) */
  bottomSheet?: React.ReactNode;
}

export default function AppShell({
  neighborhoodSlug,
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

          // Compute sun times for today and seed the store
          import("suncalc").then(({ default: SunCalc }) => {
            const now = new Date();
            const times = SunCalc.getTimes(now, 34.0195, -118.4912);
            setSunTimes(times.sunrise, times.sunset);
          });

          // Initialize the scoring worker with occluders for the current neighborhood.
          // loadAllOccluders combines buildings + trees/awnings; trees.json 404s are
          // swallowed inside loadTreeOccluders. Falls back to [] if no slug given.
          import("@/worker/client").then(({ getDefaultScoringClient }) => {
            const client = getDefaultScoringClient();
            const occluderPromise = neighborhoodSlug
              ? import("@/data/loaders").then(({ loadAllOccluders }) =>
                  loadAllOccluders(neighborhoodSlug).catch(
                    (): import("@/data/loaders").Occluder[] => []
                  )
                )
              : Promise.resolve<import("@/data/loaders").Occluder[]>([]);

            occluderPromise.then((occluders) => {
              client.init(occluders, []).catch(() => {
                // Worker may already be initialized — ignore double-init errors.
              });
            });
          });

          // If a neighborhood slug was provided, fetch its venues.
          if (neighborhoodSlug) {
            fetch(`/data/venues.geojson`)
              .then((res) => res.json())
              .then((geojson: GeoJSON.FeatureCollection) => {
                if (!map.getSource("venues")) return;
                const source = map.getSource("venues") as import("mapbox-gl").GeoJSONSource;
                source.setData(geojson);
              })
              .catch(() => {
                // Venue data not available — map still functional.
              });
          }
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

  // Handle neighborhood switch: fly map, reload occluders + worker, reload venues
  const handleNeighborhoodSelect = useCallback(
    (slug: string) => {
      setNeighborhoodSlug(slug);

      // Fly to neighborhood center
      const nb = neighborhoods.find((n) => n.slug === slug);
      const map = mapRef.current;
      if (nb && map) {
        const [lng, lat] = nb.center;
        map.flyTo({ center: [lng, lat], zoom: 14, duration: 1000, pitch: 45 });
      }

      if (!mapReady) return;

      setNeighborhoodLoading(true);

      Promise.all([
        import("@/data/loaders").then(({ loadAllOccluders }) =>
          loadAllOccluders(slug).catch(
            (): import("@/data/loaders").Occluder[] => []
          )
        ),
        fetch(`/data/${slug}/venues.json`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ]).then(([occluders, venueData]) => {
        // Re-init scoring worker with new occluders
        import("@/worker/client").then(({ getDefaultScoringClient }) => {
          const client = getDefaultScoringClient();
          client.init(occluders, []).catch(() => {
            // Ignore double-init; worker will be re-used.
          });
        });

        // Update venue layer with new neighborhood data
        const mapInstance = mapRef.current;
        if (mapInstance && venueData) {
          const source = mapInstance.getSource("venues") as import("mapbox-gl").GeoJSONSource | undefined;
          if (source) {
            source.setData(venueData);
          }
        }

        setNeighborhoodLoading(false);
      });
    },
    [mapReady, setNeighborhoodSlug]
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
