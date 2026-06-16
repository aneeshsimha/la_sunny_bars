import SunCalc from "suncalc";
import { getDefaultScoringClient } from "@/worker/client";
import { useVenueStore } from "@/state/venueStore";

const LA_LAT = 34.0195;
const LA_LNG = -118.4912;
const FUTURE_MINUTES = 90;

/**
 * Score every venue at `currentTime` and 90 minutes ahead, then merge the
 * results into the venue store. Scores sequentially (now, then future) because
 * the worker client coalesces concurrent score requests.
 */
export async function scoreAndApply(currentTime: Date): Promise<void> {
  const client = getDefaultScoringClient();

  const now = SunCalc.getPosition(currentTime, LA_LAT, LA_LNG);
  const futureTime = new Date(currentTime.getTime() + FUTURE_MINUTES * 60_000);
  const future = SunCalc.getPosition(futureTime, LA_LAT, LA_LNG);

  try {
    const directScores = await client.score({
      azimuth: now.azimuth,
      altitude: now.altitude,
    });
    const futureScores = await client.score({
      azimuth: future.azimuth,
      altitude: future.altitude,
    });
    useVenueStore.getState().applyScores(directScores, futureScores);
  } catch {
    // Worker not ready or a request was superseded — leave scores as-is.
  }
}
