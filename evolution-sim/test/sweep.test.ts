import { describe, expect, it } from 'vitest';
import { combinations, parseSeeds, runId } from '../src/cli/grid.js';
import { SettingsError, checkSetting, worldOptions } from '../src/cli/settings.js';
import { World } from '../src/engine/world.js';

describe('sweep grid', () => {
  it('parses seed lists and ranges', () => {
    expect(parseSeeds('1-3,7,2')).toEqual([1, 2, 3, 7]);
    expect(() => parseSeeds('5-1')).toThrow(SettingsError);
    expect(() => parseSeeds('a')).toThrow(SettingsError);
  });
  it('makes every combination, first axis slowest', () => {
    expect(combinations({ world: ['1', '4'], energy: ['classic', 'realistic'] })).toEqual([
      { world: '1', energy: 'classic' }, { world: '1', energy: 'realistic' },
      { world: '4', energy: 'classic' }, { world: '4', energy: 'realistic' }]);
  });
  it('names runs so they are readable and safe as file names', () => {
    expect(runId({ world: '2.25', ESCAPE_FACTOR: '1.5' }, 7)).toBe('world-2.25_ESCAPE_FACTOR-1.5_seed-7');
  });
});

describe('settings', () => {
  it('rejects unknown keys and bad values', () => {
    expect(() => checkSetting('NOPE', '1')).toThrow(SettingsError);
    expect(() => checkSetting('world', '3')).toThrow(SettingsError);
    expect(() => checkSetting('ESCAPE_FACTOR', 'fast')).toThrow(SettingsError);
    expect(() => checkSetting('asexual', 'yes')).toThrow(SettingsError);
  });
  it('maps settings onto world options', () => {
    const o = worldOptions(3, { world: '4', energy: 'realistic', seasons: 'on', layer: 'on', ESCAPE_FACTOR: '2', asexual: 'false', mutation: '0.2' });
    expect(o).toEqual({ seed: 3, scale: 2, config: { ESCAPE_FACTOR: 2 },
      params: { energyModel: 'realistic', seasons: true, linkage: true, regulation: true, duplication: true, asexual: false, mutation: 0.2 } });
    const w = new World(o);
    expect([w.width, w.cfg.ESCAPE_FACTOR, w.params.asexual]).toEqual([760, 2, false]);
  });
});
