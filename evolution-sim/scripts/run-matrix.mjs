// Runs the baseline matrix in parallel and writes one JSON file of fingerprints.
//   node scripts/run-matrix.mjs legacy  test/baseline/v8-baseline.json   (record the baseline from v8)
//   node scripts/run-matrix.mjs port    out/port-matrix.json             (run the ported engine)
// Add --compare test/baseline/v8-baseline.json to report any run that differs.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { matrix, fingerprint, TICKS } from './matrix.mjs';

async function runOne(engine, run, ticks) {
  if (engine === 'legacy') {
    const { runLegacy } = await import('./legacy-engine.mjs');
    return runLegacy({ seed: run.seed, ticks, scale: run.scale, params: run.params });
  }
  const { World } = await import('../dist/engine/world.js');
  const world = new World({ seed: run.seed, scale: run.scale, params: run.params });
  world.run(ticks);
  return world;
}

if (!isMainThread) {
  const { engine, ticks } = workerData;
  parentPort.on('message', async run => {
    const t = Date.now();
    const world = await runOne(engine, run, ticks);
    parentPort.postMessage({ key: run.key, ...fingerprint(world), seconds: (Date.now() - t) / 1000 });
  });
} else {
  const args = process.argv.slice(2);
  const engine = args[0], out = args[1];
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const ticks = +(flag('--ticks') ?? TICKS);
  const compare = flag('--compare');
  const only = flag('--only');               // substring filter on the run key
  if (!['legacy', 'port'].includes(engine) || !out) {
    console.error('usage: node scripts/run-matrix.mjs legacy|port OUT.json [--ticks N] [--only TEXT] [--compare BASELINE.json]');
    process.exit(2);
  }
  // biggest worlds first, so the long runs don't finish last on their own
  const queue = matrix().filter(r => !only || r.key.includes(only)).sort((a, b) => b.scale - a.scale);
  const results = {};
  const threads = Math.min(availableParallelism(), queue.length);
  let done = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: threads }, () => new Promise(resolve => {
    const w = new Worker(new URL(import.meta.url), { workerData: { engine, ticks } });
    const next = () => { const r = queue.shift(); if (r) w.postMessage(r); else { w.terminate(); resolve(); } };
    w.on('message', res => {
      results[res.key] = res;
      console.log(`[${++done}] ${res.key}  ${res.seconds.toFixed(0)} s  ${res.finalRow.split(',').slice(0, 6).join(',')}`);
      next();
    });
    w.on('error', e => { console.error(e); process.exit(1); });
    next();
  })));
  const sorted = Object.fromEntries(matrix().filter(r => results[r.key]).map(r => {
    const { key, seconds, ...fp } = results[r.key]; return [key, fp];
  }));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ engine, ticks, runs: sorted }, null, 1) + '\n');
  console.log(`wrote ${Object.keys(sorted).length} runs to ${out} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
  if (compare) {
    const base = JSON.parse(readFileSync(compare, 'utf8'));
    if (base.ticks !== ticks) { console.error(`baseline is for ${base.ticks} ticks, this run used ${ticks}`); process.exit(1); }
    const bad = Object.entries(sorted).filter(([k, fp]) => !base.runs[k] || base.runs[k].logSha256 !== fp.logSha256 || base.runs[k].sha256 !== fp.sha256);
    for (const [k, fp] of bad) console.log(`DIFFERS  ${k}\n  baseline: ${base.runs[k]?.finalRow}\n  this run: ${fp.finalRow}`);
    console.log(bad.length ? `${bad.length} of ${Object.keys(sorted).length} runs differ` : `all ${Object.keys(sorted).length} runs match the baseline exactly`);
    process.exit(bad.length ? 1 : 0);
  }
}
