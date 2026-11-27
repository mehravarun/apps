// Determinism: the ported engine must reproduce the v8 baseline exactly. The full baseline is
// 96 runs × 216,000 ticks (npm run verify); this test checks the first 36,000 ticks of a subset.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world.js';
// @ts-expect-error plain JS helper shared with the scripts
import { matrix, quickFingerprint, QUICK_TICKS } from '../scripts/matrix.mjs';

const baseline = JSON.parse(readFileSync(new URL('./baseline/v8-baseline.json', import.meta.url), 'utf8'));

type Run = { key: string; seed: number; scale: number; params: Record<string, unknown> };
const runs: Run[] = matrix();
// every 1× configuration for seed 42, plus one 4× world with everything on
const subset = runs.filter(r => (r.seed === 42 && r.scale === 1) || r.key === 'seed=7 scale=2 energy=realistic layer=on seasons=on');

describe('matches the v8 baseline for the first 36,000 ticks', () => {
  for (const r of subset) {
    it(r.key, () => {
      const world = new World({ seed: r.seed, scale: r.scale, params: r.params });
      world.run(QUICK_TICKS);
      const fp = quickFingerprint(world);
      expect(fp.quickLogSha256).toBe(baseline.runs[r.key].quickLogSha256);
      expect(fp.quickSha256).toBe(baseline.runs[r.key].quickSha256);
    }, 120_000);
  }
});

describe('determinism', () => {
  const run = (seed: number) => { const w = new World({ seed, params: { linkage: true, regulation: true, duplication: true } }); w.run(6000); return w.toCSV(); };
  it('same seed and settings give an identical log', () => expect(run(5)).toBe(run(5)), 60_000);
  it('a different seed gives a different log', () => expect(run(5)).not.toBe(run(6)), 60_000);
  it('never calls Math.random()', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random() called in the engine'); };
    try { new World({ seed: 1, params: { immigration: true, linkage: true, regulation: true, duplication: true } }).run(3000); }
    finally { Math.random = original; }
  }, 60_000);
});

describe('bookkeeping', () => {
  it('founders + born − died equals the number alive', () => {
    const w = new World({ seed: 3 });
    w.run(12000);
    const T = w.totals, died = T.deaths.starved + T.deaths.eaten + T.deaths.old + T.deaths.genetic;
    expect(T.founders + T.added + T.sexualBirths + T.asexualBirths - died).toBe(w.agents.length);
  }, 60_000);
  it('scales the world, cap and founders with area', () => {
    const w = new World({ seed: 1, scale: 2 });
    expect([w.width, w.height, w.maxAgents, w.agents.length]).toEqual([760, 560, 3600, 480]);
  });
  it('applies config overrides', () => {
    const w = new World({ seed: 1, config: { START_COUNT: 10 } });
    expect(w.agents.length).toBe(10);
    expect(new World({ seed: 1 }).cfg.START_COUNT).toBe(120);
  });
});
