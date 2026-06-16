export interface NearbyScoreParams {
  sunScore: number;
  walkTimeMinutes: number;
  openNow: boolean | null;
}

/**
 * Composite score combining sun fraction, walk time, and open-now status.
 * Returns a value in [0, 1].
 *
 * Formula:
 *   sunScore * 0.6
 *   + (1 - min(walkTimeMinutes / 20, 1)) * 0.3
 *   + (openNow ? 0.1 : 0)
 */
export function nearbyScore({ sunScore, walkTimeMinutes, openNow }: NearbyScoreParams): number {
  return (
    sunScore * 0.6 +
    (1 - Math.min(walkTimeMinutes / 20, 1)) * 0.3 +
    (openNow ? 0.1 : 0)
  );
}
