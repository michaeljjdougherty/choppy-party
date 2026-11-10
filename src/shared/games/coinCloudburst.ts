import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, playerById, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';

const DURATION = 35;
const SPEED = 300;
const R = 22;
export const FALL_TIME = 1.1;
const COIN_LIFE = 4;
const STUN = 1.4;
export const ANVIL_HIT = 46;
export const AX0 = 60, AX1 = 1220, AY0 = 100, AY1 = 690;

interface Drop {
  kind: 'coin' | 'gem' | 'anvil';
  x: number;
  y: number;
  fall: number; // seconds until it lands
  life: number; // seconds left after landing
}

interface Runner extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  stun: number;
  coins: number;
  pop: number; // +coin flash
}

export interface CloudburstState {
  t: number;
  rng: Rng;
  spawn: number;
  drops: Drop[];
  runners: Runner[];
}

export const coinCloudburst: Minigame<CloudburstState> = {
  id: 'coin-cloudburst',
  name: 'Coin Cloudburst',
  mode: 'Free-for-all',
  blurb: 'Coins are raining down! Grab as many as you can. Bombs land where the red shadows are: run, or jump over the blast!',
  controls: 'Stick: run   A: jump',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CloudburstState {
    const n = players.length;
    return {
      t: 0,
      rng: { seed },
      spawn: 0.5,
      drops: [],
      runners: players.map((p, i) => ({
        id: p.id,
        x: AX0 + ((i + 0.5) / n) * (AX1 - AX0),
        y: (AY0 + AY1) / 2,
        face: Math.PI / 2,
        stun: 0,
        coins: 0,
        pop: 0,
        ...newBody(),
      })),
    };
  },

  step(s: CloudburstState, inputs: Inputs, dt: number): void {
    s.t += dt;
    const k = Math.min(1, s.t / DURATION);

    // spawn: faster and nastier as time goes on, and more drops for bigger groups
    s.spawn -= dt;
    if (s.spawn <= 0 && s.t < DURATION - FALL_TIME) {
      const scale = Math.sqrt(s.runners.length / 4);
      s.spawn = (0.42 - 0.22 * k) / Math.max(0.6, scale);
      const roll = rand(s.rng);
      const anvilChance = 0.22 + 0.2 * k;
      const kind: Drop['kind'] = roll < anvilChance ? 'anvil' : roll > 0.95 ? 'gem' : 'coin';
      s.drops.push({
        kind,
        x: randRange(s.rng, AX0 + 30, AX1 - 30),
        y: randRange(s.rng, AY0 + 30, AY1 - 30),
        fall: FALL_TIME,
        life: kind === 'anvil' ? 0.6 : COIN_LIFE,
      });
    }

    for (const r of s.runners) {
      r.pop = Math.max(0, r.pop - dt);
      const inp = inputs[r.id] ?? NO_INPUT;
      const stunned = r.stun > 0;
      if (stunned) r.stun = Math.max(0, r.stun - dt);
      steer(r, stunned ? 0 : inp.x, stunned ? 0 : inp.y, SPEED, dt);
      if (!stunned && inp.aPressed) jump(r);
      stepVertical(r, dt);
      r.x = clamp(r.x + r.vx * dt, AX0 + R, AX1 - R);
      r.y = clamp(r.y + r.vy * dt, AY0 + R, AY1 - R);
      if (Math.hypot(r.vx, r.vy) > 30 && !stunned) r.face = Math.atan2(r.vy, r.vx);
    }
    for (let i = 0; i < s.runners.length; i++)
      for (let j = i + 1; j < s.runners.length; j++) bump(s.runners[i], s.runners[j], R, 2.2, 0.45);

    for (const d of s.drops) {
      if (d.fall > 0) {
        d.fall -= dt;
        if (d.fall <= 0 && d.kind === 'anvil') {
          for (const r of s.runners) {
            const dist = Math.hypot(r.x - d.x, r.y - d.y);
            // jumping clears the blast
            if (dist < ANVIL_HIT && r.z < 24) {
              r.stun = STUN;
              r.coins = Math.max(0, r.coins - 2);
              // blown up and away, bouncy-style
              r.vz = 620;
              const k = 260 / Math.max(1, dist);
              r.vx = (r.x - d.x) * k;
              r.vy = (r.y - d.y) * k;
            }
          }
        }
        continue;
      }
      d.life -= dt;
      if (d.kind === 'anvil' || d.life <= 0) continue;
      // nearest non-stunned runner in reach picks it up
      let best: Runner | null = null;
      let bestD = R + 16;
      for (const r of s.runners) {
        if (r.stun > 0 || r.z > 70) continue;
        const dd = Math.hypot(r.x - d.x, r.y - d.y);
        if (dd < bestD) {
          best = r;
          bestD = dd;
        }
      }
      if (best) {
        best.coins += d.kind === 'gem' ? 5 : 1;
        best.pop = 0.3;
        d.life = 0;
      }
    }
    s.drops = s.drops.filter((d) => d.fall > 0 || d.life > 0);
  },

  isOver: (s) => s.t >= DURATION,

  results(s: CloudburstState): ResultRow[] {
    return s.runners
      .map((r) => ({ id: r.id, value: r.coins, label: `${r.coins} coins` }))
      .sort((a, b) => b.value - a.value);
  },

  /** HUD drawn over the 3D view. */
  draw(ctx, s, players) {
    const n = s.runners.length;
    const half = Math.ceil(n / 2);
    s.runners.forEach((r, i) => {
      const p = playerById(players, r.id);
      if (!p) return;
      // split the scoreboard either side of the timer
      const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.roundRect(x - 18, 20, 92, 36, 18);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, 38, 11, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(r.coins), x + 20, 38, 22, { align: 'left' });
    });
    drawTimer(ctx, DURATION - s.t);
  },
};
