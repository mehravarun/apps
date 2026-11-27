/* The "physics": every tuning constant, in one object. No species, diets or behaviours are declared.
   Values are exactly those of evolution_v8.html. A World takes a copy, so a run can override any
   of them (the CLI's --set KEY=value) without editing code. */

export const DEFAULT_CONFIG = {
  // World size at scale 1 (v1–v7). Area, organism cap, starting population and the number of
  // fertile hills all grow with scale², so density stays the same.
  BASE_W: 380,                   // world width at scale 1 (px)
  BASE_H: 280,                   // world height at scale 1 (px)
  PLANT_CELL: 10,                // plant grid resolution (px)
  HASH_CELL: 40,                 // spatial hash bucket (px)
  MAX_AGENTS: 900,               // organism cap at scale 1 (× scale²)
  LOG_EVERY: 60,                 // ticks between log samples
  LOG_MAX_ROWS: 20000,           // oldest log rows are dropped beyond this
  SPECIES_EVERY: 120,            // ticks between species detection passes

  START_COUNT: 120,              // founders at scale 1 (× scale²)
  START_ENERGY: 60,              // energy of a founder or immigrant
  BREED_ENERGY: 120,             // × size: energy needed before looking for a mate
  METABOLISM: 0.03,              // × body²: resting cost per tick (big bodies cost more just to exist)
  MOVE_COST: 0.04,               // × size³ × (velocity/1.2)²
  SENSE_COST: 0.02,              // × sense
  SPEED_UPKEEP: 0.005,           // × speed gene, every tick: the cost of maintaining muscle even at rest (v5: 0)
  PLANT_ENERGY: 20,              // energy per unit of plant biomass eaten (× plant efficiency)

  // Energy model 'realistic' (params.energyModel). Matched to classic for a body-1, sense-1 organism
  // at top speed (both cost 0.09), but scales the way measurements of real animals suggest:
  //   resting ∝ body^2.25        Kleiber's law: metabolism ∝ mass^0.75, and mass ∝ length³
  //   moving  ∝ body² × speed    running animals' energy per second rises roughly linearly with speed
  //   sensing ∝ sense²           big senses and brains are disproportionately expensive
  REAL_METABOLISM: 0.03,         // realistic: resting cost, × body^REAL_RESTING_EXP
  REAL_RESTING_EXP: 2.25,        // realistic: Kleiber exponent on body (length)
  REAL_MOVE_COST: 0.04,          // realistic: movement cost, × body^REAL_MOVE_BODY_EXP × (v/1.2)
  REAL_MOVE_BODY_EXP: 2,         // realistic: body exponent of movement cost
  REAL_SENSE_COST: 0.02,         // realistic: sensing cost, × sense^REAL_SENSE_EXP
  REAL_SENSE_EXP: 2,             // realistic: sense exponent of sensing cost

  DIGEST_MAX: 0.7,               // best possible digestion efficiency
  TRADEOFF: 1.0,                 // >1 makes generalists worse at both foods, <1 better (1 = linear)
  MIN_MEAT: 0.15,                // below this meat efficiency, ignore carcasses
  MIN_HUNT: 0.3,                 // below this meat efficiency, never attack live prey (scavenge only)
  SIZE_EDGE: 1.3,                // attacker must be this many times bigger than its target
  KIN_DISTANCE: 0.15,            // genomes closer than this are treated as family and never eaten
  HANDLING_TIME: 150,            // ticks spent digesting after a kill
  CARCASS_VALUE: 80,             // × prey size, energy in a body on top of its stored energy

  ROOT_FLOOR: 0.03,              // grazing leaves this much plant behind
  COVER_LEVEL: 0.6,              // plant biomass that hides an organism...
  COVER_RANGE: 12,               // ...unless the hunter is this close (px)

  MATE_GIFT: 0.3,                // fraction of each parent's energy given to the child
  MATE_COOLDOWN: 200,            // ticks between matings
  ASEXUAL_AFTER: 600,            // ticks ready-but-mateless before cloning (if enabled)
  MARKER_DRIFT: 0.5,             // marker mutation size relative to the mutation rate

  // Growth: newborns are small and grow toward their adult size gene
  BIRTH_FRACTION: 0.4,           // body size at birth, as a fraction of adult size
  GROWTH_RATE: 0.0008,           // × adult size: body growth per tick while fed
  GROWTH_COST: 40,               // energy per unit of body size grown
  ADULT_AT: 0.95,                // fraction of adult size at which breeding is allowed

  // Ageing: lifespan is a gene; a longer life costs more upkeep (repair)
  BASE_LIFESPAN: 10000,          // ticks, × lifespan gene; old age should be a rare way to die in the wild (v4–v5: 5000)
  LIFESPAN_UPKEEP: 1.0,          // resting cost × lifespan gene: a longer-lived body costs proportionally more to maintain (v4–v5: 0.25)
  BASE_HAZARD: 0.00001,          // chance per tick of dying at age 0...
  SENESCENCE: 6,                 // ...rising × e^(SENESCENCE × age / lifespan) (Gompertz curve)

  // Bad genes: harmful mutations at 24 loci; each one carried adds a small chance of dying
  LOAD_LOCI: 24,                 // number of harmful-mutation loci (bits in the load mask)
  LOAD_RATE: 0.1,                // chance a newborn gets one new harmful mutation, at 10% mutation (v4–v6: 0.3)
  LOAD_REVERT: 0,                // chance per birth that each carried harmful mutation is repaired (back or compensatory mutation)
  LOAD_EXP: 2,                   // each extra harmful mutation hurts more than the last (synergistic), so selection removes them before they pile up (v4–v6: 1)
  LOAD_HAZARD: 0.00001,          // added chance of death per tick per harmful mutation (v4–v5: 0.00004)

  // Carcasses: non-predation deaths leave a body that rots, feeds scavengers and fertilises plants
  CARCASS_DECAY: 0.003,          // fraction of a carcass's energy lost per tick
  CARCASS_FERTILISE: 0.002,      // plant biomass added per unit of energy rotted
  SCAVENGE_BITE: 1.5,            // × body: carcass energy eaten per tick
  MAX_CARCASSES: 300,            // oldest carcasses are dropped beyond this

  // Hunting is a contest, not a sure thing
  ESCAPE_FACTOR: 1.5,            // weight of the prey's speed in a hunt contest; equal speeds → 40% success (v4–v5: 0.8)
  HUNT_BODY_EXP: 0,              // body size no longer counts in a hunt contest; speed decides it (v4–v5: 1)
  FAIL_COOLDOWN: 30,             // ticks to recover after a failed attack
  FAIL_COST: 2,                  // energy lost in a failed attack

  // Genome layer (v5): linkage, regulation, duplication. With all three switched off,
  // the simulation follows v4's code paths exactly and gives identical results.
  LOCUS_SPACING: 10,             // chromosome distance between neighbouring primary genes
  TANDEM_GAP: 1,                 // a duplicate lands this close to its source, so it is tightly linked
  DUP_RATE: 0.05,                // chance per birth (at 10% mutation) of duplicating a random gene
  REG_RATE: 0.05,                // chance per birth of a brand-new regulatory gene
  DEL_RATE: 0.03,                // chance per birth of deleting a random extra gene
  REG_STRENGTH: 0.2,             // starting strength range (±) of a new regulator
  GENOME_COST: 0.0005,           // energy per tick per extra gene carried
  MAX_EXTRA_LOCI: 24,            // most extra genes (copies + regulators) one organism can carry
  SEASON_LENGTH: 7200,           // ticks per full year (summer → winter → summer)
  SEASON_AMPLITUDE: 0.8,         // plant growth swings between (1 − this) and (1 + this) × normal
  HUNGRY_ENERGY: 40,             // below this energy, the "hungry" condition is on
};

export type Config = typeof DEFAULT_CONFIG;
export type ConfigKey = keyof Config;

/* Run settings: what the v8 page's controls change. Defaults are the page's defaults. */
export type EnergyModel = 'classic' | 'realistic';
export interface Params {
  mutation: number;        // mutation size (0.1 = 10%)
  plantGrowth: number;     // plant regrowth rate per tick
  mateThreshold: number;   // mating range: largest genetic distance two partners can have
  asexual: boolean;        // clone after ASEXUAL_AFTER ticks without a mate
  immigration: boolean;    // a newcomer may arrive when fewer than 10 are alive
  energyModel: EnergyModel;
  seasons: boolean;        // plant growth follows a yearly sine wave
  linkage: boolean;        // genome layer: genes on a chromosome, evolvable recombination rate
  regulation: boolean;     // genome layer: regulatory genes
  duplication: boolean;    // genome layer: gene duplication and deletion
}

export const DEFAULT_PARAMS: Params = {
  mutation: 0.10, plantGrowth: 0.012, mateThreshold: 0.6, asexual: true, immigration: false,
  energyModel: 'classic', seasons: false,
  linkage: false, regulation: false, duplication: false,
};

export const isConfigKey = (k: string): k is ConfigKey => Object.hasOwn(DEFAULT_CONFIG, k);
export const isParamKey = (k: string): k is keyof Params => Object.hasOwn(DEFAULT_PARAMS, k);
