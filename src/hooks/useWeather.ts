import { useState, useEffect } from "react";
import {
  type HourlyWeather,
  fetchWeather,
  findWeatherAt,
} from "@/lib/weather";

// Module-scope cache keyed by "lat,lng" (rounded to 2 decimals)
const forecastCache = new Map<string, HourlyWeather[]>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysFromNow(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return (d.getTime() - now.getTime()) / MS_PER_DAY;
}

export function useWeather(
  lat: number,
  lng: number,
  date: Date
): { weather: HourlyWeather | null; loading: boolean; forecastAvailable: boolean } {
  const [forecast, setForecast] = useState<HourlyWeather[] | null>(null);
  const [loading, setLoading] = useState(true);

  const days = daysFromNow(date);
  const tooFar = days > 14;

  useEffect(() => {
    if (tooFar) {
      setForecast(null);
      setLoading(false);
      return;
    }

    const key = cacheKey(lat, lng);
    const cached = forecastCache.get(key);
    if (cached) {
      setForecast(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchWeather(lat, lng)
      .then((data) => {
        if (cancelled) return;
        forecastCache.set(key, data);
        setForecast(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setForecast(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, tooFar]);

  const weather =
    forecast !== null ? findWeatherAt(forecast, date) : null;

  // forecastAvailable: data was fetched and covers a date within the 7-day window
  const forecastAvailable = !tooFar && days <= 7 && forecast !== null;

  return { weather, loading, forecastAvailable };
}
