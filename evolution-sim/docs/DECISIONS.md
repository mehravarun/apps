# Decisions

Why things are the way they are, newest first. Add an entry when you choose between real alternatives, so nobody has to re-argue it.

| Date | Decision | Why | Instead of |
| --- | --- | --- | --- |
| 2026-11-28 | Sweeps run both energy formulas, 20 seeds and 60 sim-minutes by default | The handoff's lessons: a finding under one formula may be its artefact, one seed proves nothing, shorter runs see one phase of the cycle | Fast defaults that make weak evidence the easy path |
| 2026-11-28 | Speedups must keep results bit-identical, proven by the 96-run baseline | Any later difference can then only come from a behaviour change | Accepting "statistically the same" results, which would make every later comparison doubtful |
| 2026-11-28 | One worker pool (`src/cli/pool.ts`) for both the sweep and the baseline check | One piece of parallel code to get right | A second pool written for the sweep |
| 2026-11-28 | Summary measures fixed in `summarise.py` before running any real sweep | Choosing measures after seeing data invites false patterns | Exploring the CSVs first and deciding later |
| 2026-11-27 | The port lives in `evolution-sim/` inside the `apps` repo | The coding session could only reach this repo; the folder is self-contained and can move to its own repo later | A separate repo, as the handoff suggests |
| 2026-11-27 | Keep v8's quirk of applying settings after the world is built | Step 1 had to reproduce v8 exactly; fixing it is a behaviour change for later | Fixing it during the port |
| 2026-11-27 | Baseline: 6 seeds × 16 settings × 216,000 ticks, hashed at full precision, recorded from the unchanged v8 file | The handoff's first-session checklist; full precision catches drift the 3-decimal CSV hides | Comparing final rows only |
| 2026-11-27 | The browser runs the engine in a Web Worker and draws snapshots | Large worlds keep the page responsive; the engine and UI stay separate | Running the engine on the page's main thread as v8 did |
| 2026-11-27 | Desktop is the full target; phones get a watch-only tier (1× world default, max speed off) that must not break | The science runs headless, so phones only affect the viewer; desktop allows big worlds and a dense layout | Every feature on every device |
| 2026-11-15 | Design the physics, not the organisms | The project's goal: species, diets and behaviours should emerge | Declaring species and diets (v2) |
