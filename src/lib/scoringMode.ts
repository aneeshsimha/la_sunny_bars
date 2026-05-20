export type ScoringMode = 'sun' | 'shade';

/**
 * Returns a sort key for a venue's sun score given the current scoring mode.
 * Using a single descending sort (b - a) on this key works for both modes:
 * - sun mode: highest sunScore sorts first
 * - shade mode: lowest sunScore sorts first (key is negated)
 */
export function modeSortKey(sunScore: number, mode: ScoringMode): number {
  return mode === 'shade' ? -sunScore : sunScore;
}

/** Human-readable label for the mode, used in the UI toggle. */
export function modeLabel(mode: ScoringMode): string {
  return mode === 'shade' ? 'Shade' : 'Sun';
}
