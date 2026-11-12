import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, type BotCtx } from '../botkit';

/**
 * Mine Cart Mayhem (Train Kit, canyon race): everyone rides a mine cart down a twisting track in side by
 * side lanes. Lean into each curve (stick toward the turn) to keep your speed. Lean the wrong way, or not
 * at all on a sharp bend, and the cart tips up on two wheels; tip too far and you derail for 2 seconds.
 * Gaps in the track need a hop (A) at the right moment. First to the station wins; when time runs out,
 * the rest rank by distance. Fall too far behind the pack and the dust swallows you: you're out.
 */
const READY = 3;
const LIMIT = 58;
export const TRACK = 23000;
const TOP = 640;
const ACCEL = 260;
const HOP = 560;
const GRAV = 1500;
const DERAIL = 2;
export const GAP_LEN = 170;
/** Fall this far behind the leader (after the first few seconds) and you're out (Michael: no hopeless stragglers). */
export const BEHIND = 2600;
const GRACE = 6;
/** How hard the track turns per px at curvature 1 (radians). */
export const TURN = Math.PI / 2 / 650;

export interface Seg {
  start: number;
  len: number;
  /** -1..1: left/right bend (0 = straight). */
  c: number;
  gap: boolean;
}
export interface Cart {
  id: string;
  lane: number;
  d: number; // distance along the track
  v: number;
  z: number;
  vz: number;
  lean: number; // -1..1, smoothed stick
  tip: number; // 0..1, 1 = derail
  derail: number; // seconds left off the rails
  finish: number; // race time, -1 while racing
  crashes: number;
  /** Race time they fell too far behind and were knocked out (-1 = still in). Optional for old snapshots. */
  out?: number;
}
export interface CartState {
  t: number;
  rng: Rng;
  lanes: number;
  segs: Seg[];
  carts: Cart[];
  /** This tick's events, for the view. */
  derails: string[];
  hops: string[];
  endAt?: number;
}

export function segAt(s: CartState, d: number): Seg {
  for (const g of s.segs) if (d < g.start + g.len) return g;
  return s.segs[s.segs.length - 1];
}
/** Curvature `ahead` px further down the track. */
export const curveAt = (s: CartState, d: number) => segAt(s, d).c;

export const mineCart: Minigame<CartState> = {
  id: 'mine-cart-mayhem',
  name: 'Mine Cart Mayhem',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'ROLL!',
  blurb: 'Race mine carts down a twisting canyon track! Lean into every bend with the stick to keep your speed. Lean the wrong way and the cart tips; tip too far and you derail. Press A to hop the gaps. First to the station wins!',
  controls: 'Stick: lean   A: hop the gaps',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CartState {
    const rng = { seed };
    const segs: Seg[] = [];
    let d = 0;
    const add = (len: number, c: number, gap = false) => {
      segs.push({ start: d, len, c, gap });
      d += len;
    };
    add(900, 0);
    let side = rand(rng) < 0.5 ? -1 : 1;
    while (d < TRACK - 800) {
      const r = rand(rng);
      if (r < 0.2) {
        add(randRange(rng, 300, 500), 0);
        add(GAP_LEN, 0, true);
        add(randRange(rng, 300, 450), 0);
      } else if (r < 0.75) {
        // a bend: gentle or sharp, switching sides often (S-bends)
        const sharp = rand(rng) < 0.55;
        add(randRange(rng, sharp ? 380 : 520, sharp ? 560 : 820), side * (sharp ? randRange(rng, 0.75, 1) : randRange(rng, 0.3, 0.5)));
        if (rand(rng) < 0.65) side = -side;
      } else add(randRange(rng, 400, 800), 0);
    }
    add(TRACK - d + 1200, 0);
    const n = players.length;
    return {
      t: 0,
      rng,
      lanes: n,
      segs,
      derails: [],
      hops: [],
      carts: players.map((p, i) => ({ id: p.id, lane: i, d: 0, v: 0, z: 0, vz: 0, lean: 0, tip: 0, derail: 0, finish: -1, crashes: 0 })),
    };
  },

  step(s: CartState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.derails = [];
    s.hops = [];
    if (s.t < READY || s.endAt !== undefined) return;
    const race = s.t - READY;
    const lead = Math.min(TRACK, Math.max(...s.carts.filter((c) => (c.out ?? -1) < 0).map((c) => c.d)));
    for (const c of s.carts) {
      if ((c.out ?? -1) >= 0) {
        c.v = 0;
        continue;
      }
      if (c.finish < 0 && race > GRACE && lead - c.d > BEHIND) {
        c.out = race;
        c.v = 0;
        s.derails.push(c.id);
        continue;
      }
      if (c.finish >= 0) {
        c.v = Math.max(0, c.v - 500 * dt);
        c.d += c.v * dt;
        continue;
      }
      const inp = inputs[c.id] ?? NO_INPUT;
      if (c.derail > 0) {
        c.derail -= dt;
        c.v = 0;
        c.tip = 0;
        c.lean = 0;
        continue;
      }
      c.lean += (Math.max(-1, Math.min(1, inp.x)) - c.lean) * Math.min(1, dt * 10);
      const g = segAt(s, c.d);
      const bend = Math.abs(g.c);
      const right = bend > 0.2 && Math.sign(c.lean) === Math.sign(g.c) && Math.abs(c.lean) > 0.35;
      // speed: bends cost speed unless you lean into them
      const top = TOP * (bend > 0.2 && !right ? 1 - bend * 0.45 : 1);
      c.v += Math.max(-900 * dt, Math.min(ACCEL * dt, top - c.v));
      // tipping: wrong lean (or none) on a sharp bend tips you; leaning right settles you
      if (bend >= 0.6 && !right && c.z <= 0) c.tip += dt * (Math.sign(c.lean) === -Math.sign(g.c) && Math.abs(c.lean) > 0.35 ? 1.6 : 0.85) * bend;
      else c.tip = Math.max(0, c.tip - dt * 1.4);
      if (inp.aPressed && c.z <= 0) {
        c.vz = HOP;
        s.hops.push(c.id);
      }
      if (c.z > 0 || c.vz > 0) {
        c.vz -= GRAV * dt;
        c.z = Math.max(0, c.z + c.vz * dt);
        if (c.z <= 0) c.vz = 0;
      }
      c.d += c.v * dt;
      const crash = (why: 'tip' | 'gap') => {
        c.derail = DERAIL;
        c.crashes++;
        c.tip = 0;
        s.derails.push(c.id);
        // fell into a gap: put back on the far side
        if (why === 'gap') {
          const gg = segAt(s, c.d);
          c.d = gg.start + gg.len + 10;
        }
      };
      if (c.tip >= 1) crash('tip');
      else if (segAt(s, c.d).gap && c.z <= 0) crash('gap');
      if (c.d >= TRACK) c.finish = race;
    }
    if (s.carts.every((c) => c.finish >= 0 || (c.out ?? -1) >= 0) || race >= LIMIT) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    return s.carts
      .map((c) => (c.finish >= 0 ? { id: c.id, value: 100000 - Math.round(c.finish * 100), label: `${c.finish.toFixed(2)}s` } : (c.out ?? -1) >= 0 ? { id: c.id, value: Math.round(c.out! * 10), label: `Left behind at ${Math.round((c.d / TRACK) * 100)}%` } : { id: c.id, value: 5000 + Math.round(c.d / 10), label: `${Math.round((c.d / TRACK) * 100)}% of the way` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + LIMIT - s.t);
    const lead = Math.min(TRACK, Math.max(...s.carts.filter((c) => (c.out ?? -1) < 0).map((c) => c.d)));
    playerChips(
      ctx,
      players,
      s.carts.map((c) => {
        const gone = (c.out ?? -1) >= 0;
        const behind = !gone && c.finish < 0 && s.t - READY > GRACE && lead - c.d > BEHIND * 0.6;
        return { id: c.id, label: c.finish >= 0 ? `${c.finish.toFixed(1)}s` : gone ? 'LEFT BEHIND' : c.derail > 0 ? 'DERAILED' : behind ? 'CATCH UP!' : `${Math.min(99, Math.round((c.d / TRACK) * 100))}%`, hot: c.tip > 0.5 || behind, out: gone || c.derail > 0 };
      }),
    );
    if (s.t > READY && s.endAt === undefined && segAt(s, lead + 500).gap && !segAt(s, lead).gap) text(ctx, 'GAP AHEAD: hop with A!', 640, 150, 32, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const c = s.carts.find((q) => q.id === id);
    if (!c || s.t < READY || c.finish >= 0 || c.derail > 0) return NO_INPUT;
    // lean for the bend we'll be on after our reaction time
    const react = k.level === 'hard' ? 0.05 : k.level === 'normal' ? 0.18 : 0.42;
    const look = c.d + c.v * react;
    const cv = curveAt(s, look);
    const lean = Math.abs(cv) > 0.2 ? Math.sign(cv) : 0;
    // hop just before a gap: hard bots time it well, easy ones are sloppy
    let hop = false;
    const g = segAt(s, c.d + 40);
    const next = s.segs.find((q) => q.gap && q.start > c.d);
    if (next && c.z <= 0) {
      const dist = next.start - c.d;
      if (k.mem.n !== next.start) {
        k.mem.n = next.start;
        k.mem.m = (rand(k.r) * 2 - 1) * (k.level === 'hard' ? 20 : k.level === 'normal' ? 60 : 150);
      }
      if (dist < 70 + k.mem.m + c.v * 0.05) hop = true;
    }
    void g;
    return stick(lean, 0, hop);
  },
};
