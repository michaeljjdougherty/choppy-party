import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, roundRect, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { jump, newBody, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';

/**
 * Laser Limbo (Modular Space Kit): everyone races up a spiral ramp around a reactor column.
 * Laser arms sweep down the spiral. Red beams are low: jump them (A). Blue beams are high: duck
 * them (hold B). The beams speed up every 5 seconds. A hit slides you back down; the third hit
 * knocks you out. First to the top wins; otherwise the highest climber does.
 */
export const TURNS = 3;
const CLIMB = 0.034; // course per second at full stick
const SLIDE = 0.07;
const MAX_HITS = 3;
const MAX_T = 60;
const LOW_CLEAR = 34; // jump height needed to clear a low beam
const READY = 3;

export interface Climber extends Body {
  id: string;
  lane: number;
  p: number; // 0 = bottom, 1 = top
  duck: boolean;
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
  blurb: 'Race up the reactor! Red lasers are low: jump them. Blue lasers are high: duck them. They get faster every 5 seconds. Three hits and you are out!',
  controls: 'Stick up: climb   A: jump   B: duck',
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
      folk: players.map((p, i) => ({ id: p.id, lane: i, p: 0, duck: false, hits: 0, safe: 0, outAt: -1, topAt: -1, ...newBody() })),
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
    for (const f of s.folk) {
      stepVertical(f, dt);
      if (f.outAt >= 0 || f.topAt >= 0) continue;
      const inp = inputs[f.id] ?? NO_INPUT;
      f.safe = Math.max(0, f.safe - dt);
      f.duck = inp.b && f.z <= 0.01;
      if (inp.aPressed && !f.duck) jump(f);
      const push = Math.max(0, -inp.y, Math.abs(inp.x) > 0.5 ? 0.6 : 0);
      if (!f.duck) f.p += CLIMB * Math.min(1, push) * dt;
      if (f.p >= 1) {
        f.p = 1;
        f.topAt = s.t;
      }
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
          f.vz = 300;
          s.zaps.push({ id: f.id, high: b.high });
          if (f.hits >= MAX_HITS) f.outAt = s.t;
        }
      }
    }
    s.beams = s.beams.filter((b) => b.p > -0.08);
  },

  isOver(s) {
    return s.t >= MAX_T + READY || racing(s).length === 0 || s.folk.some((f) => f.topAt >= 0);
  },

  results(s): ResultRow[] {
    return s.folk
      .map((f) => ({
        id: f.id,
        value: f.topAt >= 0 ? 100000 - Math.round(f.topAt * 100) : Math.round(f.p * 10000) - (f.outAt >= 0 ? 0 : 0),
        label: f.topAt >= 0 ? 'Reached the top!' : `${Math.round(f.p * 100)}% up${f.outAt >= 0 ? ' (knocked out)' : ''}`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T + READY - s.t);
    playerChips(
      ctx,
      players,
      s.folk.map((f) => ({ id: f.id, label: f.outAt >= 0 ? 'OUT' : `${Math.round(f.p * 100)}% ${'✕'.repeat(f.hits)}`, out: f.outAt >= 0 })),
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
