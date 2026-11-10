import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';
import { hearts, playerChips } from './hud';

/**
 * Snowball Scramble (Holiday Kit): a snowy village square with snow forts to hide behind.
 * Throw snowballs (A) the way you're facing; forts stop them. Three hits and you're out.
 * Jumping (B) hops over a low throw. Last one standing, or most hearts at the bell, wins.
 */
export const SX0 = 120, SX1 = 1160, SY0 = 150, SY1 = 670;
const R = 22;
const SPEED = 280;
const BALL_SPEED = 620;
const BALL_LIFE = 1.1;
const THROW_CD = 0.55;
const HEARTS = 3;
const MAX_T = 60;
/** Snow fort walls: x, y, half width, half height. */
export const FORTS: [number, number, number, number][] = [
  [380, 300, 70, 18], [900, 300, 70, 18], [640, 410, 18, 60], [380, 540, 70, 18], [900, 540, 70, 18], [240, 410, 18, 40], [1040, 410, 18, 40],
];

export interface Thrower extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  hearts: number;
  cd: number;
  safe: number;
  outAt: number;
  hits: number;
}
export interface Snowball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  by: string;
}
export interface SnowState {
  t: number;
  rng: Rng;
  folk: Thrower[];
  balls: Snowball[];
  splats: { x: number; y: number; hit: boolean }[];
  throws: { x: number; y: number }[];
}

const live = (s: SnowState) => s.folk.filter((f) => f.outAt < 0);

export function fortAt(x: number, y: number, pad = 0): boolean {
  return FORTS.some(([fx, fy, hw, hh]) => Math.abs(x - fx) < hw + pad && Math.abs(y - fy) < hh + pad);
}

export const snowballScramble: Minigame<SnowState> = {
  id: 'snowball-scramble',
  name: 'Snowball Scramble',
  mode: 'Free-for-all',
  blurb: 'Snowball fight! Throw the way you face and duck behind the snow forts. Jump to hop over a throw. Three hits and you are out!',
  controls: 'Stick: move   A: throw   B: jump',
  minPlayers: 2,
  maxPlayers: 10,
  ready: 3,

  setup(players: PlayerInfo[], seed: number): SnowState {
    const n = players.length;
    return {
      t: 0,
      rng: { seed },
      balls: [],
      splats: [],
      throws: [],
      folk: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2 + 0.3;
        return {
          id: p.id,
          x: 640 + Math.cos(a) * 430,
          y: 410 + Math.sin(a) * 210,
          face: a + Math.PI,
          hearts: HEARTS,
          cd: 0,
          safe: 0,
          outAt: -1,
          hits: 0,
          ...newBody(),
        };
      }),
    };
  },

  step(s: SnowState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.splats = [];
    s.throws = [];
    if (s.t < 3) return;
    for (const f of s.folk) {
      if (f.outAt >= 0) {
        stepVertical(f, dt);
        continue;
      }
      const inp = inputs[f.id] ?? NO_INPUT;
      f.cd = Math.max(0, f.cd - dt);
      f.safe = Math.max(0, f.safe - dt);
      steer(f, inp.x, inp.y, SPEED, dt);
      if (inp.bPressed) jump(f);
      stepVertical(f, dt);
      const nx = f.x + f.vx * dt;
      const ny = f.y + f.vy * dt;
      if (!fortAt(nx, f.y, R)) f.x = nx;
      else f.vx = 0;
      if (!fortAt(f.x, ny, R)) f.y = ny;
      else f.vy = 0;
      f.x = Math.max(SX0 + R, Math.min(SX1 - R, f.x));
      f.y = Math.max(SY0 + R, Math.min(SY1 - R, f.y));
      if (Math.hypot(inp.x, inp.y) > 0.3) f.face = Math.atan2(inp.y, inp.x);
      if (inp.aPressed && f.cd === 0) {
        f.cd = THROW_CD;
        const dx = Math.cos(f.face);
        const dy = Math.sin(f.face);
        s.balls.push({ x: f.x + dx * (R + 8), y: f.y + dy * (R + 8), vx: dx * BALL_SPEED, vy: dy * BALL_SPEED, life: BALL_LIFE, by: f.id });
        s.throws.push({ x: f.x, y: f.y });
      }
    }
    for (let i = 0; i < s.folk.length; i++)
      for (let j = i + 1; j < s.folk.length; j++) if (s.folk[i].outAt < 0 && s.folk[j].outAt < 0) bump(s.folk[i], s.folk[j], R);
    for (const b of s.balls) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (fortAt(b.x, b.y, 6) || b.x < SX0 || b.x > SX1 || b.y < SY0 || b.y > SY1) {
        b.life = 0;
        s.splats.push({ x: b.x, y: b.y, hit: false });
        continue;
      }
      for (const f of s.folk) {
        if (f.outAt >= 0 || f.id === b.by || f.safe > 0 || f.z > 40) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) < R + 10) {
          b.life = 0;
          f.hearts--;
          f.safe = 1;
          f.vx += b.vx * 0.45;
          f.vy += b.vy * 0.45;
          f.vz = 320;
          s.splats.push({ x: b.x, y: b.y, hit: true });
          const thrower = s.folk.find((q) => q.id === b.by);
          if (thrower) thrower.hits++;
          if (f.hearts <= 0) {
            f.outAt = s.t;
            f.vz = 700;
          }
          break;
        }
      }
    }
    s.balls = s.balls.filter((b) => b.life > 0);
  },

  isOver(s) {
    const n = live(s).length;
    return s.t >= MAX_T + 3 || n === 0 || (s.folk.length > 1 && n <= 1);
  },

  results(s): ResultRow[] {
    return s.folk
      .map((f) => ({
        id: f.id,
        value: f.outAt < 0 ? 10000 + f.hearts * 100 + f.hits : Math.round(f.outAt * 10),
        label: f.outAt < 0 ? `${f.hearts} ${f.hearts === 1 ? 'heart' : 'hearts'} left, ${f.hits} hits` : `Snowed under at ${(f.outAt - 3).toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T + 3 - s.t);
    playerChips(ctx, players, s.folk.map((f) => ({ id: f.id, label: f.outAt >= 0 ? 'OUT' : hearts(f.hearts), out: f.outAt >= 0 })));
    if (s.t > 3 && s.t < 5) text(ctx, 'Snowball fight!', 640, 110, 40, { color: '#bfe9ff' });
  },
};
