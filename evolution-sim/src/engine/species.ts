/* Species detection: cluster genomes, keep identities over time, build the family tree.
   Species are observed, never declared. Greedy: each organism joins the nearest live species
   centroid within the mating range, or founds a new species whose parent is its lineage's last one. */
import { GENES, geneticDistance } from './genome.js';
import type { World } from './world.js';
import type { Agent, Species } from './types.js';

export function detectSpecies(w: World) {
  const T = w.params.mateThreshold;
  const alive = w.species.filter(s => s.died === null);
  const fresh: Species[] = [];            // species founded this pass
  const members = new Map<Species, Agent[]>();
  for (const a of w.agents) {
    let best: Species | null = null, bestD = T;
    for (const s of alive) {
      const d = geneticDistance(a.dna, s.centroid);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) {
      for (const s of fresh) {
        const d = geneticDistance(a.dna, s.centroid);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
    if (!best) {
      // a new species: its parent is whatever species this organism's lineage belonged to
      best = { id: w.nextSpeciesId++, parent: a.species || null, born: w.tick, died: null,
               centroid: { ...a.dna }, count: 0, history: [] };
      fresh.push(best);
      w.species.push(best);
    }
    a.species = best.id;
    if (!members.has(best)) members.set(best, []);
    members.get(best)!.push(a);
  }
  for (const s of w.species) {
    if (s.died !== null) continue;
    const list = members.get(s) || [];
    s.count = list.length;
    if (!list.length) { s.died = w.tick; continue; }
    for (const k of GENES) s.centroid[k] = list.reduce((sum, a) => sum + a.dna[k], 0) / list.length;
    s.history.push({ t: w.tick, n: list.length });
    if (s.history.length > 600) s.history.splice(0, s.history.length - 600);
  }
}
