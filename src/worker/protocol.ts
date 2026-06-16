import type { Occluder, SunPosition } from '../engine/shadows';
import type { HorizonProfile } from '../engine/terrain';

export type InitMsg = {
  type: 'init';
  occluders: Occluder[];
  venues: Array<{ id: string; coords: [number, number] }>;
  horizonProfile?: HorizonProfile;
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

export type WorkerInMsg = InitMsg | ScoreMsg | PlanMsg;

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

export type WorkerOutMsg = ReadyMsg | ScoreResultMsg | PlanResultMsg;
