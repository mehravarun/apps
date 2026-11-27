// mulberry32: small, fast, seeded random number generator. All engine randomness goes through it,
// never Math.random(), so the same seed and settings always give the same run.
export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
