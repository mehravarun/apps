/* Shapes shared by the engine modules. */

// speed, size, sense, lifespan: multiplicative genes (1.0 = baseline); size = ADULT size
// carnivory: 0..1, trades plant digestion against meat digestion
// m1..m3: neutral markers. They do nothing except drift, like non-coding DNA,
//         so isolated groups become genetically distinct over time.
export interface Genes {
  speed: number; size: number; sense: number; lifespan: number; carnivory: number;
  m1: number; m2: number; m3: number;
}
export type GeneName = keyof Genes;
export type FunctionalTrait = 'speed' | 'size' | 'sense' | 'lifespan' | 'carnivory';
export type Condition = 'juvenile' | 'hungry' | 'switch';

// Extra genes of the genome layer (v5). A copy is silent until a regulator points at it.
export interface CopyLocus { id: number; kind: 'copy'; trait: FunctionalTrait; value: number; pos: number }
export interface RegLocus {
  id: number; kind: 'reg'; trait: FunctionalTrait; condition: Condition; strength: number;
  copy: number | null; pos: number; silent?: boolean;
}
export type Locus = CopyLocus | RegLocus;
export interface Genome { recomb: number; extra: Locus[] }

export type DeathCause = 'starved' | 'eaten' | 'old' | 'genetic';

export interface Agent {
  x: number; y: number; angle: number;
  genes: Genes;            // expressed phenotype that behaviour reads
  dna: Genes;              // primary gene values (the genotype)
  genome: Genome;          // recombination rate + extra genes
  energy: number; age: number; generation: number; species: number;
  digest: number; mateCooldown: number; waiting: number;
  dead: boolean; cause: DeathCause | null;
  load: number;            // harmful-mutation bitmask
  body: number;            // current body size
  hunter: boolean;         // meat digestion beats plant digestion; set at the start of each tick
}

export interface Carcass { x: number; y: number; energy: number }

export interface Species {
  id: number; parent: number | null; born: number; died: number | null;
  centroid: Genes; count: number; history: { t: number; n: number }[];
}

export interface DeathCounts { starved: number; eaten: number; old: number; genetic: number }

export interface Counters {
  sexualBirths: number; asexualBirths: number; huntAttempts: number; huntSuccesses: number;
  scavengeBites: number; deaths: DeathCounts;
}

export interface Totals {
  founders: number; added: number; sexualBirths: number; asexualBirths: number; maxGeneration: number;
  deaths: DeathCounts; ageAtDeathSum: number;
  huntAttempts: number; huntSuccesses: number; scavengeBites: number;
}

export interface LogRow {
  t: number; organisms: number; juveniles: number; hunters: number; speciesAlive: number; speciesEver: number;
  plants: number; carcasses: number;
  speed: number; size: number; sense: number; lifespan: number; carnivory: number; load: number;
  sexualBirths: number; asexualBirths: number;
  huntAttempts: number; huntSuccesses: number; scavengeBites: number;
  diedStarved: number; diedEaten: number; diedOld: number; diedGenetic: number;
  copies: number; regulators: number; recomb: number;
  regJuvenile: number; regHungry: number; regSwitch: number;
  season: number;
  totalBorn: number; totalDied: number; maxGeneration: number; meanGeneration: number;
}
