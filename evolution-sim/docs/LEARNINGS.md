# Learnings and ways of thinking

A living notebook for whoever works on this code next, person or agent. Each entry says what we learned and the habit it leads to. Add to it when something surprises you.

The science lessons from building v1–v8 (the energy formula decides which traits win, one seed proves nothing, compare with a neutral control, run long enough, small populations make luck stronger than selection) are in two Claude Docs: [How it evolved and what we observed](https://claude.ai/artifact/NJeSjdJknkQhMxL9BSFxwc) and [Learning evolution: ideas and ways of thinking](https://claude.ai/artifact/7J8B79mkvnHCXLqg5CNfNd). This file holds the engineering lessons, plus a checklist that turns the science lessons into sweep settings.

## Two kinds of change

Every change to the engine is one of two kinds, and each needs a different proof.

| | A refactor | A behaviour change |
| --- | --- | --- |
| Examples | Splitting a module, a speedup, renaming | A new mechanism, a new constant value, a bug fix that changes outcomes |
| Results | Must stay bit-for-bit identical | Are meant to differ |
| Proof | `npm test`, then `npm run verify` (all 96 baseline runs match) | A sweep: 20+ seeds, both energy formulas, 60+ sim-minutes, before and after |
| Baseline | Untouched | Re-recorded in its own commit that says why |

Never mix the two in one commit. If a refactor turns out to change results, either find out why and keep it identical, or relabel it a behaviour change and treat it as one.

## Reproducibility

**The order of random draws is part of the behaviour.** The engine has one seeded generator, so every call to `rand()` shifts every later draw. Adding a draw, removing one, or moving one before another changes the whole run from that point on, even if the new code is "equivalent".

Things that silently change the draw order:
- Calling `rand()` in a new place, or one more time in a loop.
- Reordering conditions joined by `&&` or `||` when a later one draws (`ready && rand() < p` skips the draw when not ready).
- Evaluating something eagerly that used to be evaluated only in one branch. This is the catch in refactor 4 (sense, decide, act): sensing everything up front would run searches in a different order.
- Iterating a collection in a different order when the loop draws, or when ties are broken by "first one wins". `nearest` keeps the first organism at the smallest distance because it uses a strict `<`, so the order buckets are scanned in is part of the result.

**Hash at full precision.** The CSV rounds to 3 decimals, which can hide a drift for a while. The baseline also hashes `JSON.stringify(world.log)`, which keeps every bit of every number.

**Record the baseline from the original, unchanged.** `scripts/legacy-engine.mjs` cuts the engine out of `legacy/evolution_v8.html` and runs it as-is. A baseline recorded from the port itself would only prove the port agrees with itself.

**Keep quirks you inherit; fix them on purpose.** v8 builds the world with default settings and applies the run's settings afterwards, so the tick-0 species pass always uses a mating range of 0.6. The port keeps that, with a comment, so step 1 could be proven identical. Fixing it is a behaviour change (it changes species ids when the mating range isn't 0.6), so it gets its own commit and a re-recorded baseline.

## Speed

**Profile before you optimise, and turn inlining off to read the profile.** V8 inlines small functions into their callers, so a normal profile showed 55% of the time "in" `stepAgent`. Running with `node --no-turbo-inlining --cpu-prof` showed where it really went: 40% finding the nearest organism and 24% scanning plant cells. Carcass search, which looked suspicious in the code, was under 1%.

**For each speedup, ask: can the answer change?** All four speedups in step 2 keep every random draw and every comparison in the same order:

| Change | Why the result can't change |
| --- | --- |
| Work out each organism's hunter flag once per tick | Expressed traits are fixed for the whole tick |
| Precompute plant-search offsets and distances | Same cells in the same order with the same distances; only `Math.hypot` calls are saved |
| A flat array of grid buckets instead of a `Map` | Same buckets, same contents in the same order; the cells the `Map` lacked are the ones outside the grid |
| A second grid holding only hunters, for the flee check | Non-hunters always fail that check, and the hunters keep their relative order, so the same one wins |

The last one gave the most: every organism looked for a threat every tick, even in a world with no hunters. Skipping work whose answer is already known is often the biggest win.

Result, best of 2 runs on the same machine (`npm run bench`):

| Benchmark | Before | After | Speedup |
| --- | ---: | ---: | ---: |
| 1× world, classic, layer off | 3,322 ticks/s | 9,129 ticks/s | 2.7× |
| 4× world, realistic, layer and seasons on | 1,775 ticks/s | 4,808 ticks/s | 2.7× |
| 4× world, classic, layer on (about 1,150 organisms) | 721 ticks/s | 2,378 ticks/s | 3.3× |

All 96 baseline runs still match exactly. At 2,400 ticks/s, a 60-minute run of a crowded 4× world takes about 1.5 minutes.

## Sweeps: from lessons to settings

Each science lesson becomes a default or a warning in the sweep tools:

| Lesson | Where it shows up |
| --- | --- |
| One seed proves nothing | Sweeps default to 20 seeds; the summary warns below 20 |
| Run long enough (a 30-minute result was one phase of an hour-long cycle) | Runs default to 216,000 ticks (60 sim-minutes); the summary warns below 60 |
| A finding under one energy formula may be an artefact of it | Sweeps run both formulas by default; the summary warns if only one ran |
| Compare against a neutral control | Put the control in the grid as a setting (for example the constant at its current value), never compare with an old run made with other settings |
| Small worlds let luck beat selection | Use `--world 4` for questions about selection |
| Change one thing at a time | One `--set` axis per question; a grid of two axes is fine, but read it one axis at a time |

**Decide what you'll measure before you look.** `summarise.py` defines its measures up front (extinctions, lowest population, species, hunter presence per window, hunt success, deaths by cause, load, genes). Choosing a measure after seeing the data makes it easy to find a pattern that isn't there.

**Read the summary with care:**
- `hunt_success` is blank, not 0%, when there were no hunts.
- Gene averages and load leave out runs that went extinct, since an empty world has no averages. Check `extinct` before comparing them.
- `species_alive` comes from the engine's greedy clustering, which depends on the order organisms are visited. Good for trends, not for exact counts.
- `hunters_0_10` and the other windows are the share of runs with at least one hunter at any moment in that window, not how many hunters there were.

## Tooling lessons

- **A worker pool must shut down the worker that delivers the last result.** The first version of `pool.ts` finished all its jobs and then hung, because only workers that asked for more work were terminated. Test long-running tools on a tiny job first.
- **Importing a command-line file runs it.** `sweep.ts` starts a sweep when loaded, so its helpers live in `grid.ts`, where tests can import them safely.
- **Write results atomically.** The sweep writes `name.csv.partial` and renames it when complete, and rewrites `manifest.json` the same way after every run. A CSV that exists is always complete, so an interrupted sweep can resume.
- **Don't rebuild `dist/` under a running job.** Long runs import the compiled engine; compile to another folder (`tsc --outDir`) while one is going.
- **After a squash merge, the branch's old commits are still on the remote.** Pushing new work to the same branch is then rejected. Check that the old tip's content equals what was merged (`git diff <squash-commit> <old-tip>` is empty), then merge it with `-s ours`. Never force-push to get round it.
- **The page lags the worker by one frame.** A snapshot already on its way can arrive just after you press Pause, so the clock moves once more. A browser test must let in-flight frames settle (about half a second) before checking that a paused clock stays frozen.
- **The engine's tsconfig has no DOM library.** Using `document` or `window` in `src/engine` is a compile error, which enforces "the engine never touches the DOM" for free.
