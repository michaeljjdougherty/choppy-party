/** Seeded RNG whose whole state is one number, so it can live inside JSON game state. */
export interface Rng {
  seed: number;
}

export function rand(r: Rng): number {
  r.seed = (r.seed + 0x6d2b79f5) | 0;
  let t = r.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(r: Rng, lo: number, hi: number): number {
  return lo + rand(r) * (hi - lo);
}

export function randInt(r: Rng, lo: number, hiInclusive: number): number {
  return Math.floor(randRange(r, lo, hiInclusive + 1));
}

export function shuffle<T>(r: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
