import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, remember, type BotCtx } from '../botkit';

/**
 * Barrel Bands (Pirate Kit, cooper's dock): everyone has a barrel at a workbench. An iron band slides up
 * and down it; A hammers it in place. Closer to the gold line in the middle scores more. 8 bands each,
 * every band moves at its own speed (shown by its colour), and the last one counts double.
 */
const READY = 3;
/** Michael: about a minute, and hitting the goal pops your barrel. */
export const TIME = 60;
/** Points that pop the barrel. */
export const POP = 100;
/** Size of the speed cycle (bands repeat it, getting quicker as the clock runs down). */
export const BANDS = 12;
const SETTLE = 0.8; // seconds the hammered band shows before the next one starts
const TIMEOUT = 4; // a band nobody hammers slides off the end
export type Pace = 'slow' | 'medium' | 'fast' | 'tricky';
export const PACE_COLOR: Record<Pace, string> = { slow: '#4cd97b', medium: '#ffd23f', fast: '#ff5a5f', tricky: '#b06cff' };
const PACE_SPEED: Record<Pace, number> = { slow: 0.55, medium: 0.85, fast: 1.25, tricky: 1.35 };

/** Score for stopping the band `off` from the middle (0 = dead centre, 1 = the end of the barrel). */
export function bandScore(off: number): number {
  const d = Math.abs(off);
  if (d <= 0.06) return 10;
  if (d <= 0.2) return 6;
  if (d <= 0.45) return 3;
  if (d <= 0.85) return 1;
  return 0;
}

export interface Cooper {
  id: string;
  band: number; // which band (0..BANDS-1); BANDS = done
  pace: Pace;
  /** Band phase: position is sin(phase), so it sweeps the barrel top to bottom. */
  phase: number;
  /** Seconds this band has been sliding. */
  age: number;
  /** Set when hammered: where it stopped and what it scored. */
  stopped: number | null;
  settle: number;
  scores: number[];
  total: number;
  /** When the barrel popped (game time), if it did. */
  popAt?: number;
}
export interface BandState {
  t: number;
  rng: Rng;
  paces: Pace[]; // the same speeds for everyone, so it's fair
  coopers: Cooper[];
  /** This tick's hammer hits, for the view. */
  hits: { id: string; score: number }[];
  /** Barrels that popped this tick, for the view. */
  pops?: string[];
  endAt?: number;
}

export const bandPos = (c: Cooper) => Math.sin(c.phase);

export const barrelBands: Minigame<BandState> = {
  id: 'barrel-bands',
  name: 'Barrel Bands',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'HAMMER!',
  blurb: `An iron band slides up and down your barrel. Press A to hammer it in place: dead on the gold line is PERFECT! Every band adds pressure. Reach ${100} points and your barrel POPS. First to pop wins, and the bands get faster as the minute runs out.`,
  controls: 'A: hammer the band',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): BandState {
    const rng = { seed };
    const kinds: Pace[] = ['slow', 'medium', 'fast', 'tricky'];
    // two or three of each speed, shuffled; the double-points finale is always a quick one
    const paces: Pace[] = [...kinds, ...kinds, 'medium' as Pace, 'fast' as Pace].sort(() => rand(rng) - 0.5);
    if (paces[BANDS - 1] === 'slow') [paces[0], paces[BANDS - 1]] = [paces[BANDS - 1], paces[0]];
    return {
      t: 0,
      rng,
      paces,
      hits: [],
      coopers: players.map((p) => ({ id: p.id, band: 0, pace: paces[0], phase: randRange(rng, 0, Math.PI * 2), age: 0, stopped: null, settle: 0, scores: [], total: 0 })),
    };
  },

  step(s: BandState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.hits = [];
    s.pops = [];
    if (s.t < READY || s.endAt !== undefined) return;
    // the bands speed up as the minute runs down
    const rush = 1 + Math.min(1, (s.t - READY) / TIME) * 0.45;
    for (const c of s.coopers) {
      if (c.popAt !== undefined) continue;
      if (c.stopped !== null) {
        c.settle -= dt;
        if (c.settle <= 0) {
          c.band++;
          c.stopped = null;
          c.age = 0;
          c.pace = s.paces[c.band % BANDS];
          c.phase = randRange(s.rng, 0, Math.PI * 2);
        }
        continue;
      }
      c.age += dt;
      // tricky bands start fast and slow right down
      const speed = PACE_SPEED[c.pace] * rush * (c.pace === 'tricky' ? Math.max(0.35, 1.6 - c.age * 0.6) : 1);
      c.phase += speed * Math.PI * dt;
      const inp = inputs[c.id] ?? NO_INPUT;
      const timeout = c.age > TIMEOUT;
      if ((inp.aPressed && c.age > 0.25) || timeout) {
        const off = timeout ? 1 : bandPos(c);
        const sc = bandScore(off);
        c.stopped = off;
        c.settle = SETTLE;
        c.scores.push(sc);
        c.total += sc;
        s.hits.push({ id: c.id, score: sc });
        if (c.total >= POP) {
          c.popAt = s.t;
          s.pops.push(c.id);
        }
      }
    }
    if (s.t >= READY + TIME || s.coopers.every((c) => c.popAt !== undefined)) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    // popped barrels first (sooner is better), then everyone else by points
    return s.coopers
      .map((c) => ({ id: c.id, value: c.popAt !== undefined ? 100000 - Math.round(c.popAt * 100) : Math.min(c.total, POP - 1), label: c.popAt !== undefined ? `POPPED in ${Math.round(c.popAt - READY)}s` : `${c.total} / ${POP} pts` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(
      ctx,
      players,
      s.coopers.map((c) => ({ id: c.id, label: c.popAt !== undefined ? 'POPPED!' : `${Math.min(c.total, POP)} / ${POP}` })),
    );
    if (s.t >= READY && s.endAt === undefined) {
      drawTimer(ctx, READY + TIME - s.t);
      text(ctx, `Reach ${POP} points to POP your barrel!`, 640, 150, 26, { color: '#ffd23f' });
    }
    if (s.endAt !== undefined) text(ctx, s.coopers.some((c) => c.popAt !== undefined) ? 'Barrels popped!' : "Time's up!", 640, 150, 40, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const c = s.coopers.find((q) => q.id === id);
    if (!c || s.t < READY || c.popAt !== undefined || c.stopped !== null) return NO_INPUT;
    // each band: aim for a crossing of the middle, hammering a little late or early depending on skill
    if (remember(k.mem, `band:${c.band}`, randRange(k.r, 0.4, 1.2))) k.mem.m = randRange(k.r, -1, 1);
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    const err = (k.level === 'hard' ? 0.05 : k.level === 'normal' ? 0.17 : 0.4) * k.mem.m;
    const pos = bandPos(c);
    const vel = Math.cos(c.phase);
    // press when the band is (about) on the line, with a timing error that scales with difficulty
    if (Math.abs(pos - err * Math.sign(vel)) < 0.07 + PACE_SPEED[c.pace] * 0.04) return press();
    return NO_INPUT;
  },
};
