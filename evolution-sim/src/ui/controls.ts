/* Sliders, checkboxes and buttons: read them into Params and wire them to the worker. */
import type { EnergyModel, Params } from '../engine/config.js';

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

export function readParams(): Params {
  return {
    mutation: +$('mutation').value / 100,
    plantGrowth: +$('growth').value / 1000,
    mateThreshold: +$('mateThreshold').value / 100,
    asexual: $('asexual').checked,
    immigration: $('immigration').checked,
    seasons: $('seasons').checked,
    energyModel: document.querySelector<HTMLInputElement>('input[name=energyModel]:checked')!.value as EnergyModel,
    linkage: $('linkage').checked,
    regulation: $('regulation').checked,
    duplication: $('duplication').checked,
  };
}

export const readSeed = () => +$('seed').value || 1;
export const readScale = () => +$<HTMLSelectElement>('worldSize').value;
export const maxSpeedOn = () => $('maxSpeed').checked;
export const ticksPerFrame = () => +$('speed').value;

export interface Handlers {
  playPause(): boolean;        // returns whether the sim is now running
  reset(): void;
  add(count: number): void;
  paramsChanged(): void;
  modeChanged(): void;
  copyCSV(): Promise<string>;  // resolves to the message shown next to the button
}

export function wireControls(h: Handlers) {
  $('btnPlay').onclick = () => { $('btnPlay').textContent = h.playPause() ? 'Pause' : 'Play'; };
  $('btnReset').onclick = () => h.reset();
  $('btnAdd').onclick = () => h.add(20);
  $('speed').oninput = e => { $('speedOut').textContent = (e.target as HTMLInputElement).value + 'x'; };
  $('mutation').oninput = e => { $('mutationOut').textContent = (e.target as HTMLInputElement).value + '%'; h.paramsChanged(); };
  $('growth').oninput = e => { $('growthOut').textContent = (e.target as HTMLInputElement).value; h.paramsChanged(); };
  $('mateThreshold').oninput = e => { $('mateThresholdOut').textContent = (+(e.target as HTMLInputElement).value / 100).toFixed(2); h.paramsChanged(); };
  for (const id of ['asexual', 'immigration', 'linkage', 'regulation', 'duplication', 'seasons']) $(id).onchange = () => h.paramsChanged();
  document.querySelectorAll<HTMLInputElement>('input[name=energyModel]').forEach(el => el.onchange = () => h.paramsChanged());
  $('maxSpeed').onchange = () => h.modeChanged();
  $('btnCopy').onclick = async () => { $('copyMsg').textContent = await h.copyCSV(); };
}
