import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, popText, text } from '../draw';

const READY = 3;
const MASH = 10;

export interface PancakeState {
  t: number;
  ids: string[];
  stacks: Record<string, number>;
  flip: Record<string, number>; // animation timer per player
}

export const pancakePanic: Minigame<PancakeState> = {
  id: 'pancake-panic',
  name: 'Pancake Panic',
  mode: 'Free-for-all',
  blurb: 'Mash A to flip pancakes onto your plate. Tallest stack after 10 seconds wins!',
  controls: 'Mash A',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[]): PancakeState {
    const s: PancakeState = { t: 0, ids: players.map((p) => p.id), stacks: {}, flip: {} };
    for (const id of s.ids) {
      s.stacks[id] = 0;
      s.flip[id] = 0;
    }
    return s;
  },

  step(s: PancakeState, inputs: Inputs, dt: number): void {
    s.t += dt;
    for (const id of s.ids) s.flip[id] = Math.max(0, s.flip[id] - dt);
    if (s.t < READY || s.t > READY + MASH) return;
    for (const id of s.ids) {
      const taps = (inputs[id] ?? NO_INPUT).aTaps;
      if (taps > 0) {
        s.stacks[id] += taps;
        s.flip[id] = 0.18;
      }
    }
  },

  isOver: (s) => s.t >= READY + MASH + 1.5,

  results(s: PancakeState): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: s.stacks[id], label: `${s.stacks[id]} pancakes` }))
      .sort((a, b) => b.value - a.value);
  },

  /** HUD drawn over the 3D view; stack counts are labels in the 3D view. */
  draw(ctx, s) {
    if (s.t < READY) popText(ctx, 'pp:count', Math.ceil(READY - s.t), 640, 150, 140, { color: '#ff5a5f' });
    else if (s.t < READY + 0.8) text(ctx, 'MASH!', 640, 150, 120, { color: '#ff5a5f' });
    else if (s.t <= READY + MASH) drawTimer(ctx, READY + MASH - s.t);
    else text(ctx, 'Stop!', 640, 150, 110, { color: '#ff5a5f' });
  },
};
