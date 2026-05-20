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

export function useWeather(
  lat: number,
  lng: number,
  date: Date
): { weather: HourlyWeather | null; loading: boolean } {
  const [forecast, setForecast] = useState<HourlyWeather[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [lat, lng]);

  const weather =
    forecast !== null ? findWeatherAt(forecast, date) : null;

  return { weather, loading };
}
