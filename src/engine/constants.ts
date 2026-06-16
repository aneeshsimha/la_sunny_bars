// Centralized scoring constants for the sun-scoring engine.

// --- Partial shade sampling ---
export const PATIO_RADIUS_METERS = 10;
export const SAMPLE_COUNT = 9; // 3x3 grid

// --- Spatial proximity ---
export const PROXIMITY_RADIUS_METERS = 250;

// --- Occluder opacity ---
export const TREE_OPACITY = 0.5;
export const AWNING_OPACITY = 0.7;
export const DEFAULT_BUILDING_HEIGHT = 4; // meters, used when OSM height tag is absent

// --- Forecast window ---
export const FORECAST_MINUTES = 60;
export const FORECAST_STEP_MINUTES = 15;

// --- Score composition weights (must sum to 1.0) ---
export const METRIC_WEIGHTS = {
  directSun: 0.6,
  futureSun: 0.25,
  skyExposure: 0.15,
} as const;
