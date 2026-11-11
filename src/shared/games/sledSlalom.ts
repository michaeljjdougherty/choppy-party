import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { stick, type BotCtx } from '../botkit';

/**
 * Sled Slalom (Holiday Kit): everyone sleds down a snowy village slope at once, steering through flag
 * gates. Missing a gate adds 2 seconds. Snowdrifts slow you, ice patches speed you up but steer like
 * butter. Tap A at the start to push off; hold A on the way down to tuck (faster, but turns wider).
 * Sleds bump each other. Best time plus penalties wins.
 */
const READY = 3;
const LIMIT = 62;
export const COURSE = 18500; // px downhill
const START_Y = 200;
const GATE_GAP = 560;
export const GATE_HALF = 78;
const PENALTY = 2;
const R = 24;
const BASE = 430;
const TUCK = 580;
const STEER = 380;
const PUSH_WINDOW = 1.6;

export const slopeW = (n: number) => Math.min(1100, 620 + n * 46);

export interface Patch {
  x: number;
  y: number;
  r: number;
  ice: boolean;
}
export interface Sled {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  land: number;
  face: number;
  tuck: boolean;
  gate: number; // next gate index
  missed: number;
  finish: number; // race time, -1 while racing
  pushes: number;
  /** Seconds left of the "missed!" flash. */
  missFlash: number;
}
export interface SledState {
  t: number;
  rng: Rng;
  w: number;
  gates: { x: number; y: number }[];
  patches: Patch[];
  sleds: Sled[];
  bonks: { x: number; y: number }[];
  misses: string[];
  passes: string[];
  endAt?: number;
}

const X0 = (s: SledState) => 640 - s.w / 2;
const X1 = (s: SledState) => 640 + s.w / 2;
/** Total time with penalties (finished sleds). */
export const sledTime = (u: Sled) => u.finish + u.missed * PENALTY;

export const sledSlalom: Minigame<SledState> = {
  id: 'sled-slalom',
  name: 'Sled Slalom',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'PUSH!',
  blurb: 'Race down the snowy village on a sled! Steer through every flag gate (a miss adds 2 seconds). Tap A at the start to push off, then hold A to tuck: faster, but you turn wider. Drifts slow you down, ice speeds you up but it’s slippery!',
  controls: 'Stick: steer   A: push off / hold to tuck',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): SledState {
    const rng = { seed };
    const n = players.length;
    const w = slopeW(n);
    const gates: { x: number; y: number }[] = [];
    let gx = 640;
    for (let y = START_Y + 700; y < START_Y + COURSE - 300; y += GATE_GAP) {
      // gates swing side to side so you have to carve
      gx = Math.max(640 - w / 2 + 140, Math.min(640 + w / 2 - 140, gx + (rand(rng) < 0.5 ? -1 : 1) * randRange(rng, 140, w * 0.38)));
      gates.push({ x: gx, y });
    }
    const patches: Patch[] = [];
    for (let i = 0; i < 18; i++) {
      const y = START_Y + 900 + rand(rng) * (COURSE - 1400);
      const ice = rand(rng) < 0.45;
      patches.push({ x: 640 + (rand(rng) * 2 - 1) * (w / 2 - 90), y, r: ice ? randRange(rng, 90, 140) : randRange(rng, 60, 95), ice });
    }
    return {
      t: 0,
      rng,
      w,
      gates,
      patches,
      bonks: [],
      misses: [],
      passes: [],
      sleds: players.map((p, i) => ({
        id: p.id,
        x: 640 + ((i + 0.5) / n - 0.5) * (w - 120),
        y: START_Y,
        vx: 0,
        vy: 0,
        z: 0,
        vz: 0,
        land: 0,
        face: Math.PI / 2,
        tuck: false,
        gate: 0,
        missed: 0,
        finish: -1,
        pushes: 0,
        missFlash: 0,
      })),
    };
  },

  step(s: SledState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.bonks = [];
    s.misses = [];
    s.passes = [];
    if (s.t < READY || s.endAt !== undefined) return;
    const race = s.t - READY;
    for (const u of s.sleds) {
      u.missFlash = Math.max(0, u.missFlash - dt);
      u.land = Math.max(0, u.land - dt);
      if (u.finish >= 0) {
        // coast to a stop past the line
        u.vy *= Math.max(0, 1 - dt * 1.5);
        u.y += u.vy * dt;
        continue;
      }
      const inp = inputs[u.id] ?? NO_INPUT;
      const patch = s.patches.find((p) => Math.hypot(p.x - u.x, (p.y - u.y) * 0.8) < p.r);
      // push off: taps at the start give a launch
      if (race < PUSH_WINDOW && inp.aPressed && u.pushes < 5) {
        u.pushes++;
        u.vy += 70;
      }
      u.tuck = race >= PUSH_WINDOW && inp.a;
      const top = (u.tuck ? TUCK : BASE) * (patch ? (patch.ice ? 1.3 : 0.45) : 1);
      const gain = (patch && !patch.ice ? 900 : 260) * dt;
      u.vy += Math.max(-gain, Math.min(gain * (race < PUSH_WINDOW ? 0.4 : 1), top - u.vy));
      // steering: tucked or on ice you carve wide
      const grip = (u.tuck ? 0.45 : 1) * (patch?.ice ? 0.3 : 1);
      const want = inp.x * STEER * (u.tuck ? 0.75 : 1);
      u.vx += (want - u.vx) * Math.min(1, dt * 7 * grip);
      const prevY = u.y;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      if (u.x < X0(s) + R) {
        u.x = X0(s) + R;
        u.vx = Math.abs(u.vx) * 0.3;
        u.vy *= 0.8;
      }
      if (u.x > X1(s) - R) {
        u.x = X1(s) - R;
        u.vx = -Math.abs(u.vx) * 0.3;
        u.vy *= 0.8;
      }
      u.face = Math.atan2(u.vy, u.vx);
      // gates
      const g = s.gates[u.gate];
      if (g && prevY < g.y && u.y >= g.y) {
        if (Math.abs(u.x - g.x) > GATE_HALF) {
          u.missed++;
          u.missFlash = 1.2;
          s.misses.push(u.id);
        } else s.passes.push(u.id);
        u.gate++;
      }
      if (u.y >= START_Y + COURSE) u.finish = race;
    }
    // sled bumps
    for (let i = 0; i < s.sleds.length; i++)
      for (let j = i + 1; j < s.sleds.length; j++) {
        const a = s.sleds[i], b = s.sleds[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        const nx = dx / d, ny = dy / d, ov = R * 2 - d;
        a.x -= nx * ov * 0.5;
        a.y -= ny * ov * 0.5;
        b.x += nx * ov * 0.5;
        b.y += ny * ov * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        a.vx -= rel * nx * 1.2;
        a.vy -= rel * ny * 0.6;
        b.vx += rel * nx * 1.2;
        b.vy += rel * ny * 0.6;
        if (rel > 80) s.bonks.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    if (s.sleds.every((u) => u.finish >= 0) || race >= LIMIT) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    return s.sleds
      .map((u) =>
        u.finish >= 0
          ? { id: u.id, value: 100000 - Math.round(sledTime(u) * 100), label: `${sledTime(u).toFixed(2)}s${u.missed ? ` (${u.missed} missed)` : ''}` }
          : { id: u.id, value: Math.round(u.y - u.missed * 200), label: `Didn't finish (${Math.round(((u.y - START_Y) / COURSE) * 100)}%)` },
      )
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + LIMIT - s.t);
    playerChips(
      ctx,
      players,
      s.sleds.map((u) => ({
        id: u.id,
        label: u.finish >= 0 ? `${sledTime(u).toFixed(1)}s` : `${Math.round(((u.y - START_Y) / COURSE) * 100)}%${u.missed ? ` +${u.missed * PENALTY}s` : ''}`,
        hot: u.missFlash > 0,
      })),
    );
    if (s.t >= READY && s.t < READY + PUSH_WINDOW) text(ctx, 'Tap A to push off!', 640, 150, 36, { color: '#7cf3ff' });
  },

  bot(s, id, k: BotCtx) {
    const u = s.sleds.find((q) => q.id === id);
    if (!u || s.t < READY || u.finish >= 0) return NO_INPUT;
    const race = s.t - READY;
    if (race < PUSH_WINDOW) return (s.t * k.sk.mash) % 1 < 0.5 ? { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 } : NO_INPUT;
    const g = s.gates[u.gate];
    // easy bots wander off line now and then and miss a gate
    if (k.mem.n !== u.gate) {
      k.mem.n = u.gate;
      k.mem.m = (rand(k.r) * 2 - 1) * (k.level === 'easy' ? 120 : k.level === 'normal' ? 45 : 15);
    }
    const tx = g ? g.x + k.mem.m : 640;
    const dy = g ? Math.max(60, g.y - u.y) : 400;
    // lead the turn: where we'll be when we reach the gate
    const t = dy / Math.max(150, u.vy);
    const want = Math.max(-1, Math.min(1, ((tx - u.x) / Math.max(0.25, t) - u.vx * 0.3) / STEER));
    const lined = Math.abs(tx - u.x) < 60 + dy * 0.12;
    const tuck = lined && k.sk.smart > 0.4;
    return stick(want, 0, tuck);
  },
};
