/* Births: sex with a compatible partner, cloning as a fallback, founders and immigrants. */
import { inheritGenome, inheritLoad, newGenome, randomGenome } from './genome.js';
import type { World } from './world.js';
import type { Agent, Genes, Genome } from './types.js';

export function makeAgent(w: World, x: number, y: number, genes: Genes, generation: number, speciesId: number,
                          energy: number, load: number, body: number, genome: Genome): Agent {
  return { x, y, angle: w.rand() * Math.PI * 2, genes, dna: genes, genome, energy, age: 0, generation,
           species: speciesId, digest: 0, mateCooldown: 0, waiting: 0, dead: false, cause: null,
           load, body, hunter: false };
}

export function spawnRandom(w: World, count: number) {
  const T = w.totals;
  for (let i = 0; i < count && w.agents.length < w.maxAgents; i++, w.tick === 0 ? T.founders++ : T.added++)
  {
    const g = randomGenome(w);   // immigrants and founders arrive as adults with clean genes
    w.agents.push(makeAgent(w, w.rand() * w.width, w.rand() * w.height, g, 1, 0, w.cfg.START_ENERGY, 0, g.size, newGenome()));
  }
}

export function mateWith(w: World, a: Agent, b: Agent) {
  const C = w.cfg;
  if (w.agents.length + w.babies.length >= w.maxAgents) return;
  const gift = C.MATE_GIFT * a.energy + C.MATE_GIFT * b.energy;
  a.energy *= 1 - C.MATE_GIFT; b.energy *= 1 - C.MATE_GIFT;
  a.mateCooldown = b.mateCooldown = C.MATE_COOLDOWN;
  a.waiting = b.waiting = 0;
  const { dna, genome } = inheritGenome(w, a, b);
  w.babies.push(makeAgent(w, (a.x + b.x) / 2, (a.y + b.y) / 2, dna,
                          Math.max(a.generation, b.generation) + 1, a.species, gift,
                          inheritLoad(w, a, b), dna.size * C.BIRTH_FRACTION, genome));
  w.counters.sexualBirths++;
  w.totals.sexualBirths++;
  w.totals.maxGeneration = Math.max(w.totals.maxGeneration, Math.max(a.generation, b.generation) + 1);
}

export function clone(w: World, a: Agent) {
  const C = w.cfg;
  if (w.agents.length + w.babies.length >= w.maxAgents) return;
  a.energy /= 2; a.waiting = 0; a.mateCooldown = C.MATE_COOLDOWN;
  const { dna, genome } = inheritGenome(w, a, null);
  w.babies.push(makeAgent(w, a.x, a.y, dna, a.generation + 1, a.species, a.energy,
                          inheritLoad(w, a, null), dna.size * C.BIRTH_FRACTION, genome));
  w.counters.asexualBirths++;
  w.totals.asexualBirths++;
  w.totals.maxGeneration = Math.max(w.totals.maxGeneration, a.generation + 1);
}

export function immigrate(w: World) {
  if (w.agents.length < 10 && w.rand() < 1 / 120) spawnRandom(w, 1);
}
