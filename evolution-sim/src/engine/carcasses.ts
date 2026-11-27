/* Carcasses: every death except being eaten leaves a body that rots, fertilises the plants
   under it and can be scavenged. */
import type { World } from './world.js';
import type { Agent, Carcass } from './types.js';

export function nearestCarcass(w: World, a: Agent, radius: number) {
  let best: Carcass | null = null, bestD = radius * radius;
  for (const c of w.carcasses) {
    const d = (c.x - a.x) ** 2 + (c.y - a.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function stepCarcasses(w: World) {
  const { CARCASS_DECAY, CARCASS_FERTILISE } = w.cfg, { biomass, capacity } = w.plants;
  for (const c of w.carcasses) {
    const rot = c.energy * CARCASS_DECAY;
    c.energy -= rot;
    const i = w.cellAt(c.x, c.y);
    if (capacity[i] > 0) biomass[i] = Math.min(capacity[i], biomass[i] + rot * CARCASS_FERTILISE);
  }
  w.carcasses = w.carcasses.filter(c => c.energy > 1);
}
