import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, playerById, popText } from '../draw';

/**
 * Present Pile-Up (Holiday Kit): a gift swings over your pile; press A to drop it. Land it
 * roughly on top and the pile grows. Land it too far off and it knocks the top gifts down.
 * The swing gets faster as your pile grows. Tallest pile when time runs out wins.
 */
export const GIFT_W = 70; // gift width in arena px
export const GIFT_H = 34;
export const SWING = 80; // swing amplitude
const DURATION = 30;
export const DROP_TIME = 0.32;
const COOLDOWN = 0.25;
const READY = 2;

export interface Pile {
  id: string;
  /** Horizontal offsets of each gift on the pile, from the pile's base centre. */
  gifts: number[];
  /** Swing phase. */
  phase: number;
  /** A gift on its way down: where it was let go, and time since. -1 when none. */
  dropX: number;
  dropT: number;
  cool: number;
  /** Gifts that tumbled off this pile (for the view's animation). */
  tumbles: number;
  best: number;
}
export interface PileState {
  t: number;
  piles: Pile[];
}

export const swingX = (p: Pile) => Math.sin(p.phase) * SWING;
const swingSpeed = (p: Pile) => 2.1 + p.gifts.length * 0.16;
const topX = (p: Pile) => (p.gifts.length ? p.gifts[p.gifts.length - 1] : 0);

export const presentPileUp: Minigame<PileState> = {
  id: 'present-pile-up',
  name: 'Present Pile-Up',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'DROP!',
  blurb: 'Drop the swinging gift onto your pile. Land it close to the top or the pile wobbles and gifts tumble off! Tallest pile wins.',
  controls: 'A: drop',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[]): PileState {
    return {
      t: 0,
      piles: players.map((p, i) => ({ id: p.id, gifts: [], phase: i * 0.9, dropX: 0, dropT: -1, cool: 0, tumbles: 0, best: 0 })),
    };
  },

  step(s: PileState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.t < READY) return;
    for (const p of s.piles) {
      p.phase += swingSpeed(p) * dt;
      p.cool = Math.max(0, p.cool - dt);
      const inp = inputs[p.id] ?? NO_INPUT;
      if (p.dropT >= 0) {
        p.dropT += dt;
        if (p.dropT >= DROP_TIME) {
          p.dropT = -1;
          const off = p.dropX - topX(p);
          if (p.gifts.length === 0 || Math.abs(off) <= GIFT_W * 0.6) {
            // a near-perfect drop snaps to the centre: a little help, like the real thing
            p.gifts.push(Math.abs(off) < 8 ? topX(p) : p.dropX);
          } else {
            // it clips the edge: this gift and the top one tumble off
            const lost = Math.min(p.gifts.length, 1);
            p.gifts.splice(p.gifts.length - lost, lost);
            p.tumbles++;
          }
          p.best = Math.max(p.best, p.gifts.length);
        }
      } else if (inp.aPressed && p.cool <= 0 && s.t < DURATION) {
        p.dropX = swingX(p);
        p.dropT = 0;
        p.cool = COOLDOWN;
      }
    }
  },

  isOver: (s) => s.t >= DURATION + DROP_TIME,

  results(s): ResultRow[] {
    return s.piles
      .map((p) => ({ id: p.id, value: p.gifts.length * 100 + p.best, label: `${p.gifts.length} ${p.gifts.length === 1 ? 'gift' : 'gifts'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY) drawTimer(ctx, DURATION - s.t);
    const n = s.piles.length;
    s.piles.forEach((p, i) => {
      const pl = playerById(players, p.id);
      if (!pl) return;
      const x = ((i + 0.5) / n) * 1280;
      popText(ctx, `pp:${p.id}`, p.gifts.length, x, 600, 34, { color: pl.color });
    });
  },
};
