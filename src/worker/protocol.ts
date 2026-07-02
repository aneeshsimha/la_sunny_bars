import type { Occluder, SunPosition } from '../engine/shadows';
import type { HorizonProfile } from '../engine/terrain';
import type { MapBounds, ShadowFeatureCollection } from '../engine/shadowProjection';

export type InitMsg = {
  type: 'init';
  occluders: Occluder[];
  venues: Array<{
    id: string;
    coords: [number, number];
    facadeAzimuths?: number[];
    /** Seating type; used to derive receiver elevation for rooftops (ANS-218 D6). */
    seatingType?: string | null;
    /** Matched building roof height in meters, if any (ANS-218 D6). */
    buildingHeight?: number | null;
  }>;
  horizonProfile?: HorizonProfile;
  /**
   * Building-only occluders for the visible ground-shadow layer (ANS-237).
   * Distinct from `occluders` (which also includes tree/awning occluders used
   * for venue scoring) so the `shadow` message reproduces exactly what the
   * main-thread shadow layer would show — trees are not rendered as ground
   * shadows. Falls back to `occluders` if omitted.
   */
  buildingOccluders?: Occluder[];
};

export type ScoreMsg = {
  type: 'score';
  requestId: number;
  sun: SunPosition;
};

export type PlanMsg = {
  type: 'plan';
  requestId: number;
  venueId: string;
  sun: SunPosition;
  /** Timestamp (ms since epoch) corresponding to the sun position */
  timestampMs: number;
  /** Latitude of the venue (for advancing sun position via SunCalc) */
  lat: number;
  /** Longitude of the venue (for advancing sun position via SunCalc) */
  lng: number;
  /** Step size in minutes */
  stepMinutes: number;
  /** Maximum minutes to simulate forward */
  maxMinutes: number;
};

/**
 * Request ground-shadow polygons for the current viewport (ANS-237). Mirrors
 * `computeShadowFeatures`'s params; `zoom`/`bounds` come from the map since
 * the worker has no map instance of its own. Coalesced drop-and-replace by
 * the client, separately from `score` requests.
 */
export type ShadowMsg = {
  type: 'shadow';
  requestId: number;
  sun: SunPosition;
  bounds: MapBounds;
  zoom: number;
  cap?: number;
};

export type WorkerInMsg = InitMsg | ScoreMsg | PlanMsg | ShadowMsg;

export type ReadyMsg = { type: 'ready'; venueCount: number; occluderCount: number };

export type ScoreResultMsg = {
  type: 'scoreResult';
  requestId: number;
  scores: Record<string, number>;
};

export type PlanResultMsg = {
  type: 'planResult';
  requestId: number;
  venueId: string;
  /** Minutes until the venue first goes into shadow. null = still in sun past maxMinutes. */
  sunUntilMinutes: number | null;
};

export type ShadowResultMsg = {
  type: 'shadowResult';
  requestId: number;
  features: ShadowFeatureCollection;
};

export type WorkerOutMsg = ReadyMsg | ScoreResultMsg | PlanResultMsg | ShadowResultMsg;
