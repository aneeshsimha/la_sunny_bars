import { describe, it, expect } from 'vitest';
import {
  flatHorizonProfile,
  isSunAboveHorizon,
  type HorizonProfile,
} from './terrain';
import type { SunPosition } from './shadows';

// ---------------------------------------------------------------------------
// 1. flatHorizonProfile
// ---------------------------------------------------------------------------
describe('flatHorizonProfile', () => {
  it('returns 360 azimuth buckets', () => {
    const profile = flatHorizonProfile();
    expect(profile.azimuthBuckets).toHaveLength(360);
  });

  it('returns 360 elevation angles', () => {
    const profile = flatHorizonProfile();
    expect(profile.elevationAngles).toHaveLength(360);
  });

  it('all elevation angles are 0', () => {
    const profile = flatHorizonProfile();
    expect(profile.elevationAngles.every((a) => a === 0)).toBe(true);
  });

  it('azimuthBuckets are 0..359 in order', () => {
    const profile = flatHorizonProfile();
    for (let i = 0; i < 360; i++) {
      expect(profile.azimuthBuckets[i]).toBe(i);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. isSunAboveHorizon — flat profile
// ---------------------------------------------------------------------------
describe('isSunAboveHorizon — flat profile', () => {
  const flat = flatHorizonProfile();

  it('sun at high altitude (0.5 rad) with flat profile returns true', () => {
    const sun: SunPosition = { azimuth: 0, altitude: 0.5 };
    expect(isSunAboveHorizon(sun, flat)).toBe(true);
  });

  it('sun at low positive altitude (0.01 rad) with flat profile returns true', () => {
    const sun: SunPosition = { azimuth: 1.0, altitude: 0.01 };
    expect(isSunAboveHorizon(sun, flat)).toBe(true);
  });

  it('sun at negative altitude returns false', () => {
    const sun: SunPosition = { azimuth: 0, altitude: -0.1 };
    expect(isSunAboveHorizon(sun, flat)).toBe(false);
  });

  it('sun at exactly 0 altitude returns false (not strictly above)', () => {
    const sun: SunPosition = { azimuth: 0, altitude: 0 };
    expect(isSunAboveHorizon(sun, flat)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. isSunAboveHorizon — custom profile with non-zero horizon
// ---------------------------------------------------------------------------
describe('isSunAboveHorizon — custom profile', () => {
  it('sun blocked by a high terrain horizon in that bucket', () => {
    // Build a profile where bucket 180 (south) has a high horizon of 0.3 rad
    const elevationAngles = new Array(360).fill(0);
    elevationAngles[180] = 0.3; // south bucket blocked
    const profile: HorizonProfile = {
      azimuthBuckets: Array.from({ length: 360 }, (_, i) => i),
      elevationAngles,
    };
    // suncalc azimuth 0 = south → compassDeg = (0 * 180/π + 180) % 360 = 180 → bucket 180
    const sun: SunPosition = { azimuth: 0, altitude: 0.2 }; // 0.2 < 0.3 → blocked
    expect(isSunAboveHorizon(sun, profile)).toBe(false);
  });

  it('sun above a partial terrain horizon in that bucket', () => {
    const elevationAngles = new Array(360).fill(0);
    elevationAngles[180] = 0.1; // south bucket low hill
    const profile: HorizonProfile = {
      azimuthBuckets: Array.from({ length: 360 }, (_, i) => i),
      elevationAngles,
    };
    const sun: SunPosition = { azimuth: 0, altitude: 0.5 }; // 0.5 > 0.1 → above
    expect(isSunAboveHorizon(sun, profile)).toBe(true);
  });
});
