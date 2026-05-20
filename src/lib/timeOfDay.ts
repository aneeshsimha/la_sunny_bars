import SunCalc from "suncalc";

export type Phase = "day" | "sunrise" | "sunset" | "twilight" | "night";

export interface Palette {
  phase: Phase;
  label: string;
  buildingColor: string;
  shadowColor: string;
  lightColor: string;
  lightIntensity: number;
  tintColor: string;
  tintOpacity: number;
}

const PALETTES: Record<Phase, Palette> = {
  day: {
    phase: "day",
    label: "Daytime",
    buildingColor: "#D4B896",
    shadowColor: "#1A0F5C",
    lightColor: "rgb(255, 226, 100)",
    lightIntensity: 0.55,
    tintColor: "rgba(0, 0, 0, 0)",
    tintOpacity: 0,
  },
  sunrise: {
    phase: "sunrise",
    label: "Sunrise",
    buildingColor: "#F2C290",
    shadowColor: "#3A1F6B",
    lightColor: "rgb(255, 170, 80)",
    lightIntensity: 0.5,
    tintColor: "rgba(255, 140, 60, 1)",
    tintOpacity: 0.1,
  },
  sunset: {
    phase: "sunset",
    label: "Golden hour",
    buildingColor: "#E89762",
    shadowColor: "#3A1A52",
    lightColor: "rgb(255, 130, 60)",
    lightIntensity: 0.5,
    tintColor: "rgba(230, 90, 40, 1)",
    tintOpacity: 0.16,
  },
  twilight: {
    phase: "twilight",
    label: "Twilight",
    buildingColor: "#6F6680",
    shadowColor: "#1A1240",
    lightColor: "#2A2F5A",
    lightIntensity: 0.18,
    tintColor: "rgba(50, 40, 90, 1)",
    tintOpacity: 0.28,
  },
  night: {
    phase: "night",
    label: "Night",
    buildingColor: "#2C2C42",
    shadowColor: "#0A0A1A",
    lightColor: "#14152A",
    lightIntensity: 0.1,
    tintColor: "rgba(8, 10, 28, 1)",
    tintOpacity: 0.5,
  },
};

export function getPhase(date: Date, lat: number, lng: number): Phase {
  const now = SunCalc.getPosition(date, lat, lng);
  const altitudeDeg = (now.altitude * 180) / Math.PI;

  if (altitudeDeg < -6) return "night";
  if (altitudeDeg <= 0) return "twilight";
  if (altitudeDeg > 10) return "day";

  // Low above horizon: split into sunrise vs sunset by altitude trend.
  const later = SunCalc.getPosition(
    new Date(date.getTime() + 5 * 60_000),
    lat,
    lng
  );
  return later.altitude > now.altitude ? "sunrise" : "sunset";
}

export function getPalette(phase: Phase): Palette {
  return PALETTES[phase];
}

export function getTimeOfDayPalette(
  date: Date,
  lat: number,
  lng: number
): Palette {
  return PALETTES[getPhase(date, lat, lng)];
}
