// Centralized scoring constants for the sun-scoring engine.

// --- Partial shade sampling ---
export const PATIO_RADIUS_METERS = 10;
export const SAMPLE_COUNT = 9; // 3x3 grid

// Meters to shift the sample-grid center toward the mean facade-normal
// direction when a venue's `facadeAzimuths` are known (ANS-217 D5). Keeps the
// shifted grid still centered near the venue (< PATIO_RADIUS_METERS) while
// decisively favoring the street-facing/open side of the building over the
// building side, so a patio on the sunny side of a building scores
// differently than one on the shaded side of the same building.
export const ORIENTATION_BIAS_METERS = 8;

// --- Spatial proximity ---
export const PROXIMITY_RADIUS_METERS = 250;

// --- Occluder opacity ---
export const TREE_OPACITY = 0.5;
export const AWNING_OPACITY = 0.7;

// --- Forecast window ---
export const FORECAST_MINUTES = 60;
export const FORECAST_STEP_MINUTES = 15;

// --- Score composition weights (must sum to 1.0) ---
export const METRIC_WEIGHTS = {
  directSun: 0.6,
  futureSun: 0.25,
  skyExposure: 0.15,
} as const;
