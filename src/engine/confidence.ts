export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Derive a confidence level for a venue's sun score.
 *
 * - 'high': rooftop seating (open sky, minimal occlusion risk); manually verified;
 *   or ground-level outdoor seating (patio/sidewalk) whose patio orientation is
 *   known (ANS-217 D5) — the sample grid is biased to the actual patio side
 *   rather than sampled symmetrically around a door/centroid point.
 * - 'low': seatingType is null (unknown patio location) or indoor (score not meaningful)
 * - 'medium': ground-level outdoor seating (patio, sidewalk, etc.) whose orientation
 *   is unknown — should not read 'high' on that basis alone.
 */
export function getConfidence(venue: {
  seatingType: string | null;
  hasManualVerification?: boolean;
  /** Whether the venue's patio orientation (`facadeAzimuths`) is known (ANS-217 D5). */
  orientationKnown?: boolean;
}): ConfidenceLevel {
  if (venue.hasManualVerification) return 'high';
  if (venue.seatingType === 'rooftop') return 'high';
  if (venue.seatingType === null || venue.seatingType === 'indoor') return 'low';
  if (
    (venue.seatingType === 'patio' || venue.seatingType === 'sidewalk') &&
    venue.orientationKnown
  ) {
    return 'high';
  }
  return 'medium';
}
