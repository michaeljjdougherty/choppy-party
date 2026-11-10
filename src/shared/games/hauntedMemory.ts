import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { roundRect, text } from '../draw';
import { rand, type Rng } from '../rng';
import { playerChips } from './hud';

/**
 * Haunted Memory (Graveyard Kit): four gravestones (up, right, down, left) light up in a sequence.
 * Then everyone repeats it with the stick at once. One wrong move, or running out of time, and
 * you're out. Each round adds one more stone. Last memory standing wins.
 */
export const DIRS = ['up', 'right', 'down', 'left'] as const;
export const STONE_COLORS = ['#41e8ff', '#ff5ad6', '#ffd23f', '#5dff7a'];
const FLASH = 0.62;
const GAP = 0.18;
const PER_STEP = 1.1;
const MAX_ROUNDS = 14;

export interface Rememberer {
  id: string;
  pos: number; // how far through the sequence
  outRound: number; // -1 while in
  doneAt: number; // seconds into the input phase they finished (-1 = not yet)
  held: boolean; // stick was pushed last tick (for flick detection)
  last: number; // last stone entered (for the view), -1
  lastT: number;
  total: number; // summed finish times, a tiebreak
}
export interface MemoryState {
  t: number;
  rng: Rng;
  round: number;
  seq: number[];
  phase: 'show' | 'input' | 'judge';
  phaseT: number;
  folk: Rememberer[];
}

export function lit(s: MemoryState): number {
  if (s.phase !== 'show') return -1;
  const k = Math.floor(s.phaseT / (FLASH + GAP));
  const inFlash = s.phaseT - k * (FLASH + GAP) < FLASH;
  return k < s.seq.length && inFlash && s.phaseT > 0 ? s.seq[k] : -1;
}
export const showLen = (s: MemoryState) => s.seq.length * (FLASH + GAP) + 0.2;
export const inputLen = (s: MemoryState) => 1.5 + s.seq.length * PER_STEP;
const live = (s: MemoryState) => s.folk.filter((f) => f.outRound < 0);

function dirOf(x: number, y: number): number {
  if (Math.hypot(x, y) < 0.6) return -1;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : y > 0 ? 2 : 0;
}

export const hauntedMemory: Minigame<MemoryState> = {
  id: 'haunted-memory',
  name: 'Haunted Memory',
  mode: 'Free-for-all',
  blurb: 'Watch the gravestones light up, then repeat the pattern with the stick. Every round adds one more. One slip and the ghosts get you!',
  controls: 'Stick: up / right / down / left',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): MemoryState {
    const rng = { seed };
    const s: MemoryState = {
      t: 0,
      rng,
      round: 1,
      seq: [],
      phase: 'show',
      phaseT: -1.5,
      folk: players.map((p) => ({ id: p.id, pos: 0, outRound: -1, doneAt: -1, held: false, last: -1, lastT: 0, total: 0 })),
    };
    for (let i = 0; i < 3; i++) s.seq.push(Math.floor(rand(rng) * 4));
    return s;
  },

  step(s: MemoryState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.phaseT += dt;
    if (s.phase === 'show') {
      if (s.phaseT >= showLen(s)) {
        s.phase = 'input';
        s.phaseT = 0;
        for (const f of live(s)) {
          f.pos = 0;
          f.doneAt = -1;
          f.held = true; // ignore a stick already held from before
        }
      }
      return;
    }
    if (s.phase === 'input') {
      for (const f of live(s)) {
        const inp = inputs[f.id] ?? NO_INPUT;
        const d = dirOf(inp.x, inp.y);
        if (d < 0) {
          f.held = false;
          continue;
        }
        if (f.held || f.doneAt >= 0) continue;
        f.held = true;
        f.last = d;
        f.lastT = s.t;
        if (d === s.seq[f.pos]) {
          f.pos++;
          if (f.pos >= s.seq.length) {
            f.doneAt = s.phaseT;
            f.total += s.phaseT;
          }
        } else f.outRound = s.round;
      }
      const waiting = live(s).filter((f) => f.doneAt < 0);
      if (!waiting.length || s.phaseT >= inputLen(s)) {
        for (const f of waiting) f.outRound = s.round;
        s.phase = 'judge';
        s.phaseT = 0;
      }
      return;
    }
    // judge: a short beat, then the next, longer sequence
    if (s.phaseT >= 1.4 && !hauntedMemory.isOver(s)) {
      s.round++;
      s.seq.push(Math.floor(rand(s.rng) * 4));
      s.phase = 'show';
      s.phaseT = -0.4;
    }
  },

  isOver(s) {
    if (s.phase !== 'judge' || s.phaseT < 1.4) return false;
    const n = live(s).length;
    return n === 0 || (s.folk.length > 1 && n <= 1) || s.round >= MAX_ROUNDS;
  },

  results(s): ResultRow[] {
    return s.folk
      .map((f) => {
        const rounds = f.outRound < 0 ? s.round : f.outRound - 1;
        return {
          id: f.id,
          value: rounds * 1000 + (f.outRound < 0 ? 500 : 0) - Math.round(f.total * 10) + (f.outRound >= 0 ? f.pos : 0),
          label: f.outRound < 0 ? `Remembered all ${s.round} rounds` : `Slipped in round ${f.outRound}`,
        };
      })
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(
      ctx,
      players,
      s.folk.map((f) => ({
        id: f.id,
        label: f.outRound >= 0 ? 'OUT' : s.phase === 'input' ? (f.doneAt >= 0 ? '✓' : `${f.pos}/${s.seq.length}`) : '',
        out: f.outRound >= 0,
      })),
    );
    const head = s.phase === 'show' ? 'Watch closely...' : s.phase === 'input' ? 'Your turn! Repeat it!' : 'Next round';
    ctx.fillStyle = 'rgba(20,10,50,0.55)';
    roundRect(ctx, 440, 76, 400, 56, 28);
    ctx.fill();
    text(ctx, `Round ${s.round}  ·  ${head}`, 640, 104, 24, { color: s.phase === 'input' ? '#5dff7a' : '#ffd23f' });
    if (s.phase === 'input') {
      const left = Math.max(0, inputLen(s) - s.phaseT);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(ctx, 490, 140, 300, 12, 6);
      ctx.fill();
      ctx.fillStyle = left < 1.5 ? '#ff5a5f' : '#5dff7a';
      roundRect(ctx, 490, 140, 300 * (left / inputLen(s)), 12, 6);
      ctx.fill();
    }
  },
};
