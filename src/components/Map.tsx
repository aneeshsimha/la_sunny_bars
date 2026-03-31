"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import SunCalc from "suncalc";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  type BuildingFootprint,
  filterBuildingsByProximity,
  scoreSunlight,
} from "@/lib/shadows";

// ===================== CONSTANTS =====================

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;

// ===================== TYPES =====================

interface VenueFeature {
  id: number;
  name: string;
  amenity: string;
  cuisine: string | null;
  outdoor_seating: string;
  website: string | null;
  sunScore: number;
  coordinates: [number, number];
}

type AmenityFilter = "all" | "bar" | "restaurant" | "cafe";

// ===================== HELPERS =====================

function sunToMapboxLight(sunPos: { azimuth: number; altitude: number }) {
  const azimuthDeg = (sunPos.azimuth * 180) / Math.PI + 180;
  const altitudeDeg = Math.max(0, (sunPos.altitude * 180) / Math.PI);
  return [1.15, azimuthDeg, altitudeDeg] as [number, number, number];
}

function sunIntensity(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0.1;
  // Higher intensity for more dramatic sunlit vs shadow contrast
  return 0.35 + 0.45 * Math.min(altitudeDeg / 90, 1);
}

function sunColor(altitudeDeg: number): string {
  if (altitudeDeg <= 0) return "#1a1a2e";
  // Keep the light warm/golden — sunrise orange → midday golden-yellow (not white)
  const t = Math.min(altitudeDeg / 50, 1);
  const r = 255;
  const g = Math.round(159 + (226 - 159) * t); // caps at 226 (warm yellow, not white)
  const b = Math.round(50 + (100 - 50) * t);   // stays low to keep it golden
  return `rgb(${r}, ${g}, ${b})`;
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
}): string {
  const sunny = props.sunScore >= 0.5;
  return `<div style="font-size:13px;min-width:160px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">${props.name}</div>
    <div style="text-transform:capitalize;color:rgba(250,250,249,0.5);margin-bottom:4px">
      ${props.amenity}${props.cuisine ? ` · ${props.cuisine}` : ""}
    </div>
    ${props.website ? `<a href="${props.website}" target="_blank" rel="noopener" style="color:#F59E0B;text-decoration:none;font-size:12px">Visit Website &#8594;</a><br/>` : ""}
    <div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;${sunny ? "color:#F59E0B;background:rgba(245,158,11,0.15)" : "color:#818CF8;background:rgba(129,140,248,0.15)"}">
      <span style="width:8px;height:8px;border-radius:50%;background:${sunny ? "#F59E0B" : "#818CF8"};display:inline-block"></span>
      ${sunny ? "In Sun" : "In Shade"}
    </div>
  </div>`;
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

  // UI state
  const [venues, setVenues] = useState<VenueFeature[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AmenityFilter>("all");
  const [sunOnly, setSunOnly] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);

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
        return v.amenity === activeFilter;
      });
    }

    if (sunOnly) {
      list = list.filter((v) => v.sunScore >= 0.5);
    }

    return [...list].sort((a, b) => {
      if (b.sunScore !== a.sunScore) return b.sunScore - a.sunScore;
      return a.name.localeCompare(b.name);
    });
  }, [venues, searchQuery, activeFilter, sunOnly]);

  const sunCount = useMemo(
    () => venues.filter((v) => v.sunScore >= 0.5).length,
    [venues]
  );

  const shadeCount = useMemo(
    () => venues.filter((v) => v.sunScore < 0.5).length,
    [venues]
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

  const updateLighting = useCallback((time: Date) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sunPos = SunCalc.getPosition(time, LA_LAT, LA_LNG);
    const position = sunToMapboxLight(sunPos);
    const altDeg = position[2];

    map.setLight({
      anchor: "map",
      position: position,
      intensity: sunIntensity(altDeg),
      color: sunColor(altDeg),
    });
  }, []);

  const updateVenuesList = useCallback(() => {
    if (!venueDataRef.current) return;

    const list: VenueFeature[] = venueDataRef.current.features
      .filter((f) => f.properties?.name)
      .map((f) => ({
        id: f.properties!.osm_id as number,
        name: f.properties!.name as string,
        amenity: (f.properties!.amenity as string) || "venue",
        cuisine: f.properties!.cuisine as string | null,
        outdoor_seating: f.properties!.outdoor_seating as string,
        website: f.properties!.website as string | null,
        sunScore: (f.properties!.sunScore as number) ?? 1,
        coordinates: (f.geometry as GeoJSON.Point).coordinates as [
          number,
          number,
        ],
      }));

    setVenues(list);
  }, []);

  const scoreVenues = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("venues")) return;

    const sunPos = SunCalc.getPosition(currentTime, LA_LAT, LA_LNG);

    if (sunPos.altitude <= 0) {
      if (venueDataRef.current) {
        for (const f of venueDataRef.current.features) {
          if (f.properties) f.properties.sunScore = 0;
        }
        const source = map.getSource("venues") as mapboxgl.GeoJSONSource;
        source.setData(venueDataRef.current);
        updateVenuesList();
      }
      return;
    }

    const buildingFeatures = map.queryRenderedFeatures({
      layers: ["3d-buildings"],
    });

    const buildings: BuildingFootprint[] = [];
    for (const bf of buildingFeatures) {
      if (
        bf.geometry.type !== "Polygon" &&
        bf.geometry.type !== "MultiPolygon"
      )
        continue;

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

    const venueFeatures = map.queryRenderedFeatures({
      layers: ["venue-dots"],
    });

    if (venueFeatures.length === 0 || buildings.length === 0) return;

    const scoreByOsmId: Record<number, number> = {};
    for (const vf of venueFeatures) {
      const osmId = vf.properties?.osm_id;
      if (osmId == null || osmId in scoreByOsmId) continue;

      const coords = (vf.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      const nearby = filterBuildingsByProximity(coords, buildings, 200);
      const score = scoreSunlight(coords, nearby, sunPos);
      scoreByOsmId[osmId] = score;
    }

    if (venueDataRef.current) {
      for (const f of venueDataRef.current.features) {
        const osmId = f.properties?.osm_id;
        if (osmId != null && osmId in scoreByOsmId) {
          f.properties!.sunScore = scoreByOsmId[osmId];
        }
      }
      const source = map.getSource("venues") as mapboxgl.GeoJSONSource;
      source.setData(venueDataRef.current);
      updateVenuesList();
    }
  }, [currentTime, updateVenuesList]);

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
      style: "mapbox://styles/mapbox/dark-v11",
      center: [LA_LNG, LA_LAT],
      zoom: 14,
      pitch: 45,
      bearing: -17.6,
      antialias: true,
    });

    mapRef.current = map;

    map.on("style.load", () => {
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

      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#C8AD8A",
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
            f.properties.sunScore = 1;
          }

          venueDataRef.current = geojson;
          map.addSource("venues", { type: "geojson", data: geojson });

          map.addLayer({
            id: "venue-dots",
            type: "circle",
            source: "venues",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 3,
                14, 6,
                18, 10,
              ],
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "sunScore"],
                0, "#818CF8",
                1, "#F59E0B",
              ],
              "circle-opacity": 0.9,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": [
                "interpolate",
                ["linear"],
                ["get", "sunScore"],
                0, "rgba(129,140,248,0.3)",
                1, "rgba(245,158,11,0.3)",
              ],
            },
          });

          updateVenuesList();
        });
    };

    if (map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      map.on("style.load", onStyleLoad);
    }
  }, [updateVenuesList]);

  // Update lighting + score when time changes
  useEffect(() => {
    updateLighting(currentTime);
    scoreVenues();
  }, [currentTime, updateLighting, scoreVenues]);

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
      .setHTML(createPopupHTML(venue))
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
    { key: "bar", label: "Bars" },
    { key: "restaurant", label: "Restaurants" },
    { key: "cafe", label: "Cafes" },
  ];

  return (
    <div className="app-container">
      {/* ========== SIDEBAR ========== */}
      <aside className="sidebar">
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
              placeholder="Search venues..."
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

        <div className="venue-list" ref={venueListRef}>
          {filteredVenues.length === 0 ? (
            <div className="empty-state">
              {venues.length === 0
                ? "Loading venues..."
                : "No venues match your filters"}
            </div>
          ) : (
            filteredVenues.map((venue, index) => {
              const sunny = venue.sunScore >= 0.5;
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
                  </div>
                  <span
                    className={`venue-status ${sunny ? "sunny" : "shaded"}`}
                  >
                    {sunny ? "Sun" : "Shade"}
                  </span>
                  <svg
                    className="venue-chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ========== MAP ========== */}
      <main className="map-section">
        <div ref={mapContainer} className="map-container" />

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

            <span
              className="time-display"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatTime(currentTime)}
            </span>

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
