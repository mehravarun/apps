/* Sweep: many runs in parallel, one CSV per run, plus manifest.json describing them all.
     node dist/cli/sweep.js --out sweeps/escape --seeds 1-20 --world 4 --set ESCAPE_FACTOR=1,1.5,2
   Every combination of the listed values is one "setting"; each setting runs once per seed.
   Interrupted sweeps resume: runs whose CSV is already listed as done are skipped.
   Summarise with: python3 analysis/summarise.py sweeps/escape */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { World } from '../engine/world.js';
import { runPool, serveJobs } from './pool.js';
import { SettingsError, checkSetting, splitAssignment, worldOptions, type Settings } from './settings.js';
import { combinations, parseSeeds, runId } from './grid.js';

const HELP = `Usage: node dist/cli/sweep.js --out DIR [options]

Each option below takes a comma-separated list; the sweep runs every combination, once per seed.

  --out DIR              folder for the CSVs and manifest.json (required)
  --seeds LIST           seeds, e.g. 1-20 or 1,3,5,7 (default 1-20)
  --ticks N              ticks per run (default 216000 = 60 sim-minutes; shorter runs see only
                         one phase of the predator–prey cycle)
  --world LIST           world area: 1, 2.25, 4 (default 1)
  --energy LIST          classic, realistic (default both: a finding that holds under only one
                         formula is probably an artefact of it)
  --seasons LIST         off, on (default off)
  --layer LIST           genome layer: off, on (default off)
  --set KEY=LIST         a tuning constant or run setting, e.g. ESCAPE_FACTOR=1,1.5,2; repeatable
  --preset baseline      the v8 baseline grid: seeds 1,3,5,7,11,42, world 1,4, both energy
                         formulas, layer off,on, seasons off,on, 216,000 ticks
  --threads N            worker threads (default: one per core)
  --dry-run              list the runs without running them
  --help`;

interface Job { id: string; file: string; seed: number; settings: Settings; ticks: number }
interface JobResult { id: string; seconds: number; rows: number; organisms: number; hunters: number; speciesAlive: number }

export interface Manifest {
  tool: 'evolution-sim sweep';
  ticks: number;
  axes: Record<string, string[]>;      // every axis of the grid and its values, in order
  seeds: number[];
  runs: Record<string, { file: string; seed: number; settings: Settings; seconds: number; rows: number }>;
}

/* ---------- worker: run one job, write its CSV ---------- */
serveJobs<Job, JobResult>(job => {
  const t = Date.now();
  const world = new World(worldOptions(job.seed, job.settings));
  world.run(job.ticks);
  const tmp = job.file + '.partial';
  writeFileSync(tmp, world.toCSV() + '\n');
  renameSync(tmp, job.file);           // a CSV that exists is always complete
  const last = world.log.at(-1);
  return { id: job.id, seconds: (Date.now() - t) / 1000, rows: world.log.length,
           organisms: world.agents.length, hunters: last?.hunters ?? 0, speciesAlive: last?.speciesAlive ?? 0 };
});

/* ---------- main thread ---------- */
function fail(msg: string): never { console.error(`error: ${msg}\n\n${HELP}`); process.exit(2); }

async function main() {
  let a;
  try {
    a = parseArgs({ options: {
      out: { type: 'string' }, seeds: { type: 'string' }, ticks: { type: 'string' },
      world: { type: 'string' }, energy: { type: 'string' }, seasons: { type: 'string' }, layer: { type: 'string' },
      set: { type: 'string', multiple: true, default: [] }, preset: { type: 'string' },
      threads: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
    } }).values;
  } catch (e) { fail((e as Error).message); }
  if (a.help) { console.log(HELP); return; }
  if (!a.out) fail('--out DIR is required');
  if (a.preset && a.preset !== 'baseline') fail(`unknown preset ${a.preset}`);
  const preset = a.preset === 'baseline';

  const list = (v: string | undefined, def: string) => (v ?? def).split(',').map(s => s.trim()).filter(Boolean);
  const ticks = Number(a.ticks ?? 216000);
  if (!Number.isInteger(ticks) || ticks <= 0) fail(`--ticks must be a positive whole number, got ${a.ticks}`);
  let seeds: number[], axes: Record<string, string[]>;
  try {
    seeds = parseSeeds(a.seeds ?? (preset ? '1,3,5,7,11,42' : '1-20'));
    axes = {
      world: list(a.world, preset ? '1,4' : '1'),
      energy: list(a.energy, 'classic,realistic'),
      seasons: list(a.seasons, preset ? 'off,on' : 'off'),
      layer: list(a.layer, preset ? 'off,on' : 'off'),
    };
    for (const kv of a.set) {
      const [k, v] = splitAssignment(kv);
      if (k in axes) throw new SettingsError(`set ${k} with --${k}, not --set`);
      axes[k] = v.split(',').map(s => s.trim()).filter(Boolean);
    }
    for (const [k, vs] of Object.entries(axes)) {
      if (!vs.length) throw new SettingsError(`--${k} has no values`);
      for (const v of vs) checkSetting(k, v);
    }
  } catch (e) { if (e instanceof SettingsError) fail(e.message); throw e; }
  const threads = a.threads === undefined ? undefined : Number(a.threads);
  if (threads !== undefined && !(Number.isInteger(threads) && threads > 0)) fail(`--threads must be a positive whole number`);

  // Resume an earlier sweep in the same folder if it was for the same ticks and axes
  const dir = a.out, runsDir = join(dir, 'runs'), manifestPath = join(dir, 'manifest.json');
  let manifest: Manifest = { tool: 'evolution-sim sweep', ticks, axes, seeds, runs: {} };
  if (existsSync(manifestPath)) {
    const old = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    if (old.ticks !== ticks || JSON.stringify(old.axes) !== JSON.stringify(axes))
      fail(`${dir} already holds a sweep with different ticks or settings; use another --out folder`);
    manifest = { ...old, seeds: [...new Set([...old.seeds, ...seeds])].sort((x, y) => x - y) };
  }

  const all: Job[] = combinations(axes).flatMap(s => seeds.map(seed => {
    const id = runId(s, seed);
    return { id, file: join(runsDir, `${id}.csv`), seed, settings: s, ticks };
  }));
  const todo = all.filter(j => !(manifest.runs[j.id] && existsSync(j.file)));
  const settingsCount = all.length / seeds.length;
  console.log(`${settingsCount} setting(s) × ${seeds.length} seed(s) = ${all.length} runs of ${ticks.toLocaleString('en-US')} ticks; ` +
    `${all.length - todo.length} already done, ${todo.length} to run`);
  if (a['dry-run']) { for (const j of todo) console.log(`  ${j.id}`); return; }
  if (!todo.length) return;

  mkdirSync(runsDir, { recursive: true });
  const save = () => {
    writeFileSync(manifestPath + '.partial', JSON.stringify(manifest, null, 1) + '\n');
    renameSync(manifestPath + '.partial', manifestPath);
  };
  save();
  const started = Date.now();
  await runPool<Job, JobResult>(todo, new URL(import.meta.url), {
    threads,
    onResult: (r, job, done, total) => {
      manifest.runs[job.id] = { file: `runs/${job.id}.csv`, seed: job.seed, settings: job.settings, seconds: r.seconds, rows: r.rows };
      save();
      const mins = (Date.now() - started) / 60000, eta = mins / done * (total - done);
      console.log(`[${done}/${total}] ${job.id}  ${r.seconds.toFixed(0)} s  ` +
        `${r.organisms} organisms, ${r.speciesAlive} species, ${r.hunters} hunters  (about ${eta.toFixed(0)} min left)`);
    },
  });
  console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)} min → ${manifestPath}\n` +
    `summarise with: python3 analysis/summarise.py ${dir}`);
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
