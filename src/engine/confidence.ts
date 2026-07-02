export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Derive a confidence level for a venue's sun score.
 *
 * - 'high': rooftop seating (open sky, minimal occlusion risk) or manually verified.
 * - 'low': seatingType is null (unknown patio location) or indoor (score not meaningful);
 *   OR ground-level outdoor seating (patio/sidewalk) whose patio orientation is unknown
 *   (ANS-217 D5) — the sample grid falls back to a symmetric guess around a
 *   door/centroid point, so the score is not trustworthy on that basis.
 * - 'medium': ground-level outdoor seating (patio/sidewalk) whose orientation is known
 *   (`facadeAzimuths` present) — the grid is biased toward the actual patio side. Not
 *   promoted to 'high' because `facadeAzimuths` is itself a heuristic guess, not on
 *   equal footing with rooftop's structurally-justified 'high'.
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
    !venue.orientationKnown
  ) {
    return 'low';
  }
  return 'medium';
}
