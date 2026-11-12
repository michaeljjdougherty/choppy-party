import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randInt, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, press, pressB, type BotCtx } from '../botkit';

/**
 * Crate Cascade (free-for-all): everyone has a loading well on the dock. Clumps of crates drop in from the
 * crane; slide and turn them so they pack into full rows, which get shipped off. Clear 2+ rows at once and
 * junk crates get dumped in someone else's well. Stack up to the top and you're out. Last one standing
 * wins; at the buzzer, most rows shipped.
 */
const READY = 3;
const LIMIT = 60;
export const WELL_W = 8;
export const WELL_H = 15;
const LOCK_T = 0.35;
const DAS = 0.17;
const ARR = 0.06;
const SOFT = 0.04;

/** Crate clumps: [x, y] offsets, y up. Smaller than the usual four-block sets so the wells fill fast and clear fast. */
export const SHAPES: [number, number][][] = [
  [[0, 0], [1, 0], [-1, 0]], // bar of 3
  [[0, 0], [1, 0], [0, 1]], // corner
  [[0, 0], [1, 0]], // pair
  [[0, 0], [1, 0], [0, 1], [1, 1]], // block
  [[0, 0], [-1, 0], [1, 0], [0, 1]], // tee
  [[0, 0], [-1, 0], [0, 1], [1, 1]], // zig
  [[0, 0], [-1, 0], [1, 0], [1, 1]], // hook
];
export const JUNK = 9;

export interface Piece {
  shape: number;
  rot: number;
  x: number;
  y: number;
}
export interface Well {
  id: string;
  cells: number[]; // WELL_W * WELL_H, row 0 at the bottom; 0 empty, 1..7 clump colour, JUNK
  piece: Piece | null;
  next: number;
  fall: number; // seconds until the piece drops a row
  lock: number; // seconds resting on something
  hold: number; // seconds the stick has been held sideways
  holdDir: number;
  rotHeld: boolean;
  lines: number;
  pending: number; // junk rows waiting to come in
  out: boolean;
  outAt: number;
  sent: number;
}
export interface CascadeState {
  t: number;
  rng: Rng;
  wells: Well[];
  clears: { id: string; rows: number[] }[];
  junked: { from: string; to: string; n: number }[];
  locks: string[];
  outs: string[];
  endAt?: number;
}

const idx = (x: number, y: number) => y * WELL_W + x;
export function cellsOf(p: Piece): [number, number][] {
  return SHAPES[p.shape].map(([x, y]) => {
    for (let i = 0; i < p.rot; i++) [x, y] = [y, -x];
    return [p.x + x, p.y + y];
  });
}
function fits(cells: number[], p: Piece): boolean {
  for (const [x, y] of cellsOf(p)) {
    if (x < 0 || x >= WELL_W || y < 0) return false;
    if (y < WELL_H && cells[idx(x, y)]) return false;
  }
  return true;
}
/** Where the piece would land if dropped straight down. */
export function ghostY(cells: number[], p: Piece): number {
  let y = p.y;
  while (fits(cells, { ...p, y: y - 1 })) y--;
  return y;
}
const gravity = (time: number) => Math.max(0.2, 0.62 - time * 0.006);

function spawn(s: CascadeState, w: Well): void {
  const p: Piece = { shape: w.next, rot: 0, x: Math.floor(WELL_W / 2) - (w.next === 3 ? 1 : 0), y: WELL_H - 2 };
  w.next = randInt(s.rng, 0, SHAPES.length - 1);
  w.fall = 0;
  w.lock = 0;
  if (!fits(w.cells, p)) {
    w.out = true;
    w.outAt = s.t;
    w.piece = null;
    s.outs.push(w.id);
    return;
  }
  w.piece = p;
}

function addJunk(s: CascadeState, w: Well, n: number): void {
  for (let k = 0; k < n; k++) {
    // a full row with one gap, pushed in from the bottom
    const gap = randInt(s.rng, 0, WELL_W - 1);
    const top = w.cells.slice(0, WELL_W * (WELL_H - 1));
    const row = Array.from({ length: WELL_W }, (_, x) => (x === gap ? 0 : JUNK));
    w.cells = [...row, ...top];
    if (w.piece && !fits(w.cells, w.piece)) w.piece.y++;
  }
}

function lockPiece(s: CascadeState, w: Well): void {
  const p = w.piece!;
  let over = false;
  for (const [x, y] of cellsOf(p)) {
    if (y >= WELL_H) over = true;
    else w.cells[idx(x, y)] = p.shape + 1;
  }
  w.piece = null;
  s.locks.push(w.id);
  // ship full rows
  const rows: number[] = [];
  for (let y = 0; y < WELL_H; y++) {
    let full = true;
    for (let x = 0; x < WELL_W; x++) if (!w.cells[idx(x, y)]) full = false;
    if (full) rows.push(y);
  }
  if (rows.length) {
    const keep: number[] = [];
    for (let y = 0; y < WELL_H; y++) if (!rows.includes(y)) keep.push(...w.cells.slice(y * WELL_W, (y + 1) * WELL_W));
    while (keep.length < WELL_W * WELL_H) keep.push(0);
    w.cells = keep;
    w.lines += rows.length;
    s.clears.push({ id: w.id, rows });
    // big clears cancel your own incoming junk first, then send the rest
    let send = rows.length - 1;
    const cancel = Math.min(send, w.pending);
    w.pending -= cancel;
    send -= cancel;
    if (send > 0) {
      const foes = s.wells.filter((q) => !q.out && q !== w);
      if (foes.length) {
        const to = foes[randInt(s.rng, 0, foes.length - 1)];
        to.pending += send;
        w.sent += send;
        s.junked.push({ from: w.id, to: to.id, n: send });
      }
    }
  } else if (w.pending) {
    addJunk(s, w, w.pending);
    w.pending = 0;
  }
  if (over) {
    w.out = true;
    w.outAt = s.t;
    s.outs.push(w.id);
    return;
  }
}

export const crateCascade: Minigame<CascadeState> = {
  id: 'crate-cascade',
  name: 'Crate Cascade',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'STACK!',
  blurb: 'Crates drop into your well. Slide and turn them to pack full rows and ship them off! Clear 2 or more rows at once to dump junk on a rival. Stack to the top and you’re out!',
  controls: 'Stick ←→: slide   A / Stick ↑: turn   Stick ↓: faster   B: drop',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CascadeState {
    const rng = { seed };
    const first = randInt(rng, 0, SHAPES.length - 1);
    const second = randInt(rng, 0, SHAPES.length - 1);
    const s: CascadeState = {
      t: 0,
      rng,
      clears: [],
      junked: [],
      locks: [],
      outs: [],
      wells: players.map((p) => ({ id: p.id, cells: new Array(WELL_W * WELL_H).fill(0), piece: null, next: first, fall: 0, lock: 0, hold: 0, holdDir: 0, rotHeld: false, lines: 0, pending: 0, out: false, outAt: 0, sent: 0 })),
    };
    // everyone gets the same first two clumps
    for (const w of s.wells) {
      w.piece = { shape: first, rot: 0, x: Math.floor(WELL_W / 2) - (first === 3 ? 1 : 0), y: WELL_H - 2 };
      w.next = second;
    }
    return s;
  },

  step(s: CascadeState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.clears = [];
    s.junked = [];
    s.locks = [];
    s.outs = [];
    if (s.t < READY || s.endAt !== undefined) return;
    const time = s.t - READY;
    const g = gravity(time);
    for (const w of s.wells) {
      if (w.out) continue;
      if (!w.piece) spawn(s, w);
      if (!w.piece) continue;
      const inp = inputs[w.id] ?? NO_INPUT;
      const p = w.piece;
      // turn (A or stick up), with a little kick off the walls
      const up = inp.y < -0.6 && Math.abs(inp.y) > Math.abs(inp.x);
      if (inp.aPressed || (up && !w.rotHeld)) {
        for (const kick of [0, -1, 1, -2, 2]) {
          const q = { ...p, rot: (p.rot + 1) % 4, x: p.x + kick };
          if (fits(w.cells, q)) {
            Object.assign(p, q);
            w.lock = Math.min(w.lock, LOCK_T * 0.5);
            break;
          }
        }
      }
      w.rotHeld = up;
      // slide, with auto-repeat
      const dir = Math.abs(inp.x) > 0.5 && Math.abs(inp.x) >= Math.abs(inp.y) ? Math.sign(inp.x) : 0;
      if (dir !== w.holdDir) {
        w.holdDir = dir;
        w.hold = 0;
        if (dir && fits(w.cells, { ...p, x: p.x + dir })) p.x += dir;
      } else if (dir) {
        w.hold += dt;
        while (w.hold >= DAS + ARR) {
          w.hold -= ARR;
          if (fits(w.cells, { ...p, x: p.x + dir })) p.x += dir;
        }
      }
      // drop straight down
      if (inp.bPressed) {
        p.y = ghostY(w.cells, p);
        lockPiece(s, w);
        continue;
      }
      const soft = inp.y > 0.6 && Math.abs(inp.y) > Math.abs(inp.x);
      w.fall += dt;
      const every = soft ? Math.min(SOFT, g) : g;
      while (w.fall >= every) {
        w.fall -= every;
        if (fits(w.cells, { ...p, y: p.y - 1 })) {
          p.y--;
          w.lock = 0;
        }
      }
      if (!fits(w.cells, { ...p, y: p.y - 1 })) {
        w.lock += dt;
        if (w.lock >= LOCK_T) lockPiece(s, w);
      }
    }
    const alive = s.wells.filter((w) => !w.out);
    if (alive.length <= 1 || time >= LIMIT) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.2,

  results(s): ResultRow[] {
    const height = (w: Well) => {
      for (let y = WELL_H - 1; y >= 0; y--) for (let x = 0; x < WELL_W; x++) if (w.cells[idx(x, y)]) return y + 1;
      return 0;
    };
    return s.wells
      .map((w) => ({
        id: w.id,
        // survivors first, then by how long they lasted; among survivors, most rows, then the lowest stack
        value: w.out ? Math.round((w.outAt - READY) * 10) * 100 + Math.min(99, w.lines) : 1e7 + w.lines * 100 - height(w),
        label: `${w.lines} ${w.lines === 1 ? 'row' : 'rows'}${w.out ? ' · out' : ''}`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, Math.max(0, READY + LIMIT - s.t));
    playerChips(ctx, players, s.wells.map((w) => ({ id: w.id, label: w.out ? 'OUT' : `${w.lines} rows`, out: w.out, hot: w.pending > 0 })));
    if (s.endAt !== undefined) {
      const alive = s.wells.filter((w) => !w.out);
      if (alive.length === 1) text(ctx, `${players.find((p) => p.id === alive[0].id)?.name ?? ''} is the last one stacking!`, 640, 120, 34, { color: '#ffd23f' });
    }
  },

  bot(s, id, k: BotCtx) {
    const w = s.wells.find((q) => q.id === id);
    if (!w || w.out || !w.piece || s.t < READY) return NO_INPUT;
    const p = w.piece;
    // plan once per clump: try every turn and column, score the result
    const key = w.lines * 1000 + w.cells.reduce((a, c, i) => (c ? a + i : a), 0) + p.shape * 7;
    if (k.mem.n !== key) {
      k.mem.n = key;
      const noise = k.level === 'hard' ? 0.05 : k.level === 'normal' ? 0.9 : 2.6;
      let best = -Infinity, bestRot = 0, bestX = p.x;
      for (let rot = 0; rot < 4; rot++) {
        for (let x = -2; x < WELL_W + 2; x++) {
          const q = { ...p, rot, x, y: WELL_H - 2 };
          if (!fits(w.cells, q)) continue;
          q.y = ghostY(w.cells, q);
          const v = score(w.cells, q) + (rand(k.r) * 2 - 1) * noise;
          if (v > best) {
            best = v;
            bestRot = rot;
            bestX = x;
          }
        }
      }
      k.mem.sx = bestRot;
      k.mem.sy = bestX;
      k.mem.wait = 0;
    }
    // act at the bot's own pace
    const gap = k.level === 'hard' ? 0.07 : k.level === 'normal' ? 0.14 : 0.26;
    if (k.mem.t < gap) return NO_INPUT;
    k.mem.t = 0;
    if (p.rot !== k.mem.sx) {
      // let go between taps so each press turns once
      k.mem.prev = k.mem.prev ? 0 : 1;
      return k.mem.prev ? press() : NO_INPUT;
    }
    if (p.x !== k.mem.sy) return stick(Math.sign(k.mem.sy - p.x), 0);
    // lined up: hard bots drop it, others ease it down
    if (k.level === 'hard') return pressB();
    return k.level === 'normal' && rand(k.r) < 0.5 ? pressB() : stick(0, 1);
  },
};

/** How good a landing spot is: fewer holes, a lower, flatter stack, and rows shipped. */
function score(cells: number[], p: Piece): number {
  const c = cells.slice();
  for (const [x, y] of cellsOf(p)) {
    if (y >= WELL_H) return -1000;
    c[idx(x, y)] = 1;
  }
  let lines = 0;
  for (let y = 0; y < WELL_H; y++) {
    let full = true;
    for (let x = 0; x < WELL_W; x++) if (!c[idx(x, y)]) full = false;
    if (full) lines++;
  }
  const hs: number[] = [];
  let holes = 0;
  for (let x = 0; x < WELL_W; x++) {
    let h = 0;
    for (let y = WELL_H - 1; y >= 0; y--) {
      if (c[idx(x, y)]) {
        if (!h) h = y + 1;
      } else if (h) holes++;
    }
    hs.push(h);
  }
  let bump = 0;
  for (let x = 1; x < WELL_W; x++) bump += Math.abs(hs[x] - hs[x - 1]);
  const agg = hs.reduce((a, b) => a + b, 0);
  const tall = Math.max(...hs);
  return lines * 3.2 - holes * 3.5 - agg * 0.5 - bump * 0.35 - (tall > WELL_H - 4 ? 6 : 0);
}
