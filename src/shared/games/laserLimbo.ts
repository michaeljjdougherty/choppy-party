import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, roundRect, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { newBody, type Body } from '../physics';
import { playerChips } from './hud';

/**
 * Laser Limbo (Modular Space Kit): everyone runs up a spiral ramp around a reactor column by
 * themselves; you only dodge. Laser arms sweep down the spiral. Red beams are low: hop them (A).
 * Blue beams are high: duck them (B). Both are quick, fixed moves (no holding), and everything
 * speeds up every 5 seconds, the hop and duck included. One hit and
 * you're out. Last one standing wins.
 */
export const TURNS = 3;
const RUN = 0.0125; // course per second: everyone runs on their own
const SLIDE = 0.04;
const DUCK_TIME = 0.42; // a quick duck, shortened as the game speeds up
const HOP_V = 370; // a low hop that just clears a red beam
const HOP_G = 1400;
const MAX_HITS = 1; // one hit and you're out (Michael prefers one-hit games)
const MAX_T = 80;
const LOW_CLEAR = 34; // jump height needed to clear a low beam
const READY = 3;

export interface Climber extends Body {
  id: string;
  lane: number;
  p: number; // 0 = bottom, 1 = top
  duck: boolean;
  duckT: number;
  hits: number;
  safe: number;
  outAt: number;
  topAt: number;
}
export interface Beam {
  p: number;
  speed: number;
  high: boolean;
  /** Course position where the beam flips low/high (-1 = never). */
  flipAt: number;
  id: number;
}
export interface LaserState {
  t: number;
  rng: Rng;
  spawn: number;
  level: number;
  nextId: number;
  beams: Beam[];
  folk: Climber[];
  zaps: { id: string; high: boolean }[];
}

const racing = (s: LaserState) => s.folk.filter((f) => f.outAt < 0 && f.topAt < 0);

export const laserLimbo: Minigame<LaserState> = {
  id: 'laser-limbo',
  name: 'Laser Limbo',
  mode: 'Free-for-all',
  blurb: 'You run up the reactor on your own. Red lasers are low: hop them. Blue lasers are high: duck them. It all speeds up every 5 seconds. One hit and you are out. Last one standing wins!',
  controls: 'A: hop   B: duck (quick taps)',
  minPlayers: 1,
  maxPlayers: 10,
  ready: READY,

  setup(players: PlayerInfo[], seed: number): LaserState {
    return {
      t: 0,
      rng: { seed },
      spawn: READY + 0.6,
      level: 0,
      nextId: 0,
      beams: [],
      zaps: [],
      folk: players.map((p, i) => ({ id: p.id, lane: i, p: 0, duck: false, duckT: 0, hits: 0, safe: 0, outAt: -1, topAt: -1, ...newBody() })),
    };
  },

  step(s: LaserState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.zaps = [];
    if (s.t < READY) return;
    s.level = Math.floor((s.t - READY) / 5);
    const speedUp = Math.pow(1.13, s.level);
    s.spawn -= dt;
    if (s.spawn <= 0) {
      s.spawn = Math.max(0.75, 2.3 / Math.sqrt(speedUp));
      const pair = s.level >= 4 && rand(s.rng) < 0.35;
      const make = (offset: number) => {
        const flip = s.level >= 6 && rand(s.rng) < 0.3;
        s.beams.push({ p: 1.06 + offset, speed: 0.11 * speedUp, high: rand(s.rng) < 0.5, flipAt: flip ? randRange(s.rng, 0.2, 0.8) : -1, id: s.nextId++ });
      };
      make(0);
      if (pair) make(0.07);
    }
    const before = new Map(s.folk.map((f) => [f.id, f.p]));
    // the hop and duck speed up with everything else (same height, less time)
    const k = Math.sqrt(speedUp);
    for (const f of s.folk) {
      if (f.z > 0 || f.vz > 0) {
        f.z += f.vz * dt;
        f.vz -= HOP_G * k * k * dt;
        if (f.z <= 0) {
          f.z = 0;
          f.vz = 0;
        }
      }
      if (f.outAt >= 0 || f.topAt >= 0) continue;
      const inp = inputs[f.id] ?? NO_INPUT;
      f.safe = Math.max(0, f.safe - dt);
      f.duckT = Math.max(0, f.duckT - dt);
      const grounded = f.z <= 0.01 && f.vz <= 0;
      if (inp.bPressed && grounded && f.duckT <= 0) f.duckT = DUCK_TIME / k;
      else if (inp.aPressed && grounded && f.duckT <= 0) f.vz = HOP_V * k;
      f.duck = f.duckT > 0;
      f.p = Math.min(0.97, f.p + RUN * dt);
    }
    for (const b of s.beams) {
      const was = b.p;
      b.p -= b.speed * dt;
      if (b.flipAt >= 0 && was > b.flipAt && b.p <= b.flipAt) b.high = !b.high;
      for (const f of s.folk) {
        if (f.outAt >= 0 || f.topAt >= 0 || f.safe > 0) continue;
        const fp0 = before.get(f.id)!;
        // the beam crossed this climber if their order on the course swapped this tick
        if (was - fp0 >= 0 && b.p - f.p < 0) {
          const dodged = b.high ? f.duck : f.z > LOW_CLEAR;
          if (dodged) continue;
          f.hits++;
          f.safe = 0.9;
          f.p = Math.max(0, f.p - SLIDE);
          f.duckT = 0;
          s.zaps.push({ id: f.id, high: b.high });
          if (f.hits >= MAX_HITS) f.outAt = s.t;
        }
      }
    }
    // never a wipe-out: if the last ones climbing all get zapped together, they shake it off and keep going
    if (s.folk.length > 1 && s.folk.every((f) => f.outAt >= 0 || f.topAt >= 0) && s.folk.some((f) => f.outAt === s.t) && !s.folk.some((f) => f.topAt >= 0)) {
      for (const f of s.folk) if (f.outAt === s.t) {
        f.outAt = -1;
        f.hits = MAX_HITS - 1;
      }
    }
    s.beams = s.beams.filter((b) => b.p > -0.08);
  },

  isOver(s) {
    const alive = racing(s).length;
    return s.t >= MAX_T + READY || alive === 0 || (s.folk.length > 1 && alive <= 1);
  },

  results(s): ResultRow[] {
    return s.folk
      .map((f) => ({
        id: f.id,
        // survivors first (fewest hits), then whoever lasted longest
        value: f.outAt < 0 ? 100000 - f.hits * 1000 + Math.round(f.p * 100) : Math.round(f.outAt * 100),
        label: f.outAt < 0 ? `Survived! ${'♥'.repeat(MAX_HITS - f.hits)}` : `Out at ${Math.max(0, f.outAt - READY).toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T + READY - s.t);
    playerChips(
      ctx,
      players,
      s.folk.map((f) => ({ id: f.id, label: f.outAt >= 0 ? 'OUT' : '♥'.repeat(MAX_HITS - f.hits), out: f.outAt >= 0 })),
    );
    // climb meter on the right edge
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 1222, 120, 30, 520, 15);
    ctx.fill();
    for (const f of s.folk) {
      const p = players.find((q) => q.id === f.id);
      if (!p) continue;
      ctx.globalAlpha = f.outAt >= 0 ? 0.35 : 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(1237, 630 - f.p * 500, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.t > READY && s.level > 0 && (s.t - READY) % 5 < 1.2) text(ctx, 'Faster!', 640, 110, 40, { color: '#ff5a5f' });
  },
};
