/* The World: all simulation state and the tick loop. No drawing code, no DOM; it runs the same
   in the browser, in a Web Worker and headless in Node. One step() advances one tick. */
import { DEFAULT_CONFIG, DEFAULT_PARAMS, type Config, type Params } from './config.js';
import { mulberry32, type Rand } from './rng.js';
import { express, geneticDistance, popcount } from './genome.js';
import { Plants, seasonFactor } from './plants.js';
import { stepCarcasses } from './carcasses.js';
import { SpatialHash } from './spatial.js';
import { isAdult, isHunter, radius, stepAgent } from './agent.js';
import { collectDeaths } from './lifecycle.js';
import { immigrate, spawnRandom } from './reproduction.js';
import { detectSpecies } from './species.js';
import type { Agent, Carcass, Counters, LogRow, Species, Totals } from './types.js';

export interface WorldOptions {
  seed: number;
  scale?: number;              // linear world scale: 1 = 380 × 280, 1.5 = 2.25× area, 2 = 4× area
  params?: Partial<Params>;
  config?: Partial<Config>;
}

export const LOG_COLUMNS: (keyof LogRow)[] = ['t', 'organisms', 'juveniles', 'hunters', 'speciesAlive', 'speciesEver', 'plants', 'carcasses',
  'speed', 'size', 'sense', 'lifespan', 'carnivory', 'load', 'sexualBirths', 'asexualBirths',
  'huntAttempts', 'huntSuccesses', 'scavengeBites', 'diedStarved', 'diedEaten', 'diedOld', 'diedGenetic',
  'copies', 'regulators', 'recomb', 'regJuvenile', 'regHungry', 'regSwitch',
  'totalBorn', 'totalDied', 'maxGeneration', 'meanGeneration', 'season'];

export class World {
  readonly cfg: Config;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly maxAgents: number;
  readonly rand: Rand;
  params: Params;
  tick = 0;
  agents: Agent[] = [];
  babies: Agent[] = [];
  log: LogRow[] = [];
  species: Species[] = [];      // every species ever detected (the family tree)
  carcasses: Carcass[] = [];
  counters!: Counters;
  totals: Totals;
  nextSpeciesId = 1;
  nextLocusId = 1;
  plants: Plants;
  hash: SpatialHash;
  hunterHash: SpatialHash;     // hunters only, for the flee check

  constructor({ seed, scale = 1, params = {}, config = {} }: WorldOptions) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    const C = this.cfg;
    this.scale = scale;
    this.width = Math.round(C.BASE_W * scale);
    this.height = Math.round(C.BASE_H * scale);
    this.maxAgents = Math.round(C.MAX_AGENTS * scale * scale);
    this.rand = mulberry32(seed);
    this.hash = new SpatialHash(C.HASH_CELL, this.width, this.height);
    this.hunterHash = new SpatialHash(C.HASH_CELL, this.width, this.height);
    this.resetCounters();
    // Lifetime totals since the start of the run (never reset)
    this.totals = { founders: 0, added: 0, sexualBirths: 0, asexualBirths: 0, maxGeneration: 1,
                    deaths: { starved: 0, eaten: 0, old: 0, genetic: 0 }, ageAtDeathSum: 0,
                    huntAttempts: 0, huntSuccesses: 0, scavengeBites: 0 };
    // As in v8, the world is built with the default params and the run's params are applied
    // afterwards (the page read its controls after constructing the world). Only the tick-0 species
    // pass reads params (mateThreshold), so this matters only for a non-default mating range.
    this.params = { ...DEFAULT_PARAMS };
    this.plants = new Plants(this);
    spawnRandom(this, Math.round(C.START_COUNT * scale ** 2));
    detectSpecies(this);
    Object.assign(this.params, params);
  }

  /* ---------- views used by the modules and the UI ---------- */
  get biomass() { return this.plants.biomass; }
  get cols() { return this.plants.cols; }
  get rows() { return this.plants.rows; }
  cellAt(x: number, y: number) { return this.plants.cellAt(this.cfg.PLANT_CELL, x, y); }
  seasonFactor() { return seasonFactor(this); }
  radius(a: Agent) { return radius(a); }
  isAdult(a: Agent) { return isAdult(this, a); }
  isHunter(a: Agent) { return isHunter(this, a); }
  compatible(a: Agent, b: Agent) { return geneticDistance(a.dna, b.dna) < this.params.mateThreshold; }
  isKin(a: Agent, b: Agent) { return geneticDistance(a.dna, b.dna) < this.cfg.KIN_DISTANCE; }
  layerOn() { return this.params.linkage || this.params.regulation || this.params.duplication; }
  spawnRandom(count: number) { spawnRandom(this, count); }

  // Knockout experiment: silence every regulator in a random share of organisms (inherited by their copies)
  silenceRegulators(share: number) {
    for (const a of this.agents) if (this.rand() < share)
      for (const l of a.genome.extra) if (l.kind === 'reg') l.silent = true;
  }

  /* ---------- the tick ---------- */
  step() {
    const C = this.cfg;
    this.tick++;
    this.plants.step(this);
    stepCarcasses(this);
    this.hash.build(this.agents);
    this.babies = [];
    // Expressed traits are fixed for the tick, so whether each organism digests meat better than
    // plants is worked out once here instead of inside every neighbour search.
    for (const a of this.agents) {
      a.genes = this.params.regulation ? express(this, a) : a.dna;
      a.hunter = isHunter(this, a);
    }
    // Only hunters can be a threat, so the flee check searches this smaller grid. It keeps the
    // hunters in the same order as the full grid, so it finds the same organism.
    this.hunterHash.build(this.agents.filter(a => a.hunter));
    for (const a of this.agents) if (!a.dead) stepAgent(this, a);
    collectDeaths(this);
    this.agents = this.agents.filter(a => !a.dead).concat(this.babies);
    if (this.params.immigration) immigrate(this);
    if (this.tick % C.SPECIES_EVERY === 0) detectSpecies(this);
    if (this.tick % C.LOG_EVERY === 0) this.record();
  }

  run(ticks: number, onRecord?: (row: LogRow) => void) {
    for (let i = 0; i < ticks; i++) {
      const rows = this.log.length;
      this.step();
      if (onRecord && this.log.length !== rows) onRecord(this.log[this.log.length - 1]);
    }
  }

  /* ---------- logging ---------- */
  resetCounters() {
    this.counters = { sexualBirths: 0, asexualBirths: 0, huntAttempts: 0, huntSuccesses: 0, scavengeBites: 0,
                      deaths: { starved: 0, eaten: 0, old: 0, genetic: 0 } };
  }

  record() {
    const n = this.agents.length || 1, avg = (k: 'speed' | 'size' | 'sense' | 'lifespan' | 'carnivory') =>
      this.agents.reduce((s, a) => s + a.dna[k], 0) / n;
    const c = this.counters, T = this.totals;
    T.huntAttempts += c.huntAttempts; T.huntSuccesses += c.huntSuccesses; T.scavengeBites += c.scavengeBites;
    const totalDied = T.deaths.starved + T.deaths.eaten + T.deaths.old + T.deaths.genetic;
    let copies = 0, regs = 0, recomb = 0;
    const regBy = { juvenile: 0, hungry: 0, switch: 0 };
    for (const a of this.agents) {
      recomb += a.genome.recomb;
      for (const l of a.genome.extra) { if (l.kind === 'copy') copies++; else { regs++; regBy[l.condition]++; } }
    }
    // Key order matches v8, so the full-precision log serialises identically.
    this.log.push({
      t: this.tick, organisms: this.agents.length,
      juveniles: this.agents.filter(a => !this.isAdult(a)).length,
      hunters: this.agents.filter(a => this.isHunter(a)).length,
      speciesAlive: this.species.filter(s => s.died === null).length,
      speciesEver: this.species.length,
      plants: this.biomass.reduce((s, b) => s + b, 0),
      carcasses: this.carcasses.length,
      speed: avg('speed'), size: avg('size'), sense: avg('sense'), lifespan: avg('lifespan'), carnivory: avg('carnivory'),
      load: this.agents.reduce((s, a) => s + popcount(a.load), 0) / n,
      sexualBirths: c.sexualBirths, asexualBirths: c.asexualBirths,
      huntAttempts: c.huntAttempts, huntSuccesses: c.huntSuccesses, scavengeBites: c.scavengeBites,
      diedStarved: c.deaths.starved, diedEaten: c.deaths.eaten, diedOld: c.deaths.old, diedGenetic: c.deaths.genetic,
      copies: copies / n, regulators: regs / n, recomb: recomb / n,
      regJuvenile: regBy.juvenile / n, regHungry: regBy.hungry / n, regSwitch: regBy.switch / n,
      season: this.seasonFactor(),
      totalBorn: T.sexualBirths + T.asexualBirths, totalDied, maxGeneration: T.maxGeneration,
      meanGeneration: this.agents.reduce((s, a) => s + a.generation, 0) / n,
    });
    this.resetCounters();
    if (this.log.length > this.cfg.LOG_MAX_ROWS) this.log.shift();
  }

  static csvHeader() { return LOG_COLUMNS.join(','); }
  static csvRow(r: LogRow) {
    const fmt = (v: number) => Number.isInteger(v) ? v : v.toFixed(3);
    return LOG_COLUMNS.map(c => fmt(r[c])).join(',');
  }
  toCSV() { return [World.csvHeader(), ...this.log.map(World.csvRow)].join('\n'); }
}
