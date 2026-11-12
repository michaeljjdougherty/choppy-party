import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, type BotCtx } from '../botkit';

/**
 * Spark Trails (free-for-all, last one standing): everyone rides a spark scooter that never stops and leaves
 * a glowing trail behind it. Steer in right angles; hit a wall or any trail (yours too) and you're out.
 * Trails never fade, so the floor fills up. Hold A for a short burst of speed (it needs to recharge).
 * Everyone slowly speeds up, so the game always ends. No timer.
 * Grid cells; the arena grows with the player count.
 */
const READY = 3;
export const CELL = 10;
const BASE = 13; // cells per second
const BOOST = 1.75;
const BOOST_T = 0.7;
const BOOST_CD = 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export interface Rider {
  id: string;
  slot: number;
  x: number;
  y: number;
  dir: number;
  want: number;
  /** Fraction of the way into the next cell. */
  prog: number;
  trail: number[]; // cell indices, in order
  out: boolean;
  outAt: number;
  boost: number; // seconds of boost left
  cd: number; // seconds before boost is ready
  cells: number;
}
export interface SparkState {
  t: number;
  rng: Rng;
  gw: number;
  gh: number;
  grid: number[]; // 0 empty, slot+1 = that rider's trail
  riders: Rider[];
  crashes: { id: string; x: number; y: number }[];
  endAt?: number;
}

export const arenaSize = (n: number): [number, number] => {
  const w = Math.round(64 + Math.max(0, n - 2) * 6.5);
  return [w, Math.round(w * 0.55)];
};
const speedAt = (time: number) => BASE * (1 + Math.min(1.2, time * 0.012) + Math.max(0, time - 60) * 0.03);

export const sparkTrails: Minigame<SparkState> = {
  id: 'spark-trails',
  name: 'Spark Trails',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'RIDE!',
  blurb: 'Your spark scooter never stops and leaves a glowing trail. Steer around the walls and everyone’s trails, your own too. Hold A for a burst of speed. Last one riding wins!',
  controls: 'Stick: steer   Hold A: boost',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): SparkState {
    const rng = { seed };
    const n = players.length;
    const [gw, gh] = arenaSize(n);
    const grid = new Array(gw * gh).fill(0);
    // start spread round a ring, facing along it (so nobody starts aimed at someone)
    const riders: Rider[] = players.map((p, i) => {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const x = Math.round(gw / 2 + Math.cos(a) * gw * 0.33);
      const y = Math.round(gh / 2 + Math.sin(a) * gh * 0.33);
      // pick the right-angle direction closest to the ring's tangent
      const tx = -Math.sin(a), ty = Math.cos(a);
      const dir = Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 0 : 2) : ty > 0 ? 1 : 3;
      grid[y * gw + x] = i + 1;
      return { id: p.id, slot: i, x, y, dir, want: dir, prog: 0, trail: [y * gw + x], out: false, outAt: 0, boost: 0, cd: 0, cells: 0 };
    });
    void rand;
    return { t: 0, rng, gw, gh, grid, riders, crashes: [] };
  },

  step(s: SparkState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.crashes = [];
    if (s.t < READY || s.endAt !== undefined) return;
    const time = s.t - READY;
    const sp = speedAt(time);
    // read the sticks
    for (const r of s.riders) {
      if (r.out) continue;
      const inp = inputs[r.id] ?? NO_INPUT;
      const ax = Math.abs(inp.x), ay = Math.abs(inp.y);
      if (Math.max(ax, ay) > 0.5) {
        const d = ax > ay ? (inp.x > 0 ? 0 : 2) : inp.y > 0 ? 1 : 3;
        if (d !== (r.dir + 2) % 4) r.want = d;
      }
      r.cd = Math.max(0, r.cd - dt);
      if (r.boost > 0) {
        r.boost -= dt;
        if (r.boost <= 0) r.cd = BOOST_CD;
      } else if (inp.a && r.cd <= 0) r.boost = BOOST_T;
      r.prog += sp * (r.boost > 0 ? BOOST : 1) * dt;
    }
    // move cell by cell; everyone who enters a cell this round is checked together, so head-ons KO both
    for (let guard = 0; guard < 6; guard++) {
      const movers = s.riders.filter((r) => !r.out && r.prog >= 1);
      if (!movers.length) break;
      const into = new Map<number, Rider[]>();
      for (const r of movers) {
        r.prog -= 1;
        if (r.want !== (r.dir + 2) % 4) r.dir = r.want;
        const nx = r.x + DX[r.dir], ny = r.y + DY[r.dir];
        if (nx < 0 || ny < 0 || nx >= s.gw || ny >= s.gh || s.grid[ny * s.gw + nx]) {
          r.out = true;
          r.outAt = s.t;
          s.crashes.push({ id: r.id, x: nx, y: ny });
          continue;
        }
        const i = ny * s.gw + nx;
        if (!into.has(i)) into.set(i, []);
        into.get(i)!.push(r);
        r.x = nx;
        r.y = ny;
      }
      for (const [i, rs] of into) {
        if (rs.length > 1) {
          for (const r of rs) {
            r.out = true;
            r.outAt = s.t;
            s.crashes.push({ id: r.id, x: r.x, y: r.y });
          }
        }
        s.grid[i] = rs[0].slot + 1;
        for (const r of rs) {
          r.trail.push(i);
          r.cells++;
        }
      }
    }
    if (s.riders.filter((r) => !r.out).length <= 1) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.2,

  results(s): ResultRow[] {
    return s.riders
      .map((r) => ({ id: r.id, value: r.out ? Math.round((r.outAt - READY) * 100) * 1000 + r.cells : 1e9, label: r.out ? `lasted ${Math.max(0, r.outAt - READY).toFixed(1)}s` : 'last one riding!' }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.riders.map((r) => ({ id: r.id, label: r.out ? 'OUT' : r.boost > 0 ? 'BOOST' : r.cd > 0 ? 'ride' : 'ride ⚡', out: r.out, hot: r.boost > 0 })));
    if (s.endAt !== undefined) {
      const alive = s.riders.find((r) => !r.out);
      text(ctx, alive ? `${players.find((p) => p.id === alive.id)?.name ?? ''} is the last one riding!` : 'Everyone crashed!', 640, 120, 34, { color: '#ffd23f' });
    }
  },

  bot(s, id, k: BotCtx) {
    const r = s.riders.find((q) => q.id === id);
    if (!r || r.out || s.t < READY) return NO_INPUT;
    // decide once per cell
    const cell = r.y * s.gw + r.x;
    if (k.mem.n === cell) return k.mem.prev >= 0 ? steer(k.mem.prev, k.mem.m === 1) : NO_INPUT;
    k.mem.n = cell;
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < s.gw && y < s.gh && !s.grid[y * s.gw + x];
    const hard = k.level === 'hard', normal = k.level === 'normal';
    const cap = hard ? 500 : normal ? 160 : 0;
    // other riders' heads count as blocked a step ahead (avoid head-ons)
    const heads = new Set<number>();
    for (const o of s.riders) if (!o.out && o !== r) for (let d = 0; d < 4; d++) heads.add((o.y + DY[d]) * s.gw + (o.x + DX[d]));
    const room = (sx: number, sy: number) => {
      if (!cap) return 0;
      const seen = new Set<number>([sy * s.gw + sx]);
      const q = [[sx, sy]];
      while (q.length && seen.size < cap) {
        const [x, y] = q.shift()!;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d], i = ny * s.gw + nx;
          if (!seen.has(i) && free(nx, ny)) {
            seen.add(i);
            q.push([nx, ny]);
          }
        }
      }
      return seen.size;
    };
    let best = -Infinity, bestDir = r.dir;
    for (const turn of [0, 1, 3]) {
      const d = (r.dir + turn) % 4;
      const nx = r.x + DX[d], ny = r.y + DY[d];
      if (!free(nx, ny)) continue;
      let run = 0;
      while (run < 30 && free(nx + DX[d] * (run + 1), ny + DY[d] * (run + 1))) run++;
      let v = Math.min(run, 12) * 2 + room(nx, ny) + (turn === 0 ? 3 : 0) + rand(k.r) * (hard ? 2 : normal ? 6 : 14);
      if (heads.has(ny * s.gw + nx)) v -= hard ? 400 : normal ? 60 : 0;
      if (v > best) {
        best = v;
        bestDir = d;
      }
    }
    // easy bots sometimes react a cell late
    if (k.level === 'easy' && rand(k.r) < 0.12) bestDir = r.dir;
    k.mem.prev = bestDir === r.dir ? -1 : bestDir;
    // boost only down long open straights
    let open = 0;
    while (open < 20 && free(r.x + DX[bestDir] * (open + 1), r.y + DY[bestDir] * (open + 1))) open++;
    k.mem.m = !k.level.startsWith('e') && open >= 18 && rand(k.r) < 0.3 ? 1 : 0;
    return k.mem.prev >= 0 ? steer(bestDir, k.mem.m === 1) : k.mem.m ? { ...NO_INPUT, a: true } : NO_INPUT;
  },
};

const steer = (d: number, boost: boolean) => stick(DX[d], DY[d], boost);
