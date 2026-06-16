import { nearbyScore } from '@/engine/nearbyScore';

export type ScoringMode = 'sun' | 'shade' | 'goldenHour' | 'nearby';

/**
 * Returns a sort key for a venue's sun score given the current scoring mode.
 * Using a single descending sort (b - a) on this key works for all modes:
 * - sun mode: highest sunScore sorts first
 * - shade mode: lowest sunScore sorts first (key is negated)
 * - goldenHour mode: highest futureSun sorts first (best sun during golden hour window)
 * - nearby mode: composite score from nearbyScore()
 */
export function modeSortKey(
  sunScore: number,
  mode: ScoringMode,
  futureSun?: number,
  walkTimeMinutes?: number,
  openNow?: boolean | null,
): number {
  if (mode === 'shade') return -sunScore;
  if (mode === 'goldenHour') return futureSun ?? sunScore;
  if (mode === 'nearby') {
    return nearbyScore({
      sunScore,
      walkTimeMinutes: walkTimeMinutes ?? 20,
      openNow: openNow ?? null,
    });
  }
  return sunScore;
}

/** Human-readable label for the mode, used in the UI toggle. */
export function modeLabel(mode: ScoringMode): string {
  if (mode === 'shade') return 'Shade';
  if (mode === 'goldenHour') return 'Golden Hour';
  if (mode === 'nearby') return 'Near Me';
  return 'Sun';
}
