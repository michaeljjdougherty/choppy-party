import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, playerById, popText, text } from '../draw';
import { randRange, type Rng } from '../rng';

/**
 * Fuse Draw (duel): a fuse burns down on a powder keg. When it bangs, the first to press A
 * scores. Pressing before the bang is a foul and gives the point away. First to 3 wins.
 */
export const WIN_SCORE = 3;
const TIME = 60;
const HARD_CAP = 85;
const AFTER_BANG = 2;
const PAUSE = 1.6;

export interface FuseState {
  t: number;
  rng: Rng;
  ids: string[];
  scores: Record<string, number>;
  phase: 'fuse' | 'bang' | 'point';
  phaseT: number;
  fuse: number;
  /** Who took the last point, and how ('draw' or 'foul'). */
  last: { id: string; how: 'draw' | 'foul' | 'none' } | null;
}

const done = (s: FuseState) => {
  const top = Math.max(...s.ids.map((id) => s.scores[id]));
  const leaders = s.ids.filter((id) => s.scores[id] === top);
  if (top >= WIN_SCORE) return true;
  // at the buzzer the leader wins; level means sudden death (next point)
  if (s.t >= TIME && leaders.length === 1) return true;
  return s.t >= HARD_CAP;
};

export const fuseDraw: Minigame<FuseState> = {
  id: 'fuse-draw',
  name: 'Fuse Draw',
  mode: 'Duel',
  blurb: 'Watch the fuse burn. When the keg goes BANG, press A first to score. Press early and your rival gets the point! First to 3.',
  controls: 'A: draw!',
  minPlayers: 2,
  maxPlayers: 2,

  setup(players: PlayerInfo[], seed: number): FuseState {
    const rng = { seed };
    return {
      t: 0,
      rng,
      ids: players.map((p) => p.id),
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      phase: 'fuse',
      phaseT: 0,
      fuse: randRange(rng, 2, 4.5),
      last: null,
    };
  },

  step(s: FuseState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.phaseT += dt;
    if (done(s)) return;
    const pressed = s.ids.filter((id) => (inputs[id] ?? NO_INPUT).aPressed);
    const point = (id: string, how: 'draw' | 'foul' | 'none') => {
      if (id) s.scores[id]++;
      s.last = { id, how };
      s.phase = 'point';
      s.phaseT = 0;
    };
    if (s.phase === 'fuse') {
      if (pressed.length) {
        // jumped the gun: everyone else gets the point
        const fouler = pressed[0];
        const rival = s.ids.find((id) => id !== fouler) ?? '';
        point(rival, 'foul');
        s.last = { id: rival, how: 'foul' };
      } else if (s.phaseT >= s.fuse) {
        s.phase = 'bang';
        s.phaseT = 0;
      }
    } else if (s.phase === 'bang') {
      if (pressed.length) point(pressed[0], 'draw');
      else if (s.phaseT > AFTER_BANG) point('', 'none');
    } else if (s.phaseT > PAUSE) {
      s.phase = 'fuse';
      s.phaseT = 0;
      s.fuse = randRange(s.rng, 1.6, 4.5);
    }
  },

  isOver: done,

  results(s): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: s.scores[id], label: `${s.scores[id]} ${s.scores[id] === 1 ? 'point' : 'points'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, Math.max(0, TIME - s.t));
    s.ids.forEach((id, i) => {
      const p = playerById(players, id);
      if (!p) return;
      const x = i === 0 ? 260 : 1020;
      text(ctx, p.name, x, 110, 30, { color: p.color });
      popText(ctx, `fd:${id}`, s.scores[id], x, 170, 64, { color: '#ffffff' });
    });
    if (s.phase === 'fuse') text(ctx, 'Wait for it...', 640, 600, 40, { color: '#ffd23f' });
    if (s.phase === 'bang') text(ctx, 'BANG! DRAW!', 640, 600, 70, { color: '#ff5a5f' });
    if (s.phase === 'point' && s.last) {
      const p = playerById(players, s.last.id);
      const msg = s.last.how === 'none' ? 'Too slow! No point' : s.last.how === 'foul' ? `Foul! Point to ${p?.name ?? ''}` : `${p?.name ?? ''} scores!`;
      text(ctx, msg, 640, 600, 44, { color: p?.color ?? '#ffffff' });
    }
    if (s.t >= TIME && !done(s)) text(ctx, 'Sudden death!', 640, 240, 40, { color: '#ff9f1c' });
  },
};
