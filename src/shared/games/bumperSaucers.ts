import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, type BotCtx } from '../botkit';

/**
 * Bumper Saucers (Space Kit): UFO bumper cars on a round platform floating in space. The platform tips
 * toward whichever side carries the most saucers, and everything slides downhill. Hold A to charge a
 * bump, let go to dash. Slide off the edge and you're out (one hit, one fall). Last saucer flying wins.
 * After a while the platform starts to shrink so it always ends near the minute.
 */
const READY = 3;
const R = 26; // saucer radius
const SPEED = 230;
const ACCEL = 520;
const SLIDE = 110; // downhill pull at full tilt
const CHARGE_T = 0.9;
const DASH = 540;
/** Speed above cruising bleeds off this fast (per second) so a bump is a shove, not a launch. */
const DRAG = 2.4;
const KICK = 190;
const MAX_V = 600;
const SHRINK_AT = 28;
const SHRINK_RATE = 8; // px per second
export const CX = 640;
export const CY = 400;
export const discR = (n: number) => Math.min(330, 200 + n * 13);

export interface Saucer {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  charge: number; // 0..1 while A is held
  dash: number; // seconds of dash left
  /** Seconds before another charge can start. */
  cool: number;
  out: boolean;
  outAt: number;
  /** Falling animation: how far it has dropped since leaving the platform. */
  fall: number;
  bumps: number;
  lastHit: string | null;
}
export interface SaucerState {
  t: number;
  rng: Rng;
  r: number; // current platform radius
  r0: number;
  tiltX: number; // -1..1, which way the platform tips
  tiltY: number;
  saucers: Saucer[];
  bonks: { x: number; y: number; hard: boolean }[]; // this tick, for the view
  falls: string[];
  endAt?: number;
}

export const bumperSaucers: Minigame<SaucerState> = {
  id: 'bumper-saucers',
  name: 'Bumper Saucers',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'BUMP!',
  blurb: 'Bumper cars, but UFOs, on a platform in space! It tips toward the crowd, so watch the slope. Hold A to charge, let go to dash into someone. Fall off and you’re out. Last saucer flying wins!',
  controls: 'Stick: fly   Hold A: charge   Release A: dash',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): SaucerState {
    const n = players.length;
    const r = discR(n);
    return {
      t: 0,
      rng: { seed },
      r,
      r0: r,
      tiltX: 0,
      tiltY: 0,
      bonks: [],
      falls: [],
      saucers: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const d = r * 0.6;
        return { id: p.id, x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, vx: 0, vy: 0, face: a + Math.PI, charge: 0, dash: 0, cool: 0, out: false, outAt: 0, fall: 0, bumps: 0, lastHit: null };
      }),
    };
  },

  step(s: SaucerState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.bonks = [];
    s.falls = [];
    for (const u of s.saucers) if (u.out) u.fall += dt;
    if (s.t < READY || s.endAt !== undefined) return;
    const live = s.saucers.filter((u) => !u.out);
    if (s.t > READY + SHRINK_AT) s.r = Math.max(110, s.r - SHRINK_RATE * dt);
    // the platform tips toward the weight
    let mx = 0, my = 0;
    for (const u of live) {
      mx += (u.x - CX) / s.r;
      my += (u.y - CY) / s.r;
    }
    const k = live.length ? 1 / Math.max(2, live.length * 0.7) : 0;
    const tx = Math.max(-1, Math.min(1, mx * k)), ty = Math.max(-1, Math.min(1, my * k));
    s.tiltX += (tx - s.tiltX) * Math.min(1, dt * 1.6);
    s.tiltY += (ty - s.tiltY) * Math.min(1, dt * 1.6);
    for (const u of live) {
      const inp = inputs[u.id] ?? NO_INPUT;
      u.dash = Math.max(0, u.dash - dt);
      u.cool = Math.max(0, u.cool - dt);
      if (inp.a && u.cool <= 0 && u.dash <= 0) {
        u.charge = Math.min(1, u.charge + dt / CHARGE_T);
      } else if (u.charge > 0) {
        // let go: dash the way you're facing (or steering)
        const m = Math.hypot(inp.x, inp.y);
        if (m > 0.3) u.face = Math.atan2(inp.y, inp.x);
        const p = 0.35 + u.charge * 0.65;
        u.vx = Math.cos(u.face) * DASH * p;
        u.vy = Math.sin(u.face) * DASH * p;
        u.dash = 0.16 + u.charge * 0.14;
        u.charge = 0;
        u.cool = 1.5;
      }
      const slow = u.charge > 0 ? 0.4 : 1;
      if (u.dash <= 0) {
        const m = Math.min(1, Math.hypot(inp.x, inp.y));
        if (m > 0.2) u.face = Math.atan2(inp.y, inp.x);
        const tvx = m > 0.2 ? Math.cos(u.face) * SPEED * m * slow : 0;
        const tvy = m > 0.2 ? Math.sin(u.face) * SPEED * m * slow : 0;
        const a = ACCEL * dt;
        u.vx += Math.max(-a, Math.min(a, tvx - u.vx));
        u.vy += Math.max(-a, Math.min(a, tvy - u.vy));
        const sp = Math.hypot(u.vx, u.vy);
        if (sp > SPEED) {
          const k2 = Math.max(SPEED / sp, Math.exp(-DRAG * dt));
          u.vx *= k2;
          u.vy *= k2;
        }
      }
      // downhill slide
      u.vx += s.tiltX * SLIDE * dt;
      u.vy += s.tiltY * SLIDE * dt;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
    }
    // bumps: a dashing saucer hits much harder
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const ov = R * 2 - d;
        a.x -= nx * ov * 0.5;
        a.y -= ny * ov * 0.5;
        b.x += nx * ov * 0.5;
        b.y += ny * ov * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        // a fairly bouncy bump; a dash adds a kick to whoever got hit (two dashes just cancel out)
        const imp = rel * 0.9;
        const ad = a.dash > 0, bd = b.dash > 0;
        const ka = ad && !bd ? 0.5 : 1, kb = bd && !ad ? 0.5 : 1;
        const kick = ad !== bd ? KICK : 0;
        a.vx -= nx * (imp * ka + (bd ? kick : 0));
        a.vy -= ny * (imp * ka + (bd ? kick : 0));
        b.vx += nx * (imp * kb + (ad ? kick : 0));
        b.vy += ny * (imp * kb + (ad ? kick : 0));
        for (const u of [a, b]) {
          const sp = Math.hypot(u.vx, u.vy);
          if (sp > MAX_V) {
            u.vx *= MAX_V / sp;
            u.vy *= MAX_V / sp;
          }
        }
        a.lastHit = b.id;
        b.lastHit = a.id;
        if (a.dash > 0) a.bumps++;
        if (b.dash > 0) b.bumps++;
        s.bonks.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hard: rel > 300 });
      }
    for (const u of live) {
      if (Math.hypot(u.x - CX, u.y - CY) > s.r + R * 0.3) {
        u.out = true;
        u.outAt = s.t;
        s.falls.push(u.id);
      }
    }
    const left = s.saucers.filter((u) => !u.out);
    if (left.length <= 1 && s.saucers.length > 1) s.endAt = s.t;
    if (s.saucers.length === 1 && left.length === 0) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.2,

  results(s): ResultRow[] {
    return s.saucers
      .map((u) => ({ id: u.id, value: u.out ? u.outAt : 9999, label: u.out ? `Fell at ${(u.outAt - READY).toFixed(1)}s` : 'Last saucer flying!' }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.saucers.map((u) => ({ id: u.id, label: u.out ? 'OUT' : 'flying', out: u.out })));
    if (s.t > READY + SHRINK_AT && s.endAt === undefined && s.t < READY + SHRINK_AT + 2.5) text(ctx, 'The platform is shrinking!', 640, 150, 36, { color: '#7cf3ff' });
  },

  bot(s, id, k: BotCtx) {
    const me = s.saucers.find((u) => u.id === id);
    if (!me || me.out || s.t < READY) return NO_INPUT;
    const others = s.saucers.filter((u) => !u.out && u.id !== id);
    const dc = Math.hypot(me.x - CX, me.y - CY);
    // too close to the edge, or the slope is pulling us off: head back uphill / to the middle
    const edge = dc > s.r * (0.72 - k.sk.sense * 0.22) || (dc > s.r * 0.45 && Math.hypot(me.vx, me.vy) > 200 && (me.vx * (me.x - CX) + me.vy * (me.y - CY)) > 0 && me.dash <= 0);
    let gx = CX - me.x - s.tiltX * 160 * k.sk.sense;
    let gy = CY - me.y - s.tiltY * 160 * k.sk.sense;
    if (edge || !others.length) {
      const m = Math.hypot(gx, gy) || 1;
      return stick(gx / m, gy / m);
    }
    // otherwise go for the nearest rival who is closer to the edge than we are, charging on the way
    let tgt = others[0], best = Infinity;
    for (const o of others) {
      const d = Math.hypot(o.x - me.x, o.y - me.y) - Math.hypot(o.x - CX, o.y - CY) * 0.5;
      if (d < best) {
        best = d;
        tgt = o;
      }
    }
    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    const d = Math.hypot(dx, dy) || 1;
    // push them outward: aim at the far side of them from the centre
    gx = dx / d;
    gy = dy / d;
    const wob = (rand(k.r) * 2 - 1) * k.sk.wobble;
    const ax = gx * Math.cos(wob) - gy * Math.sin(wob), ay = gx * Math.sin(wob) + gy * Math.cos(wob);
    const holding = me.charge > 0;
    const close = d < 150 && dc < s.r * 0.6;
    if (close && holding && me.charge > 0.5) return stick(ax, ay, false); // release: dash
    if (holding) return { ...stick(ax * 0.6, ay * 0.6), a: true };
    if (me.cool <= 0 && d < 260 && rand(k.r) < 0.03 + k.sk.smart * 0.04) return { ...stick(ax * 0.6, ay * 0.6), a: true };
    // not ready to strike: circle the rival at a distance instead of ramming
    if (d < 170) return stick(-ay * 0.8 - ax * 0.3, ax * 0.8 - ay * 0.3);
    return stick(ax * 0.7, ay * 0.7);
  },
};
