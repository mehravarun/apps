/* One organism's tick: flee, mate, scavenge or hunt, graze, move, grow, pay its energy bill.
   This decision order is the last piece of designed behaviour (roadmap step 10 replaces it). */
import { meatEff, plantEff } from './genome.js';
import { nearestCarcass } from './carcasses.js';
import { checkDeath } from './lifecycle.js';
import { clone, mateWith } from './reproduction.js';
import type { World } from './world.js';
import type { Agent } from './types.js';

export const radius = (a: Agent) => 3 * a.body + 2;
export const isAdult = (w: World, a: Agent) => a.body >= w.cfg.ADULT_AT * a.genes.size;
export const isHunter = (w: World, a: Agent) => meatEff(w.cfg, a.genes) > plantEff(w.cfg, a.genes);

export function touching(a: Agent, o: Agent) {
  const reach = radius(a) + radius(o);
  return (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < reach * reach;
}

export function stepAgent(w: World, a: Agent) {
  const C = w.cfg, biomass = w.plants.biomass;
  const g = a.genes, pe = plantEff(C, g), me = meatEff(C, g);
  const maxV = 1.2 * g.speed, senseR = 30 * g.sense;
  let v = maxV * 0.5, fleeing = false, busy = false;
  a.age++;
  if (a.digest > 0) a.digest--;
  if (a.mateCooldown > 0) a.mateCooldown--;
  const ready = a.mateCooldown === 0 && isAdult(w, a) && a.energy > C.BREED_ENERGY * a.body;

  // 1. Flee from a nearby hunter that is big enough to eat me and isn't close family
  const threat = w.hunterHash.nearest(a, senseR, o =>
    o.body > a.body * C.SIZE_EDGE && o.hunter && !w.isKin(a, o));
  if (threat) {
    a.angle = Math.atan2(a.y - threat.y, a.x - threat.x);
    v = maxV; fleeing = busy = true;
  }

  // 2. Ready to breed: look for a ready, compatible partner
  if (!busy && ready) {
    const mate = w.hash.nearest(a, Math.max(senseR * 1.5, 40), o =>
      o.mateCooldown === 0 && isAdult(w, o) && o.energy > C.BREED_ENERGY * o.body && w.compatible(a, o));
    if (mate) {
      a.angle = Math.atan2(mate.y - a.y, mate.x - a.x);
      v = maxV * 0.8; busy = true;
      if (touching(a, mate)) mateWith(w, a, mate);
    } else if (++a.waiting > C.ASEXUAL_AFTER && w.params.asexual) {
      clone(w, a);
    }
  }

  // 3. Meat: scavenge a carcass if one is in range, otherwise hunt.
  //    Anything clearly smaller is prey if I can digest meat at all. (Close family is spared.)
  if (!busy && a.digest === 0 && me > C.MIN_MEAT) {
    // how far I'll go for meat grows smoothly with my meat preference, so there is no
    // all-or-nothing jump between grazer and hunter for evolution to cross
    const meatShare = me / (me + pe);
    const huntR = radius(a) + 8 + senseR * meatShare;
    const carcass = nearestCarcass(w, a, huntR);
    if (carcass) {
      a.angle = Math.atan2(carcass.y - a.y, carcass.x - a.x);
      busy = true;
      if ((carcass.x - a.x) ** 2 + (carcass.y - a.y) ** 2 < (radius(a) + 3) ** 2) {
        const bite = Math.min(carcass.energy, C.SCAVENGE_BITE * a.body);
        carcass.energy -= bite;
        a.energy += bite * me;
        v = maxV * 0.1;
        w.counters.scavengeBites++;
      } else v = maxV * 0.8;
    } else {
      const visible = (o: Agent, d2: number) => d2 < C.COVER_RANGE ** 2 || biomass[w.cellAt(o.x, o.y)] < C.COVER_LEVEL;
      const prey = me < C.MIN_HUNT ? null : w.hash.nearest(a, huntR, (o, d2) =>
        a.body > o.body * C.SIZE_EDGE && visible(o, d2) && !w.isKin(a, o));
      if (prey) {
        a.angle = Math.atan2(prey.y - a.y, prey.x - a.x);
        v = maxV; busy = true;
        if (touching(a, prey)) {
          // a contest: my body × speed against the prey's, so many hunts fail
          w.counters.huntAttempts++;
          const attack = a.body ** C.HUNT_BODY_EXP * g.speed;
          const escape = prey.body ** C.HUNT_BODY_EXP * prey.genes.speed * C.ESCAPE_FACTOR;
          if (w.rand() < attack / (attack + escape)) {
            a.energy += (Math.max(0, prey.energy) + C.CARCASS_VALUE * prey.body) * me;
            prey.dead = true; prey.cause = 'eaten';
            a.digest = C.HANDLING_TIME;
            w.counters.huntSuccesses++;
          } else { a.digest = C.FAIL_COOLDOWN; a.energy -= C.FAIL_COST; }
        }
      }
    }
  }

  // 4. Graze
  if (!busy && pe > 0.01) {
    const here = biomass[w.cellAt(a.x, a.y)];
    if (here > C.ROOT_FLOOR + 0.1) { v = maxV * 0.1; a.angle += (w.rand() - 0.5) * 0.6; }
    else {
      const target = w.plants.bestCell(w, a, senseR);
      if (target) { a.angle = Math.atan2(target.y - a.y, target.x - a.x); v = maxV * 0.8; }
      else a.angle += (w.rand() - 0.5) * 0.4;
    }
  } else if (!busy) a.angle += (w.rand() - 0.5) * 0.4;

  // Eat plants underfoot unless fleeing
  if (!fleeing && pe > 0.01) {
    const i = w.cellAt(a.x, a.y);
    const bite = Math.max(0, Math.min(biomass[i] - C.ROOT_FLOOR, 0.008 * a.body));
    biomass[i] -= bite;
    a.energy += bite * C.PLANT_ENERGY * pe;
  }

  // Move and bounce
  const W = w.width, H = w.height;
  a.x += Math.cos(a.angle) * v;
  a.y += Math.sin(a.angle) * v;
  if (a.x < 0 || a.x > W) { a.angle = Math.PI - a.angle; a.x = Math.max(0, Math.min(W, a.x)); }
  if (a.y < 0 || a.y > H) { a.angle = -a.angle;          a.y = Math.max(0, Math.min(H, a.y)); }

  // Grow toward adult size while there is spare energy
  if (a.body < g.size && a.energy > 20) {
    const grow = Math.min(C.GROWTH_RATE * g.size, g.size - a.body);
    a.body += grow;
    a.energy -= grow * C.GROWTH_COST;
  }

  // Energy bill (longer-lived genomes pay more upkeep)
  const upkeep = 1 - C.LIFESPAN_UPKEEP + C.LIFESPAN_UPKEEP * g.lifespan;
  if (w.params.energyModel === 'realistic') {
    a.energy -= C.REAL_METABOLISM * a.body ** C.REAL_RESTING_EXP * upkeep
              + C.REAL_MOVE_COST * a.body ** C.REAL_MOVE_BODY_EXP * (v / 1.2)
              + C.REAL_SENSE_COST * g.sense ** C.REAL_SENSE_EXP
              + C.GENOME_COST * a.genome.extra.length + C.SPEED_UPKEEP * g.speed;
  } else {
    a.energy -= C.METABOLISM * a.body ** 2 * upkeep + C.MOVE_COST * a.body ** 3 * (v / 1.2) ** 2 + C.SENSE_COST * g.sense
              + C.GENOME_COST * a.genome.extra.length + C.SPEED_UPKEEP * g.speed;
  }

  checkDeath(w, a);
}
