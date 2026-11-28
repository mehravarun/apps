/* Spatial hash for nearest-neighbour queries, rebuilt once per tick. */
import type { Agent } from './types.js';

export class SpatialHash {
  private buckets = new Map<number, Agent[]>();
  constructor(private cell: number) {}

  build(agents: Agent[]) {
    this.buckets = new Map();
    for (const a of agents) {
      const k = Math.floor(a.x / this.cell) + Math.floor(a.y / this.cell) * 1000;
      let bucket = this.buckets.get(k);
      if (!bucket) this.buckets.set(k, bucket = []);
      bucket.push(a);
    }
  }

  // The closest living organism within the radius that passes the test (distance² is passed in)
  nearest(a: Agent, radius: number, test: (o: Agent, d2: number) => boolean) {
    const cell = this.cell, cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    const span = Math.ceil(radius / cell);
    let best: Agent | null = null, bestD = radius * radius;
    for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
      const bucket = this.buckets.get(cx + dx + (cy + dy) * 1000);
      if (!bucket) continue;
      for (const o of bucket) {
        if (o === a || o.dead) continue;
        const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
        if (d < bestD && test(o, d)) { bestD = d; best = o; }
      }
    }
    return best;
  }
}
