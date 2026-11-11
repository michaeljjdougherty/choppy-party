import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, roundRect, text } from '../draw';
import { randInt, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { nearest, remember, stick, toward, type BotCtx } from '../botkit';
import { rand } from '../rng';

/**
 * Color Craze (Prototype Kit): a floor of coloured tiles. A colour is called; get onto a matching tile
 * before the countdown ends, because every other tile drops away. The calls come faster each time.
 * Last one standing wins.
 */
export const COLS = 9, ROWS = 5;
export const TILE = 104;
export const FX0 = 640 - (COLS * TILE) / 2;
export const FY0 = 400 - (ROWS * TILE) / 2;
export const PALETTE = ['#ff5a5f', '#3fa9f5', '#ffd23f', '#5cd65c', '#b06cff', '#ff9f1c'];
export const PALETTE_NAME = ['RED', 'BLUE', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE'];
const R = 20;
const SPEED = 300;
const READY = 3;
const MAX_T = 75;

export interface Hopper extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  fallAt: number; // time it fell off (-1 = still up)
  fz: number; // fall depth, for the view
}
export interface CrazeState {
  t: number;
  rng: Rng;
  tiles: number[]; // colour index per tile, COLS * ROWS
  call: number; // colour being called (-1 between rounds)
  phase: 'call' | 'drop' | 'rest';
  phaseT: number;
  callTime: number;
  round: number;
  hoppers: Hopper[];
}

export const tileAt = (x: number, y: number) => {
  const c = Math.floor((x - FX0) / TILE);
  const r = Math.floor((y - FY0) / TILE);
  return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : r * COLS + c;
};
export const tileCenter = (i: number): [number, number] => [FX0 + ((i % COLS) + 0.5) * TILE, FY0 + (Math.floor(i / COLS) + 0.5) * TILE];

function deal(s: CrazeState): void {
  // a big crowd gets more colours sooner, so it thins out in about the same time as a small one
  const n = Math.min(PALETTE.length, 3 + Math.floor(s.round / 2) + Math.floor(s.hoppers.length / 4));
  s.tiles = s.tiles.map(() => randInt(s.rng, 0, n - 1));
}

const live = (s: CrazeState) => s.hoppers.filter((h) => h.fallAt < 0);

export const colorCraze: Minigame<CrazeState> = {
  id: 'color-craze',
  name: 'Color Craze',
  mode: 'Free-for-all',
  ready: READY,
  blurb: 'A colour gets called: stand on a matching tile before time runs out, because every other tile drops! The calls get faster. Last one standing wins.',
  controls: 'Stick: move   A: jump',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CrazeState {
    const n = players.length;
    const s: CrazeState = {
      t: 0,
      rng: { seed },
      tiles: new Array(COLS * ROWS).fill(0),
      call: -1,
      phase: 'rest',
      phaseT: 0,
      callTime: 3.2,
      round: 0,
      hoppers: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2;
        return { id: p.id, x: 640 + Math.cos(a) * 260, y: 400 + Math.sin(a) * 140, face: a + Math.PI, fallAt: -1, fz: 0, ...newBody() };
      }),
    };
    deal(s);
    return s;
  },

  step(s: CrazeState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.t < READY) return;
    s.phaseT += dt;
    if (s.phase === 'rest' && s.phaseT > 1.4) {
      s.round++;
      deal(s);
      s.call = s.tiles[randInt(s.rng, 0, s.tiles.length - 1)];
      s.phase = 'call';
      s.phaseT = 0;
      s.callTime = Math.max(1.2, 3.2 - s.round * 0.22);
    } else if (s.phase === 'call' && s.phaseT > s.callTime) {
      s.phase = 'drop';
      s.phaseT = 0;
    } else if (s.phase === 'drop' && s.phaseT > 1.3) {
      s.phase = 'rest';
      s.phaseT = 0;
      s.call = -1;
    }
    for (const h of s.hoppers) {
      if (h.fallAt >= 0) {
        h.fz += dt * 18;
        continue;
      }
      const inp = inputs[h.id] ?? NO_INPUT;
      steer(h, inp.x, inp.y, SPEED, dt);
      if (inp.aPressed) jump(h);
      stepVertical(h, dt);
      h.x = Math.max(FX0 + R, Math.min(FX0 + COLS * TILE - R, h.x + h.vx * dt));
      h.y = Math.max(FY0 + R, Math.min(FY0 + ROWS * TILE - R, h.y + h.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) h.face = Math.atan2(inp.y, inp.x);
      // while the floor is down, anyone touching a wrong tile drops (a jump only delays it)
      if (s.phase === 'drop' && h.z <= 1 && s.tiles[tileAt(h.x, h.y)] !== s.call) h.fallAt = s.t;
    }
    const up = live(s);
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) bump(up[i], up[j], R);
  },

  isOver(s) {
    const n = live(s).length;
    if (s.phase === 'drop' && s.phaseT < 1) return false;
    return s.t >= READY + MAX_T || n === 0 || (s.hoppers.length > 1 && n <= 1);
  },

  results(s): ResultRow[] {
    return s.hoppers
      .map((h) => ({ id: h.id, value: h.fallAt < 0 ? 100000 : Math.round(h.fallAt * 10), label: h.fallAt < 0 ? 'Still standing!' : `Dropped in round ${s.round}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, READY + MAX_T - s.t);
    playerChips(ctx, players, s.hoppers.map((h) => ({ id: h.id, label: h.fallAt >= 0 ? 'OUT' : 'IN', out: h.fallAt >= 0 })));
    if (s.call >= 0) {
      const left = Math.max(0, s.callTime - s.phaseT);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, 440, 76, 400, 72, 24);
      ctx.fill();
      ctx.fillStyle = PALETTE[s.call];
      roundRect(ctx, 452, 88, 48, 48, 10);
      ctx.fill();
      ctx.restore();
      text(ctx, PALETTE_NAME[s.call], 640, 112, 44, { color: PALETTE[s.call] });
      if (s.phase === 'call') {
        ctx.fillStyle = PALETTE[s.call];
        ctx.fillRect(452, 140, 376 * (left / s.callTime), 6);
      }
    }
  },

  bot(s, id, k: BotCtx) {
    const me = s.hoppers.find((h) => h.id === id);
    if (!me || me.fallAt >= 0 || s.t < READY) return NO_INPUT;
    if (s.phase !== 'call') return NO_INPUT;
    // each call, a less sharp bot may misread the colour for a moment or freeze up
    if (remember(k.mem, `cc:${s.round}`, k.sk.react[0] * 1.6 + (1 - k.sk.sense) * rand(k.r) * 0.9)) k.mem.n = rand(k.r) < (1 - k.sk.sense) * 0.35 ? 1 : 0;
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    if (k.mem.n === 1 && k.mem.t < k.mem.wait + 0.8) return stick(Math.cos(s.round * 2.1), Math.sin(s.round * 2.1));
    if (s.tiles[tileAt(me.x, me.y)] === s.call) {
      // already safe: drift to the middle of the tile
      const [cx, cy] = tileCenter(tileAt(me.x, me.y));
      toward(me, cx, cy, k.mem);
      return Math.hypot(cx - me.x, cy - me.y) < 24 ? NO_INPUT : stick(k.mem.sx * 0.6, k.mem.sy * 0.6);
    }
    const spots = s.tiles.map((c, i) => [c, i] as const).filter(([c]) => c === s.call).map(([, i]) => {
      const [x, y] = tileCenter(i);
      return { x, y };
    });
    const t = nearest(me, spots, (p) => (k.sk.smart < 0.5 ? Math.sin(p.x * 3.1 + p.y) * 80 : 0));
    if (!t) return NO_INPUT;
    toward(me, t.x, t.y, k.mem);
    return stick(k.mem.sx, k.mem.sy);
  },
};
