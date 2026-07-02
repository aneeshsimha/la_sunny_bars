export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Derive a confidence level for a venue's sun score.
 *
 * - 'high': manually verified; OR rooftop seating with a matched building of known
 *   height (`canElevate`) — it's scored at its real roof elevation (ANS-218 D6),
 *   open sky, minimal occlusion risk.
 * - 'low': seatingType is null (unknown patio location) or indoor (score not meaningful);
 *   OR ground-level outdoor seating (patio/sidewalk) whose patio orientation is unknown
 *   (ANS-217 D5) — the sample grid falls back to a symmetric guess around a
 *   door/centroid point, so the score is not trustworthy on that basis.
 * - 'medium': ground-level outdoor seating (patio/sidewalk) whose orientation is known
 *   (`facadeAzimuths` present) — the grid is biased toward the actual patio side. Not
 *   promoted to 'high' because `facadeAzimuths` is itself a heuristic guess, not on
 *   equal footing with rooftop's structurally-justified 'high';
 *   OR rooftop seating that couldn't be matched to a building (`!canElevate`) — it's
 *   still scored at ground level (z=0), which is meaningless for a rooftop, so it
 *   isn't promoted to 'high' the way an elevated rooftop is.
 */
export function getConfidence(venue: {
  seatingType: string | null;
  hasManualVerification?: boolean;
  /** Whether the venue's patio orientation (`facadeAzimuths`) is known (ANS-217 D5). */
  orientationKnown?: boolean;
  /**
   * Whether the venue has a matched building footprint with a known height,
   * so rooftop seating can be scored at real elevation rather than ground
   * level (ANS-218 D6).
   */
  canElevate?: boolean;
}): ConfidenceLevel {
  if (venue.hasManualVerification) return 'high';
  if (venue.seatingType === 'rooftop') return venue.canElevate ? 'high' : 'medium';
  if (venue.seatingType === null || venue.seatingType === 'indoor') return 'low';
  if (
    (venue.seatingType === 'patio' || venue.seatingType === 'sidewalk') &&
    !venue.orientationKnown
  ) {
    return 'low';
  }
  return 'medium';
}
