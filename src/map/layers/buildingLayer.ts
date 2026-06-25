import mapboxgl from "mapbox-gl";

export function addBuildingLayer(map: mapboxgl.Map): void {
  const layers = map.getStyle()?.layers ?? [];
  let labelLayerId: string | undefined;
  for (const layer of layers) {
    if (
      layer.type === "symbol" &&
      (layer as mapboxgl.SymbolLayer).layout?.["text-field"]
    ) {
      labelLayerId = layer.id;
      break;
    }
  }

  map.addLayer(
    {
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#aaa",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          0,
          12.5,
          [
            "coalesce",
            ["get", "height"],
            ["*", ["coalesce", ["get", "levels"], 1], 3],
          ],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          0,
          12.5,
          ["coalesce", ["get", "min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.85,
      },
    } as mapboxgl.AnyLayer,
    labelLayerId
  );
}

type RGB = [number, number, number];

interface SunPalette {
  lightColor: string;
  ambientColor: string;
  fogColor: string;
  fogHighColor: string;
  buildingTint: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: RGB, b: RGB, t: number): string {
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

// Palette keyed to sun altitude. Three regimes:
//   night (<= 0°): cool, dim, near-zero directional.
//   golden band (0–15°): warm amber light + warm fog.
//   mid/high (40°+): neutral white-ish light, cool neutral fog.
// We interpolate golden -> neutral across 0°..40°.
export function sunPalette(altitudeDeg: number): SunPalette {
  if (altitudeDeg <= 0) {
    return {
      lightColor: "rgb(70, 85, 120)", // unused-ish (directional ~0), kept cool
      ambientColor: "rgb(60, 72, 105)", // dim blue-grey
      fogColor: "rgb(20, 26, 48)",
      fogHighColor: "rgb(12, 18, 40)",
      buildingTint: "rgb(70, 78, 96)", // dim, cool buildings at night
    };
  }

  // 0 at horizon-grazing golden hour, 1 by ~40° (neutral midday).
  const t = Math.min(1, altitudeDeg / 40);

  // Golden-hour endpoints (t=0).
  const goldenLight: RGB = [255, 196, 130]; // warm amber sun
  const goldenAmbient: RGB = [150, 140, 150]; // slightly warm fill
  const goldenFog: RGB = [120, 90, 80]; // warm hazy low fog
  const goldenFogHigh: RGB = [70, 70, 110];

  // Neutral midday endpoints (t=1).
  const neutralLight: RGB = [255, 250, 240]; // near-white, faint warmth
  const neutralAmbient: RGB = [170, 178, 190]; // neutral cool fill
  const neutralFog: RGB = [186, 210, 235]; // matches createMap default
  const neutralFogHigh: RGB = [36, 92, 223];

  // Buildings lift from warm-grey (low sun) to cool-grey (high sun).
  const goldenTint: RGB = [185, 170, 150];
  const neutralTint: RGB = [180, 184, 190];

  return {
    lightColor: mix(goldenLight, neutralLight, t),
    ambientColor: mix(goldenAmbient, neutralAmbient, t),
    fogColor: mix(goldenFog, neutralFog, t),
    fogHighColor: mix(goldenFogHigh, neutralFogHigh, t),
    buildingTint: mix(goldenTint, neutralTint, t),
  };
}

export function updateSunLight(
  map: mapboxgl.Map,
  azimuthRad: number,
  altitudeRad: number
): void {
  if (!map.isStyleLoaded()) return;

  const azimuthDeg = (azimuthRad * 180) / Math.PI + 180;
  const altitudeDeg = Math.max(0, (altitudeRad * 180) / Math.PI);
  // polar 0 = sun overhead, 90 = sun at horizon.
  const polarDeg = Math.max(0, 90 - altitudeDeg);

  const palette = sunPalette(altitudeDeg);
  const isNight = altitudeDeg <= 0;

  // Ambient + directional 3D lighting (replaces the flat legacy setLight).
  // direction is [azimuth°, polar°] (inferred convention — verified in-browser).
  map.setLights([
    {
      id: "ambient",
      type: "ambient",
      properties: {
        color: palette.ambientColor,
        intensity: isNight ? 0.3 : 0.45,
      },
    },
    {
      id: "sun",
      type: "directional",
      properties: {
        direction: [azimuthDeg, polarDeg],
        color: palette.lightColor,
        intensity: isNight ? 0.05 : 0.8,
      },
    },
  ]);

  map.setPaintProperty("3d-buildings", "fill-extrusion-color", palette.buildingTint);

  map.setFog({
    color: palette.fogColor,
    "high-color": palette.fogHighColor,
    "star-intensity": 0.6,
    "space-color": "rgb(11, 11, 25)",
    "horizon-blend": 0.02,
  });

  // Move the sky's sun with the real sun so the atmosphere brightens toward it.
  // sky-atmosphere-sun is [azimuth°, polar°] where polar 0 = zenith, 90 = horizon.
  if (map.getLayer("sky")) {
    const skyPolarDeg = Math.min(180, Math.max(0, 90 - altitudeDeg));
    map.setPaintProperty("sky", "sky-atmosphere-sun", [azimuthDeg, skyPolarDeg]);
  }
}
