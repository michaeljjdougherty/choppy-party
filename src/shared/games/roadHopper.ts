import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, type BotCtx } from '../botkit';

/**
 * Road Hopper (duel): both players hop up the same field at once, one square per push of the stick.
 * Dodge the mine carts on the tracks, then ride the floating logs over the river. Get hit or fall in
 * and you're back at the start. First across 3 times wins; at the buzzer, most crossings, then the
 * furthest hop up the field.
 */
const READY = 3;
const LIMIT = 60;
export const WIN = 3;
export const COLS = 13;
export const ROWS = 11; // 0 = start bank, 1-4 tracks, 5 = middle bank, 6-9 river, 10 = far bank
export const CELL = 60;
export const FX0 = 640 - (COLS * CELL) / 2;
export const FY0 = 690; // bottom edge of row 0 (rows go up the screen)
const HOP_T = 0.14;
const PAD = 3 * CELL; // objects wrap through this much off-field space

export type LaneKind = 'bank' | 'track' | 'river';
export interface Thing {
  x: number; // left edge, field px (0 = field's left side)
  len: number; // in cells
}
export interface Lane {
  kind: LaneKind;
  dir: number; // -1 / 1
  speed: number; // px/s (before the per-crossing speed-up)
  things: Thing[];
}
export interface Hopper {
  id: string;
  x: number; // field px (centre)
  row: number;
  hop: number; // seconds left of the current hop
  fromX: number;
  fromRow: number;
  held: boolean;
  score: number;
  best: number; // furthest row this crossing
  bonks: number;
  /** Seconds of the "back to start" respawn. */
  reset: number;
  face: number; // 0 up, 1 right, 2 down, 3 left
}
export interface HopState {
  t: number;
  rng: Rng;
  lanes: Lane[];
  hoppers: Hopper[];
  /** Lane speed multiplier: everything speeds up a little with each crossing. */
  pace: number;
  splats: { id: string; water: boolean }[];
  scores: string[];
  endAt?: number;
  winner?: string;
}

export const laneKind = (row: number): LaneKind => (row >= 1 && row <= 4 ? 'track' : row >= 6 && row <= 9 ? 'river' : 'bank');
const W = COLS * CELL;
const wrap = (x: number) => ((((x + PAD) % (W + 2 * PAD)) + (W + 2 * PAD)) % (W + 2 * PAD)) - PAD;

/** The thing (cart or log) under/at field x in a lane, if any. */
export function thingAt(l: Lane, x: number, slack: number): Thing | null {
  for (const th of l.things) if (x > th.x - slack && x < th.x + th.len * CELL + slack) return th;
  return null;
}

function respawn(h: Hopper, slot: number): void {
  h.row = 0;
  h.x = slot === 0 ? CELL * 4.5 : CELL * 8.5;
  h.hop = 0;
  h.best = 0;
  h.reset = 0;
  h.face = 0;
}

export const roadHopper: Minigame<HopState> = {
  id: 'road-hopper',
  name: 'Road Hopper',
  mode: 'Duel',
  ready: READY,
  goWord: 'HOP!',
  blurb: 'Hop across the mine cart tracks and ride the logs over the river! Each push of the stick is one hop. Get hit or fall in and you’re back at the start. First across 3 times wins!',
  controls: 'Stick: hop (one square per push)',
  minPlayers: 2,
  maxPlayers: 2,

  setup(players: PlayerInfo[], seed: number): HopState {
    const rng = { seed };
    const lanes: Lane[] = [];
    for (let row = 0; row < ROWS; row++) {
      const kind = laneKind(row);
      const dir = row % 2 ? 1 : -1;
      const things: Thing[] = [];
      if (kind === 'track') {
        const n = 3;
        const gap = (W + 2 * PAD) / n;
        const off = rand(rng) * gap;
        for (let i = 0; i < n; i++) things.push({ x: wrap(off + i * gap), len: rand(rng) < 0.35 ? 2 : 1 });
        lanes.push({ kind, dir, speed: randRange(rng, 90, 170) + row * 8, things });
      } else if (kind === 'river') {
        const n = 3;
        const gap = (W + 2 * PAD) / n;
        const off = rand(rng) * gap;
        for (let i = 0; i < n; i++) things.push({ x: wrap(off + i * gap), len: 3 + Math.floor(rand(rng) * 2) });
        lanes.push({ kind, dir, speed: randRange(rng, 60, 110), things });
      } else lanes.push({ kind, dir: 1, speed: 0, things });
    }
    const hoppers = players.map((p, i) => {
      const h: Hopper = { id: p.id, x: 0, row: 0, hop: 0, fromX: 0, fromRow: 0, held: false, score: 0, best: 0, bonks: 0, reset: 0, face: 0 };
      respawn(h, i);
      return h;
    });
    return { t: 0, rng, lanes, hoppers, pace: 1, splats: [], scores: [] };
  },

  step(s: HopState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.splats = [];
    s.scores = [];
    if (s.t < READY || s.endAt !== undefined) return;
    // the field moves
    for (const l of s.lanes) for (const th of l.things) th.x = wrap(th.x + l.dir * l.speed * s.pace * dt);
    s.hoppers.forEach((h, slot) => {
      const inp = inputs[h.id] ?? NO_INPUT;
      if (h.reset > 0) {
        h.reset -= dt;
        if (h.reset <= 0) respawn(h, slot);
        return;
      }
      const lane = s.lanes[h.row];
      // ride your log
      if (h.hop <= 0 && lane.kind === 'river') h.x += lane.dir * lane.speed * s.pace * dt;
      if (h.hop > 0) h.hop = Math.max(0, h.hop - dt);
      // one hop per push of the stick
      const ax = Math.abs(inp.x), ay = Math.abs(inp.y);
      const pushed = Math.max(ax, ay) > 0.55;
      if (pushed && !h.held && h.hop <= 0) {
        let dx = 0, dr = 0;
        if (ay >= ax) dr = inp.y < 0 ? 1 : -1;
        else dx = inp.x > 0 ? 1 : -1;
        const nr = Math.max(0, Math.min(ROWS - 1, h.row + dr));
        const nx = Math.max(CELL / 2, Math.min(W - CELL / 2, h.x + dx * CELL));
        if (nr !== h.row || nx !== h.x) {
          h.fromX = h.x;
          h.fromRow = h.row;
          h.row = nr;
          h.x = nx;
          h.hop = HOP_T;
          h.face = dr > 0 ? 0 : dr < 0 ? 2 : dx > 0 ? 1 : 3;
          h.best = Math.max(h.best, h.row);
        }
      }
      h.held = pushed;
      if (h.hop > 0) return;
      const here = s.lanes[h.row];
      const splat = (water: boolean) => {
        h.bonks++;
        h.reset = 0.9;
        s.splats.push({ id: h.id, water });
      };
      if (here.kind === 'track' && thingAt(here, h.x, -10)) return splat(false);
      if (here.kind === 'river' && (!thingAt(here, h.x, 6) || h.x < -CELL * 0.2 || h.x > W + CELL * 0.2)) return splat(true);
      if (h.row === ROWS - 1) {
        h.score++;
        s.scores.push(h.id);
        s.pace += 0.12;
        if (h.score >= WIN) {
          s.endAt = s.t;
          s.winner = h.id;
        } else {
          h.reset = 0.6;
        }
      }
    });
    if (s.endAt === undefined && s.t - READY >= LIMIT) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    return s.hoppers
      .map((h) => ({ id: h.id, value: (s.winner === h.id ? 10000 : 0) + h.score * 100 + (h.reset > 0 ? 0 : h.best), label: `${h.score} ${h.score === 1 ? 'crossing' : 'crossings'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + LIMIT - s.t);
    playerChips(ctx, players, s.hoppers.map((h) => ({ id: h.id, label: `${h.score} / ${WIN}`, hot: h.reset > 0 })));
    if (s.winner) text(ctx, `${players.find((p) => p.id === s.winner)?.name ?? ''} made it ${WIN} times!`, 640, 150, 36, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const h = s.hoppers.find((q) => q.id === id);
    if (!h || s.t < READY || h.reset > 0 || h.hop > 0) return NO_INPUT;
    // let go of the stick between hops
    if (h.held) return NO_INPUT;
    // think a beat between hops (easy bots dawdle)
    const wait = k.level === 'hard' ? 0.05 : k.level === 'normal' ? 0.16 : 0.3;
    if (k.mem.t < wait) return NO_INPUT;
    const sense = k.level === 'hard' ? 1 : k.level === 'normal' ? 0.85 : 0.6;
    /** Is a square safe to stand on for the next `secs`? */
    const safe = (row: number, x: number, secs: number) => {
      if (row < 0 || row >= ROWS || x < CELL / 2 || x > W - CELL / 2) return false;
      const l = s.lanes[row];
      if (l.kind === 'bank') return true;
      const v = l.dir * l.speed * s.pace;
      for (let t = 0; t <= secs; t += 0.05) {
        const ghost: Lane = { ...l, things: l.things.map((th) => ({ x: wrap(th.x + v * (t + HOP_T)), len: th.len })) };
        if (l.kind === 'track' && thingAt(ghost, x, 14)) return false;
        if (l.kind === 'river') {
          const rx = x + v * t;
          if (!thingAt(ghost, rx, -12) || rx < CELL * 0.3 || rx > W - CELL * 0.3) return false;
        }
      }
      return true;
    };
    const go = (dx: number, dr: number) => {
      k.mem.t = 0;
      return stick(dx, -dr);
    };
    const look = 0.35 * sense + 0.1;
    const fumble = rand(k.r) > sense;
    if (fumble || safe(h.row + 1, h.x, look)) return go(0, 1);
    if (!safe(h.row, h.x, 0.4)) {
      // in trouble where we stand: step sideways or back
      for (const [dx, dr] of [[1, 0], [-1, 0], [0, -1]] as const) if (safe(h.row + dr, h.x + dx * CELL, 0.4)) return go(dx, dr);
    }
    // line up under a gap: drift toward the middle when near the edges
    if (s.lanes[h.row].kind === 'bank' && rand(k.r) < 0.15) {
      const dx = h.x < W * 0.3 ? 1 : h.x > W * 0.7 ? -1 : rand(k.r) < 0.5 ? 1 : -1;
      if (safe(h.row, h.x + dx * CELL, 0.3)) return go(dx, 0);
    }
    return NO_INPUT;
  },
};
