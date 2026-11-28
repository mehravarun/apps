// Loads the engine from legacy/evolution_v8.html exactly as written, for recording the baseline.
// The engine is the part of the page's script before the "RENDERING + UI" banner; it never touches the DOM.
// Each call evaluates a fresh copy, because v8 keeps world size in module-level variables.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML = fileURLToPath(new URL('../legacy/evolution_v8.html', import.meta.url));

let source = null;
function engineSource() {
  if (source) return source;
  const html = readFileSync(HTML, 'utf8');
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.indexOf('/* =====================================================================\n   RENDERING + UI');
  if (start < 8 || end < 0) throw new Error('could not find the engine in evolution_v8.html');
  source = html.slice(start, end);
  return source;
}

export function loadLegacyEngine() {
  return new Function(`${engineSource()}\nreturn { World, setWorldScale };`)();
}

// Run one configuration the way the v8 page does: set the world size, build the world with its
// default params, then apply the settings (the page's readParams runs after the constructor).
export function runLegacy({ seed, ticks, scale = 1, params = {} }) {
  const { World, setWorldScale } = loadLegacyEngine();
  setWorldScale(scale);
  const world = new World(seed);
  Object.assign(world.params, params);
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}
