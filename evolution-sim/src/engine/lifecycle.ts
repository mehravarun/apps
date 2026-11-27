/* Death: starvation, old age (Gompertz), bad genes; then the bookkeeping for everyone who died
   this tick (counters, lifetime totals, carcasses). Being eaten is decided in the hunt. */
import { popcount } from './genome.js';
import type { World } from './world.js';
import type { Agent } from './types.js';

export function checkDeath(w: World, a: Agent) {
  const C = w.cfg, g = a.genes;
  const lifespan = C.BASE_LIFESPAN * g.lifespan;
  if (a.dead) return;
  if (a.energy <= 0) { a.dead = true; a.cause = 'starved'; }
  else if (a.age > 4 * lifespan || w.rand() < C.BASE_HAZARD * Math.exp(C.SENESCENCE * a.age / lifespan)) { a.dead = true; a.cause = 'old'; }
  else if (w.rand() < C.LOAD_HAZARD * popcount(a.load) ** C.LOAD_EXP) { a.dead = true; a.cause = 'genetic'; }
}

export function collectDeaths(w: World) {
  for (const a of w.agents) {
    if (!a.dead) continue;
    const cause = a.cause!;
    w.counters.deaths[cause]++;
    w.totals.deaths[cause]++;
    w.totals.ageAtDeathSum += a.age;
    if (cause !== 'eaten') w.carcasses.push({ x: a.x, y: a.y, energy: w.cfg.CARCASS_VALUE * a.body });
  }
  if (w.carcasses.length > w.cfg.MAX_CARCASSES) w.carcasses.splice(0, w.carcasses.length - w.cfg.MAX_CARCASSES);
}
