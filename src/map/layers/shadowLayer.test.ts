import { describe, it, expect } from 'vitest';
import { selectShadowCasters, capForZoom } from './shadowLayer';
import type { Occluder } from '@/engine/shadows';

function mkOccluder(height: number, lng: number, lat: number): Occluder {
  const d = 0.0001;
  return {
    height,
    polygon: [
      [lng, lat],
      [lng + d, lat],
      [lng + d, lat + d],
      [lng, lat + d],
    ],
  };
}

describe('capForZoom', () => {
  it('returns a larger cap at higher zoom than at lower zoom', () => {
    expect(capForZoom(18)).toBeGreaterThan(capForZoom(11));
  });

  it('is monotonically non-decreasing as zoom increases', () => {
    const zooms = [0, 5, 10, 12, 13, 14, 15, 16, 17, 18, 20];
    const caps = zooms.map(capForZoom);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThanOrEqual(caps[i - 1]);
    }
  });
});

describe('selectShadowCasters', () => {
  it('returns all candidates unchanged when under the cap', () => {
    const candidates = [
      mkOccluder(10, -118.3, 34.05),
      mkOccluder(20, -118.301, 34.051),
      mkOccluder(5, -118.302, 34.052),
    ];
    const kept = selectShadowCasters(candidates, 16, 10);
    expect(kept).toHaveLength(3);
    expect(kept).toEqual(expect.arrayContaining(candidates));
  });

  it('keeps the tallest casters when over the cap', () => {
    const candidates = [
      mkOccluder(10, -118.3, 34.05),
      mkOccluder(50, -118.301, 34.051),
      mkOccluder(5, -118.302, 34.052),
      mkOccluder(30, -118.303, 34.053),
    ];
    const kept = selectShadowCasters(candidates, 16, 2);
    expect(kept).toHaveLength(2);
    const heights = kept.map((o) => o.height).sort((a, b) => b - a);
    expect(heights).toEqual([50, 30]);
  });

  it('cap scales with zoom: fewer kept at low zoom, more at high zoom', () => {
    // Exceed even the highest zoom band's cap so both selections actually hit
    // their (different) caps instead of passing through unchanged.
    const count = capForZoom(18) + 1000;
    const candidates = Array.from({ length: count }, (_, i) =>
      mkOccluder(10 + i, -118.3 + i * 0.0001, 34.05 + i * 0.0001)
    );
    const lowZoomKept = selectShadowCasters(candidates, 11);
    const highZoomKept = selectShadowCasters(candidates, 18);
    expect(lowZoomKept).toHaveLength(capForZoom(11));
    expect(highZoomKept).toHaveLength(capForZoom(18));
    expect(lowZoomKept.length).toBeLessThan(highZoomKept.length);
  });

  it('membership is stable under a simulated pan (order/shuffle-independent)', () => {
    // Same set of in-view candidates, but arriving in a different order — as
    // would happen when a Flatbush bbox query is re-run after a small pan at
    // the same zoom. The kept set must not depend on array order/position,
    // only on the occluders' own heights.
    const candidates = Array.from({ length: 20 }, (_, i) =>
      mkOccluder(10 + i, -118.3 + i * 0.0001, 34.05 + i * 0.0001)
    );
    const shuffled = [...candidates].reverse();

    const keptA = selectShadowCasters(candidates, 12, 5);
    const keptB = selectShadowCasters(shuffled, 12, 5);

    const heightsA = new Set(keptA.map((o) => o.height));
    const heightsB = new Set(keptB.map((o) => o.height));
    expect(heightsA).toEqual(heightsB);
  });

  it('breaks height ties deterministically regardless of input order', () => {
    const a = mkOccluder(20, -118.301, 34.051);
    const b = mkOccluder(20, -118.302, 34.052);
    const c = mkOccluder(20, -118.303, 34.053);

    const kept1 = selectShadowCasters([a, b, c], 16, 2);
    const kept2 = selectShadowCasters([c, b, a], 16, 2);

    expect(kept1).toEqual(kept2);
  });
});
