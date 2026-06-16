/**
 * Score correctness validation script (ANS-103 A10).
 *
 * Reads silver-lake venues and buildings, scores 10 sample venues at
 * 9am, 1pm, 5pm on June 21 (summer solstice), and writes a validation report.
 *
 * Also verifies the zoom-invariance property: without buildings the baseline
 * score is always 1.0; with buildings the score may be lower.
 *
 * Usage: npx tsx scripts/validate-scores.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import SunCalc from "suncalc";
import {
  scoreSunlight,
  filterOccludersByProximity,
  type Occluder,
  type SunPosition,
} from "../src/engine/shadows.js";
import { buildSpatialIndex, getCandidateOccluders } from "../src/engine/spatial.js";

// ---- Data shapes matching pipeline output ----

interface Venue {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  amenity: string;
}

interface VenuesFile {
  venues: Venue[];
}

interface BuildingsFile {
  occluders: Occluder[];
}

// ---- Config ----

const VENUES_PATH = resolve("public/data/silver-lake/venues.json");
const BUILDINGS_PATH = resolve("public/data/silver-lake/buildings.json");
const REPORT_PATH = resolve("scripts/validation-report.json");

// Silver Lake coords (center) for sun calculation — we'll use venue coords per venue
const SAMPLE_COUNT = 10;

// June 21 summer solstice
const SOLSTICE_DATE = new Date(2026, 5, 21); // month is 0-indexed

const TIMES: Array<{ label: string; hour: number; minute: number }> = [
  { label: "9:00am", hour: 9, minute: 0 },
  { label: "1:00pm", hour: 13, minute: 0 },
  { label: "5:00pm", hour: 17, minute: 0 },
];

// ---- Helpers ----

function makeDateAtHour(hour: number, minute: number): Date {
  const d = new Date(SOLSTICE_DATE);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function getSunPosition(lat: number, lng: number, date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
  };
}

// ---- Main ----

async function main() {
  console.log("Loading venue data...");
  const venuesRaw: VenuesFile = JSON.parse(readFileSync(VENUES_PATH, "utf-8"));

  console.log("Loading building data...");
  const buildingsRaw: BuildingsFile = JSON.parse(
    readFileSync(BUILDINGS_PATH, "utf-8")
  );

  const allVenues = venuesRaw.venues.filter(
    (v) => v.coords && v.coords.length === 2
  );
  const allOccluders = buildingsRaw.occluders;

  console.log(`Venues loaded: ${allVenues.length}`);
  console.log(`Occluders loaded: ${allOccluders.length}`);

  // Take first 10 venues with valid coords
  const sampleVenues = allVenues.slice(0, SAMPLE_COUNT);

  console.log(
    `\nSelected ${sampleVenues.length} sample venues for validation.\n`
  );

  // Build spatial index once
  const spatialIndex = buildSpatialIndex(allOccluders);

  // ---- Score each venue at each time ----

  interface ScoreEntry {
    venueId: string;
    name: string;
    coords: [number, number];
    time: string;
    sunAzimuthDeg: number;
    sunAltitudeDeg: number;
    score: number;
    scoreBaseline: number; // with no occluders — must equal 1.0 when sun is up
    inSun: boolean;
    candidateOccluderCount: number;
  }

  const scoreEntries: ScoreEntry[] = [];

  // ---- Zoom-invariance check results ----
  interface ZoomCheck {
    venueId: string;
    name: string;
    time: string;
    baselineIs1: boolean; // true if scoreSunlight with no occluders = 1.0
    scoreWithBuildings: number;
    zoominvariant: boolean; // scoreWithBuildings <= baselineIs1=1.0
  }
  const zoomChecks: ZoomCheck[] = [];

  let baselineViolations = 0;
  let zoomViolations = 0;

  for (const venue of sampleVenues) {
    const [lng, lat] = venue.coords;

    // Get candidate occluders once per venue (zoom-independent)
    const candidates = getCandidateOccluders(spatialIndex, venue.coords, 250);
    const nearbyOccluders = filterOccludersByProximity(
      venue.coords,
      candidates,
      200
    );

    for (const timeConfig of TIMES) {
      const date = makeDateAtHour(timeConfig.hour, timeConfig.minute);
      const sun = getSunPosition(lat, lng, date);

      // Score with buildings
      const score = scoreSunlight(venue.coords, nearbyOccluders, sun);

      // Baseline: score with zero occluders — must be 1.0 when sun is above horizon
      const scoreBaseline = scoreSunlight(venue.coords, [], sun);
      const baselineIs1 = sun.altitude > 0 ? scoreBaseline === 1.0 : scoreBaseline === 0.0;

      if (!baselineIs1) {
        baselineViolations++;
        console.warn(
          `BASELINE VIOLATION: ${venue.name} at ${timeConfig.label} — baseline=${scoreBaseline}, altitude=${sun.altitude}`
        );
      }

      // Zoom-invariance: score must not exceed baseline (1.0 when sun up)
      const zoominvariant = score <= scoreBaseline + 1e-9;
      if (!zoominvariant) {
        zoomViolations++;
        console.warn(
          `ZOOM VIOLATION: ${venue.name} at ${timeConfig.label} — score=${score} > baseline=${scoreBaseline}`
        );
      }

      const entry: ScoreEntry = {
        venueId: venue.id,
        name: venue.name,
        coords: venue.coords,
        time: timeConfig.label,
        sunAzimuthDeg: parseFloat(((sun.azimuth * 180) / Math.PI).toFixed(2)),
        sunAltitudeDeg: parseFloat(((sun.altitude * 180) / Math.PI).toFixed(2)),
        score: parseFloat(score.toFixed(4)),
        scoreBaseline: parseFloat(scoreBaseline.toFixed(4)),
        inSun: score > 0.5,
        candidateOccluderCount: nearbyOccluders.length,
      };

      scoreEntries.push(entry);

      zoomChecks.push({
        venueId: venue.id,
        name: venue.name,
        time: timeConfig.label,
        baselineIs1,
        scoreWithBuildings: parseFloat(score.toFixed(4)),
        zoominvariant,
      });
    }
  }

  // ---- Print human-readable summary ----

  console.log("\n=== Score Results (June 21 Solstice) ===\n");
  for (const entry of scoreEntries) {
    const sunLabel =
      entry.sunAltitudeDeg <= 0
        ? "(sun below horizon)"
        : entry.inSun
        ? "IN SUN"
        : "in shadow";
    console.log(
      `${entry.name.padEnd(35)} | ${entry.time.padEnd(8)} | ` +
        `alt=${entry.sunAltitudeDeg.toFixed(1)}° | ` +
        `score=${entry.score.toFixed(3)} | ${sunLabel} | ` +
        `occluders=${entry.candidateOccluderCount}`
    );
  }

  // ---- Print zoom-invariance check ----

  const allBaselineOk = zoomChecks.every((c) => c.baselineIs1);
  const allZoomOk = zoomChecks.every((c) => c.zoominvariant);

  console.log("\n=== Zoom-Invariance / Baseline Checks ===\n");
  console.log(
    `Baseline (no buildings = 1.0 when sun up): ${
      allBaselineOk ? "PASS" : `FAIL (${baselineViolations} violations)`
    }`
  );
  console.log(
    `Zoom-invariant (score ≤ 1.0): ${
      allZoomOk ? "PASS" : `FAIL (${zoomViolations} violations)`
    }`
  );

  // ---- Write report ----

  const report = {
    generatedAt: new Date().toISOString(),
    date: "2026-06-21 (summer solstice)",
    neighborhood: "silver-lake",
    venueCount: sampleVenues.length,
    totalOccluders: allOccluders.length,
    checks: {
      baselineNoOccluders1_0: allBaselineOk,
      baselineViolations,
      zoomInvariant: allZoomOk,
      zoomViolations,
    },
    scores: scoreEntries,
    zoomChecks,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nValidation report written to: ${REPORT_PATH}`);

  if (!allBaselineOk || !allZoomOk) {
    console.error("\nVALIDATION FAILED — see violations above.");
    process.exit(1);
  } else {
    console.log("\nAll checks PASSED.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
