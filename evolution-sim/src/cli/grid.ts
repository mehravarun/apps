/* The sweep's grid: seed lists, every combination of settings, and run names. */
import { SettingsError, type Settings } from './settings.js';

export function parseSeeds(list: string): number[] {
  const seeds: number[] = [];
  for (const part of list.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(-?\d+)(?:-(-?\d+))?$/);
    if (!m) throw new SettingsError(`seeds must look like 1-20 or 1,3,5, got ${list}`);
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (b < a) throw new SettingsError(`seed range ${part} runs backwards`);
    for (let s = a; s <= b; s++) seeds.push(s);
  }
  if (!seeds.length) throw new SettingsError('no seeds given');
  return [...new Set(seeds)];
}

// Every combination of the axes' values, in axis order (the first axis varies slowest)
export function combinations(axes: Record<string, string[]>): Settings[] {
  let out: Settings[] = [{}];
  for (const [key, values] of Object.entries(axes))
    out = out.flatMap(s => values.map(v => ({ ...s, [key]: v })));
  return out;
}

export const runId = (s: Settings, seed: number) =>
  [...Object.entries(s).map(([k, v]) => `${k}-${v}`), `seed-${seed}`].join('_').replace(/[^A-Za-z0-9_.-]/g, '');
