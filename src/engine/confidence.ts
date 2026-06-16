export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Derive a confidence level for a venue's sun score.
 *
 * - 'high': rooftop seating (open sky, minimal occlusion risk) or manually verified
 * - 'low': seatingType is null (unknown patio location) or indoor (score not meaningful)
 * - 'medium': everything else (patio, sidewalk, etc.)
 */
export function getConfidence(venue: {
  seatingType: string | null;
  hasManualVerification?: boolean;
}): ConfidenceLevel {
  if (venue.hasManualVerification) return 'high';
  if (venue.seatingType === 'rooftop') return 'high';
  if (venue.seatingType === null || venue.seatingType === 'indoor') return 'low';
  return 'medium';
}
