/* Turning command-line settings into World options. Shared by run.ts and sweep.ts. */
import { DEFAULT_CONFIG, DEFAULT_PARAMS, isConfigKey, isParamKey, type Config, type Params } from '../engine/config.js';
import type { WorldOptions } from '../engine/world.js';

// World area → linear scale, matching the v8 page's options
export const AREA_TO_SCALE: Record<string, number> = { '1': 1, '2.25': 1.5, '4': 2 };

// One run's settings, as strings exactly as given on the command line (so they print and sort cleanly).
// world: area (1 | 2.25 | 4); energy: classic | realistic; seasons, layer: off | on; plus any --set keys.
export type Settings = Record<string, string>;

export class SettingsError extends Error {}

export function checkSetting(key: string, raw: string): void {
  if (key === 'world') { if (!AREA_TO_SCALE[raw]) throw new SettingsError(`world must be 1, 2.25 or 4, got ${raw}`); return; }
  if (key === 'energy') { if (raw !== 'classic' && raw !== 'realistic') throw new SettingsError(`energy must be classic or realistic, got ${raw}`); return; }
  if (key === 'seasons' || key === 'layer') { if (raw !== 'off' && raw !== 'on') throw new SettingsError(`${key} must be off or on, got ${raw}`); return; }
  if (isConfigKey(key)) {
    if (raw === '' || !Number.isFinite(Number(raw))) throw new SettingsError(`${key} must be a number, got ${raw}`);
    return;
  }
  if (isParamKey(key)) {
    const def = DEFAULT_PARAMS[key];
    if (typeof def === 'boolean' && raw !== 'true' && raw !== 'false') throw new SettingsError(`${key} must be true or false, got ${raw}`);
    if (typeof def === 'number' && (raw === '' || !Number.isFinite(Number(raw)))) throw new SettingsError(`${key} must be a number, got ${raw}`);
    if (typeof def === 'string') throw new SettingsError(`use --energy to set ${key}`);
    return;
  }
  throw new SettingsError(`unknown key ${key}. Constants: ${Object.keys(DEFAULT_CONFIG).join(', ')}. ` +
    `Settings: ${Object.keys(DEFAULT_PARAMS).filter(k => k !== 'energyModel').join(', ')}`);
}

// Split "KEY=VALUE" (or "KEY=v1,v2" when list is true)
export function splitAssignment(kv: string): [string, string] {
  const eq = kv.indexOf('=');
  if (eq < 1) throw new SettingsError(`--set expects KEY=VALUE, got ${kv}`);
  return [kv.slice(0, eq), kv.slice(eq + 1)];
}

export function worldOptions(seed: number, s: Settings): WorldOptions {
  const params: Partial<Params> = {}, config: Partial<Config> = {};
  let scale = 1;
  for (const [key, raw] of Object.entries(s)) {
    checkSetting(key, raw);
    if (key === 'world') scale = AREA_TO_SCALE[raw];
    else if (key === 'energy') params.energyModel = raw as Params['energyModel'];
    else if (key === 'seasons') params.seasons = raw === 'on';
    else if (key === 'layer') params.linkage = params.regulation = params.duplication = raw === 'on';
    else if (isConfigKey(key)) config[key] = Number(raw);
    else if (isParamKey(key)) (params as Record<string, unknown>)[key] = typeof DEFAULT_PARAMS[key] === 'boolean' ? raw === 'true' : Number(raw);
  }
  return { seed, scale, params, config };
}
