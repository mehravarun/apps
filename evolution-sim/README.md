# Evolution sim

A browser artificial-life simulation where species, diets and behaviours emerge from evolution instead of being declared in code. **Design the physics, not the organisms.** The design, rules and roadmap are in the [handoff for a coding agent](../src/evolution-sim-docs/coding-agent-handoff.pdf).

v8 (`legacy/evolution_v8.html`) ported to TypeScript modules (roadmap step 1), with a headless runner, a parallel sweep runner and a summary script (step 2). The port reproduces v8 exactly: the same seed and settings give the same log, down to the last bit.

Before changing anything, read [docs/LEARNINGS.md](docs/LEARNINGS.md) (how to think about changes, reproducibility, speed and sweeps) and [docs/DECISIONS.md](docs/DECISIONS.md) (why things are the way they are). Coding agents also get [CLAUDE.md](CLAUDE.md).

## Quick start

```sh
npm install
npm run build                 # compile the engine and CLI to dist/
npm run sim -- --seed 42 --ticks 36000 --out run.csv
npm run dev                   # the browser version, at http://localhost:5173
npm test                      # unit tests, including determinism against the v8 baseline
npm run sweep -- --out sweeps/escape --world 4 --set ESCAPE_FACTOR=1,1.5,2
npm run summarise -- sweeps/escape
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

## Sweeps

A sweep runs every combination of the listed settings once per seed, in parallel on every core, and writes one CSV per run plus `manifest.json`:

```sh
node dist/cli/sweep.js --out sweeps/escape --seeds 1-20 --world 4 --set ESCAPE_FACTOR=1,1.5,2
python3 analysis/summarise.py sweeps/escape
```

| Option | Values (comma-separated lists) | Default |
| --- | --- | --- |
| `--seeds` | `1-20`, `1,3,5` | `1-20` |
| `--ticks` | ticks per run | 216,000 (60 sim-minutes) |
| `--world` | `1`, `2.25`, `4` | `1` |
| `--energy` | `classic`, `realistic` | both |
| `--seasons`, `--layer` | `off`, `on` | `off` |
| `--set KEY=LIST` | any constant or run setting; repeatable | |
| `--preset baseline` | the 96-run baseline grid | |
| `--threads`, `--dry-run` | | one thread per core |

The defaults follow the handoff: 20 seeds, 60 sim-minutes and both energy formulas, because one seed proves nothing, shorter runs see only one phase of the predator–prey cycle, and a finding under one formula may be an artefact of it. An interrupted sweep resumes where it stopped if you run the same command again.

`summarise.py` prints one row per setting and writes `summary.csv` and `per_run.csv` into the sweep folder. Its measures, per setting:

| Column | Meaning |
| --- | --- |
| `runs`, `extinct` | seeds, and how many reached a population of 0 |
| `min_pop`, `min_pop_worst` | lowest population, averaged over runs, and the lowest of any run |
| `species_alive`, `species_ever` | at the end, averaged over runs |
| `hunters_0_10`, `hunters_10_20`, … | share of runs with at least one hunter in each 10-minute window (`--window` changes it) |
| `hunt_success` | kills ÷ attempts over all runs; blank if nobody hunted |
| `died_starved`, `died_eaten`, `died_old`, `died_genetic` | share of all deaths by cause |
| `load`, `speed`, `size`, `sense`, `lifespan`, `carnivory` | at the end, averaged over runs that survived |

It also warns when a sweep has fewer than 20 seeds, runs shorter than 60 sim-minutes, or only one energy formula.

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
src/cli/         command line: run.ts (one run), sweep.ts (many, in parallel), pool.ts (worker
                 threads), grid.ts and settings.ts (parsing settings into world options)
analysis/        summarise.py and its tests
src/ui/          browser page: the engine runs in a Web Worker (worker.ts) and posts a snapshot
                 per frame; render.ts draws it, controls.ts wires the controls
legacy/          the earlier single-file versions, unchanged (v1 was never published, so it is missing)
scripts/         baseline recording and checking, and the speed benchmark (bench.mjs)
docs/            LEARNINGS.md and DECISIONS.md
test/            unit tests and the v8 baseline
```

Rules: the engine never imports from `ui/`; all randomness goes through the world's `rand()`, never `Math.random()` (a test enforces this); constants live in `config.ts`; new log columns go at the end.

## Verifying the port

`test/baseline/v8-baseline.json` was recorded from the engine inside `legacy/evolution_v8.html`, run unchanged in Node (`scripts/legacy-engine.mjs`). It covers 96 runs: seeds 1, 3, 5, 7, 11 and 42, at 216,000 ticks (60 sim-minutes), at 1× and 4× world area, under both energy formulas, with the genome layer off and on, and with seasons off and on. For each run it keeps the final CSV row and SHA-256 hashes of the CSV and of the log at full floating-point precision.

- `npm test` runs the TypeScript and Python tests. It checks the first 36,000 ticks of 9 of those runs (all seed-42 1× settings and one 4× run), plus settings outside the matrix (immigration, no cloning, other mutation and mating ranges, a regulator knockout, the 2.25× world) directly against the v8 engine. About a minute.
- `npm run verify` runs all 96 full runs and compares them with the baseline. About 15 minutes on 4 cores.
- `npm run baseline` re-records the baseline from the legacy file (about 40 minutes: v8's engine is slower). Do this only for a deliberate behaviour change, in its own commit.
- `npm run bench` measures ticks per second on three fixed runs.

One v8 quirk is kept on purpose: the world is built with default settings and the run's settings are applied afterwards, as the v8 page did. Only the tick-0 species pass reads a setting (the mating range), so this only matters for runs with a non-default mating range.
