import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawChoppy, drawTimer, playerById, text } from '../draw';

const CX = 640;
const CY = 390;
const R = 24; // player radius
const START_RINK = 300;
const END_RINK = 70;
const SHRINK_TIME = 40;
const TIME_LIMIT = 50;
const ACCEL = 950;
const MAX_SPEED = 360;
const DASH_SPEED = 620;
const DASH_COOLDOWN = 1.1;
const FRICTION = 1.1; // per second, icy

interface Skater {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  alive: boolean;
  dashCd: number;
  dashing: number; // seconds left of dash glow
  outAt: number; // time eliminated, -1 if alive
  fall: number; // fall animation 0..1
}

export interface RinkState {
  t: number;
  rink: number;
  skaters: Skater[];
}

export const shrinkingRink: Minigame<RinkState> = {
  id: 'shrinking-rink',
  name: 'Shrinking Rink',
  mode: 'Free-for-all',
  blurb: 'Bump everyone off the ice. The rink keeps shrinking. Last one standing wins!',
  controls: 'Stick: skate   A: dash',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[]): RinkState {
    const n = players.length;
    const spawnR = n === 1 ? 0 : Math.min(200, 90 + n * 14);
    return {
      t: 0,
      rink: START_RINK,
      skaters: players.map((p, i) => {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        return {
          id: p.id,
          x: CX + Math.cos(ang) * spawnR,
          y: CY + Math.sin(ang) * spawnR,
          vx: 0,
          vy: 0,
          face: ang + Math.PI,
          alive: true,
          dashCd: 0.5,
          dashing: 0,
          outAt: -1,
          fall: 0,
        };
      }),
    };
  },

  step(s: RinkState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.rink = START_RINK - (START_RINK - END_RINK) * Math.min(1, s.t / SHRINK_TIME);

    for (const k of s.skaters) {
      if (!k.alive) {
        k.fall = Math.min(1, k.fall + dt * 2);
        continue;
      }
      const inp = inputs[k.id] ?? NO_INPUT;
      const mag = Math.hypot(inp.x, inp.y);
      if (mag > 0.15) {
        k.face = Math.atan2(inp.y, inp.x);
        k.vx += (inp.x / Math.max(1, mag)) * ACCEL * dt;
        k.vy += (inp.y / Math.max(1, mag)) * ACCEL * dt;
      }
      k.dashCd = Math.max(0, k.dashCd - dt);
      k.dashing = Math.max(0, k.dashing - dt);
      if (inp.aPressed && k.dashCd === 0) {
        k.vx = Math.cos(k.face) * DASH_SPEED;
        k.vy = Math.sin(k.face) * DASH_SPEED;
        k.dashCd = DASH_COOLDOWN;
        k.dashing = 0.25;
      }
      const sp = Math.hypot(k.vx, k.vy);
      const cap = k.dashing > 0 ? DASH_SPEED : MAX_SPEED;
      if (sp > cap) {
        // bleed off excess speed smoothly rather than clamping, so knockbacks feel weighty
        const target = Math.max(cap, sp - 900 * dt);
        k.vx *= target / sp;
        k.vy *= target / sp;
      }
      const f = Math.exp(-FRICTION * dt);
      k.vx *= f;
      k.vy *= f;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
    }

    // collisions between living skaters
    const live = s.skaters.filter((k) => k.alive);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = R * 2 - d;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        // a dashing skater hits harder and keeps more of its momentum
        const bounce = 1.35;
        const wa = b.dashing > 0 && a.dashing === 0 ? 1.3 : a.dashing > 0 && b.dashing === 0 ? 0.6 : 1;
        const wb = 2 - wa;
        const imp = (rel * bounce) / 2;
        a.vx -= imp * nx * wa;
        a.vy -= imp * ny * wa;
        b.vx += imp * nx * wb;
        b.vy += imp * ny * wb;
      }
    }

    for (const k of live) {
      if (Math.hypot(k.x - CX, k.y - CY) > s.rink + R * 0.4) {
        k.alive = false;
        k.outAt = s.t;
      }
    }
  },

  isOver(s: RinkState): boolean {
    const alive = s.skaters.filter((k) => k.alive).length;
    const needed = s.skaters.length > 1 ? 1 : 0;
    return alive <= needed || s.t >= TIME_LIMIT;
  },

  results(s: RinkState): ResultRow[] {
    return s.skaters
      .map((k) => ({
        id: k.id,
        // survivors rank above everyone; among survivors, closer to centre is better
        value: k.alive ? 1000 + Math.round(400 - Math.hypot(k.x - CX, k.y - CY)) : k.outAt,
        label: k.alive ? 'Survived!' : `Out at ${k.outAt.toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    // water
    ctx.fillStyle = '#123a5c';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = 60 + i * 60 + Math.sin(s.t * 1.5 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 1280; x += 40) ctx.lineTo(x, y + Math.sin(x / 80 + s.t * 2 + i) * 5);
      ctx.stroke();
    }
    // rink
    const grad = ctx.createRadialGradient(CX, CY - 60, 20, CX, CY, s.rink);
    grad.addColorStop(0, '#f3fbff');
    grad.addColorStop(1, '#b9dff2');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(CX, CY, s.rink, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,140,190,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, s.rink * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // fallen first (under), then living sorted by y
    const ordered = [...s.skaters].sort((a, b) => Number(b.alive === false) - Number(a.alive === false) || a.y - b.y);
    for (const k of ordered) {
      const p = playerById(players, k.id);
      if (!p) continue;
      if (!k.alive) {
        if (k.fall >= 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - k.fall;
        drawChoppy(ctx, k.x, k.y + k.fall * 30, R * (1 - k.fall * 0.5), p.color, { stunned: true });
        ctx.restore();
        continue;
      }
      if (k.dashing > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(k.x - k.vx * 0.05, k.y - k.vy * 0.05, R * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      drawChoppy(ctx, k.x, k.y, R, p.color, { look: k.face, name: p.name });
      if (k.dashCd > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(k.x, k.y, R + 6, -Math.PI / 2, -Math.PI / 2 + (1 - k.dashCd / DASH_COOLDOWN) * Math.PI * 2);
        ctx.stroke();
      }
    }
    drawTimer(ctx, TIME_LIMIT - s.t);
    const alive = s.skaters.filter((k) => k.alive).length;
    text(ctx, `${alive} left`, 1200, 37, 24, { align: 'right' });
  },
};
