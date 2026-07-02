import { describe, it, expect } from 'vitest';
import {
  buildSpatialIndex,
  getCandidateOccluders,
  getCandidatesInBbox,
  precomputeCandidates,
  nearestGroundElev,
} from './spatial';
import type { Occluder } from './shadows';

const nearBuilding: Occluder = {
  polygon: [[-118.277, 34.084], [-118.276, 34.084], [-118.276, 34.085], [-118.277, 34.085]],
  height: 10,
};

const farBuilding: Occluder = {
  polygon: [[-118.2, 34.084], [-118.199, 34.084], [-118.199, 34.085], [-118.2, 34.085]],
  height: 10,
};

const testPoint: [number, number] = [-118.277, 34.084];

describe('buildSpatialIndex', () => {
  it('builds without error for empty array', () => {
    const idx = buildSpatialIndex([]);
    expect(idx.occluders).toHaveLength(0);
  });

  it('builds for non-empty occluders', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    expect(idx.occluders).toHaveLength(2);
  });
});

describe('getCandidateOccluders', () => {
  it('returns nearby building within 500m', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    const candidates = getCandidateOccluders(idx, testPoint, 500);
    expect(candidates).toContain(nearBuilding);
  });

  it('excludes building 7+ km away with 500m radius', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    const candidates = getCandidateOccluders(idx, testPoint, 500);
    expect(candidates).not.toContain(farBuilding);
  });

  it('returns empty array for empty index', () => {
    const idx = buildSpatialIndex([]);
    const candidates = getCandidateOccluders(idx, testPoint, 500);
    expect(candidates).toHaveLength(0);
  });
});

describe('getCandidatesInBbox', () => {
  it('returns occluders whose bbox overlaps the query bbox', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    const candidates = getCandidatesInBbox(idx, [-118.278, 34.083, -118.275, 34.086]);
    expect(candidates).toContain(nearBuilding);
    expect(candidates).not.toContain(farBuilding);
  });

  it('returns empty array for empty index', () => {
    const idx = buildSpatialIndex([]);
    const candidates = getCandidatesInBbox(idx, [-118.278, 34.083, -118.275, 34.086]);
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when bbox does not overlap any occluder', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    const candidates = getCandidatesInBbox(idx, [0, 0, 0.001, 0.001]);
    expect(candidates).toHaveLength(0);
  });
});

describe('precomputeCandidates', () => {
  it('maps venue IDs to candidate arrays', () => {
    const idx = buildSpatialIndex([nearBuilding, farBuilding]);
    const venues = [{ id: 'v1', coords: testPoint }];
    const map = precomputeCandidates(idx, venues, 500);
    expect(map.has('v1')).toBe(true);
    expect(map.get('v1')).toContain(nearBuilding);
    expect(map.get('v1')).not.toContain(farBuilding);
  });
});

// ---------------------------------------------------------------------------
// nearestGroundElev (ANS-238) — the venue's ground elevation is estimated as
// the baseElev of the nearest candidate (by centroid distance) that has one.
// ---------------------------------------------------------------------------
describe('nearestGroundElev', () => {
  it('returns null for an empty candidate list', () => {
    expect(nearestGroundElev(testPoint, [])).toBeNull();
  });

  it('returns null when no candidate has a baseElev (e.g. Pasadena — withheld neighborhood)', () => {
    const pasadenaLike: Occluder = { ...nearBuilding, baseElev: null };
    expect(nearestGroundElev(testPoint, [pasadenaLike])).toBeNull();
  });

  it('returns the baseElev of the single candidate that has one', () => {
    const withElev: Occluder = { ...nearBuilding, baseElev: 123.4 };
    expect(nearestGroundElev(testPoint, [withElev])).toBe(123.4);
  });

  it('picks the nearest-by-centroid candidate among several with baseElev', () => {
    // Two candidates on either side of testPoint; the closer one's centroid
    // (0.0005° east) wins over the farther one's (0.01° east).
    const near: Occluder = {
      polygon: [[-118.2765, 34.0835], [-118.2755, 34.0835], [-118.2755, 34.0845], [-118.2765, 34.0845]],
      height: 10,
      baseElev: 50,
    };
    const far: Occluder = {
      polygon: [[-118.267, 34.0835], [-118.266, 34.0835], [-118.266, 34.0845], [-118.267, 34.0845]],
      height: 10,
      baseElev: 200,
    };
    expect(nearestGroundElev(testPoint, [far, near])).toBe(50);
  });

  it('skips candidates with a null baseElev in favor of a farther candidate that has one', () => {
    // The nearest candidate has no baseElev (unmatched); the venue's
    // estimated ground elevation falls back to the next-nearest that does.
    const nearestButUnmatched: Occluder = {
      polygon: [[-118.2771, 34.0839], [-118.2769, 34.0839], [-118.2769, 34.0841], [-118.2771, 34.0841]],
      height: 10,
      baseElev: null,
    };
    const fartherMatched: Occluder = {
      polygon: [[-118.267, 34.0835], [-118.266, 34.0835], [-118.266, 34.0845], [-118.267, 34.0845]],
      height: 10,
      baseElev: 77,
    };
    expect(nearestGroundElev(testPoint, [nearestButUnmatched, fartherMatched])).toBe(77);
  });

  it('ignores empty-polygon candidates', () => {
    const empty: Occluder = { polygon: [], height: 10, baseElev: 999 };
    expect(nearestGroundElev(testPoint, [empty])).toBeNull();
  });
});
