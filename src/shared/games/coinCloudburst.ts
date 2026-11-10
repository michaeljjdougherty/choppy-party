import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawChoppy, drawTimer, playerById, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';

const DURATION = 35;
const SPEED = 300;
const R = 22;
const FALL_TIME = 1.1;
const COIN_LIFE = 4;
const STUN = 1.4;
const ANVIL_HIT = 46;
const AX0 = 60, AX1 = 1220, AY0 = 100, AY1 = 690;

interface Drop {
  kind: 'coin' | 'gem' | 'anvil';
  x: number;
  y: number;
  fall: number; // seconds until it lands
  life: number; // seconds left after landing
}

interface Runner {
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
  blurb: 'Coins are raining down! Grab as many as you can, but stay out from under the anvils.',
  controls: 'Stick: run',
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
      if (r.stun > 0) {
        r.stun = Math.max(0, r.stun - dt);
        continue;
      }
      const inp = inputs[r.id] ?? NO_INPUT;
      const mag = Math.hypot(inp.x, inp.y);
      if (mag > 0.15) {
        const m = Math.min(1, mag);
        r.face = Math.atan2(inp.y, inp.x);
        r.x = clamp(r.x + (inp.x / mag) * m * SPEED * dt, AX0 + R, AX1 - R);
        r.y = clamp(r.y + (inp.y / mag) * m * SPEED * dt, AY0 + R, AY1 - R);
      }
    }

    for (const d of s.drops) {
      if (d.fall > 0) {
        d.fall -= dt;
        if (d.fall <= 0 && d.kind === 'anvil') {
          for (const r of s.runners) {
            if (Math.hypot(r.x - d.x, r.y - d.y) < ANVIL_HIT) {
              r.stun = STUN;
              r.coins = Math.max(0, r.coins - 2);
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
        if (r.stun > 0) continue;
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

  draw(ctx, s, players) {
    ctx.fillStyle = '#3b6e3f';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#5c9a4f';
    ctx.fillRect(AX0, AY0, AX1 - AX0, AY1 - AY0);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = AX0; x < AX1; x += 80) ctx.fillRect(x, AY0, 40, AY1 - AY0);

    // landed items and shadows
    for (const d of s.drops) {
      if (d.fall > 0) {
        const p = 1 - d.fall / FALL_TIME;
        ctx.fillStyle = d.kind === 'anvil' ? `rgba(120,0,0,${0.15 + p * 0.35})` : `rgba(0,0,0,${0.1 + p * 0.25})`;
        ctx.beginPath();
        const rad = d.kind === 'anvil' ? ANVIL_HIT : 16;
        ctx.ellipse(d.x, d.y, rad * (0.4 + p * 0.6), rad * 0.5 * (0.4 + p * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind !== 'anvil') {
        drawCoin(ctx, d.x, d.y, d.kind, d.life < 1 ? Math.floor(d.life * 10) % 2 === 0 : true);
      } else {
        drawAnvil(ctx, d.x, d.y, 1);
      }
    }

    const sorted = [...s.runners].sort((a, b) => a.y - b.y);
    for (const r of sorted) {
      const p = playerById(players, r.id);
      if (!p) continue;
      drawChoppy(ctx, r.x, r.y, R, p.color, { look: r.face, stunned: r.stun > 0, name: p.name });
      if (r.pop > 0) text(ctx, '+', r.x + 26, r.y - 30 - (0.3 - r.pop) * 60, 22, { color: '#ffd23f' });
    }

    // things still in the air are drawn above everyone
    for (const d of s.drops) {
      if (d.fall <= 0) continue;
      const lift = (d.fall / FALL_TIME) * 420;
      if (d.y - lift < -40) continue;
      if (d.kind === 'anvil') drawAnvil(ctx, d.x, d.y - lift, 1);
      else drawCoin(ctx, d.x, d.y - lift, d.kind, true);
    }

    // scoreboard
    const n = s.runners.length;
    s.runners.forEach((r, i) => {
      const p = playerById(players, r.id);
      if (!p) return;
      // split the scoreboard either side of the timer
      const half = Math.ceil(n / 2);
      const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, 38, 11, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(r.coins), x + 18, 38, 22, { align: 'left' });
    });
    drawTimer(ctx, DURATION - s.t);
  },
};

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'coin' | 'gem', visible: boolean): void {
  if (!visible) return;
  if (kind === 'gem') {
    ctx.fillStyle = '#4ee6ff';
    ctx.strokeStyle = '#1a7f9c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x + 13, y - 3);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x - 13, y - 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(x - 2, y - 6, 4, 12);
}

function drawAnvil(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#4a4f5a';
  ctx.strokeStyle = '#1f2228';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 22);
  ctx.lineTo(x + 30, y - 22);
  ctx.lineTo(x + 38, y - 12);
  ctx.lineTo(x + 14, y - 6);
  ctx.lineTo(x + 14, y + 6);
  ctx.lineTo(x + 26, y + 16);
  ctx.lineTo(x - 26, y + 16);
  ctx.lineTo(x - 14, y + 6);
  ctx.lineTo(x - 14, y - 6);
  ctx.lineTo(x - 34, y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
