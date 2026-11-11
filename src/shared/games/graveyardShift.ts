import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, playerById, popText } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';

/**
 * Graveyard Shift (Graveyard Kit): collect candles among the gravestones at night. Ghosts drift
 * out of the graves and float after the nearest player; a ghost touch scares you into dropping
 * half your candles. Jump to hop over a low-flying ghost. Most candles wins.
 */
export const GX0 = 90, GX1 = 1190, GY0 = 130, GY1 = 680;
/** Gravestones are solid; ghosts rise from them. */
export const GRAVES: [number, number][] = [
  [260, 240], [520, 220], [780, 230], [1030, 250],
  [200, 450], [450, 420], [830, 430], [1080, 460],
  [330, 610], [640, 330], [950, 620], [640, 560],
];
const GRAVE_R = 26;
const R = 22;
const SPEED = 300;
const DURATION = 55;
const MAX_CANDLES = 8;
const GHOST_SPEED = 105;
const SCARE = 1.1;

export interface Candle {
  x: number;
  y: number;
  /** Seconds left while it is flying after being dropped (can't be picked up yet). */
  fly: number;
}
export interface Ghost {
  x: number;
  y: number;
  /** 0..1 while rising out of a grave. */
  rise: number;
  grave: number;
  life: number;
}
export interface Keeper extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  candles: number;
  scared: number;
  safe: number;
}
export interface GraveyardState {
  t: number;
  rng: Rng;
  candleSpawn: number;
  ghostSpawn: number;
  candles: Candle[];
  ghosts: Ghost[];
  keepers: Keeper[];
}

function freeSpot(s: GraveyardState): [number, number] {
  for (let tries = 0; tries < 20; tries++) {
    const x = randRange(s.rng, GX0 + 40, GX1 - 40);
    const y = randRange(s.rng, GY0 + 40, GY1 - 40);
    if (GRAVES.every(([gx, gy]) => Math.hypot(gx - x, gy - y) > GRAVE_R + 30)) return [x, y];
  }
  return [(GX0 + GX1) / 2, GY1 - 60];
}

export const graveyardShift: Minigame<GraveyardState> = {
  id: 'graveyard-shift',
  name: 'Graveyard Shift',
  mode: 'Free-for-all',
  blurb: 'Grab the candles before they burn out! Ghosts float out of the graves after you. A ghost touch makes you drop half your candles. Jump over low ghosts!',
  controls: 'Stick: move   A: jump',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): GraveyardState {
    const n = players.length;
    const s: GraveyardState = {
      t: 0,
      rng: { seed },
      candleSpawn: 0,
      ghostSpawn: 3,
      candles: [],
      ghosts: [],
      keepers: players.map((p, i) => ({
        id: p.id,
        x: GX0 + ((i + 0.5) / n) * (GX1 - GX0),
        y: GY1 - 30,
        face: -Math.PI / 2,
        candles: 0,
        scared: 0,
        safe: 0,
        ...newBody(),
      })),
    };
    for (let i = 0; i < 4; i++) {
      const [x, y] = freeSpot(s);
      s.candles.push({ x, y, fly: 0 });
    }
    return s;
  },

  step(s: GraveyardState, inputs: Inputs, dt: number): void {
    s.t += dt;
    const k = Math.min(1, s.t / DURATION);
    const n = s.keepers.length;

    s.candleSpawn -= dt;
    if (s.candleSpawn <= 0 && s.candles.length < MAX_CANDLES + Math.floor(n / 2)) {
      s.candleSpawn = 0.9 / Math.max(0.8, Math.sqrt(n / 3));
      const [x, y] = freeSpot(s);
      s.candles.push({ x, y, fly: 0 });
    }
    // more ghosts as the night goes on
    s.ghostSpawn -= dt;
    const maxGhosts = 2 + Math.floor(n / 3) + Math.floor(k * 3);
    if (s.ghostSpawn <= 0 && s.ghosts.length < maxGhosts) {
      s.ghostSpawn = 2.5 - k;
      const g = Math.floor(rand(s.rng) * GRAVES.length);
      s.ghosts.push({ x: GRAVES[g][0], y: GRAVES[g][1], rise: 0, grave: g, life: randRange(s.rng, 9, 14) });
    }

    for (const p of s.keepers) {
      const inp = inputs[p.id] ?? NO_INPUT;
      p.scared = Math.max(0, p.scared - dt);
      p.safe = Math.max(0, p.safe - dt);
      const can = p.scared <= 0;
      steer(p, can ? inp.x : 0, can ? inp.y : 0, SPEED, dt);
      if (can && inp.aPressed) jump(p);
      stepVertical(p, dt);
      p.x = clamp(p.x + p.vx * dt, GX0 + R, GX1 - R);
      p.y = clamp(p.y + p.vy * dt, GY0 + R, GY1 - R);
      // bounce off gravestones
      for (const [gx, gy] of GRAVES) {
        const dx = p.x - gx;
        const dy = p.y - gy;
        const d = Math.hypot(dx, dy);
        if (d < GRAVE_R + R && d > 0) {
          p.x = gx + (dx / d) * (GRAVE_R + R);
          p.y = gy + (dy / d) * (GRAVE_R + R);
          const nv = (p.vx * dx + p.vy * dy) / d;
          if (nv < 0) {
            p.vx -= (dx / d) * nv * 1.5;
            p.vy -= (dy / d) * nv * 1.5;
          }
        }
      }
      if (Math.hypot(p.vx, p.vy) > 30) p.face = Math.atan2(p.vy, p.vx);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) bump(s.keepers[i], s.keepers[j], R);

    for (const g of s.ghosts) {
      g.life -= dt;
      if (g.rise < 1) {
        g.rise = Math.min(1, g.rise + dt / 1.2);
        continue;
      }
      // drift toward the nearest player who isn't already spooked, wobbling as it goes
      let best: Keeper | null = null;
      let bd = 1e9;
      for (const p of s.keepers) {
        if (p.safe > 0) continue;
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const speed = GHOST_SPEED * (1 + k * 0.6);
      if (best && bd > 1) {
        g.x += ((best.x - g.x) / bd) * speed * dt + Math.sin(s.t * 3 + g.grave) * 30 * dt;
        g.y += ((best.y - g.y) / bd) * speed * dt + Math.cos(s.t * 2.4 + g.grave) * 30 * dt;
      }
      for (const p of s.keepers) {
        if (p.safe > 0 || p.z > 40) continue; // jump over a low ghost
        if (Math.hypot(p.x - g.x, p.y - g.y) < R + 24) {
          p.scared = SCARE;
          p.safe = SCARE + 1.2;
          p.vz = 520;
          const drop = Math.floor(p.candles / 2);
          p.candles -= drop;
          for (let c = 0; c < drop; c++) {
            const a = rand(s.rng) * Math.PI * 2;
            const r = randRange(s.rng, 60, 140);
            s.candles.push({
              x: clamp(p.x + Math.cos(a) * r, GX0 + 30, GX1 - 30),
              y: clamp(p.y + Math.sin(a) * r, GY0 + 30, GY1 - 30),
              fly: 0.6,
            });
          }
          g.life = Math.min(g.life, 1.5); // a ghost that got someone fades away soon after
        }
      }
    }
    s.ghosts = s.ghosts.filter((g) => g.life > 0);

    for (const c of s.candles) {
      if (c.fly > 0) {
        c.fly = Math.max(0, c.fly - dt);
        continue;
      }
      for (const p of s.keepers) {
        if (p.scared > 0 || p.z > 60) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < R + 16) {
          p.candles++;
          c.fly = -1; // taken
          break;
        }
      }
    }
    s.candles = s.candles.filter((c) => c.fly >= 0);
  },

  isOver: (s) => s.t >= DURATION,

  results(s): ResultRow[] {
    return s.keepers
      .map((p) => ({ id: p.id, value: p.candles, label: `${p.candles} ${p.candles === 1 ? 'candle' : 'candles'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    const n = s.keepers.length;
    const half = Math.ceil(n / 2);
    s.keepers.forEach((p, i) => {
      const pl = playerById(players, p.id);
      if (!pl) return;
      const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(x - 18, 20, 92, 36, 18);
      ctx.fill();
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(x, 38, 11, 0, Math.PI * 2);
      ctx.fill();
      popText(ctx, `gs:${p.id}`, p.candles, x + 20, 38, 22, { align: 'left', color: '#ffe9a0' });
    });
    drawTimer(ctx, DURATION - s.t);
  },
};
