import { describe, it, expect } from 'vitest';
import {
  buildSpatialIndex,
  getCandidateOccluders,
  getCandidatesInBbox,
  precomputeCandidates,
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
