export interface HourlyWeather {
  time: Date;
  cloudCoverPct: number;
  uvIndex: number;
}

export async function fetchWeather(
  lat: number,
  lng: number
): Promise<HourlyWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=cloudcover,uv_index` +
    `&timezone=auto` +
    `&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    hourly: {
      time: string[];
      cloudcover: number[];
      uv_index: number[];
    };
  };

  const { time, cloudcover, uv_index } = data.hourly;
  return time.map((t, i) => ({
    time: new Date(t),
    cloudCoverPct: cloudcover[i] ?? 0,
    uvIndex: uv_index[i] ?? 0,
  }));
}

export function findWeatherAt(
  forecast: HourlyWeather[],
  at: Date
): HourlyWeather | null {
  if (forecast.length === 0) return null;

  let nearest = forecast[0];
  let minDiff = Math.abs(at.getTime() - nearest.time.getTime());

  for (let i = 1; i < forecast.length; i++) {
    const diff = Math.abs(at.getTime() - forecast[i].time.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      nearest = forecast[i];
    }
  }

  return nearest;
}

export function cloudFactor(cloudCoverPct: number): number {
  return 1 - (cloudCoverPct / 100) * 0.7;
}

export function burnMinutes(uvIndex: number): number {
  if (uvIndex === 0) return Infinity;
  return Math.round(200 / Math.max(uvIndex, 0.5));
}
