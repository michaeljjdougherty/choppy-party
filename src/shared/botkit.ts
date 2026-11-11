/**
 * Shared bot toolkit: skill levels, per-bot memory and the little steering helpers.
 * Minigames can bring their own bot (Minigame.bot) built from these.
 */
import type { TickInput } from './types';
import { NO_INPUT } from './types';
import { rand, randRange, type Rng } from './rng';

export interface Skill {
  /** Seconds between fresh looks at the field (slower = reacts later to new danger). */
  think: number;
  /** Random wobble on the stick, in radians. */
  wobble: number;
  /** A presses per second when mashing. */
  mash: number;
  /** Reaction time range for "press when it happens" games, in seconds. */
  react: [number, number];
  /** Chance per round of jumping the gun. */
  early: number;
  /** 0..1: how much danger it notices. */
  sense: number;
  /** Error in px when lining up a drop or a paddle. */
  aim: number;
  /** Paddle speed multiplier. */
  paddle: number;
  /** Board: how often it makes the smart choice. */
  smart: number;
}


/** Per-bot scratch memory, kept in the party state so it is plain JSON. */
export interface BotMem {
  /** What the bot last noticed (round, phase, prompt): a change resets its timers. */
  key: string;
  /** Delay before acting on the current thing. */
  wait: number;
  /** Time since `key` changed. */
  t: number;
  /** Time until the next fresh look. */
  next: number;
  /** Chosen stick direction between looks. */
  sx: number;
  sy: number;
  /** Fractional mash presses carried between ticks. */
  mash: number;
  /** General-purpose slots (planned choice, aim offset, last sign). */
  n: number;
  m: number;
  prev: number;
  early: number;
  /** Board turn when this bot last considered its items. */
  itemTurn: number;
}

export const newMem = (): BotMem => ({ key: '', wait: 0, t: 0, next: 0, sx: 0, sy: 0, mash: 0, n: -1, m: 0, prev: 0, early: -1, itemTurn: -1 });


/** Everything a game's own bot gets each tick. */
export interface BotCtx {
  sk: Skill;
  mem: BotMem;
  r: Rng;
  dt: number;
  level: 'easy' | 'normal' | 'hard';
}

export const press = (a = true): TickInput => ({ ...NO_INPUT, a, aPressed: a, aTaps: a ? 1 : 0 });
export const pressB = (): TickInput => ({ ...NO_INPUT, b: true, bPressed: true, bTaps: 1 });
export const stick = (x: number, y: number, a = false): TickInput => ({ ...NO_INPUT, x, y, a, aPressed: a, aTaps: a ? 1 : 0 });

export function remember(mem: BotMem, key: string, wait: number): boolean {
  if (mem.key === key) return false;
  mem.key = key;
  mem.t = 0;
  mem.wait = wait;
  mem.next = 0;
  mem.n = -1;
  mem.early = -1;
  return true;
}

export function mash(sk: Skill, mem: BotMem, dt: number, r: Rng): TickInput {
  mem.mash += sk.mash * dt * randRange(r, 0.75, 1.25);
  const taps = Math.floor(mem.mash);
  mem.mash -= taps;
  return taps ? { ...NO_INPUT, a: true, aPressed: true, aTaps: taps } : NO_INPUT;
}

/* ---------- movement helpers */

export interface Mover {
  x: number;
  y: number;
}

/**
 * Look around: try a ring of nearby spots and pick the cheapest. `cost` scores a spot (distance to the goal
 * plus danger). The result is a stick direction held until the next look.
 */
export function look(me: Mover, sk: Skill, mem: BotMem, r: Rng, cost: (x: number, y: number) => number, reach = 110): void {
  if (mem.next > 0) return;
  mem.next = sk.think * randRange(r, 0.8, 1.2);
  let best = cost(me.x, me.y);
  let bx = 0;
  let by = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const d of [reach * 0.5, reach]) {
      const c = cost(me.x + Math.cos(a) * d, me.y + Math.sin(a) * d);
      if (c < best - 0.5) {
        best = c;
        bx = Math.cos(a);
        by = Math.sin(a);
      }
    }
  }
  const wob = (rand(r) * 2 - 1) * sk.wobble;
  mem.sx = bx * Math.cos(wob) - by * Math.sin(wob);
  mem.sy = bx * Math.sin(wob) + by * Math.cos(wob);
}

/** Head straight for a point (re-aimed every tick, so it doesn't overshoot small things). */
export function toward(me: Mover, tx: number, ty: number, mem: BotMem): void {
  const dx = tx - me.x;
  const dy = ty - me.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) {
    mem.sx = 0;
    mem.sy = 0;
  } else {
    mem.sx = dx / d;
    mem.sy = dy / d;
  }
}

export const outside = (x: number, y: number, x0: number, x1: number, y0: number, y1: number, pad = 24) =>
  x < x0 + pad || x > x1 - pad || y < y0 + pad || y > y1 - pad;

export function nearest<T extends Mover>(me: Mover, list: T[], score?: (t: T) => number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const t of list) {
    const d = Math.hypot(t.x - me.x, t.y - me.y) + (score ? score(t) : 0);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** Whether a bot of this skill notices a particular hazard (stable for the hazard's whole life). */
export function notices(x: number, y: number, sense: number): boolean {
  if (sense >= 1) return true;
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h) < sense;
}

/** Jump when something is about to hit, if the bot notices in time. */
export function dodgeJump(mem: BotMem, sk: Skill, r: Rng, threat: boolean, grounded: boolean): boolean {
  if (!threat || !grounded) return false;
  // decide once per threat moment whether this bot noticed
  if (mem.early < 0) mem.early = rand(r) < sk.sense ? 1 : 0;
  return mem.early === 1;
}

