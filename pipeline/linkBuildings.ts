/**
 * Pure venue -> building footprint linkage (ANS-214 B10).
 *
 * Reimplements `isPointInPolygon` and `METERS_PER_DEG_LAT` from
 * `src/engine/shadows.ts` (algorithm kept byte-for-byte identical) rather than
 * cross-importing `src/` from `pipeline/`, since `pipeline/` runs under tsx/ESM
 * with its own module resolution and isn't covered by the root tsconfig/eslint.
 */

export interface Occluder {
  polygon: [number, number][]; // [lng, lat] vertices of footprint
  height: number; // height in meters
  opacity?: number;
}

export interface BuildingLink {
  buildingId: number | null;
  buildingHeight: number | null;
  buildingCentroid: [number, number] | null;
  facadeAzimuths: number[];
}

// Approximate meters per degree of latitude (Earth circumference / 360).
// Source: src/engine/shadows.ts METERS_PER_DEG_LAT.
export const METERS_PER_DEG_LAT = 111_320;

// Match rule threshold: a footprint whose nearest edge is within this many
// meters of the venue point (and doesn't contain it) still counts as a match.
export const MATCH_RADIUS_METERS = 25;

// Cap on how many nearest-edge outward-normal azimuths we report per venue.
const MAX_FACADE_EDGES = 3;

/**
 * Ray-casting point-in-polygon test.
 * Casts a ray from the point in the +x (east) direction and counts edge crossings.
 * Source: src/engine/shadows.ts isPointInPolygon (lines 237-258), copied identically.
 */
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;

  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function polygonCentroid(polygon: [number, number][]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const [vertexLng, vertexLat] of polygon) {
    lng += vertexLng;
    lat += vertexLat;
  }
  return [lng / polygon.length, lat / polygon.length];
}

/**
 * Converts a lng/lat point into local east/north meters relative to `origin`,
 * using METERS_PER_DEG_LAT and a cos(lat) correction for longitude (same
 * pattern as src/engine/shadows.ts, e.g. filterOccludersByProximity).
 */
function toLocalMeters(
  point: [number, number],
  origin: [number, number],
  cosLat: number
): [number, number] {
  const eastMeters = (point[0] - origin[0]) * METERS_PER_DEG_LAT * cosLat;
  const northMeters = (point[1] - origin[1]) * METERS_PER_DEG_LAT;
  return [eastMeters, northMeters];
}

/**
 * Shortest distance in meters from `point` to the segment `a`-`b`.
 * cosLat is derived from the venue point's latitude (consistent reference
 * for the whole match), per the METERS_PER_DEG_LAT + cos(lat) conversion.
 */
function distancePointToSegmentMeters(
  point: [number, number],
  a: [number, number],
  b: [number, number],
  cosLat: number
): number {
  const [ax, ay] = toLocalMeters(a, point, cosLat);
  const [bx, by] = toLocalMeters(b, point, cosLat);

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return Math.hypot(ax, ay);

  let t = (-ax * dx + -ay * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(closestX, closestY);
}

/**
 * Outward-normal compass azimuth (degrees, 0 = north, clockwise) of edge
 * a->b, given the footprint's centroid as the "inside" reference point.
 *
 * Convention (documented for D5): the azimuth points away from the
 * building's interior through the edge — i.e. the direction a facade on
 * that edge faces the street. Works regardless of polygon winding order,
 * since the outward side is picked by comparing against the centroid.
 */
function edgeOutwardAzimuthDeg(
  a: [number, number],
  b: [number, number],
  centroid: [number, number],
  cosLat: number
): number {
  const [bx, by] = toLocalMeters(b, a, cosLat); // edge vector, a as origin
  const midX = bx / 2;
  const midY = by / 2;
  const [cx, cy] = toLocalMeters(centroid, a, cosLat);

  const outwardX = midX - cx;
  const outwardY = midY - cy;

  const candidateX = by;
  const candidateY = -bx;
  const dot = candidateX * outwardX + candidateY * outwardY;

  const normalX = dot >= 0 ? candidateX : -candidateX;
  const normalY = dot >= 0 ? candidateY : -candidateY;

  const azimuth = (Math.atan2(normalX, normalY) * 180) / Math.PI;
  return (azimuth + 360) % 360;
}

function buildLink(
  buildingId: number,
  occluder: Occluder,
  point: [number, number]
): BuildingLink {
  const polygon = occluder.polygon;
  const centroid = polygonCentroid(polygon);
  const cosLat = Math.cos((point[1] * Math.PI) / 180);

  const edgeDistances = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return { i, dist: distancePointToSegmentMeters(point, a, b, cosLat) };
  });
  edgeDistances.sort((x, y) => x.dist - y.dist);

  const facadeAzimuths = edgeDistances
    .slice(0, Math.min(MAX_FACADE_EDGES, edgeDistances.length))
    .map(({ i }) => {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      return edgeOutwardAzimuthDeg(a, b, centroid, cosLat);
    });

  return {
    buildingId,
    buildingHeight: occluder.height,
    buildingCentroid: centroid,
    facadeAzimuths,
  };
}

const UNMATCHED: BuildingLink = {
  buildingId: null,
  buildingHeight: null,
  buildingCentroid: null,
  facadeAzimuths: [],
};

/**
 * Link a venue coordinate to the building footprint it sits in (or is
 * nearest to, within MATCH_RADIUS_METERS). Match rule:
 *   1. The footprint that contains the point (point-in-polygon) wins.
 *   2. Otherwise, the footprint whose nearest edge is within
 *      MATCH_RADIUS_METERS of the point.
 *   3. Otherwise, unmatched (all fields null / empty).
 * Footprints with fewer than 3 vertices are ignored (degenerate polygons).
 */
export function linkVenueToBuilding(
  point: [number, number],
  occluders: Occluder[]
): BuildingLink {
  for (let i = 0; i < occluders.length; i++) {
    const occluder = occluders[i];
    if (occluder.polygon.length < 3) continue;
    if (isPointInPolygon(point, occluder.polygon)) {
      return buildLink(i, occluder, point);
    }
  }

  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < occluders.length; i++) {
    const polygon = occluders[i].polygon;
    if (polygon.length < 3) continue;

    for (let e = 0; e < polygon.length; e++) {
      const a = polygon[e];
      const b = polygon[(e + 1) % polygon.length];
      const dist = distancePointToSegmentMeters(point, a, b, cosLat);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
  }

  if (bestIndex !== -1 && bestDist <= MATCH_RADIUS_METERS) {
    return buildLink(bestIndex, occluders[bestIndex], point);
  }

  return UNMATCHED;
}
