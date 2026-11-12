import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, shuffle, type Rng } from '../rng';
import { TEAM_HEX, TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { stick, type BotCtx } from '../botkit';

/**
 * Stew Relay (Stew Battle): each team has its own lane of the market, with its stew pot on the left and six
 * ingredient stalls on the right. The recipe card says what goes in next; run to that stall, grab it, and
 * run it back to the pot. Each ingredient is needed once per teammate, so big and small teams have the same
 * number of trips each. Rolling barrels cross the lanes: get bowled over and you drop what you carry.
 * First team to finish the recipe wins; at the buzzer, the team further along wins.
 * Top-down, arena px.
 */
const READY = 3;
const LIMIT = 75;
export const LANE_Y = [130, 420]; // top of each team's lane
export const LANE_H = 270;
export const POT_X = 150;
const SPEED = 270;
const CARRY_SPEED = 235;
const R = 18;
export const BARREL_R = 22;
const GRAB = 42;
const DROP = 64;
const STUN = 1.2;
export const KINDS = ['onion', 'pepper', 'cheese', 'cabbage', 'tomato', 'meat'] as const;
export type Kind = (typeof KINDS)[number];
export const STEPS = 6;

export interface Runner {
  id: string;
  team: number;
  x: number;
  y: number;
  carry: Kind | null;
  stun: number;
  trips: number;
  bonks: number;
  face: number; // radians, for the view
  moving: boolean;
}
export interface Barrel {
  x: number;
  y: number; // relative to the lane top (both lanes get the same barrels, so it's fair)
  vy: number;
  spin: number;
}
export interface RelayState {
  t: number;
  rng: Rng;
  recipe: Kind[];
  /** Stall positions (same for both lanes, relative to lane top), by kind. */
  stalls: Record<Kind, { x: number; y: number }>;
  step: [number, number];
  /** Units of the current ingredient each team has put in. */
  got: [number, number];
  size: [number, number];
  runners: Runner[];
  barrels: Barrel[];
  nextBarrel: number;
  /** Events this tick, for the view. */
  plops: { team: number; kind: Kind; done: boolean }[];
  bonked: string[];
  grabs: string[];
  winner: number;
  endAt?: number;
}

export const stallAt = (s: RelayState, kind: Kind, team: number) => ({ x: s.stalls[kind].x, y: LANE_Y[team] + s.stalls[kind].y });
export const potAt = (team: number) => ({ x: POT_X, y: LANE_Y[team] + LANE_H / 2 });
/** What a team's pot needs now (null when done). */
export const needs = (s: RelayState, team: number): Kind | null => (s.step[team] >= STEPS ? null : s.recipe[s.step[team]]);
const progress = (s: RelayState, team: number) => s.step[team] + s.got[team] / Math.max(1, s.size[team]);

function carried(s: RelayState, team: number, kind: Kind): number {
  let n = 0;
  for (const r of s.runners) if (r.team === team && r.carry === kind) n++;
  return n;
}

export const stewRelay: Minigame<RelayState> = {
  id: 'stew-relay',
  name: 'Stew Relay',
  mode: 'Team',
  ready: READY,
  goWord: 'COOK!',
  blurb: 'Read the recipe, run to the right stall, and race each ingredient back to your team’s pot! Each one is needed once per teammate. Dodge the rolling barrels or you’ll drop it. First team to finish the stew wins!',
  controls: 'Stick: run (grab and drop are automatic)',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): RelayState {
    const rng = { seed };
    const teams = teamsOf(players);
    const recipe = shuffle(rng, [...KINDS]) as Kind[];
    // the stalls get their own shuffle, so the recipe order doesn't match the stall order
    const spots = shuffle(rng, [0, 1, 2, 3, 4, 5]);
    const stalls = {} as Record<Kind, { x: number; y: number }>;
    KINDS.forEach((k, i) => {
      const j = spots[i];
      stalls[k] = { x: 1030 + (j % 2) * 120, y: 50 + Math.floor(j / 2) * 85 };
    });
    const size: [number, number] = [0, 0];
    const count = [0, 0];
    for (const p of players) size[teams[p.id]]++;
    const runners: Runner[] = players.map((p) => {
      const team = teams[p.id];
      const i = count[team]++;
      const n = size[team];
      return { id: p.id, team, x: POT_X + 70, y: LANE_Y[team] + LANE_H * ((i + 0.5) / n), carry: null, stun: 0, trips: 0, bonks: 0, face: 0, moving: false };
    });
    return { t: 0, rng, recipe, stalls, step: [0, 0], got: [0, 0], size, runners, barrels: [], nextBarrel: 1.2, plops: [], bonked: [], grabs: [], winner: -1 };
  },

  step(s: RelayState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.plops = [];
    s.bonked = [];
    s.grabs = [];
    if (s.t < READY || s.winner >= 0) return;
    const time = s.t - READY;
    // barrels roll across both lanes (one from the top, one from the bottom, alternating)
    s.nextBarrel -= dt;
    if (s.nextBarrel <= 0) {
      s.nextBarrel = randRange(s.rng, 0.9, 1.6) * (time > 40 ? 0.8 : 1);
      const down = rand(s.rng) < 0.5;
      const vy = randRange(s.rng, 190, 280) * (down ? 1 : -1);
      s.barrels.push({ x: randRange(s.rng, 330, 900), y: down ? -BARREL_R : LANE_H + BARREL_R, vy, spin: 0 });
    }
    for (const b of s.barrels) {
      b.y += b.vy * dt;
      b.spin += (b.vy * dt) / BARREL_R;
    }
    s.barrels = s.barrels.filter((b) => b.y > -BARREL_R * 2 && b.y < LANE_H + BARREL_R * 2);

    for (const r of s.runners) {
      const inp = inputs[r.id] ?? NO_INPUT;
      const top = LANE_Y[r.team];
      r.moving = false;
      if (r.stun > 0) {
        r.stun -= dt;
        continue;
      }
      const mag = Math.hypot(inp.x, inp.y);
      if (mag > 0.2) {
        const sp = (r.carry ? CARRY_SPEED : SPEED) * Math.min(1, mag);
        r.x += (inp.x / mag) * sp * dt;
        r.y += (inp.y / mag) * sp * dt;
        r.face = Math.atan2(inp.y, inp.x);
        r.moving = true;
      }
      r.x = Math.max(60, Math.min(1230, r.x));
      r.y = Math.max(top + R, Math.min(top + LANE_H - R, r.y));
      // bowled over
      for (const b of s.barrels) {
        if (Math.hypot(r.x - b.x, r.y - (top + b.y)) < R + BARREL_R) {
          r.stun = STUN;
          r.carry = null;
          r.bonks++;
          r.y += Math.sign(b.vy) * 26;
          r.y = Math.max(top + R, Math.min(top + LANE_H - R, r.y));
          s.bonked.push(r.id);
          break;
        }
      }
      if (r.stun > 0) continue;
      const need = needs(s, r.team);
      if (!need) continue;
      if (!r.carry) {
        // grab at the stall, but only if the pot still needs more than the team is already carrying
        const st = stallAt(s, need, r.team);
        if (Math.hypot(r.x - st.x, r.y - st.y) < GRAB && s.got[r.team] + carried(s, r.team, need) < s.size[r.team]) {
          r.carry = need;
          s.grabs.push(r.id);
        }
      } else {
        const pot = potAt(r.team);
        if (Math.hypot(r.x - pot.x, r.y - pot.y) < DROP) {
          if (r.carry === need) {
            s.got[r.team]++;
            r.trips++;
            const done = s.got[r.team] >= s.size[r.team];
            s.plops.push({ team: r.team, kind: r.carry, done });
            if (done) {
              s.got[r.team] = 0;
              s.step[r.team]++;
            }
          }
          r.carry = null;
        }
      }
    }
    if (s.step[0] >= STEPS || s.step[1] >= STEPS) s.winner = s.step[0] >= STEPS ? 0 : 1;
    else if (time >= LIMIT) {
      const a = progress(s, 0), b = progress(s, 1);
      s.winner = Math.abs(a - b) < 1e-6 ? 2 : a > b ? 0 : 1;
    }
    if (s.winner >= 0) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.4,

  results(s): ResultRow[] {
    const teams = Object.fromEntries(s.runners.map((r) => [r.id, r.team]));
    return teamResults(
      s.runners.map((r) => r.id),
      teams,
      s.winner,
      (id) => s.runners.find((r) => r.id === id)!.trips,
      (id) => {
        const r = s.runners.find((q) => q.id === id)!;
        return `${r.trips} ${r.trips === 1 ? 'delivery' : 'deliveries'}`;
      },
    );
  },

  draw(ctx, s) {
    if (s.t >= READY && s.winner < 0) drawTimer(ctx, Math.max(0, READY + LIMIT - s.t));
    teamScores(ctx, `${s.step[0]} / ${STEPS}`, `${s.step[1]} / ${STEPS}`);
    for (const team of [0, 1]) {
      const need = needs(s, team);
      const y = LANE_Y[team] + 22;
      text(ctx, need ? `${TEAM_NAME[team]} needs: ${need.toUpperCase()}  ${s.got[team]}/${s.size[team]}` : `${TEAM_NAME[team]} stew is done!`, 470, y, 22, { color: TEAM_HEX[team] });
    }
    if (s.winner === 0 || s.winner === 1) text(ctx, `${TEAM_NAME[s.winner]} serves the stew!`, 640, 405, 44, { color: TEAM_HEX[s.winner] });
  },

  bot(s, id, k: BotCtx) {
    const r = s.runners.find((q) => q.id === id);
    if (!r || s.t < READY || s.winner >= 0 || r.stun > 0) return NO_INPUT;
    const need = needs(s, r.team);
    if (!need) return NO_INPUT;
    const top = LANE_Y[r.team];
    // where to: the pot with an item, the stall without (wait by it if the team has enough carriers)
    let goal = r.carry ? potAt(r.team) : stallAt(s, need, r.team);
    // easier bots sometimes run to the wrong stall for a moment
    if (!r.carry && k.level === 'easy') {
      if (k.mem.n !== s.step[r.team] * 10 + r.trips) {
        k.mem.n = s.step[r.team] * 10 + r.trips;
        k.mem.m = rand(k.r) < 0.35 ? 1 + Math.floor(rand(k.r) * 5) : 0;
      }
      if (k.mem.m && Math.abs(r.x - goal.x) > 160) goal = stallAt(s, s.recipe[(s.step[r.team] + k.mem.m) % STEPS], r.team);
    }
    let dx = goal.x - r.x, dy = goal.y - r.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) return NO_INPUT;
    dx /= d;
    dy /= d;
    // barrel dodge: look ahead along the path and wait or sidestep
    const look = k.level === 'hard' ? 0.55 : k.level === 'normal' ? 0.4 : 0.22;
    const sp = r.carry ? CARRY_SPEED : SPEED;
    for (const b of s.barrels) {
      for (let t = 0.05; t <= look; t += 0.05) {
        const px = r.x + dx * sp * t, py = r.y + dy * sp * t;
        if (Math.hypot(px - b.x, py - (top + b.y + b.vy * t)) < R + BARREL_R + 10) {
          // stand still if it's coming to us from the side, else back off along x
          const ahead = Math.abs(b.x - r.x) > R + BARREL_R + 4;
          if (ahead) return NO_INPUT;
          return stick(Math.sign(r.x - b.x) || 1, 0);
        }
      }
    }
    return stick(dx, dy);
  },
};
