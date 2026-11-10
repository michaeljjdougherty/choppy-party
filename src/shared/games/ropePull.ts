import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';

/**
 * Rope Pull (Stew Battle): a mashing tug-of-war over a muddy pit. Every tap of A pulls for your
 * team, averaged over the team so small teams aren't punished. Drag the flag across your line.
 */
export const LINE = 220; // how far the flag must travel
const TIME = 30;
const PULL = 9; // flag px per tap (team average)
const READY = 2.5;

export interface RopeState {
  t: number;
  ids: string[];
  teams: Record<string, number>;
  /** Flag position: negative = team 0's side (left), positive = team 1's side. */
  flag: number;
  vel: number;
  taps: Record<string, number>;
  winner: number; // -1 none yet, 0/1 team, 2 draw
}

export function teamsOf(players: PlayerInfo[]): Record<string, number> {
  return Object.fromEntries(players.map((p, i) => [p.id, p.team ?? i % 2]));
}

export function teamResults(ids: string[], teams: Record<string, number>, winner: number, score: (id: string) => number, label: (id: string) => string): ResultRow[] {
  // winners outrank losers; a draw gives everyone 0 so the board sees a tie
  return ids
    .map((id) => ({ id, value: winner === 2 || winner < 0 ? 0 : teams[id] === winner ? 1000 + score(id) : score(id), label: label(id) }))
    .sort((a, b) => b.value - a.value);
}

export const ropePull: Minigame<RopeState> = {
  id: 'rope-pull',
  name: 'Rope Pull',
  mode: 'Team',
  ready: READY,
  goWord: 'PULL!',
  blurb: 'Mash A to haul the rope! Drag the flag over your side of the mud pit before time runs out.',
  controls: 'A: pull (mash it!)',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[]): RopeState {
    return { t: 0, ids: players.map((p) => p.id), teams: teamsOf(players), flag: 0, vel: 0, taps: Object.fromEntries(players.map((p) => [p.id, 0])), winner: -1 };
  },

  step(s: RopeState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.winner >= 0 || s.t < READY) return;
    const pull = [0, 0];
    const size = [0, 0];
    for (const id of s.ids) {
      const team = s.teams[id];
      size[team]++;
      const taps = (inputs[id] ?? NO_INPUT).aTaps;
      s.taps[id] += taps;
      pull[team] += taps;
    }
    const force = (pull[1] / Math.max(1, size[1]) - pull[0] / Math.max(1, size[0])) * PULL;
    // a heavy rope: taps add momentum, mud drags it back down
    s.vel += force * 10;
    s.vel *= Math.exp(-4 * dt);
    s.flag += s.vel * dt;
    if (s.flag <= -LINE) s.winner = 0;
    else if (s.flag >= LINE) s.winner = 1;
    else if (s.t >= READY + TIME) s.winner = Math.abs(s.flag) < 4 ? 2 : s.flag < 0 ? 0 : 1;
  },

  isOver: (s) => s.winner >= 0,

  results(s): ResultRow[] {
    return teamResults(s.ids, s.teams, s.winner, (id) => s.taps[id], (id) => `${s.taps[id]} pulls`);
  },

  draw(ctx, s) {
    if (s.t >= READY) drawTimer(ctx, Math.max(0, READY + TIME - s.t));
    text(ctx, 'Red team', 200, 60, 30, { color: '#ff5a5f' });
    text(ctx, 'Blue team', 1080, 60, 30, { color: '#3fa9f5' });
  },
};
