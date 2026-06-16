import type { Neighborhood } from "@/lib/neighborhoods";

const EARTH_RADIUS_KM = 6371;

/** Haversine great-circle distance in kilometres between two [lng, lat] points. */
export function haversineDistanceKm(
  a: [number, number],
  b: [number, number]
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const haversine =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

/** Returns the neighborhood whose center is closest to userCoords, or null if the list is empty. */
export function nearestNeighborhood(
  userCoords: [number, number],
  neighborhoods: Neighborhood[]
): Neighborhood | null {
  if (neighborhoods.length === 0) return null;
  let best = neighborhoods[0];
  let bestDist = haversineDistanceKm(userCoords, best.center);
  for (let i = 1; i < neighborhoods.length; i++) {
    const dist = haversineDistanceKm(userCoords, neighborhoods[i].center);
    if (dist < bestDist) {
      bestDist = dist;
      best = neighborhoods[i];
    }
  }
  return best;
}

export interface VenueFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

/** Returns the n closest venues to userCoords, sorted nearest-first. */
export function findNearestVenues(
  userCoords: [number, number],
  venues: VenueFeature[],
  n: number
): VenueFeature[] {
  return venues
    .map((v) => ({
      venue: v,
      dist: haversineDistanceKm(userCoords, v.geometry.coordinates),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((item) => item.venue);
}
