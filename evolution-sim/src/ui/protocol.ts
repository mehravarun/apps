/* Messages between the page (main.ts) and the engine's Web Worker (worker.ts). */
import type { Params } from '../engine/config.js';
import type { LogRow, Totals } from '../engine/types.js';

export type ToWorker =
  | { type: 'reset'; seed: number; scale: number; params: Params }
  | { type: 'params'; params: Params }
  | { type: 'add'; count: number }
  | { type: 'mode'; running: boolean; maxSpeed: boolean }
  // Ask for the next frame. When not in max-speed mode, the worker first runs `ticks` ticks,
  // like the v8 page's "N ticks per frame" loop.
  | { type: 'frame'; ticks: number }
  | { type: 'csv'; id: number };

export const AGENT_STRIDE = 7;   // x, y, radius, species id, hunter (0/1), carnivory gene, size gene

export interface TreeSpecies {
  id: number; parent: number | null; born: number; died: number | null; count: number;
  history: { t: number; n: number }[];
}

export interface Snapshot {
  tick: number;
  width: number; height: number; scale: number;
  cols: number; plantCell: number;
  biomass: Float32Array;
  carcasses: Float32Array;        // x, y pairs
  agents: Float32Array;           // AGENT_STRIDE values per organism
  organisms: number; hunters: number;
  speciesAlive: number; speciesEver: number;
  meanLifespanGene: number; meanGeneration: number;
  totals: Totals;
  logTail: LogRow[];              // last 300 log rows
  logLength: number;
  tree: TreeSpecies[];            // the species the family-tree chart shows
  seasons: boolean; seasonFactor: number; seasonLength: number;
}

export type FromWorker =
  | { type: 'frame'; snapshot: Snapshot }
  | { type: 'csv'; id: number; csv: string; rows: number };
