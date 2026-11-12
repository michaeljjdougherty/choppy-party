import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, type BotCtx } from '../botkit';

/**
 * Crate Stacker (duel): a dock crane swings a crate back and forth over your tower. Press A to let it go.
 * Land it square on the crate below to build up; land it off-centre and the tower leans and wobbles more;
 * miss the top crate by too much and it topples, ending your run. Tallest tower at the buzzer wins (ties:
 * the neater tower).
 * Coordinates are per tower: x across (0 = the tower's base centre), y = crates up.
 */
const READY = 3;
const LIMIT = 45;
export const CW = 90; // crate width, px
export const CH = 46; // crate height, px
const FALL_T = 0.45; // seconds for a dropped crate to land
const NEXT_T = 0.55; // pause before the next crate swings in
/** How far off the crate below you can land before it topples (fraction of a crate width). */
const TOPPLE = 0.55;

export interface Stack {
  id: string;
  /** Landed crates' x offsets from the base centre, bottom first. */
  crates: number[];
  /** The swinging crate: x = sin(phase) * reach. */
  phase: number;
  /** A dropped crate in the air: where it was let go and how long it has fallen. */
  drop: { x: number; t: number } | null;
  next: number; // seconds until the next crate appears
  over: boolean; // toppled
  toppledAt: number;
  /** Sum of misalignment (for ties and wobble). */
  slop: number;
  perfect: number;
  /** Seconds left of the "perfect!" flash. */
  flash: number;
}
export interface StackState {
  t: number;
  rng: Rng;
  stacks: Stack[];
  lands: { id: string; perfect: boolean }[];
  topples: string[];
  endAt?: number;
}

/** How far the crane swings (grows a little as the tower climbs, so it gets harder). */
export const reach = (n: number) => 150 + Math.min(80, n * 6);
/** Swing speed in radians per second. */
export const swingSpeed = (n: number) => 2.1 + Math.min(2.4, n * 0.16);
export const craneX = (k: Stack) => Math.sin(k.phase) * reach(k.crates.length);
/** Tower sway: neat towers barely move, sloppy ones rock. */
export const sway = (k: Stack, t: number) => Math.sin(t * 2.3) * Math.min(26, k.slop * 0.12 + k.crates.length * 0.4);
const topX = (k: Stack) => (k.crates.length ? k.crates[k.crates.length - 1] : 0);

export const crateStacker: Minigame<StackState> = {
  id: 'crate-stacker',
  name: 'Crate Stacker',
  mode: 'Duel',
  ready: READY,
  goWord: 'STACK!',
  blurb: 'A crane swings crates over your tower. Press A to drop one. Land it square to build higher; miss the crate below and your tower topples! Tallest tower when time runs out wins.',
  controls: 'A: drop the crate',
  minPlayers: 2,
  maxPlayers: 2,

  setup(players: PlayerInfo[], seed: number): StackState {
    const rng = { seed };
    return {
      t: 0,
      rng,
      lands: [],
      topples: [],
      // both cranes start at the same point of the swing, so it's fair
      stacks: players.map((p) => ({ id: p.id, crates: [], phase: 0, drop: null, next: 0, over: false, toppledAt: 0, slop: 0, perfect: 0, flash: 0 })),
    };
  },

  step(s: StackState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.lands = [];
    s.topples = [];
    if (s.t < READY || s.endAt !== undefined) return;
    for (const k of s.stacks) {
      k.flash = Math.max(0, k.flash - dt);
      if (k.over) continue;
      const inp = inputs[k.id] ?? NO_INPUT;
      if (k.drop) {
        k.drop.t += dt;
        if (k.drop.t >= FALL_T) {
          const off = k.drop.x - topX(k) - (k.crates.length ? 0 : 0);
          // the base is a wide pallet: the first crate only needs to land on the dock
          const limit = k.crates.length ? CW * TOPPLE : CW * 1.2;
          if (Math.abs(off) > limit) {
            k.over = true;
            k.toppledAt = s.t;
            s.topples.push(k.id);
          } else {
            const perfect = Math.abs(off) < 7;
            // a perfect drop snaps square
            k.crates.push(perfect ? topX(k) : k.drop.x);
            k.slop += Math.abs(off);
            if (perfect) {
              k.perfect++;
              k.flash = 0.8;
            }
            s.lands.push({ id: k.id, perfect });
          }
          k.drop = null;
          k.next = NEXT_T;
          k.phase = rand(s.rng) < 0.5 ? 0 : Math.PI;
        }
        continue;
      }
      if (k.next > 0) {
        k.next -= dt;
        continue;
      }
      k.phase += swingSpeed(k.crates.length) * dt;
      if (inp.aPressed) k.drop = { x: craneX(k), t: 0 };
    }
    if (s.t - READY >= LIMIT || s.stacks.every((k) => k.over)) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.2,

  results(s): ResultRow[] {
    return s.stacks
      .map((k) => ({ id: k.id, value: k.crates.length * 1000 - Math.round(k.slop / 10), label: `${k.crates.length} ${k.crates.length === 1 ? 'crate' : 'crates'} high${k.over ? ' (toppled)' : ''}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + LIMIT - s.t);
    playerChips(ctx, players, s.stacks.map((k) => ({ id: k.id, label: k.over ? `${k.crates.length} · TOPPLED` : `${k.crates.length} high`, out: k.over, hot: k.flash > 0 })));
    if (s.t >= READY && s.t < READY + 2) text(ctx, 'Press A to drop!', 640, 150, 34, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const me = s.stacks.find((q) => q.id === id);
    if (!me || s.t < READY || me.over || me.drop || me.next > 0) return NO_INPUT;
    // a winning bot coasts: no need to risk it when well ahead late on
    const rival = s.stacks.find((q) => q.id !== id);
    if (rival?.over && me.crates.length > rival.crates.length && k.level !== 'easy') return NO_INPUT;
    // aim to let go when the crane is over the top crate, leading for the fall; skill = timing error
    const err = k.level === 'hard' ? 6 : k.level === 'normal' ? 18 : 34;
    if (k.mem.n !== me.crates.length) {
      k.mem.n = me.crates.length;
      k.mem.m = (rand(k.r) * 2 - 1) * err;
    }
    const x = craneX(me);
    const v = Math.cos(me.phase) * reach(me.crates.length) * swingSpeed(me.crates.length);
    const want = (me.crates.length ? me.crates[me.crates.length - 1] : 0) + k.mem.m;
    // let go a frame early so the crane is right over it
    return Math.abs(x + v * k.dt - want) < Math.abs(v) * k.dt * 1.2 + 2 ? press() : NO_INPUT;
  },
};
