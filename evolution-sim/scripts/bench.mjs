// Speed benchmark: ticks per second for fixed runs, best of N repeats.
//   npm run build && node scripts/bench.mjs [repeats]
import { World } from '../dist/engine/world.js';

const CASES = [
  { name: '1x classic, layer off', seed: 42, scale: 1, ticks: 36000, params: {} },
  { name: '4x realistic, layer + seasons', seed: 11, scale: 2, ticks: 30000,
    params: { energyModel: 'realistic', seasons: true, linkage: true, regulation: true, duplication: true } },
  { name: '4x classic, layer on', seed: 3, scale: 2, ticks: 30000, params: { linkage: true, regulation: true, duplication: true } },
];
const repeats = +(process.argv[2] ?? 3);
for (const c of CASES) {
  let best = Infinity, world;
  for (let r = 0; r < repeats; r++) {
    world = new World({ seed: c.seed, scale: c.scale, params: c.params });
    const t = performance.now();
    world.run(c.ticks);
    best = Math.min(best, (performance.now() - t) / 1000);
  }
  console.log(`${c.name.padEnd(32)} ${Math.round(c.ticks / best).toString().padStart(6)} ticks/s  (${best.toFixed(1)} s, ${world.agents.length} organisms at end)`);
}
