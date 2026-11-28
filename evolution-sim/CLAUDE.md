# Evolution sim: notes for coding agents

Read `README.md` for the layout, `docs/LEARNINGS.md` for how to think about changes, and `docs/DECISIONS.md` before re-opening a settled question. The design, rules and roadmap are in the handoff (`../src/evolution-sim-docs/coding-agent-handoff.pdf`; the living version is the Claude Doc linked from `docs/LEARNINGS.md`).

## The goal

Design the physics, not the organisms. A change fits when it moves a decision from designed to evolved, or makes the simulation easier to observe and measure. Never hard-code a named species, diet or behaviour; ask Varun first if a change seems to need one.

## Rules

- `src/engine` never imports from `src/ui` and never touches the DOM (its tsconfig has no DOM library).
- All randomness goes through `world.rand()`. Never `Math.random()` in the engine; a test enforces this.
- The order of random draws is behaviour. See "Reproducibility" in `docs/LEARNINGS.md` before moving any code that draws or breaks ties.
- Constants go in `src/engine/config.ts` with a one-line comment. Run settings go in `Params`.
- New log columns go at the end of `LOG_COLUMNS` and of the object in `record()`.
- Follow the roadmap order. No new biology until roadmap steps 1–5 are done.

## Before you finish

1. `npm run typecheck` and `npm test` (TypeScript and Python tests, about a minute).
2. If you touched `src/engine`: `npm run verify` (all 96 baseline runs, about 15 minutes on 4 cores). It must say "all 96 runs match the baseline exactly".
3. If the change is meant to alter behaviour: say so in the commit, re-record the baseline (`npm run baseline`) in its own commit, and back the change with a sweep (`npm run sweep`, then `npm run summarise`) of at least 10 seeds before and after.
4. Add what surprised you to `docs/LEARNINGS.md`, and any real choice to `docs/DECISIONS.md`.
