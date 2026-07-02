import { describe, it, expect } from 'vitest';
import { classifyHeight, classifyExistingHeight, DEFAULT_BUILDING_HEIGHT_METERS } from './heightClassification';

describe('classifyHeight', () => {
  it('classifies as "measured" when an OSM height tag is present and parseable', () => {
    const result = classifyHeight({ height: '12.5' });
    expect(result.height).toBe(12.5);
    expect(result.heightSource).toBe('measured');
  });

  it('classifies as "levels" when building:levels is present (and no height tag)', () => {
    const result = classifyHeight({ 'building:levels': '3' });
    expect(result.height).toBe(12); // 3 levels * 4m
    expect(result.heightSource).toBe('levels');
  });

  it('classifies as "default" when neither height nor building:levels is present', () => {
    const result = classifyHeight({ building: 'yes' });
    expect(result.height).toBe(DEFAULT_BUILDING_HEIGHT_METERS);
    expect(result.heightSource).toBe('default');
  });

  it('falls back to "default" when the height tag is present but unparseable', () => {
    const result = classifyHeight({ height: 'not-a-number' });
    expect(result.height).toBe(DEFAULT_BUILDING_HEIGHT_METERS);
    expect(result.heightSource).toBe('default');
  });

  it('falls back to "default" when building:levels is present but unparseable', () => {
    const result = classifyHeight({ 'building:levels': 'ground' });
    expect(result.height).toBe(DEFAULT_BUILDING_HEIGHT_METERS);
    expect(result.heightSource).toBe('default');
  });
});

describe('classifyExistingHeight (proxy heuristic, no raw tags available)', () => {
  it('classifies the bare default height as "default"', () => {
    expect(classifyExistingHeight(DEFAULT_BUILDING_HEIGHT_METERS)).toBe('default');
  });

  it('classifies an integer multiple of the level height as "levels"', () => {
    expect(classifyExistingHeight(12)).toBe('levels');
    expect(classifyExistingHeight(20)).toBe('levels');
  });

  it('classifies a fractional height as "measured"', () => {
    expect(classifyExistingHeight(12.5)).toBe('measured');
  });

  it('classifies an integer that is not a multiple of the level height as "measured"', () => {
    expect(classifyExistingHeight(13)).toBe('measured');
  });
});
