import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { stepVertical, type Body } from '../physics';

const CX = 640;
const CY = 390;
const R = 24; // player radius
// the rink is sized for the crowd: roomier with more skaters, snug for a duel
const startRink = (n: number) => Math.min(320, 240 + n * 8);
const END_RINK = 70;
const SHRINK_TIME = 50; // reaches END_RINK by here...
const CRUSH_TIME = 14; // ...then keeps closing to nothing, so there is always a winner (no timer)
const ACCEL = 950;
const MAX_SPEED = 360;
const DASH_SPEED = 620;
const DASH_COOLDOWN = 1.1;
const FRICTION = 1.1; // per second, icy

interface Skater extends Body {
  id: string;
  x: number;
  y: number;
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
  start?: number;
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
      rink: startRink(n),
      start: startRink(n),
      skaters: players.map((p, i) => {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        return {
          id: p.id,
          x: CX + Math.cos(ang) * spawnR,
          y: CY + Math.sin(ang) * spawnR,
          vx: 0,
          vy: 0,
          z: 0,
          vz: 0,
          land: 0,
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
    const st = s.start ?? 300;
    s.rink = s.t < SHRINK_TIME ? st - (st - END_RINK) * (s.t / SHRINK_TIME) : END_RINK * Math.max(0, 1 - (s.t - SHRINK_TIME) / CRUSH_TIME);

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
        if (k.z <= 0) k.vz = 300; // a little hop into the dash
      }
      stepVertical(k, dt);
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
        // springy bumpers: everybody bounces off with extra pop
        const bounce = 1.6;
        const wa = b.dashing > 0 && a.dashing === 0 ? 1.3 : a.dashing > 0 && b.dashing === 0 ? 0.6 : 1;
        const wb = 2 - wa;
        const imp = (rel * bounce) / 2;
        a.vx -= imp * nx * wa;
        a.vy -= imp * ny * wa;
        b.vx += imp * nx * wb;
        b.vy += imp * ny * wb;
        // a big hit sends the victim boinging up into the air
        if (rel > 150) {
          const up = Math.min(520, rel * 0.55);
          if (b.z <= 0) b.vz = up * wb * 0.7;
          if (a.z <= 0) a.vz = up * wa * 0.35;
        }
      }
    }

    for (const k of live) {
      // you're only out once you come down over the water: big hits can be survived mid-air
      if (k.z <= 0 && Math.hypot(k.x - CX, k.y - CY) > s.rink + R * 0.4) {
        k.alive = false;
        k.outAt = s.t;
      }
    }
  },

  isOver(s: RinkState): boolean {
    const alive = s.skaters.filter((k) => k.alive).length;
    const needed = s.skaters.length > 1 ? 1 : 0;
    return alive <= needed || s.t >= SHRINK_TIME + CRUSH_TIME + 2;
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

  /** HUD drawn over the 3D view. */
  draw(ctx, s) {
    const alive = s.skaters.filter((k) => k.alive).length;
    text(ctx, `${alive} left`, 1240, 37, 26, { align: 'right' });
  },
};
