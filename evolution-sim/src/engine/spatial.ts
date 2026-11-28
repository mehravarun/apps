/* Spatial hash for nearest-neighbour queries, rebuilt once per tick.
   A flat grid of buckets covering the world. Bucket contents keep the organisms' order, and
   cells are searched in the same order as v8's Map-based hash, so results are identical. */
import type { Agent } from './types.js';

export class SpatialHash {
  private readonly gx: number;
  private readonly gy: number;
  private readonly buckets: Agent[][];

  constructor(private readonly cell: number, width: number, height: number) {
    // positions are clamped to [0, width] × [0, height], so x = width needs one extra column
    this.gx = Math.floor(width / cell) + 1;
    this.gy = Math.floor(height / cell) + 1;
    this.buckets = Array.from({ length: this.gx * this.gy }, () => []);
  }

  build(agents: Agent[]) {
    const { buckets, cell, gx } = this;
    for (const b of buckets) b.length = 0;
    for (const a of agents) buckets[Math.floor(a.x / cell) + Math.floor(a.y / cell) * gx].push(a);
  }

  // The closest living organism within the radius that passes the test (distance² is passed in)
  nearest(a: Agent, radius: number, test: (o: Agent, d2: number) => boolean) {
    const { buckets, cell, gx, gy } = this;
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    const span = Math.ceil(radius / cell);
    let best: Agent | null = null, bestD = radius * radius;
    for (let dy = -span; dy <= span; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= gy) continue;
      for (let dx = -span; dx <= span; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= gx) continue;
        const bucket = buckets[x + y * gx];
        for (let i = 0; i < bucket.length; i++) {
          const o = bucket[i];
          if (o === a || o.dead) continue;
          const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
          if (d < bestD && test(o, d)) { bestD = d; best = o; }
        }
      }
    }
    return best;
  }
}
