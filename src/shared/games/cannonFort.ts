import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { TEAM_HEX, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { stick, type BotCtx } from '../botkit';

/**
 * Cannon Fort (Stew Battle): two pirate forts face each other across a bay. Everyone mans a cannon on
 * their team's fort. Stick up/down tilts the barrel; hold A and the power gauge swings up and down, let go
 * to fire. The wind changes now and then (watch the flag). Every hit knocks a chunk off the other fort;
 * smaller teams hit harder, so it's fair. First fort to fall loses; at the buzzer, the sturdier fort wins.
 * Side view: x across the bay (arena px), h = height above the water.
 */
const READY = 3;
const LIMIT = 60;
export const FORT_HP = 100;
export const FORT_W = 200;
export const FORT_H = 240;
export const FORT_X = [70, 1210 - FORT_W]; // left edge of each fort
const G = 900;
const V0 = 480;
const V1 = 1120;
const COOL = 1.3;
const GAUGE_HZ = 0.65;
const WIND_EVERY = 9;
const WIND_MAX = 160; // px/s² sideways push at full wind
const ANG0 = 0.35, ANG1 = 1.25;

export interface Gunner {
  id: string;
  team: number;
  x: number; // cannon muzzle position
  h: number;
  ang: number; // radians above the horizontal, toward the enemy
  charge: number; // seconds A has been held, -1 when not charging
  cool: number;
  hits: number;
  shots: number;
}
export interface Shell {
  id: string;
  team: number;
  x: number;
  h: number;
  vx: number;
  vh: number;
}
export interface FortState {
  t: number;
  rng: Rng;
  hp: [number, number];
  wind: number; // -1..1 (+ blows toward team 1's fort)
  windAt: number;
  gunners: Gunner[];
  shells: Shell[];
  /** This tick's events, for the view. */
  booms: { x: number; h: number; hit: number }[]; // hit: team whose fort was hit, -1 for a splash
  fires: string[];
  winner: number; // -1 playing, 0/1, 2 draw
  endAt?: number;
}

export const gauge = (charge: number) => (charge < 0 ? 0 : (1 - Math.cos(charge * Math.PI * 2 * GAUGE_HZ)) / 2);
const facing = (team: number) => (team === 0 ? 1 : -1);
const enemyFort = (team: number) => FORT_X[1 - team];

function launch(g: { team: number; ang: number }, power: number): { vx: number; vh: number } {
  const v = V0 + (V1 - V0) * power;
  return { vx: Math.cos(g.ang) * v * facing(g.team), vh: Math.sin(g.ang) * v };
}

/** Where a shell from this cannon lands (x at fort-wall middle height), for the CPUs' aim. */
function landX(g: Gunner, power: number, wind: number): number {
  let { vx, vh } = launch(g, power);
  let x = g.x, h = g.h;
  const dt = 1 / 60;
  for (let i = 0; i < 400; i++) {
    vx += wind * WIND_MAX * dt;
    vh -= G * dt;
    x += vx * dt;
    h += vh * dt;
    if (vh < 0 && h < FORT_H * 0.5) return x;
  }
  return x;
}

export const cannonFort: Minigame<FortState> = {
  id: 'cannon-fort',
  name: 'Cannon Fort',
  mode: 'Team',
  ready: READY,
  goWord: 'FIRE!',
  blurb: 'Man the cannons and knock down the other team’s fort! Tilt with the stick, hold A to swing the power gauge and let go to fire. Mind the wind. First fort to fall loses!',
  controls: 'Stick ↑↓: aim   Hold A: power   Release A: fire',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): FortState {
    const rng = { seed };
    const teams = teamsOf(players);
    const count = [0, 0];
    const size = [0, 0];
    for (const p of players) size[teams[p.id]]++;
    const gunners: Gunner[] = players.map((p) => {
      const team = teams[p.id];
      const i = count[team]++;
      // cannons on three tiers of the fort, spread along each
      const tier = i % 3;
      const along = Math.floor(i / 3);
      const perTier = Math.ceil(size[team] / 3);
      const fx = FORT_X[team];
      const u = perTier > 1 ? (along + 0.5) / perTier : 0.5;
      const x = team === 0 ? fx + 40 + u * (FORT_W - 60) : fx + FORT_W - 40 - u * (FORT_W - 60);
      return { id: p.id, team, x, h: FORT_H - 30 - tier * 62, ang: 0.75, charge: -1, cool: 0.6 + i * 0.15, hits: 0, shots: 0 };
    });
    return { t: 0, rng, hp: [FORT_HP, FORT_HP], wind: randRange(rng, -0.5, 0.5), windAt: WIND_EVERY, gunners, shells: [], booms: [], fires: [], winner: -1 };
  },

  step(s: FortState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.booms = [];
    s.fires = [];
    if (s.t < READY || s.winner >= 0) return;
    const time = s.t - READY;
    if (time >= s.windAt) {
      s.windAt += WIND_EVERY;
      s.wind = randRange(s.rng, -1, 1);
    }
    const size = [0, 0];
    for (const g of s.gunners) size[g.team]++;
    for (const g of s.gunners) {
      const inp = inputs[g.id] ?? NO_INPUT;
      g.cool = Math.max(0, g.cool - dt);
      if (Math.abs(inp.y) > 0.25) g.ang = Math.max(ANG0, Math.min(ANG1, g.ang - inp.y * 0.9 * dt));
      if (inp.a && g.cool <= 0) g.charge = g.charge < 0 ? 0 : g.charge + dt;
      else if (g.charge >= 0) {
        const { vx, vh } = launch(g, gauge(g.charge));
        s.shells.push({ id: g.id, team: g.team, x: g.x + facing(g.team) * 30, h: g.h + 8, vx, vh });
        s.fires.push(g.id);
        g.shots++;
        g.charge = -1;
        g.cool = COOL;
      }
    }
    s.shells = s.shells.filter((sh) => {
      sh.vx += s.wind * WIND_MAX * dt;
      sh.vh -= G * dt;
      sh.x += sh.vx * dt;
      sh.h += sh.vh * dt;
      const fx = enemyFort(sh.team);
      if (sh.x > fx && sh.x < fx + FORT_W && sh.h < FORT_H && sh.h > 0) {
        const hitTeam = 1 - sh.team;
        // a small team hits as hard as a big one
        s.hp[hitTeam] = Math.max(0, s.hp[hitTeam] - 5.5 / Math.max(1, size[sh.team]));
        const g = s.gunners.find((q) => q.id === sh.id);
        if (g) g.hits++;
        s.booms.push({ x: sh.x, h: sh.h, hit: hitTeam });
        return false;
      }
      // its own fort shields it (no friendly fire), the sea swallows the rest
      if (sh.h <= 0 || sh.x < -100 || sh.x > 1380) {
        s.booms.push({ x: sh.x, h: 0, hit: -1 });
        return false;
      }
      return true;
    });
    if (s.hp[0] <= 0 || s.hp[1] <= 0) s.winner = s.hp[0] <= 0 && s.hp[1] <= 0 ? 2 : s.hp[0] <= 0 ? 1 : 0;
    else if (time >= LIMIT) s.winner = Math.abs(s.hp[0] - s.hp[1]) < 0.5 ? 2 : s.hp[0] > s.hp[1] ? 0 : 1;
    if (s.winner >= 0) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.4,

  results(s): ResultRow[] {
    const teams = Object.fromEntries(s.gunners.map((g) => [g.id, g.team]));
    return teamResults(
      s.gunners.map((g) => g.id),
      teams,
      s.winner,
      (id) => s.gunners.find((g) => g.id === id)!.hits,
      (id) => {
        const g = s.gunners.find((q) => q.id === id)!;
        return `${g.hits} ${g.hits === 1 ? 'hit' : 'hits'}`;
      },
    );
  },

  draw(ctx, s) {
    if (s.t >= READY && s.winner < 0) drawTimer(ctx, Math.max(0, READY + LIMIT - s.t));
    teamScores(ctx, `${Math.ceil(s.hp[0])}%`, `${Math.ceil(s.hp[1])}%`);
    // the wind sock
    const w = s.wind;
    text(ctx, `Wind ${w > 0.05 ? '→' : w < -0.05 ? '←' : '·'} ${Math.round(Math.abs(w) * 10)}`, 640, 150, 24, { color: '#ffffff' });
    if (s.winner === 0 || s.winner === 1) text(ctx, `${['Red', 'Blue'][1 - s.winner]} fort falls!`, 640, 200, 40, { color: TEAM_HEX[s.winner] });
  },

  bot(s, id, k: BotCtx) {
    const g = s.gunners.find((q) => q.id === id);
    if (!g || s.t < READY || s.winner >= 0) return NO_INPUT;
    // a fresh aim for each shot: a spot on the enemy wall, worse aim for easier bots
    const spread = k.level === 'hard' ? 60 : k.level === 'normal' ? 190 : 340;
    const key = g.shots * 7 + Math.round(s.wind * 100) * 1000;
    if (k.mem.n !== key) {
      k.mem.n = key;
      const fx = enemyFort(g.team) + FORT_W / 2 + (rand(k.r) * 2 - 1) * spread;
      // find the power that lands there at this angle in this wind
      let best = 0.5, bd = Infinity;
      for (let p = 0; p <= 1.0001; p += 0.02) {
        const d = Math.abs(landX(g, p, s.wind) - fx);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      k.mem.m = best;
      // if no power reaches it, tilt the barrel toward 45°
      k.mem.prev = bd > 60 ? 1 : 0;
    }
    if (k.mem.prev === 1 && Math.abs(g.ang - 0.78) > 0.05) {
      k.mem.n = -1;
      return stick(0, g.ang > 0.78 ? 1 : -1);
    }
    if (g.cool > 0) return NO_INPUT;
    // hold A until the gauge swings past the power we want, on its way up
    const p = gauge(g.charge);
    const tol = k.level === 'hard' ? 0.02 : k.level === 'normal' ? 0.05 : 0.1;
    if (g.charge >= 0 && Math.abs(p - k.mem.m) < tol) return NO_INPUT; // let go: fire
    return { ...NO_INPUT, a: true, aPressed: g.charge < 0, aTaps: g.charge < 0 ? 1 : 0 };
  },
};
