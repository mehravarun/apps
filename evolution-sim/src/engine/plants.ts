/* Plant grid: fertile hills, logistic regrowth, spreading into bare cells, seasons, bestPlantCell. */
import type { World } from './world.js';
import type { Agent } from './types.js';

export class Plants {
  cols: number;
  rows: number;
  biomass: Float32Array;
  capacity: Float32Array;   // fixed fertility map made of random hills

  constructor(w: World) {
    const { PLANT_CELL } = w.cfg, W = w.width, H = w.height;
    this.cols = Math.ceil(W / PLANT_CELL);
    this.rows = Math.ceil(H / PLANT_CELL);
    const n = this.cols * this.rows;
    this.biomass = new Float32Array(n);
    this.capacity = new Float32Array(n);
    const hills = Array.from({ length: Math.round(6 * w.scale ** 2) }, () => ({
      x: w.rand() * W, y: w.rand() * H, s: 35 + w.rand() * 40 }));
    for (let i = 0; i < n; i++) {
      const x = (i % this.cols + 0.5) * PLANT_CELL, y = (Math.floor(i / this.cols) + 0.5) * PLANT_CELL;
      let v = 0;
      for (const h of hills) v += Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / (2 * h.s * h.s));
      v = Math.min(1, v);
      this.capacity[i] = v > 0.15 ? v : 0;
      this.biomass[i] = this.capacity[i] * (0.3 + 0.5 * w.rand());
    }
  }

  step(w: World) {
    const { cols, rows, biomass, capacity } = this, r = w.params.plantGrowth * seasonFactor(w);
    for (let i = 0; i < biomass.length; i++) {
      const cap = capacity[i];
      if (cap === 0) continue;
      const b = biomass[i];
      if (b > 0) biomass[i] = b + r * b * (1 - b / cap);
      else {
        const c = i % cols, rr = Math.floor(i / cols);
        let nb = 0;
        if (c > 0) nb += biomass[i - 1];
        if (c < cols - 1) nb += biomass[i + 1];
        if (rr > 0) nb += biomass[i - cols];
        if (rr < rows - 1) nb += biomass[i + cols];
        if (nb > 0 && w.rand() < r * nb) biomass[i] = 0.02;
      }
    }
  }

  cellAt(cellSize: number, x: number, y: number) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / cellSize)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / cellSize)));
    return r * this.cols + c;
  }

  // Cell offsets within cr cells, in v8's scan order (row by row), with their distances in px.
  // Corners beyond cr cells are left out: their distance exceeds any radius that rounds up to cr.
  private offsets = new Map<number, Float64Array>();
  private offsetsFor(cr: number, cellSize: number) {
    let o = this.offsets.get(cr);
    if (!o) {
      const list: number[] = [];
      for (let dr = -cr; dr <= cr; dr++) for (let dc = -cr; dc <= cr; dc++) {
        const d = Math.hypot(dc, dr) * cellSize;
        if (d <= cr * cellSize) list.push(dc, dr, d);
      }
      this.offsets.set(cr, o = Float64Array.from(list));
    }
    return o;
  }

  // The best-scoring cell within the radius: most biomass, slightly discounted by distance
  bestCell(w: World, a: Agent, radius: number) {
    const { PLANT_CELL, ROOT_FLOOR } = w.cfg, { cols, rows, biomass } = this;
    const cr = Math.ceil(radius / PLANT_CELL);
    const c0 = Math.floor(a.x / PLANT_CELL), r0 = Math.floor(a.y / PLANT_CELL);
    const off = this.offsetsFor(cr, PLANT_CELL);
    let bestC = -1, bestR = -1, bestScore = ROOT_FLOOR + 0.1;
    for (let k = 0; k < off.length; k += 3) {
      const d = off[k + 2];
      if (d > radius) continue;
      const c = c0 + off[k], r = r0 + off[k + 1];
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const score = biomass[r * cols + c] - d * 0.002;
      if (score > bestScore) { bestScore = score; bestC = c; bestR = r; }
    }
    return bestC < 0 ? null : { x: (bestC + 0.5) * PLANT_CELL, y: (bestR + 0.5) * PLANT_CELL };
  }
}

// Plant growth multiplier for the current time of year (1 when seasons are off)
export function seasonFactor(w: World) {
  if (!w.params.seasons) return 1;
  return Math.max(0, 1 + w.cfg.SEASON_AMPLITUDE * Math.sin(2 * Math.PI * w.tick / w.cfg.SEASON_LENGTH));
}
