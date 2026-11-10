import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { randRange, type Rng } from '../rng';

const ROUNDS = 3;
const MAX_WAIT_MS = 1500; // no press after bloom counts as this
const EARLY_PENALTY_MS = 1000;
const REVEAL_TIME = 2;

export interface QuickDrawState {
  t: number;
  rng: Rng;
  round: number;
  phase: 'wait' | 'bloom' | 'reveal' | 'done';
  phaseT: number;
  waitFor: number;
  /** ms reaction this round; -1 = jumped early; null = not yet */
  reaction: Record<string, number | null>;
  totals: Record<string, number>;
  ids: string[];
}

export const quickDrawCactus: Minigame<QuickDrawState> = {
  id: 'quick-draw-cactus',
  name: 'Quick Draw Cactus',
  mode: 'Free-for-all',
  blurb: 'Wait for the cactus to bloom, then press A as fast as you can. Press early and you get a penalty! Best of 3.',
  controls: 'A: draw!',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): QuickDrawState {
    const rng = { seed };
    const s: QuickDrawState = {
      t: 0,
      rng,
      round: 0,
      phase: 'wait',
      phaseT: 0,
      waitFor: randRange(rng, 1.8, 4.5),
      reaction: {},
      totals: {},
      ids: players.map((p) => p.id),
    };
    for (const id of s.ids) {
      s.reaction[id] = null;
      s.totals[id] = 0;
    }
    return s;
  },

  step(s: QuickDrawState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.phaseT += dt;
    if (s.phase === 'wait') {
      for (const id of s.ids) {
        if ((inputs[id] ?? NO_INPUT).aPressed && s.reaction[id] === null) s.reaction[id] = -1;
      }
      if (s.phaseT >= s.waitFor) {
        s.phase = 'bloom';
        s.phaseT = 0;
      }
    } else if (s.phase === 'bloom') {
      for (const id of s.ids) {
        if ((inputs[id] ?? NO_INPUT).aPressed && s.reaction[id] === null) {
          // the press happened somewhere inside this tick; credit the middle of it
          s.reaction[id] = Math.max(1, Math.round((s.phaseT - dt / 2) * 1000));
        }
      }
      const allIn = s.ids.every((id) => s.reaction[id] !== null);
      if (allIn || s.phaseT * 1000 >= MAX_WAIT_MS) {
        for (const id of s.ids) {
          const r = s.reaction[id];
          if (r === null) s.reaction[id] = MAX_WAIT_MS;
          s.totals[id] += r === -1 ? EARLY_PENALTY_MS : (s.reaction[id] as number);
        }
        s.phase = 'reveal';
        s.phaseT = 0;
      }
    } else if (s.phase === 'reveal') {
      if (s.phaseT >= REVEAL_TIME) {
        s.round++;
        if (s.round >= ROUNDS) {
          s.phase = 'done';
          return;
        }
        s.phase = 'wait';
        s.phaseT = 0;
        s.waitFor = randRange(s.rng, 1.8, 4.5);
        for (const id of s.ids) s.reaction[id] = null;
      }
    }
  },

  isOver: (s) => s.phase === 'done',

  results(s: QuickDrawState): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: -s.totals[id], label: `${(s.totals[id] / 1000).toFixed(3)}s total` }))
      .sort((a, b) => b.value - a.value);
  },

  /** HUD drawn over the 3D view; per-player times are labels in the 3D view. */
  draw(ctx, s) {
    if (s.phase === 'bloom') text(ctx, 'DRAW!', 640, 90, 96, { color: '#ff2f6d' });
    else if (s.phase === 'wait') text(ctx, 'Wait for it…', 640, 80, 52);
    text(ctx, `Round ${Math.min(s.round + 1, ROUNDS)} of ${ROUNDS}`, 30, 40, 28, { align: 'left' });
  },
};
