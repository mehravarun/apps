/* Browser entry: runs the engine in a Web Worker and draws the snapshots it sends back.
   The model and the display are decoupled. In max-speed mode the worker runs as fast as the device
   allows and the screen just shows the latest state; otherwise each frame runs the slider's number
   of ticks, as in v8. */
import type { FromWorker, Snapshot, ToWorker } from './protocol.js';
import { drawPop, drawScatter, drawStats, drawTree, drawWorld, setupCanvas, TICKS_PER_SEC } from './render.js';
import { maxSpeedOn, readParams, readScale, readSeed, ticksPerFrame, wireControls } from './controls.js';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);

const views = {
  world: setupCanvas('world'), tree: setupCanvas('treeChart'),
  scatter: setupCanvas('scatterChart'), pop: setupCanvas('popChart'),
};
const rateOut = document.getElementById('rateOut')!;

let running = true, pending = false, latest: Snapshot | null = null, frame = 0;
let csvId = 0;
const csvWaiting = new Map<number, (r: { csv: string; rows: number }) => void>();
const perf = { ticks0: 0, t0: performance.now() };

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === 'frame') { latest = m.snapshot; pending = false; }
  else if (m.type === 'csv') { csvWaiting.get(m.id)?.(m); csvWaiting.delete(m.id); }
};

function reset() {
  send({ type: 'reset', seed: readSeed(), scale: readScale(), params: readParams() });
  perf.ticks0 = 0; perf.t0 = performance.now();
}

function requestCSV() {
  const id = ++csvId;
  return new Promise<{ csv: string; rows: number }>(resolve => { csvWaiting.set(id, resolve); send({ type: 'csv', id }); });
}

async function copyCSV() {
  try {
    const result = requestCSV();
    // ClipboardItem with a promise keeps the click's permission while the worker builds the CSV (Safari needs this)
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': result.then(r => new Blob([r.csv], { type: 'text/plain' })) })]);
    } else {
      await navigator.clipboard.writeText((await result).csv);
    }
    return `Copied ${(await result).rows} rows`;
  } catch {
    return 'Clipboard not available here';
  }
}

wireControls({
  playPause: () => { running = !running; send({ type: 'mode', running, maxSpeed: maxSpeedOn() }); return running; },
  reset,
  add: count => send({ type: 'add', count }),
  paramsChanged: () => send({ type: 'params', params: readParams() }),
  modeChanged: () => send({ type: 'mode', running, maxSpeed: maxSpeedOn() }),
  copyCSV,
});

function draw(s: Snapshot) {
  const now = performance.now();
  if (now - perf.t0 > 1000) {
    const rate = (s.tick - perf.ticks0) / ((now - perf.t0) / 1000);
    perf.ticks0 = s.tick; perf.t0 = now;
    rateOut.textContent = running
      ? `${Math.round(rate).toLocaleString('en-US')} ticks/s · ${(rate / TICKS_PER_SEC).toFixed(0)}× real time`
      : 'Paused';
  }
  drawWorld(views.world, s); drawStats(s);
  if (frame++ % 6 === 0) { drawTree(views.tree, s); drawScatter(views.scatter, s); drawPop(views.pop, s); }
}

function loop() {
  if (!pending) { pending = true; send({ type: 'frame', ticks: ticksPerFrame() }); }
  if (latest) { draw(latest); latest = null; }
  requestAnimationFrame(loop);
}

send({ type: 'mode', running, maxSpeed: maxSpeedOn() });
reset();
loop();
