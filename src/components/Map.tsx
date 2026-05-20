"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import SunCalc from "suncalc";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  type BuildingFootprint,
  computeShadowPolygon,
  estimateSkyExposure,
  filterBuildingsByProximity,
  scoreSunlight,
} from "@/lib/shadows";
import { getTimeOfDayPalette, type Palette } from "@/lib/timeOfDay";
import { openTableUrl, resyUrl } from "@/lib/reservations";

// ===================== CONSTANTS =====================

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;
const METRIC_WEIGHTS = {
  directSun: 0.6,
  futureSun: 0.25,
  skyExposure: 0.15,
} as const;
const FORECAST_MINUTES = 90;
const FORECAST_STEP_MINUTES = 30;
const SUN_UNTIL_STEP_MINUTES = 10;

// ===================== TYPES =====================

interface VenueFeature {
  id: number;
  name: string;
  amenity: string;
  cuisine: string | null;
  outdoor_seating: string;
  website: string | null;
  sunScore: number;
  directSun: number;
  futureSun: number;
  skyExposure: number;
  sunUntil: string | null;
  coordinates: [number, number];
}

type AmenityFilter = "all" | "bar" | "restaurant" | "cafe" | "best";

// ===================== HELPERS =====================

function sunToMapboxLight(sunPos: { azimuth: number; altitude: number }) {
  const azimuthDeg = (sunPos.azimuth * 180) / Math.PI + 180;
  const altitudeDeg = Math.max(0, (sunPos.altitude * 180) / Math.PI);
  return [1.15, azimuthDeg, altitudeDeg] as [number, number, number];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeShort(date: Date): string {
  const h = date.getHours();
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return `${hour}${ampm}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSunAltitude(altitudeRad: number): string {
  return `${Math.round((altitudeRad * 180) / Math.PI)}deg`;
}

function formatSunDirection(azimuthRad: number): string {
  const bearing = (((azimuthRad * 180) / Math.PI + 180) % 360 + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(bearing / 45) % directions.length;
  return directions[index];
}

function getSeasonLabel(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  if (month >= 8 && month <= 10) return "Fall";
  return "Winter";
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createPopupHTML(props: {
  name: string;
  amenity: string;
  cuisine: string | null;
  website: string | null;
  sunScore: number;
  directSun?: number;
  sunUntil?: string | null;
}): string {
  const sunny = (props.directSun ?? props.sunScore) >= 0.5;
  return `<div style="font-size:13px;min-width:160px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">${props.name}</div>
    <div style="text-transform:capitalize;color:rgba(28,25,23,0.6);margin-bottom:4px">
      ${props.amenity}${props.cuisine ? ` · ${props.cuisine}` : ""}
    </div>
    ${props.website ? `<a href="${props.website}" target="_blank" rel="noopener" style="color:#F59E0B;text-decoration:none;font-size:12px">Visit Website &#8594;</a><br/>` : ""}
    <div style="margin-top:4px;display:flex;gap:8px">
      <a href="${openTableUrl(props.name)}" target="_blank" rel="noopener" style="color:#F59E0B;text-decoration:none;font-size:12px">Reserve · OpenTable &#8594;</a>
      <a href="${resyUrl(props.name)}" target="_blank" rel="noopener" style="color:#F59E0B;text-decoration:none;font-size:12px">Reserve · Resy &#8594;</a>
    </div>
    <div style="margin-top:8px;color:rgba(28,25,23,0.85);font-size:12px">
      Sun score <strong>${Math.round(props.sunScore)}</strong>/100
      ${props.sunUntil ? ` · sunny until ${props.sunUntil}` : ""}
    </div>
    <div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;${sunny ? "color:#F59E0B;background:rgba(245,158,11,0.15)" : "color:#818CF8;background:rgba(129,140,248,0.15)"}">
      <span style="width:8px;height:8px;border-radius:50%;background:${sunny ? "#F59E0B" : "#818CF8"};display:inline-block"></span>
      ${sunny ? "In Sun" : "In Shade"}
    </div>
  </div>`;
}

function isVenueInBounds(
  bounds: mapboxgl.LngLatBounds,
  coordinates: [number, number]
) {
  return bounds.contains(coordinates);
}

function scoreVenueForTimeWindow(
  coordinates: [number, number],
  buildings: BuildingFootprint[],
  startTime: Date,
  sunsetTime: Date
) {
  const directSun = scoreSunlight(
    coordinates,
    buildings,
    SunCalc.getPosition(startTime, LA_LAT, LA_LNG)
  );

  const skyExposure = estimateSkyExposure(coordinates, buildings);
  const horizonEnd = Math.min(
    sunsetTime.getTime(),
    startTime.getTime() + FORECAST_MINUTES * 60_000
  );

  let futureSamples = 0;
  let futureSunHits = 0;
  for (
    let time = startTime.getTime() + FORECAST_STEP_MINUTES * 60_000;
    time <= horizonEnd;
    time += FORECAST_STEP_MINUTES * 60_000
  ) {
    futureSamples += 1;
    futureSunHits += scoreSunlight(
      coordinates,
      buildings,
      SunCalc.getPosition(new Date(time), LA_LAT, LA_LNG)
    );
  }

  const futureSun = futureSamples > 0 ? futureSunHits / futureSamples : directSun;

  let sunUntil: string | null = null;
  if (directSun >= 0.5) {
    let nextShadeTime = sunsetTime;
    for (
      let time = startTime.getTime() + SUN_UNTIL_STEP_MINUTES * 60_000;
      time <= sunsetTime.getTime();
      time += SUN_UNTIL_STEP_MINUTES * 60_000
    ) {
      const sampleSun = scoreSunlight(
        coordinates,
        buildings,
        SunCalc.getPosition(new Date(time), LA_LAT, LA_LNG)
      );
      if (sampleSun < 0.5) {
        nextShadeTime = new Date(time);
        break;
      }
    }
    sunUntil = formatTime(nextShadeTime);
  }

  const sunScore =
    (directSun * METRIC_WEIGHTS.directSun +
      futureSun * METRIC_WEIGHTS.futureSun +
      skyExposure * METRIC_WEIGHTS.skyExposure) *
    100;

  return {
    directSun,
    futureSun,
    skyExposure,
    sunScore,
    sunUntil,
  };
}

function createEmptyFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function extractRenderedBuildings(map: mapboxgl.Map): BuildingFootprint[] {
  const buildingFeatures = map.queryRenderedFeatures({
    layers: ["3d-buildings"],
  });

  const buildings: BuildingFootprint[] = [];
  for (const bf of buildingFeatures) {
    if (
      bf.geometry.type !== "Polygon" &&
      bf.geometry.type !== "MultiPolygon"
    ) {
      continue;
    }

    const height =
      (bf.properties?.height as number) ||
      ((bf.properties?.levels as number) || 3) * 3;

    if (bf.geometry.type === "Polygon") {
      const ring = bf.geometry.coordinates[0] as [number, number][];
      buildings.push({ polygon: ring, height });
    } else {
      for (const poly of bf.geometry.coordinates) {
        const ring = poly[0] as [number, number][];
        buildings.push({ polygon: ring, height });
      }
    }
  }

  return buildings;
}

// ===================== COMPONENT =====================

export default function Map() {
  // Refs
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const venueDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const venueListRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Time state
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [sunrise, setSunrise] = useState<Date>(new Date());
  const [sunset, setSunset] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);

  // UI state
  const [venues, setVenues] = useState<VenueFeature[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AmenityFilter>("all");
  const [sunOnly, setSunOnly] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [shadowOverlayOn, setShadowOverlayOn] = useState(true);

  // ===================== COMPUTED =====================

  const filteredVenues = useMemo(() => {
    let list = venues;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.cuisine && v.cuisine.toLowerCase().includes(q))
      );
    }

    if (activeFilter !== "all") {
      list = list.filter((v) => {
        if (activeFilter === "bar")
          return v.amenity === "bar" || v.amenity === "pub";
        if (activeFilter === "best")
          return v.outdoor_seating && v.outdoor_seating !== "no" && v.sunScore >= 60;
        return v.amenity === activeFilter;
      });
    }

    if (sunOnly) {
      list = list.filter((v) => v.directSun >= 0.5);
    }

    return [...list].sort((a, b) => {
      if (b.sunScore !== a.sunScore) return b.sunScore - a.sunScore;
      if (b.directSun !== a.directSun) return b.directSun - a.directSun;
      return a.name.localeCompare(b.name);
    });
  }, [venues, searchQuery, activeFilter, sunOnly]);

  const sunCount = useMemo(
    () => venues.filter((v) => v.directSun >= 0.5).length,
    [venues]
  );

  const shadeCount = useMemo(
    () => venues.filter((v) => v.directSun < 0.5).length,
    [venues]
  );

  const bestCount = useMemo(
    () => venues.filter((v) => v.outdoor_seating && v.outdoor_seating !== "no" && v.sunScore >= 60).length,
    [venues]
  );

  const bestVenue = useMemo(() => filteredVenues[0] ?? null, [filteredVenues]);
  const sunPosition = useMemo(
    () => SunCalc.getPosition(currentTime, LA_LAT, LA_LNG),
    [currentTime]
  );
  const palette = useMemo(
    () => getTimeOfDayPalette(currentTime, LA_LAT, LA_LNG),
    [currentTime]
  );

  // ===================== CALLBACKS =====================

  const computeSunTimes = useCallback((date: Date) => {
    const times = SunCalc.getTimes(date, LA_LAT, LA_LNG);
    setSunrise(times.sunrise);
    setSunset(times.sunset);
    return { sunrise: times.sunrise, sunset: times.sunset };
  }, []);

  const initializeSlider = useCallback(
    (sunriseTime: Date, sunsetTime: Date) => {
      const now = new Date();
      let targetTime: Date;

      if (now >= sunriseTime && now <= sunsetTime) {
        targetTime = now;
      } else {
        targetTime = new Date(sunriseTime);
        targetTime.setHours(16, 0, 0, 0);
        if (targetTime < sunriseTime) targetTime = sunriseTime;
        if (targetTime > sunsetTime) targetTime = sunsetTime;
      }

      const totalRange = sunsetTime.getTime() - sunriseTime.getTime();
      const elapsed = targetTime.getTime() - sunriseTime.getTime();
      const pct = totalRange > 0 ? (elapsed / totalRange) * 1000 : 500;

      setSliderValue(Math.round(pct));
      setCurrentTime(targetTime);
    },
    []
  );

  const updateLighting = useCallback((time: Date, palette: Palette) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sunPos = SunCalc.getPosition(time, LA_LAT, LA_LNG);
    const position = sunToMapboxLight(sunPos);

    map.setLight({
      anchor: "map",
      position: position,
      intensity: palette.lightIntensity,
      color: palette.lightColor,
    });
  }, []);

  const applyPalette = useCallback((palette: Palette) => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("3d-buildings")) {
      map.setPaintProperty(
        "3d-buildings",
        "fill-extrusion-color",
        palette.buildingColor
      );
    }
    if (map.getLayer("shadow-polygons")) {
      map.setPaintProperty(
        "shadow-polygons",
        "fill-color",
        palette.shadowColor
      );
    }

    const section = mapContainer.current?.parentElement;
    if (section) {
      section.style.setProperty("--map-tint-color", palette.tintColor);
      section.style.setProperty(
        "--map-tint-opacity",
        String(palette.tintOpacity)
      );
    }
  }, []);

  const updateVenuesList = useCallback(() => {
    const map = mapRef.current;
    if (!map || !venueDataRef.current) return;

    const bounds = map.getBounds();
    if (!bounds) return;
    const list: VenueFeature[] = venueDataRef.current.features
      .filter((f) => f.properties?.name)
      .filter((f) =>
        isVenueInBounds(
          bounds,
          (f.geometry as GeoJSON.Point).coordinates as [number, number]
        )
      )
      .map((f) => ({
        id: f.properties!.osm_id as number,
        name: f.properties!.name as string,
        amenity: (f.properties!.amenity as string) || "venue",
        cuisine: f.properties!.cuisine as string | null,
        outdoor_seating: f.properties!.outdoor_seating as string,
        website: f.properties!.website as string | null,
        sunScore: Number(f.properties!.sunScore ?? 0),
        directSun: Number(f.properties!.directSun ?? 0),
        futureSun: Number(f.properties!.futureSun ?? 0),
        skyExposure: Number(f.properties!.skyExposure ?? 1),
        sunUntil:
          typeof f.properties!.sunUntil === "string"
            ? (f.properties!.sunUntil as string)
            : null,
        coordinates: (f.geometry as GeoJSON.Point).coordinates as [
          number,
          number,
        ],
      }));

    setVenues(list);
  }, []);

  const updateShadowOverlay = useCallback(
    (buildings: BuildingFootprint[], sunPos: { azimuth: number; altitude: number }) => {
      const map = mapRef.current;
      if (!map || !map.getSource("shadow-polygons")) return;

      const source = map.getSource("shadow-polygons") as mapboxgl.GeoJSONSource;

      if (!shadowOverlayOn || sunPos.altitude <= 0 || buildings.length === 0) {
        source.setData(createEmptyFeatureCollection());
        return;
      }

      const features: GeoJSON.Feature<GeoJSON.Polygon>[] = buildings
        .map((building) => computeShadowPolygon(building, sunPos))
        .filter((polygon) => polygon.length >= 4)
        .map((polygon, index) => ({
          type: "Feature",
          id: index,
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [polygon],
          },
        }));

      source.setData({
        type: "FeatureCollection",
        features,
      });
    },
    [shadowOverlayOn]
  );

  const scoreVenues = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("venues")) return;
    if (!venueDataRef.current) return;

    const sunPos = SunCalc.getPosition(currentTime, LA_LAT, LA_LNG);
    const bounds = map.getBounds();
    if (!bounds) return;
    const visibleVenueFeatures = venueDataRef.current.features.filter((feature) =>
      isVenueInBounds(
        bounds,
        (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      )
    );

    const buildings = extractRenderedBuildings(map);
    updateShadowOverlay(buildings, sunPos);

    for (const f of venueDataRef.current.features) {
      if (!f.properties) continue;
      f.properties.inView = isVenueInBounds(
        bounds,
        (f.geometry as GeoJSON.Point).coordinates as [number, number]
      );
    }

    if (sunPos.altitude <= 0) {
      for (const f of visibleVenueFeatures) {
        if (!f.properties) continue;
        f.properties.sunScore = 0;
        f.properties.directSun = 0;
        f.properties.futureSun = 0;
        f.properties.skyExposure = Number(f.properties.skyExposure ?? 1);
        f.properties.sunUntil = null;
      }
      const source = map.getSource("venues") as mapboxgl.GeoJSONSource;
      source.setData(venueDataRef.current);
      updateVenuesList();
      return;
    }

    for (const feature of visibleVenueFeatures) {
      if (!feature.properties) continue;

      const coords = (feature.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      const nearbyBuildings = filterBuildingsByProximity(coords, buildings, 220);
      const metrics = scoreVenueForTimeWindow(
        coords,
        nearbyBuildings,
        currentTime,
        sunset
      );

      feature.properties.sunScore = metrics.sunScore;
      feature.properties.directSun = metrics.directSun;
      feature.properties.futureSun = metrics.futureSun;
      feature.properties.skyExposure = metrics.skyExposure;
      feature.properties.sunUntil = metrics.sunUntil;
    }

    if (venueDataRef.current) {
      const source = map.getSource("venues") as mapboxgl.GeoJSONSource;
      source.setData(venueDataRef.current);
      updateVenuesList();
    }
  }, [currentTime, sunset, updateShadowOverlay, updateVenuesList]);

  // ===================== EFFECTS =====================

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error(
        "Mapbox token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local"
      );
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [LA_LNG, LA_LAT],
      zoom: 14,
      pitch: 45,
      bearing: -17.6,
      antialias: true,
      maxPitch: 75,
    });

    mapRef.current = map;

    map.on("style.load", () => {
      setMapReady(true);
      if (!map.getSource("shadow-polygons")) {
        map.addSource("shadow-polygons", {
          type: "geojson",
          data: createEmptyFeatureCollection(),
        });
      }

      const layers = map.getStyle().layers;
      let labelLayerId: string | undefined;
      if (layers) {
        for (const layer of layers) {
          if (layer.type === "symbol" && layer.layout?.["text-field"]) {
            labelLayerId = layer.id;
            break;
          }
        }
      }

      if (!map.getLayer("shadow-polygons")) {
        map.addLayer({
          id: "shadow-polygons",
          type: "fill",
          source: "shadow-polygons",
          paint: {
            "fill-color": "#1A0F5C",
            "fill-opacity": shadowOverlayOn ? 0.32 : 0,
          },
        });
      }

      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#D4B896",
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              0,
              12.5,
              [
                "coalesce",
                ["get", "height"],
                ["*", ["coalesce", ["get", "levels"], 1], 3],
              ],
            ],
            "fill-extrusion-base": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              0,
              12.5,
              ["coalesce", ["get", "min_height"], 0],
            ],
            "fill-extrusion-opacity": 0.85,
          },
        },
        labelLayerId
      );

      const { sunrise: sr, sunset: ss } = computeSunTimes(selectedDate);
      initializeSlider(sr, ss);
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.touchZoomRotate.enableRotation();

    // Venue click on map
    map.on("click", "venue-dots", (e) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [
        number,
        number,
      ];
      const props = f.properties as Record<string, string>;
      const osmId = Number(props.osm_id);

      setSelectedVenueId(osmId);

      new mapboxgl.Popup({ offset: 15 })
        .setLngLat(coords)
        .setHTML(
          createPopupHTML({
            name: props.name,
            amenity: props.amenity,
            cuisine: props.cuisine === "null" ? null : props.cuisine,
            website: props.website === "null" ? null : props.website,
            sunScore: Number(props.sunScore),
            directSun: Number(props.directSun),
            sunUntil: props.sunUntil === "null" ? null : props.sunUntil,
          })
        )
        .addTo(map);
    });

    map.on("mouseenter", "venue-dots", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "venue-dots", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load venue data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onStyleLoad = () => {
      fetch("/data/venues.geojson")
        .then((res) => res.json())
        .then((geojson) => {
          if (map.getSource("venues")) return;

          for (const f of geojson.features) {
            f.properties.sunScore = 0;
            f.properties.directSun = 0;
            f.properties.futureSun = 0;
            f.properties.skyExposure = 1;
            f.properties.sunUntil = null;
            f.properties.inView = false;
          }

          venueDataRef.current = geojson;
          map.addSource("venues", { type: "geojson", data: geojson });

          map.addLayer({
            id: "venue-sun-glow",
            type: "circle",
            source: "venues",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 5,
                14, 10,
                18, 18,
              ],
              "circle-color": "#FCD34D",
              "circle-opacity": [
                "interpolate",
                ["linear"],
                ["get", "directSun"],
                0, 0,
                1, 0.22,
              ],
              "circle-blur": 1,
            },
          });

          map.addLayer({
            id: "venue-dots",
            type: "circle",
            source: "venues",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 2,
                14, 3.5,
                18, 6,
              ],
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "sunScore"],
                0, "#6366F1",
                50, "#A78BFA",
                75, "#F59E0B",
                100, "#FDE68A",
              ],
              "circle-opacity": 0.9,
              "circle-stroke-width": 1,
              "circle-stroke-color": [
                "interpolate",
                ["linear"],
                ["get", "sunScore"],
                0, "rgba(99,102,241,0.45)",
                50, "rgba(167,139,250,0.45)",
                75, "rgba(245,158,11,0.45)",
                100, "rgba(253,230,138,0.5)",
              ],
            },
          });

          updateVenuesList();
          scoreVenues();
        });
    };

    if (map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      map.on("style.load", onStyleLoad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update lighting + score when time changes
  useEffect(() => {
    updateLighting(currentTime, palette);
    applyPalette(palette);
    scoreVenues();
  }, [currentTime, palette, updateLighting, applyPalette, scoreVenues]);

  useEffect(() => {
    if (!mapReady) return;
    scoreVenues();
  }, [mapReady, scoreVenues]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    map.on("moveend", scoreVenues);

    return () => {
      map.off("moveend", scoreVenues);
    };
  }, [mapReady, scoreVenues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("shadow-polygons")) return;

    map.setPaintProperty(
      "shadow-polygons",
      "fill-opacity",
      shadowOverlayOn ? 0.32 : 0
    );
  }, [mapReady, shadowOverlayOn]);

  // Play animation
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setSliderValue((prev) => {
          if (prev >= 1000) {
            setIsPlaying(false);
            return 1000;
          }
          return prev + 3;
        });
      }, 60);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying]);

  // Derive currentTime from sliderValue during playback
  useEffect(() => {
    if (!isPlaying) return;
    const totalRange = sunset.getTime() - sunrise.getTime();
    if (totalRange <= 0) return;
    const newTime = new Date(
      sunrise.getTime() + (sliderValue / 1000) * totalRange
    );
    setCurrentTime(newTime);
  }, [sliderValue, isPlaying, sunrise, sunset]);

  // Live clock — update time every 30s when in live mode and not playing
  useEffect(() => {
    if (!isLiveMode || isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30_000);

    return () => clearInterval(interval);
  }, [isLiveMode, isPlaying]);

  // Scroll to selected venue in list
  useEffect(() => {
    if (selectedVenueId && venueListRef.current) {
      const card = venueListRef.current.querySelector(
        `[data-venue-id="${selectedVenueId}"]`
      );
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedVenueId]);

  // ===================== HANDLERS =====================

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    setIsPlaying(false);
    setIsLiveMode(false);

    const totalRange = sunset.getTime() - sunrise.getTime();
    const newTime = new Date(sunrise.getTime() + (val / 1000) * totalRange);
    setCurrentTime(newTime);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parts = e.target.value.split("-");
    const newDate = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );
    setSelectedDate(newDate);
    setIsPlaying(false);

    const { sunrise: sr, sunset: ss } = computeSunTimes(newDate);
    initializeSlider(sr, ss);
  };

  const handleNowClick = () => {
    setIsPlaying(false);
    setIsLiveMode(true);
    const now = new Date();
    setSelectedDate(now);
    const { sunrise: sr, sunset: ss } = computeSunTimes(now);

    if (now >= sr && now <= ss) {
      const totalRange = ss.getTime() - sr.getTime();
      const elapsed = now.getTime() - sr.getTime();
      setSliderValue(Math.round((elapsed / totalRange) * 1000));
      setCurrentTime(now);
    } else {
      initializeSlider(sr, ss);
    }
  };

  const handleVenueClick = (venue: VenueFeature) => {
    setSelectedVenueId(venue.id);
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: venue.coordinates,
      zoom: 16,
      pitch: 45,
      duration: 1200,
    });

    // Clear existing popups
    document.querySelectorAll(".mapboxgl-popup").forEach((p) => p.remove());

    new mapboxgl.Popup({ offset: 15 })
      .setLngLat(venue.coordinates)
      .setHTML(
        createPopupHTML({
          ...venue,
          directSun: venue.directSun,
          sunUntil: venue.sunUntil,
        })
      )
      .addTo(map);
  };

  // ===================== RENDER =====================

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return (
      <div className="no-token-message">
        <p>
          Mapbox token missing.
          <br />
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>.env.local</code>
        </p>
      </div>
    );
  }

  const filters: { key: AmenityFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "best", label: "Best" },
    { key: "bar", label: "Bars" },
    { key: "restaurant", label: "Restaurants" },
    { key: "cafe", label: "Cafes" },
  ];
  const hasActiveFilters =
    searchQuery.trim().length > 0 || activeFilter !== "all" || sunOnly;
  const hasVenueData = venueDataRef.current !== null;

  return (
    <div className="app-container">
      {/* ========== SIDEBAR ========== */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-header">
            <div className="sidebar-title">Los Angeles</div>
            <h1
              className="sidebar-brand"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sunny Bars
            </h1>
            <p className="sidebar-tagline">Find your place in the sun</p>
          </div>

          <div className="search-container">
            <div className="search-wrapper">
              <svg
                className="search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="search-input"
                type="text"
                placeholder="Search this map view..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-bar">
            {filters.map((f) => (
              <button
                key={f.key}
                className={`filter-pill${activeFilter === f.key ? " active" : ""}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="stats-bar">
            <div className="stats-counts">
              <span className="stat-sun">{sunCount} in sun</span>
              <span className="stat-shade">{shadeCount} in shade</span>
            </div>
            <div
              className="sun-only-toggle"
              onClick={() => setSunOnly(!sunOnly)}
            >
              <span>Sun only</span>
              <div className={`toggle-switch${sunOnly ? " active" : ""}`} />
            </div>
          </div>

          <div className="score-explainer">
            <div className="score-explainer-title">
              Ranked in this map view
            </div>
            <p className="score-explainer-copy">
              Score = 60% sun right now, 25% next 90 minutes, 15% open sky from
              surrounding buildings. The selected date changes the sun angle, so
              3 PM in winter and 3 PM in summer cast different shadows.
            </p>
          </div>

          {bestVenue ? (
            <div className="top-pick-card">
              <div className="top-pick-label">Best right now</div>
              <div className="top-pick-name">{bestVenue.name}</div>
              <div className="top-pick-meta">
                {Math.round(bestVenue.sunScore)}/100 score
                {bestVenue.sunUntil ? ` · sunny until ${bestVenue.sunUntil}` : ""}
              </div>
              <div className="top-pick-breakdown">
                <span>Now {Math.round(bestVenue.directSun * 100)}%</span>
                <span>Next {Math.round(bestVenue.futureSun * 100)}%</span>
                <span>Open sky {Math.round(bestVenue.skyExposure * 100)}%</span>
              </div>
            </div>
          ) : (
            <div className="top-pick-card empty">
              <div className="top-pick-label">Best right now</div>
              <div className="top-pick-name">Move the map to explore patios</div>
              <div className="top-pick-meta">
                Rankings only show venues inside the current map view.
              </div>
            </div>
          )}
        </div>

        <div className="venue-list" ref={venueListRef}>
          {filteredVenues.length === 0 ? (
            <div className="empty-state">
              {!hasVenueData
                ? "Loading venues..."
                : venues.length === 0
                  ? "No venues in this map view yet. Pan or zoom to a busier block."
                : hasActiveFilters
                  ? "No venues match these filters in the current view."
                  : "No venues in this map view yet. Pan or zoom to a busier block."}
            </div>
          ) : (
            filteredVenues.map((venue, index) => {
              const sunny = venue.directSun >= 0.5;
              return (
                <div
                  key={venue.id}
                  data-venue-id={venue.id}
                  className={`venue-card ${sunny ? "sunny" : "shaded"}${
                    selectedVenueId === venue.id ? " selected" : ""
                  }`}
                  onClick={() => handleVenueClick(venue)}
                >
                  <span className="venue-rank">{index + 1}</span>
                  <span
                    className={`venue-sun-indicator ${sunny ? "sunny" : "shaded"}`}
                  />
                  <div className="venue-info">
                    <div className="venue-name">{venue.name}</div>
                    <div className="venue-meta">
                      {venue.amenity}
                      {venue.cuisine ? ` · ${venue.cuisine}` : ""}
                    </div>
                    <div className="venue-supporting">
                      Score {Math.round(venue.sunScore)}
                      {venue.sunUntil ? ` · sunny until ${venue.sunUntil}` : ""}
                      {!venue.sunUntil
                        ? ` · open sky ${Math.round(venue.skyExposure * 100)}%`
                        : ""}
                    </div>
                  </div>
                  <div className="venue-side">
                    <span
                      className={`venue-status ${sunny ? "sunny" : "shaded"}`}
                    >
                      {sunny ? "Sun now" : "Shade now"}
                    </span>
                    <div className="venue-score-number">
                      {Math.round(venue.sunScore)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ========== MAP ========== */}
      <main className="map-section">
        <div ref={mapContainer} className="map-container" />
        <div className="map-tint" aria-hidden />

        <div className="sun-context-card">
          <div className="sun-context-row">
            <div>
              <div className="sun-context-label">
                {palette.label} · {getSeasonLabel(selectedDate)} sun simulation
              </div>
              <div className="sun-context-meta">
                {formatDateLabel(selectedDate)} · {formatTime(currentTime)}
              </div>
            </div>
            <button
              className={`shadow-toggle-btn${shadowOverlayOn ? " active" : ""}`}
              onClick={() => setShadowOverlayOn((value) => !value)}
              type="button"
            >
              {shadowOverlayOn ? "Hide shadows" : "Show shadows"}
            </button>
          </div>
          <div className="sun-context-stats">
            <span>Sun {formatSunDirection(sunPosition.azimuth)}</span>
            <span>Altitude {formatSunAltitude(sunPosition.altitude)}</span>
            <span>
              {sunPosition.altitude > 0
                ? "Shadows update with season + hour"
                : "Sun below horizon"}
            </span>
          </div>
        </div>

        <div className="time-controls animate-slide-up">
          <div className="time-display-row">
            <button
              className={`play-btn${isPlaying ? " playing" : ""}`}
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                className="time-display"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatTime(currentTime)}
              </span>
              {isLiveMode && (
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: "600",
                    letterSpacing: "0.1em",
                    color: "var(--color-sun)",
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                >
                  ● LIVE
                </span>
              )}
            </div>

            <button className="now-btn" onClick={handleNowClick}>
              Now
            </button>

            <div className="date-btn" title="Change date">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <input
                type="date"
                value={toDateInputValue(selectedDate)}
                onChange={handleDateChange}
              />
            </div>
          </div>

          <div className="slider-row">
            <span className="slider-label">{formatTimeShort(sunrise)}</span>
            <input
              className="time-slider"
              type="range"
              min={0}
              max={1000}
              value={sliderValue}
              onChange={handleSliderChange}
            />
            <span className="slider-label">{formatTimeShort(sunset)}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
