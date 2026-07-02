import { describe, it, expect } from 'vitest';
import { feetToMeters, polygonCentroid, findNearestLariacMatch, type LariacRecord } from './lariac';

describe('feetToMeters', () => {
  it('converts US Bank Tower (1016.83 ft measured LARIAC HEIGHT) to ~309.9m, not ~1000m', () => {
    // Golden/manual assertion (per ANS-235 brief): a known-tall DTLA building
    // must land around 300m after conversion. If this ever comes out close
    // to 1016.83 (i.e. the conversion was skipped) or ~3336 (i.e. applied in
    // the wrong direction), that's a unit-conversion regression.
    const meters = feetToMeters(1016.83);
    expect(meters).toBeCloseTo(309.93, 1);
    expect(meters).toBeGreaterThan(250);
    expect(meters).toBeLessThan(400);
  });

  it('converts Silver Lake ELEV (~440 ft) to ~134.1m', () => {
    expect(feetToMeters(440)).toBeCloseTo(134.11, 1);
  });

  it('converts 0 feet to 0 meters', () => {
    expect(feetToMeters(0)).toBe(0);
  });
});

describe('polygonCentroid', () => {
  it('computes the average of vertices for a simple square', () => {
    const square: [number, number][] = [
      [-118.001, 34.001],
      [-117.999, 34.001],
      [-117.999, 34.003],
      [-118.001, 34.003],
    ];
    const [lng, lat] = polygonCentroid(square);
    expect(lng).toBeCloseTo(-118.0, 6);
    expect(lat).toBeCloseTo(34.002, 6);
  });
});

describe('findNearestLariacMatch', () => {
  const centroid: [number, number] = [-118.25, 34.05];
  const cosLat = Math.cos((34.05 * Math.PI) / 180);
  // ~111320 meters per degree latitude.
  const metersPerDegLat = 111_320;

  function offsetRecord(eastMeters: number, northMeters: number, heightFt: number, elevFt: number): LariacRecord {
    return {
      lng: centroid[0] + eastMeters / (metersPerDegLat * cosLat),
      lat: centroid[1] + northMeters / metersPerDegLat,
      heightFt,
      elevFt,
    };
  }

  it('matches the nearest candidate within the radius and converts feet to meters', () => {
    const near = offsetRecord(5, 5, 1016.83, 440); // ~7m away
    const far = offsetRecord(15, 15, 200, 100); // ~21.2m away, outside 20m radius on its own but farther than `near`
    const match = findNearestLariacMatch(centroid, [far, near], 20);
    expect(match).not.toBeNull();
    expect(match!.heightMeters).toBeCloseTo(309.93, 1);
    expect(match!.baseElevMeters).toBeCloseTo(134.11, 1);
    expect(match!.distanceMeters).toBeLessThan(10);
  });

  it('returns null when the nearest candidate is beyond the radius', () => {
    const tooFar = offsetRecord(30, 30, 100, 50); // ~42.4m away
    const match = findNearestLariacMatch(centroid, [tooFar], 20);
    expect(match).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(findNearestLariacMatch(centroid, [], 20)).toBeNull();
  });

  it('picks the closer of two candidates both within radius', () => {
    const closer = offsetRecord(2, 2, 50, 10);
    const farther = offsetRecord(10, 10, 999, 999);
    const match = findNearestLariacMatch(centroid, [farther, closer], 20);
    expect(match!.heightMeters).toBeCloseTo(feetToMeters(50), 5);
  });

  it('a candidate exactly at the radius boundary counts as matched (<=)', () => {
    const onBoundary = offsetRecord(20, 0, 100, 50);
    const match = findNearestLariacMatch(centroid, [onBoundary], 20);
    expect(match).not.toBeNull();
  });
});
