import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, playerById, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';

/**
 * Meteor Shower (Space Kit): dodge meteors crashing onto a round moon base. One hit and you are
 * out, and every impact leaves a crater that slows you down for a while. Last one standing wins.
 */
export const MCX = 640, MCY = 390, MR = 310;
export const FALL = 1.35;
export const BLAST = 54;
const SPEED = 290;
const R = 22;
const HEARTS = 1;
const MAX_T = 85;
const CRATER_LIFE = 7;
const CRATER_R = 42;

export interface Meteor {
  x: number;
  y: number;
  fall: number; // seconds until impact
}
export interface Crater {
  x: number;
  y: number;
  life: number;
}
export interface Astro extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  hearts: number;
  safe: number; // invulnerable after a hit
  outAt: number; // -1 while still in
}
export interface MeteorState {
  t: number;
  rng: Rng;
  spawn: number;
  meteors: Meteor[];
  craters: Crater[];
  astros: Astro[];
  /** Impacts this tick, for the view's explosions (cleared every step). */
  booms: { x: number; y: number }[];
}

const alive = (s: MeteorState) => s.astros.filter((a) => a.outAt < 0);

export const meteorShower: Minigame<MeteorState> = {
  id: 'meteor-shower',
  name: 'Meteor Shower',
  mode: 'Free-for-all',
  blurb: 'Meteors are raining on the moon base! Dodge the glowing targets or jump the blast. Craters slow you down. One hit and you are out!',
  controls: 'Stick: move   A: jump',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): MeteorState {
    const n = players.length;
    return {
      t: 0,
      rng: { seed },
      spawn: 1,
      meteors: [],
      craters: [],
      booms: [],
      astros: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2;
        return {
          id: p.id,
          x: MCX + Math.cos(a) * MR * 0.55,
          y: MCY + Math.sin(a) * MR * 0.55,
          face: a + Math.PI,
          hearts: HEARTS,
          safe: 0,
          outAt: -1,
          ...newBody(),
        };
      }),
    };
  },

  step(s: MeteorState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.booms = [];
    const k = Math.min(1, s.t / 50);
    const live = alive(s);

    // spawn: most meteors aim near a random player, so nobody can hide in a corner
    s.spawn -= dt;
    if (s.spawn <= 0) {
      // fewer astronauts, fewer meteors, so each one faces the same danger in a duel as in a crowd
      s.spawn = (0.75 - 0.45 * k) * Math.max(0.55, Math.min(2.4, 4 / Math.max(1, live.length)));
      let x: number, y: number;
      if (live.length && rand(s.rng) < 0.7) {
        const target = live[Math.floor(rand(s.rng) * live.length)];
        x = target.x + randRange(s.rng, -70, 70);
        y = target.y + randRange(s.rng, -70, 70);
      } else {
        const a = rand(s.rng) * Math.PI * 2;
        const d = Math.sqrt(rand(s.rng)) * MR;
        x = MCX + Math.cos(a) * d;
        y = MCY + Math.sin(a) * d;
      }
      s.meteors.push({ x, y, fall: FALL });
    }

    for (const a of s.astros) {
      if (a.outAt >= 0) {
        stepVertical(a, dt);
        continue;
      }
      a.safe = Math.max(0, a.safe - dt);
      const inp = inputs[a.id] ?? NO_INPUT;
      // craters are sticky moon dust: slower inside them
      const slow = a.z <= 0 && s.craters.some((c) => Math.hypot(c.x - a.x, c.y - a.y) < CRATER_R);
      steer(a, inp.x, inp.y, slow ? SPEED * 0.5 : SPEED, dt);
      if (inp.aPressed) jump(a);
      stepVertical(a, dt);
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      // the dome's force field keeps everyone on the base
      const dx = a.x - MCX;
      const dy = a.y - MCY;
      const d = Math.hypot(dx, dy);
      if (d > MR - R) {
        a.x = MCX + (dx / d) * (MR - R);
        a.y = MCY + (dy / d) * (MR - R);
        const n = (a.vx * dx + a.vy * dy) / d;
        if (n > 0) {
          // springy wall
          a.vx -= (dx / d) * n * 1.6;
          a.vy -= (dy / d) * n * 1.6;
        }
      }
      if (Math.hypot(a.vx, a.vy) > 30) a.face = Math.atan2(a.vy, a.vx);
    }
    for (let i = 0; i < s.astros.length; i++)
      for (let j = i + 1; j < s.astros.length; j++) {
        const a = s.astros[i];
        const b = s.astros[j];
        if (a.outAt < 0 && b.outAt < 0) bump(a, b, R);
      }

    for (const m of s.meteors) {
      m.fall -= dt;
      if (m.fall > 0) continue;
      s.booms.push({ x: m.x, y: m.y });
      s.craters.push({ x: m.x, y: m.y, life: CRATER_LIFE });
      for (const a of s.astros) {
        if (a.outAt >= 0 || a.safe > 0 || a.z > 30) continue;
        const d = Math.hypot(a.x - m.x, a.y - m.y);
        if (d > BLAST) continue;
        a.hearts--;
        a.safe = 1.6;
        a.vz = 640;
        const push = 300 / Math.max(1, d);
        a.vx = (a.x - m.x) * push;
        a.vy = (a.y - m.y) * push;
        if (a.hearts <= 0) {
          a.outAt = s.t;
          a.vz = 900;
        }
      }
    }
    s.meteors = s.meteors.filter((m) => m.fall > 0);
    for (const c of s.craters) c.life -= dt;
    s.craters = s.craters.filter((c) => c.life > 0);
  },

  isOver(s) {
    const n = alive(s).length;
    return s.t >= MAX_T || n === 0 || (s.astros.length > 1 && n <= 1);
  },

  results(s): ResultRow[] {
    return s.astros
      .map((a) => ({
        id: a.id,
        value: a.outAt < 0 ? 10000 + a.hearts : Math.round(a.outAt * 100),
        label: a.outAt < 0 ? `Survived with ${a.hearts} ${a.hearts === 1 ? 'heart' : 'hearts'}` : `Out at ${a.outAt.toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T - s.t);
    const n = s.astros.length;
    const half = Math.ceil(n / 2);
    s.astros.forEach((a, i) => {
      const p = playerById(players, a.id);
      if (!p) return;
      const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.roundRect(x - 18, 20, 98, 36, 18);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, 38, 11, 0, Math.PI * 2);
      ctx.fill();
      for (let h = 0; h < HEARTS; h++) {
        ctx.fillStyle = h < a.hearts ? '#ff5a6e' : 'rgba(255,255,255,0.25)';
        const hx = x + 22 + h * 20;
        ctx.beginPath();
        ctx.moveTo(hx, 44);
        ctx.bezierCurveTo(hx - 10, 36, hx - 6, 28, hx, 33);
        ctx.bezierCurveTo(hx + 6, 28, hx + 10, 36, hx, 44);
        ctx.fill();
      }
    });
    if (s.t < 2) text(ctx, 'Watch the sky!', 640, 120, 40, { color: '#ffd23f' });
  },
};
