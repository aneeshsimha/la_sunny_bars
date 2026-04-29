// Shadow calculation utilities for determining whether a point (venue) is in
// sunlight or shadow based on nearby building geometries and sun position.
// Pure math + geometry — no external dependencies.

// --- Types ---

export interface BuildingFootprint {
  polygon: [number, number][]; // [lng, lat] vertices of building footprint
  height: number; // building height in meters
}

export interface SunPosition {
  azimuth: number; // radians, 0 = south, positive = west (suncalc convention)
  altitude: number; // radians, angle above horizon
}

// --- Constants ---

// Approximate meters per degree of latitude (Earth circumference / 360)
const METERS_PER_DEG_LAT = 111_320;

// --- Core Functions ---

/**
 * Determine whether a point is in sunlight given nearby buildings and sun position.
 * Returns true if in sunlight, false if in shadow.
 */
export function isPointInSunlight(
  point: [number, number], // [lng, lat]
  buildings: BuildingFootprint[],
  sun: SunPosition
): boolean {
  // Sun below or at the horizon — everything is in shadow
  if (sun.altitude <= 0) return false;

  for (const building of buildings) {
    const shadowPoly = computeShadowPolygon(building, sun);
    if (isPointInPolygon(point, shadowPoly)) {
      return false;
    }
  }

  return true;
}

/**
 * Compute the shadow polygon cast by a building given a sun position.
 *
 * The shadow is formed by projecting each vertex of the building footprint
 * along the ground in the direction opposite the sun. The resulting polygon
 * is the convex hull-ish shape connecting the original footprint and its
 * projected copy — we approximate this as the concatenation of original
 * vertices + projected vertices (wound in reverse) to form a closed ring.
 */
export function computeShadowPolygon(
  building: BuildingFootprint,
  sun: SunPosition
): [number, number][] {
  // Sun at or below horizon: shadow extends infinitely — return empty polygon.
  // Callers should check sun.altitude <= 0 separately (isPointInSunlight does).
  if (sun.altitude <= 0) return [];

  const { polygon, height } = building;
  if (polygon.length === 0) return [];

  // Shadow length on the ground in meters.
  // From basic trig: if the sun is at angle `altitude` above the horizon,
  // a vertical object of `height` casts a shadow of length height / tan(altitude).
  const shadowLengthMeters = height / Math.tan(sun.altitude);

  // Shadow direction: opposite the sun azimuth.
  // suncalc azimuth: 0 = south, positive = west, measured clockwise from south.
  // In a standard math frame (x = east, y = north):
  //   sun direction x = -sin(azimuth)  (azimuth positive toward west → sun is in -x when positive)
  //   sun direction y = -cos(azimuth)  (azimuth 0 = south → sun is in -y)
  // Wait — suncalc: azimuth 0 means sun is due south. Positive azimuth = clockwise
  // toward west. So the sun direction vector (toward the sun) in a N/E frame:
  //   toward_sun = (-sin(azimuth), -cos(azimuth))  [east, north]
  // because at azimuth=0 (south), toward_sun = (0, -1) — i.e. due south. Correct.
  //
  // Shadow falls in the opposite direction (away from the sun):
  //   shadow_dir = (sin(azimuth), cos(azimuth))  [east, north]
  const shadowDirEast = Math.sin(sun.azimuth);
  const shadowDirNorth = Math.cos(sun.azimuth);

  // Use a representative latitude for the lng→meters conversion.
  // Average the lat values of the footprint vertices.
  const avgLat =
    polygon.reduce((sum, v) => sum + v[1], 0) / polygon.length;

  // Convert shadow displacement from meters to degrees.
  // 1 deg lat ≈ 111,320 m
  // 1 deg lng ≈ 111,320 m * cos(lat)
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((avgLat * Math.PI) / 180);
  const dLng = (shadowDirEast * shadowLengthMeters) / metersPerDegLng;
  const dLat = (shadowDirNorth * shadowLengthMeters) / METERS_PER_DEG_LAT;

  // Project each vertex to get the far edge of the shadow.
  const projected: [number, number][] = polygon.map(([lng, lat]) => [
    lng + dLng,
    lat + dLat,
  ]);

  // Build the shadow polygon: original footprint + projected footprint in reverse
  // order. This creates a closed ring that covers the area from the building base
  // out to the shadow tip.
  const shadowPoly: [number, number][] = [
    ...polygon,
    ...projected.reverse(),
  ];

  return shadowPoly;
}

/**
 * Sunlight score for a point: 0.0 (full shadow) to 1.0 (full sun).
 * Currently binary — structured for future nuance (partial shade, sun quality).
 */
export function scoreSunlight(
  point: [number, number],
  buildings: BuildingFootprint[],
  sun: SunPosition
): number {
  return isPointInSunlight(point, buildings, sun) ? 1.0 : 0.0;
}

/**
 * Estimate how open the sky feels from a venue based on nearby building height,
 * distance, and direction around the point.
 *
 * The score is intentionally approximate: 1.0 means mostly open sky, while 0.0
 * means the point is boxed in by tall nearby buildings on many sides.
 */
export function estimateSkyExposure(
  point: [number, number],
  buildings: BuildingFootprint[],
  radiusMeters: number = 180,
  sectorCount: number = 12
): number {
  if (buildings.length === 0) return 1;

  const [pLng, pLat] = point;
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const sectorObstruction = new Array(sectorCount).fill(0);

  for (const building of buildings) {
    const centroid = computePolygonCentroid(building.polygon);
    if (!centroid) continue;

    const [cLng, cLat] = centroid;
    const eastMeters = (cLng - pLng) * METERS_PER_DEG_LAT * cosLat;
    const northMeters = (cLat - pLat) * METERS_PER_DEG_LAT;
    const distance = Math.hypot(eastMeters, northMeters);

    if (distance === 0 || distance > radiusMeters * 1.35) continue;

    const angle = Math.atan2(northMeters, eastMeters);
    const sectorIndex = Math.min(
      sectorCount - 1,
      Math.floor(((angle + Math.PI) / (Math.PI * 2)) * sectorCount)
    );

    const elevationAngle = Math.atan2(Math.max(building.height, 1), distance);
    const normalizedElevation = Math.min(elevationAngle / (Math.PI / 3), 1);
    const proximityWeight = Math.max(0.2, 1 - distance / (radiusMeters * 1.35));
    const obstruction = normalizedElevation * proximityWeight;

    sectorObstruction[sectorIndex] = Math.max(
      sectorObstruction[sectorIndex],
      obstruction
    );
  }

  const averageObstruction =
    sectorObstruction.reduce((sum, value) => sum + value, 0) / sectorCount;

  return clamp01(1 - averageObstruction);
}

/**
 * Filter buildings to only those within `radiusMeters` of the point.
 * Uses a cheap bounding-box prefilter on each building's centroid.
 *
 * Rationale: a 50 m tall building at a low 15° sun altitude casts a shadow
 * ~186 m long, so a 200 m radius is a reasonable default cutoff.
 */
export function filterBuildingsByProximity(
  point: [number, number], // [lng, lat]
  buildings: BuildingFootprint[],
  radiusMeters: number = 200
): BuildingFootprint[] {
  const [pLng, pLat] = point;
  const cosLat = Math.cos((pLat * Math.PI) / 180);

  // Convert radius to degrees for a cheap bounding-box check.
  const dLatMax = radiusMeters / METERS_PER_DEG_LAT;
  const dLngMax = radiusMeters / (METERS_PER_DEG_LAT * cosLat);

  return buildings.filter((b) => {
    // Compute centroid of building footprint.
    const n = b.polygon.length;
    if (n === 0) return false;
    let cLng = 0;
    let cLat = 0;
    for (const [lng, lat] of b.polygon) {
      cLng += lng;
      cLat += lat;
    }
    cLng /= n;
    cLat /= n;

    // Bounding-box proximity check (Manhattan-ish, fast).
    return (
      Math.abs(cLat - pLat) <= dLatMax && Math.abs(cLng - pLng) <= dLngMax
    );
  });
}

// --- Internal Helpers ---

/**
 * Ray-casting point-in-polygon test.
 * Casts a ray from the point in the +x (east) direction and counts edge crossings.
 * An odd number of crossings means the point is inside.
 */
function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;

  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    // Check if the edge from vertex j to vertex i crosses the horizontal ray
    // from (px, py) heading in the +x direction.
    const intersects =
      yi > py !== yj > py && // edge straddles the ray's y-level
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi; // intersection x is to the right of px

    if (intersects) inside = !inside;
  }

  return inside;
}

function computePolygonCentroid(
  polygon: [number, number][]
): [number, number] | null {
  if (polygon.length === 0) return null;

  let lng = 0;
  let lat = 0;
  for (const [vertexLng, vertexLat] of polygon) {
    lng += vertexLng;
    lat += vertexLat;
  }

  return [lng / polygon.length, lat / polygon.length];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
