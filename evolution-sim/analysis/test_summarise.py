"""Checks summarise.py against small hand-made logs whose answers are known.

    python3 -m unittest analysis/test_summarise.py
"""
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from summarise import summarise  # noqa: E402

COLUMNS = ("t,organisms,juveniles,hunters,speciesAlive,speciesEver,plants,carcasses,speed,size,sense,lifespan,carnivory,"
           "load,sexualBirths,asexualBirths,huntAttempts,huntSuccesses,scavengeBites,diedStarved,diedEaten,diedOld,"
           "diedGenetic,copies,regulators,recomb,regJuvenile,regHungry,regSwitch,totalBorn,totalDied,maxGeneration,"
           "meanGeneration,season").split(",")


def log(rows: list[dict]) -> pd.DataFrame:
    """A log with one row per sim-second; unspecified columns are 0."""
    out = []
    for i, r in enumerate(rows):
        row = {c: 0 for c in COLUMNS}
        row.update(t=(i + 1) * 60, organisms=100, speciesAlive=2, speciesEver=2, speed=1, size=1, sense=1, lifespan=1)
        row.update(r)
        out.append(row)
    return pd.DataFrame(out, columns=COLUMNS)


def minutes(n: int, **values) -> list[dict]:
    return [dict(values) for _ in range(n * 60)]


class SummariseTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / "runs").mkdir()
        self.runs = {}

    def add(self, run_id, seed, settings, frame):
        frame.to_csv(self.dir / "runs" / f"{run_id}.csv", index=False)
        self.runs[run_id] = {"file": f"runs/{run_id}.csv", "seed": seed, "settings": settings, "seconds": 1, "rows": len(frame)}

    def write_manifest(self, axes):
        (self.dir / "manifest.json").write_text(json.dumps(
            {"tool": "evolution-sim sweep", "ticks": 0, "axes": axes, "seeds": [], "runs": self.runs}))

    def test_known_answers(self):
        A = {"energy": "classic", "X": "1"}
        # Seed 1: 20 minutes, a hunter only in minutes 10-20, 4 attempts and 1 kill, ends alive
        self.add("a1", 1, A, log(minutes(10, hunters=0) +
                                  minutes(10, hunters=1, huntAttempts=0) +
                                  [{"huntAttempts": 4, "huntSuccesses": 1, "diedEaten": 1, "diedOld": 3,
                                    "carnivory": 0.5, "load": 2, "speciesAlive": 3, "speciesEver": 5}]))
        # Seed 2: population falls to 0 and stays there (extinct); a hunter in minutes 0-10
        self.add("a2", 2, A, log(minutes(10, hunters=1, organisms=40) +
                                  [{"organisms": 0, "diedStarved": 6, "speciesAlive": 0, "speciesEver": 4}] +
                                  minutes(10, organisms=0, speciesAlive=0, speciesEver=4)))
        self.write_manifest({"energy": ["classic"], "X": ["1"]})
        summary, per_run, notes = summarise(self.dir, window_min=10)
        row = summary.iloc[0]
        self.assertEqual(row.runs, 2)
        self.assertEqual(row.extinct, 1)
        self.assertEqual(row.min_pop, 50.0)              # mean of 100 and 0
        self.assertEqual(row.min_pop_worst, 0)
        self.assertEqual(row.species_alive, 1.5)         # 3 and 0
        self.assertEqual(row.species_ever, 4.5)          # 5 and 4
        self.assertEqual(row.hunters_0_10, 0.5)          # only seed 2
        self.assertEqual(row.hunters_10_20, 0.5)         # only seed 1
        self.assertEqual(row.hunt_success, 0.25)
        self.assertAlmostEqual(row.died_starved, 0.6)    # 6 of 10 deaths
        self.assertAlmostEqual(row.died_eaten, 0.1)
        self.assertAlmostEqual(row.died_old, 0.3)
        self.assertEqual(row.carnivory, 0.5)             # extinct run left out of gene averages
        self.assertEqual(row.load, 2)
        self.assertEqual(len(per_run), 2)
        self.assertTrue(any("energy formula" in n for n in notes))
        self.assertTrue(any("seed" in n for n in notes))

    def test_one_row_per_setting(self):
        for x in ["1", "2"]:
            for seed in [1, 2, 3]:
                self.add(f"x{x}s{seed}", seed, {"energy": "classic", "X": x}, log(minutes(61)))
        self.write_manifest({"energy": ["classic"], "X": ["1", "2"]})
        summary, _, notes = summarise(self.dir)
        self.assertEqual(list(summary.X), ["1", "2"])
        self.assertEqual(list(summary.runs), [3, 3])
        self.assertTrue(math.isnan(summary.hunt_success.iloc[0]))   # no hunts: not 0%
        self.assertFalse(any("sim-minutes" in n for n in notes))     # 61 minutes is long enough


if __name__ == "__main__":
    unittest.main()
