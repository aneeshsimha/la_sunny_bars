import { getPalette } from "@/lib/timeOfDay";

/**
 * Returns a CSS linear-gradient string for the time slider track.
 * Colors reflect the time-of-day palette from sunrise to sunset,
 * with night bookends beyond the slider range.
 */
export function goldenHourGradient(
  sunrise: Date,
  sunset: Date,
  sliderMin: Date,
  sliderMax: Date
): string {
  const rangeMs = sliderMax.getTime() - sliderMin.getTime();
  if (rangeMs <= 0) {
    return `linear-gradient(to right, ${getPalette("day").lightColor}, ${getPalette("day").lightColor})`;
  }

  const toPercent = (date: Date): number =>
    ((date.getTime() - sliderMin.getTime()) / rangeMs) * 100;

  const nightColor = getPalette("night").lightColor;
  const sunriseColor = getPalette("sunrise").lightColor;
  const dayColor = getPalette("day").lightColor;
  const sunsetColor = getPalette("sunset").lightColor;

  // Key moments
  const oneHourMs = 60 * 60 * 1000;
  const beforeSunrise = new Date(sunrise.getTime() - oneHourMs);
  const dayStart = new Date(sunrise.getTime() + oneHourMs);
  const dayEnd = new Date(sunset.getTime() - oneHourMs);
  const afterSunset = new Date(sunset.getTime() + oneHourMs);

  const stops: Array<[string, number]> = [
    [nightColor, toPercent(beforeSunrise)],
    [sunriseColor, toPercent(sunrise)],
    [dayColor, toPercent(dayStart)],
    [dayColor, toPercent(dayEnd)],
    [sunsetColor, toPercent(sunset)],
    [nightColor, toPercent(afterSunset)],
  ];

  const stopStrings = stops
    .map(([color, pct]) => `${color} ${pct.toFixed(1)}%`)
    .join(", ");

  return `linear-gradient(to right, ${stopStrings})`;
}
