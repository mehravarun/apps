// Settings outside the baseline matrix, checked directly against the engine inside
// legacy/evolution_v8.html: immigration, no cloning, other mutation and mating ranges,
// a regulator knockout mid-run, and the 2.25× world.
import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world.js';
// @ts-expect-error plain JS helper shared with the scripts
import { loadLegacyEngine } from '../scripts/legacy-engine.mjs';

const TICKS = 7200;

function legacyLog(seed: number, scale: number, params: object, knockoutAt?: number) {
  const { World: LegacyWorld, setWorldScale } = loadLegacyEngine();
  setWorldScale(scale);
  const w = new LegacyWorld(seed);
  Object.assign(w.params, params);
  for (let i = 0; i < TICKS; i++) { if (i === knockoutAt) w.silenceRegulators(0.5); w.step(); }
  return JSON.stringify(w.log);
}

function portLog(seed: number, scale: number, params: object, knockoutAt?: number) {
  const w = new World({ seed, scale, params });
  for (let i = 0; i < TICKS; i++) { if (i === knockoutAt) w.silenceRegulators(0.5); w.step(); }
  return JSON.stringify(w.log);
}

const layer = { linkage: true, regulation: true, duplication: true };
const cases: [string, number, number, object, number?][] = [
  ['immigration on, no cloning', 11, 1, { immigration: true, asexual: false }],
  ['mutation 25%, faster plant growth', 3, 1, { mutation: 0.25, plantGrowth: 0.03 }],
  ['narrow mating range', 7, 1, { mateThreshold: 0.35, ...layer }],
  ['linkage only', 5, 1, { linkage: true, energyModel: 'realistic' }],
  ['regulator knockout at tick 3600', 42, 1, layer, 3600],
  ['2.25× world with seasons', 1, 1.5, { seasons: true, ...layer }],
  ['no mutation', 2, 1, { mutation: 0 }],
];

describe('matches the v8 engine for settings outside the baseline', () => {
  for (const [name, seed, scale, params, knockout] of cases)
    it(name, () => expect(portLog(seed, scale, params, knockout)).toBe(legacyLog(seed, scale, params, knockout)), 120_000);
});
