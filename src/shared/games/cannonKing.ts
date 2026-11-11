import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, playerById, text } from '../draw';
import { rand, randInt, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { hearts, pickOne, playerChips } from './hud';
import { look, notices, press, remember, stick } from '../botkit';

/**
 * Cannon King (Pirate Kit, 1-vs-many): the captain stands at the cannons on the quarterdeck and fires
 * cannonballs down the deck lanes. A lane glows before its ball rolls, so runners can dodge into a
 * quiet lane. Three hits and a runner is overboard. The captain scores per hit.
 */
export const KX0 = 300, KX1 = 1180, KY0 = 170, KY1 = 650;
export const LANES = 5;
export const LANE_H = (KY1 - KY0) / LANES;
const R = 22;
const SPEED = 300;
const READY = 3;
const TIME = 40;
const WARN = 0.8;
const COOLDOWN = 0.95;
const HP = 3;

export const laneY = (l: number) => KY0 + LANE_H * (l + 0.5);
export const laneOf = (y: number) => Math.max(0, Math.min(LANES - 1, Math.floor((y - KY0) / LANE_H)));

export interface Ball {
  lane: number;
  x: number;
  warn: number; // seconds of glow left before it rolls
  speed: number;
  born: number;
}
export interface Runner extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  hp: number;
  safe: number;
  outAt: number;
}
export interface CannonState {
  t: number;
  rng: Rng;
  captain: string;
  aim: number; // lane
  cool: number;
  moveCool: number;
  hits: number;
  balls: Ball[];
  runners: Runner[];
  booms: number[]; // lanes fired this tick
  splats: { x: number; y: number }[];
}

const live = (s: CannonState) => s.runners.filter((r) => r.outAt < 0);

export const cannonKing: Minigame<CannonState> = {
  id: 'cannon-king',
  name: 'Cannon King',
  mode: '1-vs-many',
  ready: READY,
  blurb: 'The captain fires cannonballs down the deck lanes. A glowing lane is about to get a ball, so run to a quiet one! Three hits and you go overboard.',
  controls: 'Captain: Stick up/down to aim, A to fire.   Runners: Stick to move',
  minPlayers: 3,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CannonState {
    const cap = pickOne(players.length, seed);
    const others = players.filter((_, i) => i !== cap);
    return {
      t: 0,
      rng: { seed },
      captain: players[cap].id,
      aim: 2,
      cool: 0,
      moveCool: 0,
      hits: 0,
      balls: [],
      booms: [],
      splats: [],
      runners: others.map((p, i) => ({
        id: p.id,
        x: KX1 - 120 - (i % 3) * 120,
        y: laneY(i % LANES),
        face: Math.PI,
        hp: HP,
        safe: 0,
        outAt: -1,
        ...newBody(),
      })),
    };
  },

  step(s: CannonState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.booms = [];
    s.splats = [];
    if (s.t < READY) return;
    const over = s.t > READY + TIME;
    // captain
    const ci = inputs[s.captain] ?? NO_INPUT;
    s.cool = Math.max(0, s.cool - dt);
    s.moveCool = Math.max(0, s.moveCool - dt);
    if (Math.abs(ci.y) > 0.5 && s.moveCool <= 0) {
      s.aim = Math.max(0, Math.min(LANES - 1, s.aim + Math.sign(ci.y)));
      s.moveCool = 0.16;
    } else if (Math.abs(ci.y) < 0.3) s.moveCool = 0;
    if (ci.aPressed && s.cool <= 0 && !over) {
      const k = Math.min(1, (s.t - READY) / TIME);
      s.balls.push({ lane: s.aim, x: KX0 - 30, warn: WARN * (1 - k * 0.3), speed: 620 + k * 380, born: s.t });
      s.cool = COOLDOWN * (1 - k * 0.3);
    }
    for (const b of s.balls) {
      if (b.warn > 0) {
        b.warn -= dt;
        if (b.warn <= 0) s.booms.push(b.lane);
        continue;
      }
      b.x += b.speed * dt;
      for (const r of live(s)) {
        if (r.safe > 0 || r.z > 50) continue;
        if (Math.abs(r.y - laneY(b.lane)) < LANE_H / 2 + R * 0.4 && Math.abs(r.x - b.x) < R + 26) {
          r.hp--;
          r.safe = 1.1;
          r.vx += 700;
          r.vz = 520;
          s.hits++;
          s.splats.push({ x: r.x, y: r.y });
          if (r.hp <= 0) r.outAt = s.t;
        }
      }
    }
    s.balls = s.balls.filter((b) => b.x < KX1 + 80);
    for (const r of s.runners) {
      const inp = inputs[r.id] ?? NO_INPUT;
      r.safe = Math.max(0, r.safe - dt);
      const out = r.outAt >= 0;
      steer(r, out || over ? 0 : inp.x, out || over ? 0 : inp.y, SPEED, dt);
      stepVertical(r, dt);
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (!out) {
        r.x = Math.max(KX0 + 60, Math.min(KX1 - R, r.x));
        r.y = Math.max(KY0 + R * 0.6, Math.min(KY1 - R * 0.6, r.y));
      }
      if (Math.hypot(inp.x, inp.y) > 0.3) r.face = Math.atan2(inp.y, inp.x);
    }
    const alive = live(s);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) bump(alive[i], alive[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5 || (s.t > READY && live(s).length === 0 && s.t - Math.max(...s.runners.map((r) => r.outAt)) > 1.2),

  results(s): ResultRow[] {
    const total = s.runners.length * HP;
    // the captain ranks like a runner who kept as many hearts as the share of hearts they knocked off
    const capValue = Math.round((s.hits / Math.max(1, total)) * HP * 100 + (live(s).length === 0 ? 1000 : 0));
    const rows: ResultRow[] = s.runners.map((r) => ({
      id: r.id,
      value: r.outAt < 0 ? r.hp * 100 + 50 : Math.round((r.outAt - READY) * 2),
      label: r.outAt < 0 ? `Survived with ${r.hp} ${r.hp === 1 ? 'heart' : 'hearts'}` : `Overboard at ${(r.outAt - READY).toFixed(1)}s`,
    }));
    rows.push({ id: s.captain, value: capValue, label: `Captain: ${s.hits} hits` });
    return rows.sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    const cap = playerById(players, s.captain);
    playerChips(
      ctx,
      players,
      [{ id: s.captain, label: `${s.hits} hits`, hot: true }, ...s.runners.map((r) => ({ id: r.id, label: r.outAt >= 0 ? 'OUT' : hearts(r.hp), out: r.outAt >= 0 }))],
    );
    if (s.t < READY + 2) text(ctx, `${cap?.name ?? 'Captain'} is the Cannon King!`, 640, 110, 34, { color: '#ffd23f' });
  },

  bot(s, id, k) {
    if (s.t < READY) return NO_INPUT;
    if (id === s.captain) {
      // pick a lane: hard bots aim where the most runners are, easy ones just pick at random
      if (remember(k.mem, `cap:${Math.floor(s.t / 0.9)}`, randRange(k.r, 0.1, 0.4))) {
        const counts = Array.from({ length: LANES }, (_, l) => live(s).filter((r) => laneOf(r.y) === l).length);
        const best = counts.indexOf(Math.max(...counts));
        k.mem.n = rand(k.r) < k.sk.smart ? best : randInt(k.r, 0, LANES - 1);
      }
      if (k.mem.n !== s.aim) return stick(0, Math.sign(k.mem.n - s.aim));
      return s.cool <= 0 && k.mem.t > k.mem.wait ? press() : NO_INPUT;
    }
    const me = s.runners.find((r) => r.id === id);
    if (!me || me.outAt >= 0) return NO_INPUT;
    // lanes with a ball coming that this bot noticed (each ball is noticed or missed once, not every tick)
    const hot = new Set(s.balls.filter((b) => (b.warn > 0 || b.x < me.x + 40) && notices(b.born * 13.7, b.lane, k.sk.sense + 0.25)).map((b) => b.lane));
    const crowd = (y: number) => s.runners.filter((r) => r.id !== id && r.outAt < 0 && laneOf(r.y) === laneOf(y)).length;
    look(me, k.sk, k.mem, k.r, (x, y) => {
      const l = laneOf(y);
      let c = Math.abs(x - (KX1 - 220)) * 0.05 + Math.abs(y - laneY(l)) * 0.3;
      if (hot.has(l)) c += 400;
      if (l === s.aim) c += 60 * k.sk.smart;
      c += crowd(y) * 25 * k.sk.smart; // don't bunch up where the captain wants to shoot
      if (x < KX0 + 70 || x > KX1 - 30 || y < KY0 + 20 || y > KY1 - 20) c += 500;
      return c;
    }, LANE_H * 1.1);
    return stick(k.mem.sx, k.mem.sy);
  },
};
