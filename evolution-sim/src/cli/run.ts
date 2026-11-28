/* Headless runner for one run.
     node dist/cli/run.js --seed 42 --ticks 108000 --world 4 --energy realistic --seasons \
                          --genome-layer --set ESCAPE_FACTOR=1.5 --out run.csv
   Prints the log as CSV (to --out, or stdout) plus a one-line summary on stderr. */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { World } from '../engine/world.js';
import { SettingsError, checkSetting, splitAssignment, worldOptions, type Settings } from './settings.js';

const HELP = `Usage: node dist/cli/run.js [options]

  --seed N             random seed (default 42)
  --ticks N            ticks to run (default 36000 = 10 sim-minutes; 60 ticks = 1 sim-second)
  --world 1|2.25|4     world area relative to 380 × 280 (default 1)
  --energy MODEL       classic (default) or realistic
  --seasons            plant growth follows a yearly cycle
  --linkage            genome layer: genes on a chromosome
  --regulation         genome layer: regulatory genes
  --duplication        genome layer: gene duplication and deletion
  --genome-layer       all three genome-layer switches
  --set KEY=VALUE      override a tuning constant (e.g. ESCAPE_FACTOR=1.5) or a run setting
                       (mutation, plantGrowth, mateThreshold, asexual, immigration); repeatable
  --out FILE.csv       write the log here instead of stdout
  --quiet              no summary on stderr
  --help

For many runs in parallel, use dist/cli/sweep.js.`;

function fail(msg: string): never { console.error(`error: ${msg}\n\n${HELP}`); process.exit(2); }

function main() {
  let a;
  try {
    a = parseArgs({ options: {
      seed: { type: 'string', default: '42' }, ticks: { type: 'string', default: '36000' },
      world: { type: 'string', default: '1' }, energy: { type: 'string', default: 'classic' },
      seasons: { type: 'boolean' }, linkage: { type: 'boolean' }, regulation: { type: 'boolean' },
      duplication: { type: 'boolean' }, 'genome-layer': { type: 'boolean' },
      set: { type: 'string', multiple: true, default: [] }, out: { type: 'string' },
      quiet: { type: 'boolean' }, help: { type: 'boolean' },
    } }).values;
  } catch (e) { fail((e as Error).message); }
  if (a.help) { console.log(HELP); return; }

  const seed = Number(a.seed), ticks = Number(a.ticks);
  if (!Number.isInteger(seed)) fail(`--seed must be an integer, got ${a.seed}`);
  if (!Number.isInteger(ticks) || ticks < 0) fail(`--ticks must be a whole number, got ${a.ticks}`);

  const settings: Settings = { world: a.world, energy: a.energy, seasons: a.seasons ? 'on' : 'off' };
  if (a['genome-layer']) settings.layer = 'on';
  for (const k of ['linkage', 'regulation', 'duplication'] as const) if (a[k]) settings[k] = 'true';
  try {
    for (const kv of a.set) { const [k, v] = splitAssignment(kv); settings[k] = v; }
    for (const [k, v] of Object.entries(settings)) checkSetting(k, v);
  } catch (e) { if (e instanceof SettingsError) fail(e.message); throw e; }

  const started = Date.now();
  const world = new World(worldOptions(seed, settings));
  world.run(ticks);
  const csv = world.toCSV() + '\n';
  if (a.out) writeFileSync(a.out, csv); else process.stdout.write(csv);
  if (!a.quiet) {
    const last = world.log.at(-1), secs = (Date.now() - started) / 1000;
    console.error(`seed ${seed}, ${ticks} ticks, ${a.world}× world: ${world.agents.length} organisms, ` +
      `${last?.speciesAlive ?? 0} species alive / ${world.species.length} ever, ${last?.hunters ?? 0} hunters ` +
      `(${secs.toFixed(1)} s, ${Math.round(ticks / Math.max(secs, 0.001)).toLocaleString('en-US')} ticks/s)` +
      (a.out ? ` → ${a.out}` : ''));
  }
}

main();
