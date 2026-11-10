import type { Hill } from './types';

/** Ground height at (x, z) for a set of hills. The tallest hill wins, so plateaus stay flat. */
export function groundAt(hills: Hill[] | undefined, x: number, z: number): number {
  if (!hills) return 0;
  let y = 0;
  for (const h of hills) {
    const d = Math.hypot((x - h.x) / (h.sx ?? 1), z - h.z) / h.r;
    if (d >= 1) continue;
    const top = h.top ?? 0.25;
    const k = d <= top ? 1 : 1 - (d - top) / (1 - top);
    // smootherstep: gentle at the foot and at the brow
    const s = k * k * k * (k * (k * 6 - 15) + 10);
    y = Math.max(y, h.h * s);
  }
  return y;
}
