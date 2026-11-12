/**
 * Shared "party feel" movement, in arena pixels and seconds.
 *
 * Tuned to feel like the Mario Party minigames (2026-11-12 animation/physics pass, Michael's reference):
 * - Tight, responsive running: full speed in well under a tenth of a second and a short, crisp stop
 *   (one or two frames of slide, not a glide), with an even faster turnaround so dodges snap.
 * - Short, punchy jumps: a quick rise, a brief hang at the top, then a heavier fall, about 0.6 s in the
 *   air in all. Landings stick (only a tiny hop on a hard landing); the squash is done by the animation.
 * - Bumps knock you back clearly but don't ping you across the arena.
 * - Every impact is shown with squash and stretch (done in the 3D views).
 */
export const FEEL = {
  accel: 4200,
  decel: 3400,
  turnDecel: 6200,
  airControl: 0.8,
  gravity: 2900,
  apexBand: 160, // |vz| below this counts as "near the top"
  apexGravity: 0.6, // gravity multiplier near the top: a brief hang
  fallGravity: 1.35,
  jumpSpeed: 820, // ~ 120 px high, ~0.32 s to the top, ~0.6 s in the air
  landBounce: 0.12, // fraction of fall speed kept as a little hop
  minBounce: 500, // only bounce when landing faster than this
};

export interface Body {
  vx: number;
  vy: number;
  z: number; // height above ground
  vz: number;
  land: number; // seconds of landing squash left, for the views
}

export function newBody(): Body {
  return { vx: 0, vy: 0, z: 0, vz: 0, land: 0 };
}

export const grounded = (b: Body) => b.z <= 0.01 && b.vz <= 0;

/** Steer toward the stick direction at `maxSpeed`. */
export function steer(b: Body, ix: number, iy: number, maxSpeed: number, dt: number): void {
  const mag = Math.min(1, Math.hypot(ix, iy));
  const control = grounded(b) ? 1 : FEEL.airControl;
  const tx = mag > 0.15 ? (ix / Math.max(1e-6, Math.hypot(ix, iy))) * mag * maxSpeed : 0;
  const ty = mag > 0.15 ? (iy / Math.max(1e-6, Math.hypot(ix, iy))) * mag * maxSpeed : 0;
  const axis = (v: number, t: number) => {
    const reversing = t !== 0 && Math.sign(t) !== Math.sign(v) && v !== 0;
    const rate = (t === 0 ? FEEL.decel : reversing ? FEEL.turnDecel : FEEL.accel) * control * dt;
    return v < t ? Math.min(t, v + rate) : Math.max(t, v - rate);
  };
  b.vx = axis(b.vx, tx);
  b.vy = axis(b.vy, ty);
}

export function jump(b: Body, power = 1): boolean {
  if (!grounded(b)) return false;
  b.vz = FEEL.jumpSpeed * power;
  return true;
}

/** Vertical motion with hang time and a little landing bounce. Returns true on the frame it lands. */
export function stepVertical(b: Body, dt: number): boolean {
  b.land = Math.max(0, b.land - dt);
  if (b.z <= 0 && b.vz <= 0) {
    b.z = 0;
    b.vz = 0;
    return false;
  }
  const g = FEEL.gravity * (Math.abs(b.vz) < FEEL.apexBand ? FEEL.apexGravity : b.vz < 0 ? FEEL.fallGravity : 1);
  b.vz -= g * dt;
  b.z += b.vz * dt;
  if (b.z <= 0) {
    const impact = -b.vz;
    b.z = 0;
    b.vz = impact > FEEL.minBounce ? impact * FEEL.landBounce : 0;
    b.land = 0.22;
    return true;
  }
  return false;
}

/** Springy bump between two round bodies. Returns the impact speed (0 if they weren't touching). */
export function bump(
  a: { x: number; y: number } & Body,
  b: { x: number; y: number } & Body,
  radius: number,
  springiness = 2.2, // 2 = perfectly elastic, above 2 = extra knock
  pop = 0.28,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius * 2 || d === 0 || Math.abs(a.z - b.z) > radius * 1.5) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = radius * 2 - d;
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rel <= 0) return 0;
  const imp = (rel * springiness) / 2;
  a.vx -= imp * nx;
  a.vy -= imp * ny;
  b.vx += imp * nx;
  b.vy += imp * ny;
  // a hard bump pops both a little off the ground: the "boing"
  if (rel > 120) {
    const up = Math.min(420, rel * pop);
    if (grounded(a)) a.vz = up * 0.6;
    if (grounded(b)) b.vz = up;
  }
  return rel;
}
