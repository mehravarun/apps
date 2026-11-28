/* Genes, mutation, recombination, genetic distance, digestion curves, harmful-mutation load,
   and the genome layer (crossover along a chromosome, regulation, duplication, expression).
   One genome shape for every organism. The order of random draws matches evolution_v8.html exactly. */
import type { Config } from './config.js';
import type { World } from './world.js';
import type { Agent, Condition, FunctionalTrait, GeneName, Genes, Genome, Locus } from './types.js';

export const GENES: GeneName[] = ['speed', 'size', 'sense', 'lifespan', 'carnivory', 'm1', 'm2', 'm3'];
export const FUNCTIONAL: FunctionalTrait[] = ['speed', 'size', 'sense', 'lifespan', 'carnivory'];
export const CONDITIONS: Condition[] = ['juvenile', 'hungry', 'switch'];   // switch = marker gene m1 above 0

export const plantEff = (c: Config, g: Genes) => c.DIGEST_MAX * (1 - g.carnivory) ** c.TRADEOFF;
export const meatEff = (c: Config, g: Genes) => c.DIGEST_MAX * g.carnivory ** c.TRADEOFF;

export function popcount(n: number) { let c = 0; while (n) { n &= n - 1; c++; } return c; }

export function geneticDistance(a: Genes, b: Genes) {
  return Math.sqrt(
    Math.log(a.speed / b.speed) ** 2 +
    Math.log(a.size / b.size) ** 2 +
    Math.log(a.sense / b.sense) ** 2 +
    Math.log(a.lifespan / b.lifespan) ** 2 +
    (2 * (a.carnivory - b.carnivory)) ** 2 +
    (a.m1 - b.m1) ** 2 + (a.m2 - b.m2) ** 2 + (a.m3 - b.m3) ** 2);
}

export function randomGenome(w: World): Genes {
  const r = () => w.rand();
  return { speed: 0.8 + 0.4 * r(), size: 0.8 + 0.4 * r(), sense: 0.8 + 0.4 * r(), lifespan: 0.8 + 0.4 * r(),
           carnivory: 0.3 * r(), m1: (r() - 0.5) * 0.2, m2: (r() - 0.5) * 0.2, m3: (r() - 0.5) * 0.2 };
}

export function mutate(w: World, g: Genes): Genes {
  const m = w.params.mutation, drift = w.cfg.MARKER_DRIFT, noise = () => w.rand() * 2 - 1;
  const mult = (v: number) => Math.min(5, Math.max(0.2, v * (1 + noise() * m)));
  return {
    speed: mult(g.speed), size: mult(g.size), sense: mult(g.sense), lifespan: mult(g.lifespan),
    carnivory: Math.min(1, Math.max(0, g.carnivory + noise() * m * 0.5)),
    m1: g.m1 + noise() * m * drift, m2: g.m2 + noise() * m * drift, m3: g.m3 + noise() * m * drift,
  };
}

// Sexual reproduction: each gene comes from one parent at random
export function recombine(w: World, a: Genes, b: Genes): Genes {
  const child = {} as Genes;
  for (const k of GENES) child[k] = w.rand() < 0.5 ? a[k] : b[k];
  return child;
}

// Harmful mutations: sex shuffles them (children can carry fewer than either parent),
// cloning passes all of them on. A new one may appear in every birth.
export function inheritLoad(w: World, a: Agent, b: Agent | null) {
  const c = w.cfg, full = (1 << c.LOAD_LOCI) - 1;
  let load = a.load;
  if (b) { const mask = Math.floor(w.rand() * (full + 1)); load = (a.load & mask) | (b.load & ~mask & full); }
  if (w.rand() < c.LOAD_RATE * w.params.mutation / 0.1) load |= 1 << Math.floor(w.rand() * c.LOAD_LOCI);
  if (c.LOAD_REVERT > 0) for (let i = 0; i < c.LOAD_LOCI; i++)
    if ((load >> i) & 1 && w.rand() < c.LOAD_REVERT) load &= ~(1 << i);
  return load;
}

/* ---------- genome layer (v5) ----------
   a.dna    = the primary gene values (the genotype, as in v4)
   a.genome = { recomb, extra }: recombination-rate gene + extra genes (copies and regulators),
              each with a chromosome position. Primary genes sit at index × LOCUS_SPACING.
   a.genes  = the expressed phenotype that behaviour reads; equals a.dna unless regulators act. */

export const newGenome = (): Genome => ({ recomb: 0.5, extra: [] });

export function express(w: World, a: Agent): Genes {
  if (!w.params.regulation || !a.genome.extra.length) return a.dna;
  let out: Genes | null = null;
  const juvenile = a.body < w.cfg.ADULT_AT * a.dna.size, hungry = a.energy < w.cfg.HUNGRY_ENERGY, sw = a.dna.m1 > 0;
  for (const r of a.genome.extra) {
    if (r.kind !== 'reg' || r.silent) continue;   // silenced regulators are inherited but do nothing
    const on = r.condition === 'juvenile' ? juvenile : r.condition === 'hungry' ? hungry : sw;
    if (!on) continue;
    out = out || { ...a.dna };
    let base = out[r.trait];
    if (r.copy !== null) {                       // express a duplicate copy instead of the primary
      const c = a.genome.extra.find(l => l.id === r.copy);
      if (c) base = (c as { value: number }).value;
    }
    out[r.trait] = r.trait === 'carnivory'
      ? Math.min(1, Math.max(0, base + r.strength * 0.5))
      : Math.min(5, Math.max(0.2, base * Math.exp(r.strength)));
  }
  return out || a.dna;
}

export function mutateValue(w: World, trait: GeneName, v: number, m: number) {
  const noise = w.rand() * 2 - 1;
  if (trait === 'carnivory') return Math.min(1, Math.max(0, v + noise * m * 0.5));
  if (trait === 'm1' || trait === 'm2' || trait === 'm3') return v + noise * m * w.cfg.MARKER_DRIFT;
  return Math.min(5, Math.max(0.2, v * (1 + noise * m)));
}

// Child genotype from one parent (clone) or two (sex). With the layer off this is exactly v4.
export function inheritGenome(w: World, a: Agent, b: Agent | null): { dna: Genes; genome: Genome } {
  if (!w.layerOn()) {
    return { dna: mutate(w, b ? recombine(w, a.dna, b.dna) : a.dna), genome: newGenome() };
  }
  const c = w.cfg, m = w.params.mutation;
  let dna: Genes, extra: Locus[], recomb: number;
  if (!b) {
    dna = { ...a.dna }; extra = a.genome.extra.map(l => ({ ...l })); recomb = a.genome.recomb;
  } else {
    // Crossover along the chromosome: walk every locus in position order, switching parent
    // with a chance that grows with the distance from the previous locus.
    const r = w.params.linkage ? (a.genome.recomb + b.genome.recomb) / 2 : 0.5;
    const loci: { pos: number; prim?: GeneName; id?: number }[] = GENES.map((k, i) => ({ pos: i * c.LOCUS_SPACING, prim: k }));
    const seen = new Set<number>();
    for (const l of a.genome.extra.concat(b.genome.extra)) if (!seen.has(l.id)) { seen.add(l.id); loci.push({ pos: l.pos, id: l.id }); }
    loci.sort((x, y) => x.pos - y.pos || (x.id || 0) - (y.id || 0));
    let cur = w.rand() < 0.5 ? a : b, prev: number | null = null;
    dna = {} as Genes; extra = [];
    for (const l of loci) {
      if (prev !== null) {
        const p = w.params.linkage ? Math.min(0.5, r * (l.pos - prev) / c.LOCUS_SPACING) : 0.5;
        if (w.rand() < p) cur = cur === a ? b : a;
      }
      prev = l.pos;
      if (l.prim) dna[l.prim] = cur.dna[l.prim];
      else { const g = cur.genome.extra.find(x => x.id === l.id); if (g) extra.push({ ...g }); }
    }
    recomb = (w.rand() < 0.5 ? a : b).genome.recomb;
  }
  // Point mutations
  dna = mutate(w, dna);
  for (const l of extra) {
    if (l.kind === 'copy') l.value = mutateValue(w, l.trait, l.value, m);
    else {
      l.strength += (w.rand() * 2 - 1) * m;
      if (w.rand() < 0.05) {                  // occasionally re-point at a different copy
        const copies = extra.filter(x => x.kind === 'copy' && x.trait === l.trait);
        l.copy = copies.length && w.rand() < 0.5 ? copies[Math.floor(w.rand() * copies.length)].id : null;
      }
    }
  }
  if (w.params.linkage) recomb = Math.min(0.5, Math.max(0.001, recomb + (w.rand() * 2 - 1) * m * 0.5));
  // Structural mutations
  const scale = m / 0.1;
  if (w.params.duplication && extra.length < c.MAX_EXTRA_LOCI && w.rand() < c.DUP_RATE * scale) {
    const k = Math.floor(w.rand() * (FUNCTIONAL.length + extra.length));
    if (k < FUNCTIONAL.length) {
      const t = FUNCTIONAL[k];
      extra.push({ id: w.nextLocusId++, kind: 'copy', trait: t, value: dna[t],
                   pos: GENES.indexOf(t) * c.LOCUS_SPACING + c.TANDEM_GAP * (0.1 + 0.9 * w.rand()) });
    } else {
      const src = extra[k - FUNCTIONAL.length];
      extra.push({ ...src, id: w.nextLocusId++, pos: src.pos + c.TANDEM_GAP * (0.1 + 0.9 * w.rand()) });
    }
  }
  if (w.params.regulation && extra.length < c.MAX_EXTRA_LOCI && w.rand() < c.REG_RATE * scale) {
    const t = FUNCTIONAL[Math.floor(w.rand() * FUNCTIONAL.length)];
    const copies = extra.filter(x => x.kind === 'copy' && x.trait === t);
    extra.push({ id: w.nextLocusId++, kind: 'reg', trait: t,
                 condition: CONDITIONS[Math.floor(w.rand() * CONDITIONS.length)],
                 strength: (w.rand() * 2 - 1) * c.REG_STRENGTH,
                 copy: copies.length && w.rand() < 0.5 ? copies[Math.floor(w.rand() * copies.length)].id : null,
                 pos: w.rand() * (GENES.length - 1) * c.LOCUS_SPACING });
  }
  if (extra.length && w.rand() < c.DEL_RATE * scale) extra.splice(Math.floor(w.rand() * extra.length), 1);
  return { dna, genome: { recomb, extra } };
}
