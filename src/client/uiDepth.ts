import { roundRect } from '../shared/draw';

/**
 * Depth for the 2D menus: springs, a shared "look" offset from the mouse or stick, and a card
 * drawer that fakes a tilted, extruded toy slab with a soft shadow. Everything here is view-only.
 */

/** A critically-damped-ish spring: call step every frame, read .v. */
export class Spring {
  v: number;
  vel = 0;
  constructor(
    public target = 0,
    public k = 220,
    public damp = 18,
  ) {
    this.v = target;
  }
  step(dt: number): number {
    const h = Math.min(dt, 1 / 30);
    this.vel += (this.target - this.v) * this.k * h - this.vel * this.damp * h;
    this.v += this.vel * h;
    return this.v;
  }
  snap(v: number): void {
    this.v = this.target = v;
    this.vel = 0;
  }
  /** Give it a shove (for a press squish or a bump). */
  kick(vel: number): void {
    this.vel += vel;
  }
}

/** Where the viewer is "looking" from, -1..1 on each axis. Mouse position or a stick nudges it. */
const look = { x: new Spring(0, 40, 11), y: new Spring(0, 40, 11), tx: 0, ty: 0, idle: 0 };
export function lookAt(x: number, y: number): void {
  look.tx = Math.max(-1, Math.min(1, x));
  look.ty = Math.max(-1, Math.min(1, y));
  look.idle = 0;
}
/** Mouse in 1280x720 space. */
export function lookAtPointer(px: number, py: number): void {
  lookAt((px - 640) / 640, (py - 360) / 360);
}
export function stepLook(dt: number, t: number): void {
  look.idle += dt;
  // with nobody steering, drift in a slow figure-eight so the menu never sits dead still
  const drift = Math.min(1, Math.max(0, look.idle - 2) / 2);
  look.x.target = look.tx * (1 - drift) + Math.sin(t * 0.35) * 0.35 * drift;
  look.y.target = look.ty * (1 - drift) + Math.sin(t * 0.7) * 0.2 * drift;
  look.x.step(dt);
  look.y.step(dt);
}
export const lookX = (): number => look.x.v;
export const lookY = (): number => look.y.v;

/** Shift for a layer at `depth` (0 = background, 1 = closest): nearer layers move more. */
export function parallax(depth: number, amount = 14): { x: number; y: number } {
  return { x: -look.x.v * amount * depth, y: -look.y.v * amount * depth };
}

export interface CardPose {
  /** centre of the card at rest */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 0..1, how far the card has risen toward the viewer (selection) */
  lift: number;
  /** tilt in "units" (-1..1): x turns the card left/right, y tips it up/down */
  tiltX: number;
  tiltY: number;
  scale?: number;
  radius?: number;
  /** extrusion thickness in px at rest */
  depth?: number;
  alpha?: number;
}

/**
 * Draws a tilted, extruded card: soft floor shadow, a darker side slab, then calls `face` with the
 * context already transformed so the face draws in local coordinates (0,0 = card centre).
 * `face` gets a `pop(z)` helper that shifts content toward the viewer for inner parallax.
 */
export function card3d(
  ctx: CanvasRenderingContext2D,
  p: CardPose,
  sideColor: string,
  face: (pop: (z: number) => { x: number; y: number }) => void,
): void {
  const r = p.radius ?? 28;
  const s = p.scale ?? 1;
  // small things (pills, chips) get proportionally smaller rise and shadow
  const sz = Math.max(0.35, Math.min(1, p.h / 90));
  const thick = (p.depth ?? 9) + p.lift * 5 * sz;
  const rise = p.lift * 12 * sz;
  ctx.save();
  if (p.alpha !== undefined) ctx.globalAlpha *= Math.max(0, Math.min(1, p.alpha));
  // soft floor shadow: further and blurrier as the card rises
  ctx.save();
  ctx.translate(p.cx + p.tiltX * 6 * sz, p.cy + 14 * sz + rise * 0.9);
  ctx.scale(s, s);
  ctx.shadowColor = `rgba(10,4,30,${0.42 - p.lift * 0.12})`;
  ctx.shadowBlur = (14 + p.lift * 22) * sz;
  ctx.shadowOffsetY = (6 + p.lift * 10) * sz;
  ctx.fillStyle = 'rgba(10,4,30,0.18)';
  roundRect(ctx, -p.w / 2 + 6, -p.h / 2 + 6, p.w - 12, p.h - 8, r);
  ctx.fill();
  ctx.restore();
  // the card itself: an affine fake of a small 3D turn (yaw squeezes x and shears y, pitch the reverse)
  ctx.translate(p.cx, p.cy - rise);
  const yaw = p.tiltX * 0.22;
  const pitch = p.tiltY * 0.16;
  ctx.transform(Math.cos(yaw), Math.sin(yaw) * 0.18, -Math.sin(pitch) * 0.18, Math.cos(pitch), 0, 0);
  ctx.scale(s, s);
  // extruded side, offset down and away from the viewer
  const ox = -p.tiltX * 3;
  ctx.fillStyle = sideColor;
  roundRect(ctx, -p.w / 2 + ox, -p.h / 2 + thick, p.w, p.h, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, -p.w / 2 + ox, -p.h / 2 + thick, p.w, p.h, r);
  ctx.fill();
  const pop = (z: number) => ({ x: p.tiltX * 7 * z, y: p.tiltY * 5 * z - p.lift * 2 * z });
  face(pop);
  ctx.restore();
}

/** A soft glossy sheen that slides across a face as it tilts. Call inside card3d's face, after clipping. */
export function sheen(ctx: CanvasRenderingContext2D, w: number, h: number, tiltX: number, tiltY: number, strength = 0.35): void {
  const gx = -tiltX * w * 0.45;
  const gy = -h / 2 - tiltY * h * 0.3;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.75);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(0.45, `rgba(255,255,255,${strength * 0.25})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
}

/** Ease with a little overshoot, for things popping in. */
export function backOut(k: number, over = 1.7): number {
  const x = Math.max(0, Math.min(1, k)) - 1;
  return 1 + x * x * ((over + 1) * x + over);
}

/** Springs kept per on-screen thing (by a string key), stepped once per frame by wall clock. */
interface Feel {
  lift: Spring;
  tx: Spring;
  ty: Spring;
  press: Spring;
  seen: number;
}
const feels = new Map<string, Feel>();
export function feel(key: string, on: boolean, tiltX = 0, tiltY = 0): Feel {
  const now = performance.now() / 1000;
  let f = feels.get(key);
  if (!f) feels.set(key, (f = { lift: new Spring(on ? 1 : 0, 260, 16), tx: new Spring(0, 140, 15), ty: new Spring(0, 140, 15), press: new Spring(0, 600, 22), seen: now }));
  const dt = Math.min(0.05, Math.max(0, now - f.seen));
  f.seen = now;
  f.lift.target = on ? 1 : 0;
  f.tx.target = tiltX;
  f.ty.target = tiltY;
  f.lift.step(dt);
  f.tx.step(dt);
  f.ty.step(dt);
  f.press.step(dt);
  if (feels.size > 400) for (const [k, v] of feels) if (now - v.seen > 2) feels.delete(k);
  return f;
}
