import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';

/**
 * Lantern Hunt (Graveyard Kit), 1-vs-many. The keeper stands at the crypt door and sweeps a lantern
 * beam across the graveyard. Sneakers creep up from the gate to the crypt. Anyone caught moving
 * in the light is sent back to the gate. Hold B to freeze: a frozen sneaker in the beam isn't seen.
 * Sneakers score by reaching the crypt (sooner is better); the keeper scores per catch.
 */
export const LX0 = 140, LX1 = 1140, LY0 = 140, LY1 = 680;
export const KEEPER = { x: 640, y: 190 };
export const CRYPT_Y = 230;
export const BEAM_LEN = 420;
export const BEAM_HALF = 0.3; // radians
const R = 20;
const SPEED = 110;
const TURN = 1.4; // keeper turn speed, rad/s
const MAX_T = 55;
export const BREATH = 2.5;
export const SPOT_T = 0.25;
const SEND_BACK = 300;
/** Gravestones to dodge behind (just obstacles). */
export const STONES: [number, number][] = [
  [330, 360], [520, 330], [760, 330], [950, 360], [420, 470], [640, 450], [860, 470], [280, 560], [540, 570], [740, 570], [1000, 560],
];

export interface Sneaker extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  keeper: boolean;
  frozen: boolean;
  caught: number; // flash timer after a catch
  safe: number; // grace time back at the gate
  /** Seconds of freeze left: you can only hold still so long before you have to breathe. */
  breath: number;
  /** How long they've been moving in the light; caught at SPOT_T. */
  seen: number;
  catches: number;
  /** Time they reached the crypt, -1 if not yet. */
  inAt: number;
  startX: number;
}
export interface LanternState {
  t: number;
  rng: Rng;
  angle: number; // beam direction (0 = +x); starts pointing down
  folk: Sneaker[];
  caughtNow: { x: number; y: number }[];
}

export function inBeam(s: LanternState, x: number, y: number): boolean {
  const dx = x - KEEPER.x;
  const dy = y - KEEPER.y;
  const d = Math.hypot(dx, dy);
  if (d > BEAM_LEN || d < 30) return false;
  let da = Math.atan2(dy, dx) - s.angle;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) < BEAM_HALF;
}

export const lanternHunt: Minigame<LanternState> = {
  id: 'lantern-hunt',
  name: 'Lantern Hunt',
  mode: '1-vs-many',
  blurb: "Sneak up to the crypt! The keeper sweeps a lantern across the graves. Move in the light and you're sent back. Hold B to freeze and stay unseen, but only while your breath lasts.",
  controls: 'Stick: move / aim lantern   B: freeze',
  minPlayers: 3,
  maxPlayers: 10,
  ready: 3,

  setup(players: PlayerInfo[], seed: number): LanternState {
    const rng = { seed };
    const k = Math.floor(rand(rng) * players.length);
    const others = players.filter((_, i) => i !== k);
    return {
      t: 0,
      rng,
      angle: Math.PI / 2,
      caughtNow: [],
      folk: players.map((p, i) => {
        const keeper = i === k;
        const oi = others.findIndex((q) => q.id === p.id);
        const x = keeper ? KEEPER.x : LX0 + 80 + ((LX1 - LX0 - 160) * (oi + 0.5)) / Math.max(1, others.length);
        return {
          id: p.id,
          x,
          y: keeper ? KEEPER.y : LY1 - 40,
          face: keeper ? Math.PI / 2 : -Math.PI / 2,
          keeper,
          frozen: false,
          caught: 0,
          safe: 0,
          breath: BREATH,
          seen: 0,
          catches: 0,
          inAt: -1,
          startX: x,
          ...newBody(),
        };
      }),
    };
  },

  step(s: LanternState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.caughtNow = [];
    if (s.t < 3) return;
    const keeper = s.folk.find((f) => f.keeper)!;
    const kin = inputs[keeper.id] ?? NO_INPUT;
    // the keeper swings the lantern toward the stick (left/right also turns it)
    if (Math.hypot(kin.x, kin.y) > 0.3) {
      const want = kin.y < -0.2 && Math.abs(kin.x) < 0.3 ? s.angle : Math.atan2(Math.max(0.05, kin.y), kin.x);
      let da = want - s.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      s.angle += Math.max(-TURN * dt, Math.min(TURN * dt, da));
    }
    s.angle = Math.max(0.12, Math.min(Math.PI - 0.12, s.angle));
    keeper.face = s.angle;

    for (const f of s.folk) {
      if (f.keeper || f.inAt >= 0) continue;
      const inp = inputs[f.id] ?? NO_INPUT;
      f.caught = Math.max(0, f.caught - dt);
      f.safe = Math.max(0, f.safe - dt);
      f.frozen = inp.b && f.caught === 0 && f.breath > 0;
      f.breath = f.frozen ? Math.max(0, f.breath - dt) : Math.min(BREATH, f.breath + dt * 0.6);
      steer(f, f.frozen || f.caught > 0 ? 0 : inp.x, f.frozen || f.caught > 0 ? 0 : inp.y, SPEED, dt);
      stepVertical(f, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      for (const [gx, gy] of STONES) {
        const dx = f.x - gx;
        const dy = f.y - gy;
        const d = Math.hypot(dx, dy);
        if (d < R + 26 && d > 0) {
          f.x = gx + (dx / d) * (R + 26);
          f.y = gy + (dy / d) * (R + 26);
        }
      }
      f.x = Math.max(LX0 + R, Math.min(LX1 - R, f.x));
      f.y = Math.max(CRYPT_Y - 20, Math.min(LY1 - R, f.y));
      if (Math.hypot(f.vx, f.vy) > 30) f.face = Math.atan2(f.vy, f.vx);
      const moving = Math.hypot(f.vx, f.vy) > 40;
      const lit = moving && f.caught === 0 && f.safe === 0 && f.y < LY1 - 70 && inBeam(s, f.x, f.y);
      f.seen = lit ? f.seen + dt : Math.max(0, f.seen - dt * 2);
      if (f.seen >= SPOT_T) {
        f.seen = 0;
        s.caughtNow.push({ x: f.x, y: f.y });
        keeper.catches++;
        f.caught = 1.2;
        f.safe = 2.5;
        f.y = Math.min(LY1 - 40, f.y + SEND_BACK);
        f.vx = f.vy = 0;
        f.vz = 500;
      }
      if (f.y < CRYPT_Y + 10 && Math.abs(f.x - KEEPER.x) < 120) f.inAt = s.t;
    }
    for (let i = 0; i < s.folk.length; i++)
      for (let j = i + 1; j < s.folk.length; j++) {
        const a = s.folk[i];
        const b = s.folk[j];
        if (!a.keeper && !b.keeper && a.inAt < 0 && b.inAt < 0) bump(a, b, R);
      }
  },

  isOver(s) {
    return s.t >= MAX_T + 3 || s.folk.every((f) => f.keeper || f.inAt >= 0);
  },

  results(s): ResultRow[] {
    return s.folk
      .map((f) => {
        if (f.keeper) return { id: f.id, value: 300 + f.catches * 60, label: `Keeper: ${f.catches} ${f.catches === 1 ? 'catch' : 'catches'}` };
        if (f.inAt >= 0) return { id: f.id, value: 2000 - Math.round(f.inAt * 10), label: `In at ${(f.inAt - 3).toFixed(1)}s` };
        const prog = Math.round(((LY1 - f.y) / (LY1 - CRYPT_Y)) * 100);
        return { id: f.id, value: prog * 4, label: `${prog}% of the way` };
      })
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T + 3 - s.t);
    playerChips(
      ctx,
      players,
      s.folk.map((f) => ({ id: f.id, label: f.keeper ? `KEEPER ${f.catches}` : f.inAt >= 0 ? 'SAFE!' : f.frozen ? 'frozen' : f.breath < 0.6 ? 'gasp!' : '', hot: f.keeper })),
    );
    if (s.t < 5) {
      const k = players.find((p) => p.id === s.folk.find((f) => f.keeper)?.id);
      text(ctx, `${k?.name ?? ''} holds the lantern!`, 640, 104, 30, { color: '#ffd23f' });
    }
  },
};
