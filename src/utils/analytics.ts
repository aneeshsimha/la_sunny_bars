const isDev = process.env.NODE_ENV === "development";

export type AnalyticsEventName =
  | "neighborhood_selected"
  | "venue_clicked"
  | "time_scrubbed"
  | "near_me_tapped"
  | "pwa_installed";

export function trackEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (isDev) return;
  if (typeof window === "undefined") return;
  const va = (window as unknown as Record<string, unknown>).va;
  if (typeof va === "function") {
    (va as (event: string, data?: Record<string, unknown>) => void)(
      "event",
      { name, ...properties },
    );
  }
}
