import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, popText, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';
import { teamResults, teamsOf } from './ropePull';

/**
 * Crate Grab (Stew Battle): crates drop in the middle of the yard. Grab one, carry it back to
 * your team's base and drop it in. Bump a carrier to knock their crate loose. Most crates wins.
 */
export const CX0 = 80, CX1 = 1200, CY0 = 150, CY1 = 670;
export const BASE_W = 170;
const R = 22;
const SPEED = 300;
const TIME = 60;
const READY = 2;
const MAX_CRATES = 6;

export interface Crate {
  x: number;
  y: number;
  fall: number; // seconds until it lands
}
export interface Grabber extends Body {
  id: string;
  team: number;
  x: number;
  y: number;
  face: number;
  carrying: boolean;
  delivered: number;
  stun: number;
}
export interface CrateGrabState {
  t: number;
  rng: Rng;
  spawn: number;
  crates: Crate[];
  grabbers: Grabber[];
  score: [number, number];
}

const baseOf = (team: number) => (team === 0 ? CX0 + BASE_W / 2 : CX1 - BASE_W / 2);

export const crateGrab: Minigame<CrateGrabState> = {
  id: 'crate-grab',
  name: 'Crate Grab',
  mode: 'Team',
  ready: READY,
  blurb: 'Grab crates from the middle and carry them home to your team base. Bump a carrier to knock their crate loose!',
  controls: 'Stick: move   A: jump',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CrateGrabState {
    const teams = teamsOf(players);
    const count = [0, 0];
    const s: CrateGrabState = {
      t: 0,
      rng: { seed },
      spawn: 0,
      crates: [],
      score: [0, 0],
      grabbers: players.map((p) => {
        const team = teams[p.id];
        const k = count[team]++;
        return {
          id: p.id,
          team,
          x: baseOf(team),
          y: CY0 + 80 + k * 90,
          face: team === 0 ? 0 : Math.PI,
          carrying: false,
          delivered: 0,
          stun: 0,
          ...newBody(),
        };
      }),
    };
    return s;
  },

  step(s: CrateGrabState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.t < READY || s.t >= READY + TIME) return;
    s.spawn -= dt;
    if (s.spawn <= 0 && s.crates.length < MAX_CRATES) {
      s.spawn = 1.2;
      s.crates.push({ x: randRange(s.rng, 500, 780), y: randRange(s.rng, CY0 + 40, CY1 - 40), fall: 0.8 });
    }
    for (const c of s.crates) c.fall = Math.max(0, c.fall - dt);
    for (const g of s.grabbers) {
      const inp = inputs[g.id] ?? NO_INPUT;
      g.stun = Math.max(0, g.stun - dt);
      const can = g.stun <= 0;
      steer(g, can ? inp.x : 0, can ? inp.y : 0, g.carrying ? SPEED * 0.8 : SPEED, dt);
      if (can && inp.aPressed) jump(g);
      stepVertical(g, dt);
      g.x = clamp(g.x + g.vx * dt, CX0 + R, CX1 - R);
      g.y = clamp(g.y + g.vy * dt, CY0 + R, CY1 - R);
      if (Math.hypot(g.vx, g.vy) > 30) g.face = Math.atan2(g.vy, g.vx);
      // pick up
      if (!g.carrying && can && g.z < 30) {
        const i = s.crates.findIndex((c) => c.fall <= 0 && Math.hypot(c.x - g.x, c.y - g.y) < R + 24);
        if (i >= 0) {
          s.crates.splice(i, 1);
          g.carrying = true;
        }
      }
      // deliver
      if (g.carrying && Math.abs(g.x - baseOf(g.team)) < BASE_W / 2) {
        g.carrying = false;
        g.delivered++;
        s.score[g.team]++;
      }
    }
    // a hard bump from a rival knocks a crate loose
    const n = s.grabbers.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = s.grabbers[i];
        const b = s.grabbers[j];
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (!bump(a, b, R)) continue;
        if (a.team === b.team || rel < 260) continue;
        for (const v of [a, b]) {
          if (!v.carrying) continue;
          v.carrying = false;
          v.stun = 0.5;
          const ang = rand(s.rng) * Math.PI * 2;
          s.crates.push({ x: clamp(v.x + Math.cos(ang) * 70, CX0 + 40, CX1 - 40), y: clamp(v.y + Math.sin(ang) * 70, CY0 + 40, CY1 - 40), fall: 0.3 });
        }
      }
  },

  isOver: (s) => s.t >= READY + TIME,

  results(s): ResultRow[] {
    const winner = s.score[0] === s.score[1] ? 2 : s.score[0] > s.score[1] ? 0 : 1;
    const teams = Object.fromEntries(s.grabbers.map((g) => [g.id, g.team]));
    const by = (id: string) => s.grabbers.find((g) => g.id === id)!.delivered;
    return teamResults(s.grabbers.map((g) => g.id), teams, winner, by, (id) => `${by(id)} ${by(id) === 1 ? 'crate' : 'crates'}`);
  },

  draw(ctx, s) {
    if (s.t >= READY) drawTimer(ctx, Math.max(0, READY + TIME - s.t));
    text(ctx, 'Red base', 165, 60, 26, { color: '#ff5a5f' });
    popText(ctx, 'cg0', s.score[0], 165, 104, 48, { color: '#ffffff' });
    text(ctx, 'Blue base', 1115, 60, 26, { color: '#3fa9f5' });
    popText(ctx, 'cg1', s.score[1], 1115, 104, 48, { color: '#ffffff' });
  },
};
