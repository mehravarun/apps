# Evolution sim

A browser artificial-life simulation where species, diets and behaviours emerge from evolution instead of being declared in code. **Design the physics, not the organisms.** The design, rules and roadmap are in the [handoff for a coding agent](../src/evolution-sim-docs/coding-agent-handoff.pdf).

This folder is roadmap step 1: v8 (`legacy/evolution_v8.html`) ported to TypeScript modules with a headless command-line runner. The port reproduces v8 exactly: the same seed and settings give the same log, down to the last bit.

## Quick start

```sh
npm install
npm run build                 # compile the engine and CLI to dist/
npm run sim -- --seed 42 --ticks 36000 --out run.csv
npm run dev                   # the browser version, at http://localhost:5173
npm test                      # unit tests, including determinism against the v8 baseline
```

## Command-line runner

```sh
node dist/cli/run.js --seed 7 --ticks 216000 --world 4 --energy realistic --seasons --genome-layer \
                     --set ESCAPE_FACTOR=1.5 --set mutation=0.2 --out seed7.csv
```

| Option | What it does |
| --- | --- |
| `--seed N` | Random seed (default 42) |
| `--ticks N` | Ticks to run (default 36,000 = 10 sim-minutes; 60 ticks = 1 sim-second) |
| `--world 1\|2.25\|4` | World area relative to 380 × 280 (default 1) |
| `--energy classic\|realistic` | Energy formula (default classic) |
| `--seasons` | Plant growth follows a yearly cycle |
| `--linkage`, `--regulation`, `--duplication` | Genome-layer switches; `--genome-layer` turns on all three |
| `--set KEY=VALUE` | Override any constant in `src/engine/config.ts`, or a run setting (`mutation`, `plantGrowth`, `mateThreshold`, `asexual`, `immigration`). Repeatable |
| `--out FILE.csv` | Write the log here instead of stdout |

The log has one row per sim-second; the columns are the same as the v8 page's "Copy log as CSV".

## Layout

```
src/engine/   the simulation; no DOM, runs in the browser, a Web Worker or Node
  config.ts      every tuning constant, one object (DEFAULT_CONFIG), plus run settings (Params)
  rng.ts         mulberry32 seeded random number generator (the only source of randomness)
  genome.ts      genes, mutation, recombination, genetic distance, digestion, harmful-mutation load,
                 genome layer (crossover, regulation, duplication, expression)
  plants.ts      plant grid, growth, seasons, bestCell
  carcasses.ts   rotting, fertilising, nearestCarcass
  spatial.ts     spatial hash for nearest-neighbour queries
  agent.ts       one organism's tick: flee, mate, scavenge, hunt, graze, move, grow, pay energy
  lifecycle.ts   death checks and per-tick death bookkeeping
  reproduction.ts  sex, cloning, founders, immigration
  species.ts     species detection by clustering genomes, family tree
  world.ts       World: state, step(), run(), record(), toCSV()
src/cli/run.ts   headless runner
src/ui/          browser page: the engine runs in a Web Worker (worker.ts) and posts a snapshot
                 per frame; render.ts draws it, controls.ts wires the controls
legacy/          the earlier single-file versions, unchanged (v1 was never published, so it is missing)
scripts/         baseline tooling (plain JS, runs without a build step)
test/            unit tests and the v8 baseline
```

Rules: the engine never imports from `ui/`; all randomness goes through the world's `rand()`, never `Math.random()` (a test enforces this); constants live in `config.ts`; new log columns go at the end.

## Verifying the port

`test/baseline/v8-baseline.json` was recorded from the engine inside `legacy/evolution_v8.html`, run unchanged in Node (`scripts/legacy-engine.mjs`). It covers 96 runs: seeds 1, 3, 5, 7, 11 and 42, at 216,000 ticks (60 sim-minutes), at 1× and 4× world area, under both energy formulas, with the genome layer off and on, and with seasons off and on. For each run it keeps the final CSV row and SHA-256 hashes of the CSV and of the log at full floating-point precision.

- `npm test` checks the first 36,000 ticks of 9 of those runs (all seed-42 1× settings and one 4× run), plus settings outside the matrix (immigration, no cloning, other mutation and mating ranges, a regulator knockout, the 2.25× world) directly against the v8 engine. About 2 minutes.
- `npm run verify` runs all 96 full runs and compares them with the baseline. About an hour on 4 cores.
- `npm run baseline` re-records the baseline from the legacy file.

One v8 quirk is kept on purpose: the world is built with default settings and the run's settings are applied afterwards, as the v8 page did. Only the tick-0 species pass reads a setting (the mating range), so this only matters for runs with a non-default mating range.
