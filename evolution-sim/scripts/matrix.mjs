// The baseline matrix from the handoff's first-session checklist:
// seeds 1, 3, 5, 7, 11, 42 at 216,000 ticks (60 sim-minutes), world sizes 1× and 4× area,
// both energy formulas, genome layer off and on, seasons off and on.
import { createHash } from 'node:crypto';

export const SEEDS = [1, 3, 5, 7, 11, 42];
export const TICKS = 216000;
export const QUICK_TICKS = 36000;            // prefix checked by the fast unit test
export const QUICK_ROWS = QUICK_TICKS / 60;  // log rows in that prefix

export function matrix() {
  const runs = [];
  for (const scale of [1, 2])                       // linear scale; 2 = 4× area
    for (const energyModel of ['classic', 'realistic'])
      for (const layer of [false, true])
        for (const seasons of [false, true])
          for (const seed of SEEDS)
            runs.push({
              key: `seed=${seed} scale=${scale} energy=${energyModel} layer=${layer ? 'on' : 'off'} seasons=${seasons ? 'on' : 'off'}`,
              seed, scale,
              params: { energyModel, seasons, linkage: layer, regulation: layer, duplication: layer },
            });
  return runs;
}

const sha = s => createHash('sha256').update(s).digest('hex');

// What the baseline keeps per run: the final CSV row, a hash of the whole CSV, a hash of the
// log at full floating-point precision (the CSV rounds to 3 decimals), and the same two hashes
// for the first QUICK_ROWS rows so a short run can be checked too.
export function fingerprint(world) {
  const csv = world.toCSV(), lines = csv.split('\n');
  return {
    rows: lines.length - 1,
    finalRow: lines.at(-1),
    sha256: sha(csv),
    logSha256: sha(JSON.stringify(world.log)),
    ...quickFingerprint(world),
  };
}

export function quickFingerprint(world) {
  const lines = world.toCSV().split('\n');
  return {
    quickSha256: sha(lines.slice(0, QUICK_ROWS + 1).join('\n')),
    quickLogSha256: sha(JSON.stringify(world.log.slice(0, QUICK_ROWS))),
  };
}
