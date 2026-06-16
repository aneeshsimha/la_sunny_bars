/**
 * Time formatters that always render in Los Angeles time, regardless of the
 * viewer's timezone. This app is about LA sun, so "8:06 PM" must mean 8:06 PM
 * in LA whether the viewer is in LA, New York, or London. Sun scoring itself
 * uses absolute Date instants, so only display needs the fixed timezone.
 */
const LA_TZ = "America/Los_Angeles";

/** e.g. "2:10 PM" in LA time. */
export function formatLATime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LA_TZ,
  });
}

/** Compact label, e.g. "6a" / "8p" in LA time (used for slider endpoints). */
export function formatLATimeShort(date: Date): string {
  const label = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: LA_TZ,
  });
  const m = label.match(/(\d+)\s*(AM|PM)/i);
  if (!m) return label;
  return m[1] + (m[2].toUpperCase() === "AM" ? "a" : "p");
}
