import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world.js';
import { GENES, express, geneticDistance, inheritGenome, inheritLoad, meatEff, mutate, plantEff, popcount } from '../src/engine/genome.js';
import type { Agent, Genes } from '../src/engine/types.js';

const genes = (o: Partial<Genes> = {}): Genes =>
  ({ speed: 1, size: 1, sense: 1, lifespan: 1, carnivory: 0.2, m1: 0, m2: 0, m3: 0, ...o });

describe('genetic distance', () => {
  it('is zero for identical genomes and symmetric', () => {
    const a = genes(), b = genes({ speed: 1.3, carnivory: 0.6, m2: 0.1 });
    expect(geneticDistance(a, a)).toBe(0);
    expect(geneticDistance(a, b)).toBeCloseTo(geneticDistance(b, a), 12);
  });
  it('uses log ratios for multiplicative genes and doubles carnivory', () => {
    expect(geneticDistance(genes({ size: 1 }), genes({ size: Math.E }))).toBeCloseTo(1, 12);
    expect(geneticDistance(genes({ carnivory: 0 }), genes({ carnivory: 0.5 }))).toBeCloseTo(1, 12);
  });
});

describe('digestion', () => {
  it('trades plant against meat efficiency linearly', () => {
    const w = new World({ seed: 1 });
    expect(plantEff(w.cfg, genes({ carnivory: 0 }))).toBeCloseTo(0.7);
    expect(meatEff(w.cfg, genes({ carnivory: 1 }))).toBeCloseTo(0.7);
    expect(plantEff(w.cfg, genes({ carnivory: 0.25 })) + meatEff(w.cfg, genes({ carnivory: 0.25 }))).toBeCloseTo(0.7);
  });
});

describe('mutation', () => {
  it('keeps every gene within its bounds, even at a huge mutation rate', () => {
    const w = new World({ seed: 9, params: { mutation: 5 } });
    let g = genes();
    for (let i = 0; i < 2000; i++) {
      g = mutate(w, g);
      for (const k of ['speed', 'size', 'sense', 'lifespan'] as const) { expect(g[k]).toBeGreaterThanOrEqual(0.2); expect(g[k]).toBeLessThanOrEqual(5); }
      expect(g.carnivory).toBeGreaterThanOrEqual(0); expect(g.carnivory).toBeLessThanOrEqual(1);
    }
  });
  it('changes nothing at zero mutation', () => {
    const w = new World({ seed: 9, params: { mutation: 0 } });
    expect(mutate(w, genes({ speed: 1.7 }))).toEqual(genes({ speed: 1.7 }));
  });
});

describe('harmful-mutation load', () => {
  const agent = (load: number) => ({ load }) as Agent;
  it('a clone keeps every harmful mutation of its parent', () => {
    const w = new World({ seed: 4, params: { mutation: 0 } });
    for (let i = 0; i < 200; i++) expect(inheritLoad(w, agent(0b1011_0110), null)).toBe(0b1011_0110);
  });
  it('a sexual child carries only mutations from its parents (plus at most one new one)', () => {
    const w = new World({ seed: 4 });
    const a = 0b0000_1111, b = 0b1111_0000_0000;
    let fewer = 0;
    for (let i = 0; i < 500; i++) {
      const child = inheritLoad(w, agent(a), agent(b));
      expect(popcount(child & ~(a | b))).toBeLessThanOrEqual(1);
      if (popcount(child) < 4) fewer++;
    }
    expect(fewer).toBeGreaterThan(0);   // sex can give a child fewer than either parent
  });
});

describe('genome layer', () => {
  it('with the layer off, inheritance gives a fresh genome and no extra genes', () => {
    const w = new World({ seed: 2 });
    const [a, b] = w.agents;
    const child = inheritGenome(w, a, b);
    expect(child.genome).toEqual({ recomb: 0.5, extra: [] });
    expect(Object.keys(child.dna)).toEqual(GENES);
  });
  it('expression equals the genotype unless a regulator is on', () => {
    const w = new World({ seed: 2, params: { regulation: true } });
    const a = w.agents[0];
    expect(express(w, a)).toBe(a.dna);
    a.genome.extra.push({ id: 1, kind: 'reg', trait: 'speed', condition: 'switch', strength: Math.log(2), copy: null, pos: 3 });
    a.dna = { ...a.dna, m1: 0.05 };
    expect(express(w, a).speed).toBeCloseTo(Math.min(5, a.dna.speed * 2));
    a.genome.extra[0] = { ...a.genome.extra[0], silent: true } as typeof a.genome.extra[0];
    expect(express(w, a)).toBe(a.dna);
  });
});
