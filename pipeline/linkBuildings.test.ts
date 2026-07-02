import { describe, it, expect } from 'vitest';
import { linkVenueToBuilding, isPointInPolygon, type Occluder } from './linkBuildings';

// Axis-aligned ~20m square footprint centered at (-118.4, 34.05).
// dLng/2 and dLat/2 are chosen so each side is ~20m at this latitude
// (metersPerDegLat = 111_320, cosLat = cos(34.05deg) ~= 0.8290).
const centerLng = -118.4;
const centerLat = 34.05;
const halfDLat = 0.00008984; // ~10m
const halfDLng = 0.00010835; // ~10m

const box: Occluder = {
  polygon: [
    [centerLng - halfDLng, centerLat - halfDLat], // SW
    [centerLng + halfDLng, centerLat - halfDLat], // SE
    [centerLng + halfDLng, centerLat + halfDLat], // NE
    [centerLng - halfDLng, centerLat + halfDLat], // NW
  ],
  height: 12,
};

describe('isPointInPolygon (reimplementation)', () => {
  it('returns true for a point inside the polygon', () => {
    expect(isPointInPolygon([centerLng, centerLat], box.polygon)).toBe(true);
  });

  it('returns false for a point far outside the polygon', () => {
    expect(isPointInPolygon([centerLng + 1, centerLat + 1], box.polygon)).toBe(false);
  });

  it('returns false for a degenerate polygon with fewer than 3 vertices', () => {
    expect(isPointInPolygon([centerLng, centerLat], [[centerLng, centerLat]])).toBe(false);
  });
});

describe('linkVenueToBuilding', () => {
  it('links a venue inside a known footprint with correct id/height/centroid', () => {
    const result = linkVenueToBuilding([centerLng, centerLat], [box]);
    expect(result.buildingId).toBe(0);
    expect(result.buildingHeight).toBe(12);
    expect(result.buildingCentroid).not.toBeNull();
    expect(result.buildingCentroid![0]).toBeCloseTo(centerLng, 6);
    expect(result.buildingCentroid![1]).toBeCloseTo(centerLat, 6);
  });

  it('links a venue just outside the footprint (within ~25m) to the nearest edge, with south-facing azimuth', () => {
    // 15m south of the box's south edge, directly below its midpoint.
    const southEdgeLat = centerLat - halfDLat;
    const point: [number, number] = [centerLng, southEdgeLat - 15 / 111_320];

    const result = linkVenueToBuilding(point, [box]);
    expect(result.buildingId).toBe(0);
    expect(result.buildingHeight).toBe(12);
    expect(result.buildingCentroid).not.toBeNull();
    expect(result.facadeAzimuths.length).toBeGreaterThan(0);
    // Nearest edge is the south (bottom) edge; its outward normal should point south (180deg).
    expect(result.facadeAzimuths[0]).toBeCloseTo(180, 0);
  });

  it('returns buildingId null when the nearest footprint edge is more than ~25m away', () => {
    const southEdgeLat = centerLat - halfDLat;
    const point: [number, number] = [centerLng, southEdgeLat - 40 / 111_320];

    const result = linkVenueToBuilding(point, [box]);
    expect(result.buildingId).toBeNull();
    expect(result.buildingHeight).toBeNull();
    expect(result.buildingCentroid).toBeNull();
    expect(result.facadeAzimuths).toEqual([]);
  });

  it('degrades gracefully with no crash when there are no occluders', () => {
    expect(() => linkVenueToBuilding([centerLng, centerLat], [])).not.toThrow();
    const result = linkVenueToBuilding([centerLng, centerLat], []);
    expect(result).toEqual({
      buildingId: null,
      buildingHeight: null,
      buildingCentroid: null,
      facadeAzimuths: [],
    });
  });
});
