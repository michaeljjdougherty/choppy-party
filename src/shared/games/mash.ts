/**
 * Mash cap: no one counts more than MASH_RATE taps a second (a very fast human; an auto clicker is far faster),
 * with a small burst allowance so a quick flurry right after a pause isn't lost. Deterministic: the budget
 * lives in the game state, so online play agrees.
 */
export const MASH_RATE = 13;
const BURST = 3;

export function capTaps(budget: Record<string, number>, id: string, taps: number, dt: number): number {
  const b = Math.min(BURST, (budget[id] ?? BURST) + MASH_RATE * dt);
  const n = Math.max(0, Math.min(taps, Math.floor(b)));
  budget[id] = b - n;
  return n;
}
