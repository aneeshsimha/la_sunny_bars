import type { SunPosition } from './shadows';

// --- Types ---

/**
 * A horizon profile for a location.
 * 360 azimuth buckets (one per degree, index 0 = 0°/north), each holding the
 * elevation angle of the terrain horizon in that direction (radians).
 * A flat-terrain profile has all values = 0.
 */
export interface HorizonProfile {
  azimuthBuckets: number[]; // length 360: bucket index i covers azimuth i° to (i+1)°
  elevationAngles: number[]; // length 360: horizon elevation in radians for each bucket
}

// --- Factory ---

/**
 * Returns a flat-terrain HorizonProfile: 360 buckets all with elevation angle 0.
 */
export function flatHorizonProfile(): HorizonProfile {
  return {
    azimuthBuckets: Array.from({ length: 360 }, (_, i) => i),
    elevationAngles: new Array(360).fill(0),
  };
}

// --- Sun / Horizon Check ---

/**
 * Returns true if the sun is above the horizon profile at its current azimuth.
 *
 * sun.azimuth uses the suncalc convention: radians, 0 = south, positive = west.
 * We convert to compass degrees (0 = north, clockwise) for the bucket lookup.
 *
 * Conversion: compassDeg = (azimuthRad * 180 / Math.PI + 180) % 360
 *   - suncalc 0 (south) → 180°
 *   - suncalc π/2 (west) → 270°
 *   - suncalc -π/2 (east) → 90°
 *   - suncalc ±π (north) → 0°/360°
 */
export function isSunAboveHorizon(
  sun: SunPosition,
  profile: HorizonProfile
): boolean {
  const compassDeg = ((sun.azimuth * 180) / Math.PI + 180) % 360;
  const bucketIndex = Math.floor(compassDeg) % 360;
  const horizonElevation = profile.elevationAngles[bucketIndex];
  return sun.altitude > horizonElevation;
}

// --- Loader ---

/**
 * Attempts to load a horizon profile for a neighborhood from
 * /data/{slug}/horizon.json. Falls back to flatHorizonProfile() on 404 or
 * any network/parse error.
 *
 * Expected JSON format: { elevationAngles: number[] } (exactly 360 values)
 */
export async function loadHorizonProfile(slug: string): Promise<HorizonProfile> {
  try {
    const response = await fetch(`/data/${slug}/horizon.json`);
    if (!response.ok) {
      return flatHorizonProfile();
    }
    const json = (await response.json()) as { elevationAngles: number[] };
    if (
      !Array.isArray(json.elevationAngles) ||
      json.elevationAngles.length !== 360
    ) {
      return flatHorizonProfile();
    }
    return {
      azimuthBuckets: Array.from({ length: 360 }, (_, i) => i),
      elevationAngles: json.elevationAngles,
    };
  } catch {
    return flatHorizonProfile();
  }
}
