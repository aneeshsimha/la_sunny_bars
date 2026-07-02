import { describe, it, expect } from 'vitest';
import { getConfidence } from './confidence';

describe('getConfidence', () => {
  it('is high when manually verified, regardless of everything else', () => {
    expect(
      getConfidence({ seatingType: 'patio', hasManualVerification: true, orientationKnown: false })
    ).toBe('high');
  });

  it('is high for rooftop seating (orientation-agnostic)', () => {
    expect(getConfidence({ seatingType: 'rooftop' })).toBe('high');
    expect(getConfidence({ seatingType: 'rooftop', orientationKnown: false })).toBe('high');
  });

  it('is low when seatingType is unknown (null)', () => {
    expect(getConfidence({ seatingType: null })).toBe('low');
    expect(getConfidence({ seatingType: null, orientationKnown: true })).toBe('low');
  });

  it('is low for indoor seating regardless of orientation', () => {
    expect(getConfidence({ seatingType: 'indoor', orientationKnown: true })).toBe('low');
  });

  it('is medium for patio/sidewalk seating when orientation is unknown', () => {
    expect(getConfidence({ seatingType: 'patio' })).toBe('medium');
    expect(getConfidence({ seatingType: 'patio', orientationKnown: false })).toBe('medium');
    expect(getConfidence({ seatingType: 'sidewalk', orientationKnown: false })).toBe('medium');
  });

  it('is high for patio/sidewalk seating when orientation is known', () => {
    expect(getConfidence({ seatingType: 'patio', orientationKnown: true })).toBe('high');
    expect(getConfidence({ seatingType: 'sidewalk', orientationKnown: true })).toBe('high');
  });
});
