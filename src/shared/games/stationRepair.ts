import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randInt, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { TEAM_HEX, TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { press, pressB, remember, stick, toward, type BotCtx } from '../botkit';

/**
 * Station Repair (Space Station Kit, team): each team keeps its half of the station alive. Consoles
 * spark and break; a broken console drains your team's oxygen. Stand at it and punch in the code
 * it shows (A and B). A wrong button resets the code. More oxygen at the end wins.
 */
export const SX0 = 80, SX1 = 1200, SY0 = 170, SY1 = 660;
export const MID = 640;
const R = 22;
const SPEED = 300;
const READY = 3;
const TIME = 50;
const DRAIN = 2.2; // oxygen per second per broken console
const PAD = 52; // how close you must stand to work a console

export interface Console {
  team: number;
  x: number;
  y: number;
  code: number[]; // 0 = A, 1 = B; empty when working
  at: number; // how far through the code
  breakIn: number; // seconds until it breaks again
  fixed: number; // celebration timer
}
export interface Tech extends Body {
  id: string;
  team: number;
  x: number;
  y: number;
  face: number;
  fixes: number;
  oops: number;
}
export interface RepairState {
  t: number;
  rng: Rng;
  oxygen: [number, number];
  consoles: Console[];
  techs: Tech[];
  sparks: number[]; // consoles that just broke
  wins: number[]; // consoles just fixed
}

const SPOTS: [number, number][] = [
  [200, 250], [470, 230], [200, 580], [470, 590], [330, 410],
];

export const stationRepair: Minigame<RepairState> = {
  id: 'station-repair',
  name: 'Station Repair',
  mode: 'Team',
  ready: READY,
  blurb: 'Consoles keep breaking and every broken one leaks your oxygen! Run to a sparking console and punch in its code with A and B. Most oxygen at the end wins.',
  controls: 'Stick: move   A / B: punch in the code',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): RepairState {
    const teams = teamsOf(players);
    const rng = { seed };
    const consoles: Console[] = [];
    for (const team of [0, 1])
      for (const [x, y] of SPOTS) consoles.push({ team, x: team === 0 ? x : 1280 - x, y, code: [], at: 0, breakIn: randRange(rng, 0.5, 4), fixed: 0 });
    const count = [0, 0];
    return {
      t: 0,
      rng,
      oxygen: [100, 100],
      consoles,
      sparks: [],
      wins: [],
      techs: players.map((p) => {
        const team = teams[p.id];
        const k = count[team]++;
        return { id: p.id, team, x: team === 0 ? 330 : 950, y: 300 + k * 60, face: 0, fixes: 0, oops: 0, ...newBody() };
      }),
    };
  },

  step(s: RepairState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.sparks = [];
    s.wins = [];
    if (s.t < READY) return;
    const live = s.t <= READY + TIME;
    const k = Math.min(1, (s.t - READY) / TIME);
    s.consoles.forEach((c, i) => {
      c.fixed = Math.max(0, c.fixed - dt);
      if (!live) return;
      if (c.code.length) s.oxygen[c.team] = Math.max(0, s.oxygen[c.team] - DRAIN * dt);
      else {
        c.breakIn -= dt;
        if (c.breakIn <= 0) {
          const len = randInt(s.rng, 3, 4) + Math.floor(k * 3);
          c.code = Array.from({ length: len }, () => (rand(s.rng) < 0.5 ? 0 : 1));
          c.at = 0;
          s.sparks.push(i);
        }
      }
    });
    for (const t of s.techs) {
      const inp = inputs[t.id] ?? NO_INPUT;
      t.oops = Math.max(0, t.oops - dt);
      steer(t, live ? inp.x : 0, live ? inp.y : 0, SPEED, dt);
      stepVertical(t, dt);
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      // each team stays on its own half of the station
      const lo = t.team === 0 ? SX0 + R : MID + 24;
      const hi = t.team === 0 ? MID - 24 : SX1 - R;
      t.x = Math.max(lo, Math.min(hi, t.x));
      t.y = Math.max(SY0 + R, Math.min(SY1 - R, t.y));
      if (Math.hypot(inp.x, inp.y) > 0.3) t.face = Math.atan2(inp.y, inp.x);
      if (!live || t.oops > 0) continue;
      const press = inp.aPressed ? 0 : inp.bPressed ? 1 : -1;
      if (press < 0) continue;
      const ci = s.consoles.findIndex((c) => c.team === t.team && c.code.length && Math.hypot(c.x - t.x, c.y - t.y) < PAD + R);
      if (ci < 0) continue;
      const c = s.consoles[ci];
      if (c.code[c.at] === press) {
        c.at++;
        if (c.at >= c.code.length) {
          c.code = [];
          c.at = 0;
          c.fixed = 0.8;
          c.breakIn = randRange(s.rng, 3.5, 7) * (1 - k * 0.45);
          t.fixes++;
          s.oxygen[t.team] = Math.min(100, s.oxygen[t.team] + 2);
          s.wins.push(ci);
        }
      } else {
        c.at = 0;
        t.oops = 0.45;
      }
    }
    for (let i = 0; i < s.techs.length; i++) for (let j = i + 1; j < s.techs.length; j++) bump(s.techs[i], s.techs[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5,

  results(s): ResultRow[] {
    const [a, b] = s.oxygen.map((o) => Math.round(o));
    const win = a === b ? 2 : a > b ? 0 : 1;
    const teams = Object.fromEntries(s.techs.map((t) => [t.id, t.team]));
    const fixes = (id: string) => s.techs.find((t) => t.id === id)?.fixes ?? 0;
    return teamResults(s.techs.map((t) => t.id), teams, win, fixes, (id) => `${TEAM_NAME[teams[id]]}: ${Math.round(s.oxygen[teams[id]])}% oxygen, ${fixes(id)} fixes`);
  },

  draw(ctx, s) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    teamScores(ctx, `${Math.round(s.oxygen[0])}%`, `${Math.round(s.oxygen[1])}%`);
    // oxygen tanks down each side
    for (const team of [0, 1]) {
      const x = team === 0 ? 24 : 1240;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, 180, 16, 420);
      const h = 420 * (s.oxygen[team] / 100);
      ctx.fillStyle = s.oxygen[team] < 30 ? '#ff5a5f' : TEAM_HEX[team];
      ctx.fillRect(x, 600 - h, 16, h);
      text(ctx, 'O₂', x + 8, 168, 16, { color: '#ffffff' });
    }
  },

  bot(s, id, k: BotCtx) {
    const me = s.techs.find((t) => t.id === id);
    if (!me || s.t < READY) return NO_INPUT;
    const mine = s.consoles.filter((c) => c.team === me.team && c.code.length);
    if (!mine.length) return NO_INPUT;
    // the closest broken console that no teammate is already standing at
    let best = mine[0];
    let bd = Infinity;
    for (const c of mine) {
      const taken = s.techs.some((t) => t.id !== id && t.team === me.team && Math.hypot(c.x - t.x, c.y - t.y) < PAD + R);
      const d = Math.hypot(c.x - me.x, c.y - me.y) + (taken ? 400 : 0);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (Math.hypot(best.x - me.x, best.y - me.y) > PAD) {
      toward(me, best.x, best.y, k.mem);
      return stick(k.mem.sx, k.mem.sy);
    }
    if (me.oops > 0) return NO_INPUT;
    // press the next button at a steady human pace; easy bots fumble now and then
    remember(k.mem, `sr:${s.consoles.indexOf(best)}:${best.at}:${best.code.length}`, randRange(k.r, 0.12, 0.3) + (1 - k.sk.smart) * 0.25);
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    const right = best.code[best.at];
    const btn = rand(k.r) < (1 - k.sk.smart) * 0.1 ? 1 - right : right;
    return btn === 0 ? press() : pressB();
  },
};
