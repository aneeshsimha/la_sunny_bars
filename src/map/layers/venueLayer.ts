import mapboxgl from "mapbox-gl";
import type { VenueFeature, AmenityFilter, SeatingFilter } from "@/state/types";

export function addVenueLayer(
  map: mapboxgl.Map,
  venues: VenueFeature[]
): void {
  const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features: venues.map((v) => ({
      type: "Feature",
      id: String(v.id),
      properties: {
        name: v.name,
        amenity: v.amenity,
        cuisine: v.cuisine,
        outdoor_seating: v.outdoor_seating,
        website: v.website,
        osm_id: v.id,
        seatingType: v.seatingType ?? "",
      },
      geometry: {
        type: "Point",
        coordinates: v.coordinates,
      },
    })),
  };

  if (!map.getSource("venues")) {
    map.addSource("venues", {
      type: "geojson",
      data: geojson,
      promoteId: "osm_id",
    });
  }

  if (!map.getLayer("venue-sun-glow")) {
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
          ["feature-state", "sunScore"],
          0, 0,
          100, 0.22,
        ],
        "circle-blur": 1,
      },
    } as mapboxgl.AnyLayer);
  }

  if (!map.getLayer("venue-dots")) {
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
          ["feature-state", "sunScore"],
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
          ["feature-state", "sunScore"],
          0, "rgba(99,102,241,0.45)",
          50, "rgba(167,139,250,0.45)",
          75, "rgba(245,158,11,0.45)",
          100, "rgba(253,230,138,0.5)",
        ],
      },
    } as mapboxgl.AnyLayer);
  }
}

export function updateVenueScores(
  map: mapboxgl.Map,
  scores: Record<string, number>
): void {
  if (!map.isStyleLoaded() || !map.getSource("venues")) return;

  for (const [id, sunScore] of Object.entries(scores)) {
    map.setFeatureState(
      { source: "venues", id },
      { sunScore }
    );
  }
}

export function updateVenueVisibility(
  map: mapboxgl.Map,
  filter: AmenityFilter,
  sunOnly: boolean,
  searchQuery: string,
  seatingFilter: SeatingFilter = "all"
): void {
  if (!map.isStyleLoaded()) return;

  // Build a legacy expression array; cast to any to escape Mapbox's
  // deeply-recursive FilterSpecification union type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = ["all"];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filters.push([
      "any",
      ["in", q, ["downcase", ["get", "name"]]],
      ["in", q, ["downcase", ["coalesce", ["get", "cuisine"], ""]]],
    ]);
  }

  if (filter === "bar") {
    filters.push([
      "any",
      ["==", ["get", "amenity"], "bar"],
      ["==", ["get", "amenity"], "pub"],
    ]);
  } else if (filter === "restaurant") {
    filters.push(["==", ["get", "amenity"], "restaurant"]);
  } else if (filter === "cafe") {
    filters.push(["==", ["get", "amenity"], "cafe"]);
  }

  if (seatingFilter !== "all") {
    filters.push(["==", ["get", "seatingType"], seatingFilter]);
  }

  if (sunOnly) {
    filters.push([">=", ["feature-state", "sunScore"], 50]);
  }

  const mapFilter = filters.length > 1 ? filters : null;

  for (const layerId of ["venue-sun-glow", "venue-dots"]) {
    if (map.getLayer(layerId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setFilter(layerId, mapFilter as any);
    }
  }
}
