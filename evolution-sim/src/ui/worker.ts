/* Runs the engine off the main thread, so large worlds keep the page responsive.
   In max-speed mode it steps in ~25 ms chunks and yields between them to answer messages;
   otherwise it runs a fixed number of ticks per frame the page asks for. */
import { World } from '../engine/world.js';
import { AGENT_STRIDE, type FromWorker, type Snapshot, type ToWorker, type TreeSpecies } from './protocol.js';

const FRAME_BUDGET_MS = 25;
const TREE_WINDOW_TICKS = 60 * 60 * 10;   // the family tree shows the last 10 sim-minutes
const TREE_MAX_ROWS = 24;

let world: World | null = null;
let running = true, maxSpeed = true, chunkQueued = false;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

// Yield to the message queue without setTimeout's minimum delay
const channel = new MessageChannel();
channel.port1.onmessage = () => { chunkQueued = false; runChunk(); };
function queueChunk() { if (!chunkQueued) { chunkQueued = true; channel.port2.postMessage(null); } }

function runChunk() {
  if (!world || !running || !maxSpeed) return;
  const start = performance.now();
  do world.step(); while (performance.now() - start < FRAME_BUDGET_MS);
  queueChunk();
}

function snapshot(w: World): Snapshot {
  const n = w.agents.length;
  const agents = new Float32Array(n * AGENT_STRIDE);
  let hunters = 0, lifespan = 0, generation = 0;
  for (let i = 0; i < n; i++) {
    const a = w.agents[i], o = i * AGENT_STRIDE, hunter = w.isHunter(a);
    if (hunter) hunters++;
    lifespan += a.genes.lifespan; generation += a.generation;
    agents[o] = a.x; agents[o + 1] = a.y; agents[o + 2] = w.radius(a); agents[o + 3] = a.species;
    agents[o + 4] = hunter ? 1 : 0; agents[o + 5] = a.genes.carnivory; agents[o + 6] = a.genes.size;
  }
  const carcasses = new Float32Array(w.carcasses.length * 2);
  w.carcasses.forEach((c, i) => { carcasses[2 * i] = c.x; carcasses[2 * i + 1] = c.y; });
  const t0 = Math.max(0, w.tick - TREE_WINDOW_TICKS);
  const tree: TreeSpecies[] = w.species
    .filter(s => (s.died === null || s.died > t0) && s.history.length)
    .slice(-TREE_MAX_ROWS)
    .map(s => ({ id: s.id, parent: s.parent, born: s.born, died: s.died, count: s.count, history: s.history.slice() }));
  return {
    tick: w.tick, width: w.width, height: w.height, scale: w.scale,
    cols: w.cols, plantCell: w.cfg.PLANT_CELL, biomass: w.biomass.slice(), carcasses, agents,
    organisms: n, hunters,
    speciesAlive: w.species.filter(s => s.died === null).length, speciesEver: w.species.length,
    meanLifespanGene: lifespan / (n || 1), meanGeneration: generation / (n || 1),
    totals: structuredClone(w.totals), logTail: w.log.slice(-300), logLength: w.log.length, tree,
    seasons: w.params.seasons, seasonFactor: w.seasonFactor(), seasonLength: w.cfg.SEASON_LENGTH,
  };
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'reset':
      world = new World({ seed: m.seed, scale: m.scale, params: m.params });
      break;
    case 'params':
      if (world) Object.assign(world.params, m.params);
      break;
    case 'add':
      world?.spawnRandom(m.count);
      break;
    case 'mode':
      running = m.running; maxSpeed = m.maxSpeed;
      break;
    case 'frame': {
      if (!world) return;
      if (running && !maxSpeed) for (let i = 0; i < m.ticks; i++) world.step();
      const s = snapshot(world);
      post({ type: 'frame', snapshot: s }, [s.biomass.buffer, s.carcasses.buffer, s.agents.buffer]);
      break;
    }
    case 'csv':
      if (world) post({ type: 'csv', id: m.id, csv: world.toCSV(), rows: world.log.length });
      break;
  }
  if (running && maxSpeed) queueChunk();
};
