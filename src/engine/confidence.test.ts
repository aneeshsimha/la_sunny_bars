import { describe, it, expect } from 'vitest';
import { getConfidence } from './confidence';

describe('getConfidence', () => {
  it('is high when manually verified, regardless of everything else', () => {
    expect(
      getConfidence({ seatingType: 'patio', hasManualVerification: true, orientationKnown: false })
    ).toBe('high');
  });

  it('is high for rooftop seating with a matched building (elevatable, ANS-218 D6)', () => {
    expect(getConfidence({ seatingType: 'rooftop', canElevate: true })).toBe('high');
    expect(
      getConfidence({ seatingType: 'rooftop', canElevate: true, orientationKnown: false })
    ).toBe('high');
  });

  it('is medium for rooftop seating without a matched building (cannot elevate, ANS-218 D6)', () => {
    expect(getConfidence({ seatingType: 'rooftop' })).toBe('medium');
    expect(getConfidence({ seatingType: 'rooftop', canElevate: false })).toBe('medium');
  });

  it('is low when seatingType is unknown (null)', () => {
    expect(getConfidence({ seatingType: null })).toBe('low');
    expect(getConfidence({ seatingType: null, orientationKnown: true })).toBe('low');
  });

  it('is low for indoor seating regardless of orientation', () => {
    expect(getConfidence({ seatingType: 'indoor', orientationKnown: true })).toBe('low');
  });

  it('is low for patio/sidewalk seating when orientation is unknown (centroid guess)', () => {
    expect(getConfidence({ seatingType: 'patio' })).toBe('low');
    expect(getConfidence({ seatingType: 'patio', orientationKnown: false })).toBe('low');
    expect(getConfidence({ seatingType: 'sidewalk', orientationKnown: false })).toBe('low');
  });

  it('is medium (not high) for patio/sidewalk seating when orientation is known', () => {
    // facadeAzimuths is itself a heuristic guess, so a known orientation only
    // lifts confidence to 'medium' — not to rooftop's structurally-justified 'high'.
    expect(getConfidence({ seatingType: 'patio', orientationKnown: true })).toBe('medium');
    expect(getConfidence({ seatingType: 'sidewalk', orientationKnown: true })).toBe('medium');
  });
});
