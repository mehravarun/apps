"""Summarise a sweep: one row per setting, pooled over its seeds.

    python3 analysis/summarise.py sweeps/escape            # table on screen, files in the sweep folder
    python3 analysis/summarise.py sweeps/escape --window 10

Writes two files next to manifest.json:
  summary.csv   one row per setting (every column below)
  per_run.csv   the same measures for each run, to dig into one setting's seeds

Measures, per setting (the log has one row per sim-second, LOG_EVERY = 60 ticks):
  runs            number of seeds
  extinct         runs where the population reached 0 (immigration is off by default, so it stays 0)
  min_pop         lowest population, averaged over runs; min_pop_worst is the lowest of any run
  species_alive   species alive at the end, averaged over runs
  species_ever    species that ever existed, averaged over runs
  hunters_W       share of runs with at least one hunter during each window of W sim-minutes
  hunt_success    kills / hunt attempts, over the whole run, pooled over runs
  died_*          share of all deaths by cause (starved, eaten, old, genetic)
  load            harmful mutations per organism at the end, averaged over surviving runs
  speed, size, sense, lifespan, carnivory   gene averages at the end, over surviving runs
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

SECONDS_PER_ROW = 1          # LOG_EVERY (60 ticks) at 60 ticks per sim-second
GENES = ["speed", "size", "sense", "lifespan", "carnivory"]
CAUSES = ["starved", "eaten", "old", "genetic"]


def load_manifest(folder: Path) -> dict:
    path = folder / "manifest.json"
    if not path.exists():
        sys.exit(f"error: no manifest.json in {folder}; is this a sweep folder?")
    return json.loads(path.read_text())


def run_metrics(log: pd.DataFrame, window_min: int) -> dict:
    """Measures for one run's log."""
    alive = log[log.organisms > 0]
    last = log.iloc[-1]
    survived = last.organisms > 0
    m: dict = {
        "extinct": int(not survived),
        "min_pop": int(log.organisms.min()),
        "species_alive": int(last.speciesAlive),
        "species_ever": int(last.speciesEver),
        "hunt_attempts": int(log.huntAttempts.sum()),
        "hunt_kills": int(log.huntSuccesses.sum()),
        "minutes": round(len(log) * SECONDS_PER_ROW / 60, 2),
    }
    for c in CAUSES:
        m[f"deaths_{c}"] = int(log[f"died{c.capitalize()}"].sum())
    # Hunter presence per window: was there at least one hunter at any sample in the window?
    minute = (log.t / 60 / 60).to_numpy()        # ticks → sim-minutes
    n_windows = int(-(-minute.max() // window_min)) if len(log) else 0
    for w in range(n_windows):
        in_w = (minute > w * window_min) & (minute <= (w + 1) * window_min)
        m[f"hunters_{w * window_min}_{(w + 1) * window_min}"] = int((log.hunters[in_w] > 0).any())
    # End-of-run genetics only mean something if anyone is alive
    for g in GENES + ["load"]:
        m[g] = float(last[g]) if survived else float("nan")
    m["final_alive_row"] = int(alive.index[-1]) if len(alive) else -1
    return m


def summarise(folder: Path, window_min: int = 10) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    manifest = load_manifest(folder)
    axes = list(manifest["axes"].keys())
    rows = []
    for run_id, run in sorted(manifest["runs"].items()):
        log = pd.read_csv(folder / run["file"])
        rows.append({"run": run_id, **run["settings"], "seed": run["seed"], **run_metrics(log, window_min)})
    if not rows:
        sys.exit(f"error: no finished runs in {folder}")
    per_run = pd.DataFrame(rows)

    hunter_cols = [c for c in per_run.columns if c.startswith("hunters_")]
    hunter_cols.sort(key=lambda c: int(c.split("_")[1]))
    out = []
    for key, g in per_run.groupby(axes, sort=False, dropna=False):
        key = key if isinstance(key, tuple) else (key,)
        deaths = {c: g[f"deaths_{c}"].sum() for c in CAUSES}
        total_deaths = sum(deaths.values())
        surv = g[g.extinct == 0]
        row = dict(zip(axes, key))
        row.update({
            "runs": len(g),
            "extinct": int(g.extinct.sum()),
            "min_pop": round(g.min_pop.mean(), 1),
            "min_pop_worst": int(g.min_pop.min()),
            "species_alive": round(g.species_alive.mean(), 1),
            "species_ever": round(g.species_ever.mean(), 1),
        })
        for c in hunter_cols:   # share of runs; runs shorter than the window don't count
            present = g[c].dropna()
            row[c] = round(present.mean(), 2) if len(present) else float("nan")
        attempts = g.hunt_attempts.sum()
        row["hunt_success"] = round(g.hunt_kills.sum() / attempts, 3) if attempts else float("nan")
        for c in CAUSES:
            row[f"died_{c}"] = round(deaths[c] / total_deaths, 3) if total_deaths else float("nan")
        for col in ["load"] + GENES:
            row[col] = round(surv[col].mean(), 3) if len(surv) else float("nan")
        out.append(row)
    summary = pd.DataFrame(out)

    notes = []
    if "energy" in axes and len(manifest["axes"]["energy"]) < 2:
        notes.append("Only one energy formula in this sweep; the handoff asks for both, since a finding "
                     "that holds under only one is probably an artefact of that formula.")
    if per_run.minutes.max() < 60:
        notes.append(f"Runs last {per_run.minutes.max():g} sim-minutes; the handoff asks for 60 or more, "
                     "because shorter runs see only one phase of the predator-prey cycle.")
    seeds = per_run.groupby(axes, dropna=False).seed.nunique()
    if seeds.min() < 20:
        notes.append(f"{seeds.min()} seed(s) per setting; the roadmap asks for 20 or more before trusting a difference.")
    return summary, per_run, notes


def to_text(summary: pd.DataFrame, axes: list[str]) -> str:
    """Compact table for the terminal: settings, then the headline measures."""
    hunter_cols = [c for c in summary.columns if c.startswith("hunters_")]
    show = summary.copy()
    if hunter_cols:
        show["hunters by window"] = show[hunter_cols].apply(
            lambda r: " ".join("-" if pd.isna(v) else f"{v:.1f}" for v in r), axis=1)
    show["deaths s/e/o/g %"] = show.apply(
        lambda r: "/".join("-" if pd.isna(r[f"died_{c}"]) else f"{100 * r[f'died_{c}']:.0f}" for c in CAUSES), axis=1)
    varying = [a for a in axes if summary[a].nunique() > 1] or axes[:1]
    cols = varying + ["runs", "extinct", "min_pop", "species_alive", "species_ever"] + \
        (["hunters by window"] if hunter_cols else []) + ["hunt_success", "deaths s/e/o/g %", "load", "carnivory", "size"]
    return show[cols].to_string(index=False)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Summarise an evolution-sim sweep folder.")
    p.add_argument("folder", type=Path)
    p.add_argument("--window", type=int, default=10, help="hunter-presence window in sim-minutes (default 10)")
    a = p.parse_args(argv)
    summary, per_run, notes = summarise(a.folder, a.window)
    summary.to_csv(a.folder / "summary.csv", index=False)
    per_run.to_csv(a.folder / "per_run.csv", index=False)
    axes = list(load_manifest(a.folder)["axes"].keys())
    fixed = {ax: summary[ax].iloc[0] for ax in axes if summary[ax].nunique() == 1}
    if fixed:
        print("Same in every setting: " + ", ".join(f"{k} {v}" for k, v in fixed.items()))
    print(to_text(summary, axes))
    print(f"\nhunters by window = share of runs with a hunter in each {a.window}-minute window; "
          "deaths = starved/eaten/old age/bad genes")
    for n in notes:
        print(f"note: {n}")
    print(f"wrote {a.folder / 'summary.csv'} and {a.folder / 'per_run.csv'}")


if __name__ == "__main__":
    main()
