import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, remember, stick, type BotCtx } from '../botkit';

/**
 * Pumpkin Bowling (Graveyard Kit): everyone bowls at once, one lane each, down a moonlit graveyard path.
 * Aim with the stick (the pumpkin sweeps left and right), hold A to charge, let go to roll. Ten gravestone
 * pins; a hard roll scatters them into each other. Four rolls each, most pins down wins.
 */
export const ROLLS = 4;
export const LANE_LEN = 900; // from the foul line to the head pin
export const LANE_W = 150;
export const BALL_R = 18;
export const PIN_R = 11;
export const PIN_GAP = 34;
const AIM_TIME = 9; // seconds to throw before the lane rolls for you
const ROLL_SHOW = 3.2;
const READY = 3;

export interface Pin {
  x: number; // across the lane, 0 = centre
  y: number; // down the lane from the foul line
  down: boolean;
  fall: number; // seconds since it fell (view)
  dir: number; // which way it fell
}
export interface Bowler {
  id: string;
  roll: number; // 0..ROLLS
  phase: 'aim' | 'charge' | 'rolling' | 'show' | 'done';
  phaseT: number;
  aim: number; // -1..1 across the lane
  power: number; // 0..1
  bx: number;
  by: number;
  bvx: number;
  bvy: number;
  spin: number;
  pins: Pin[];
  scores: number[];
  last: number;
  /** The ghost shoved this roll. */
  spooked?: boolean;
}
/** What each roll throws at you (the same for everyone, so it's fair). */
export interface RollPlan {
  /** Rack slides this far across the lane. */
  off: number;
  /** A ghost drifts across the lane and knocks the pumpkin off line (0 = none, else its speed). */
  ghost: number;
}
export const GHOST_Y = 520; // how far down the lane the ghost drifts
export const GHOST_R = 20;
/** Where the ghost is across lane `lane` at time t (it swings side to side). */
export const ghostX = (s: BowlState, lane: number, ghost: number) => Math.sin(s.t * ghost + lane * 1.3) * (LANE_W / 2 - GHOST_R);
export interface BowlState {
  t: number;
  rng: Rng;
  plans?: RollPlan[];
  bowlers: Bowler[];
  hits: { lane: number; n: number }[]; // pins that fell this tick (view)
}

export function rack(off = 0): Pin[] {
  const out: Pin[] = [];
  for (let row = 0; row < 4; row++)
    for (let i = 0; i <= row; i++) out.push({ x: (i - row / 2) * PIN_GAP + off, y: LANE_LEN + row * PIN_GAP * 0.87, down: false, fall: 0, dir: 0 });
  return out;
}

const total = (b: Bowler) => b.scores.reduce((a, c) => a + c, 0);

export const pumpkinBowling: Minigame<BowlState> = {
  id: 'pumpkin-bowling',
  name: 'Pumpkin Bowling',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'BOWL!',
  blurb: 'Bowl a carved pumpkin at the gravestone pins! Stick to aim, hold A to power up, let go to roll. Each roll gets trickier: the pins move, then a ghost drifts across the lane. Four rolls, most pins down wins.',
  controls: 'Stick: aim   A: hold for power, let go to roll',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): BowlState {
    // every roll gets harder: centred, slid to one side, then a ghost drifting across, then a faster ghost on a slid rack
    const rng = { seed };
    const side = () => (rand(rng) < 0.5 ? -1 : 1) * randRange(rng, 18, 26);
    const plans: RollPlan[] = [{ off: 0, ghost: 0 }, { off: side(), ghost: 0 }, { off: 0, ghost: 1.6 }, { off: side(), ghost: 2.6 }];
    return {
      t: 0,
      rng,
      plans,
      hits: [],
      bowlers: players.map((p) => ({ id: p.id, roll: 0, phase: 'aim', phaseT: 0, aim: 0, power: 0, bx: 0, by: 0, bvx: 0, bvy: 0, spin: 0, pins: rack(plans[0].off), scores: [], last: 0 })),
    };
  },

  step(s: BowlState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.hits = [];
    if (s.t < READY) return;
    s.bowlers.forEach((b, lane) => {
      const inp = inputs[b.id] ?? NO_INPUT;
      b.phaseT += dt;
      if (b.phase === 'aim' || b.phase === 'charge') {
        b.aim = Math.max(-1, Math.min(1, b.aim + inp.x * dt * 1.6));
        if (b.phase === 'aim' && inp.a && b.phaseT > 0.3) {
          b.phase = 'charge';
          b.phaseT = 0;
        }
        if (b.phase === 'charge') {
          // the meter swings up and down, so letting go at the top takes timing
          b.power = 0.5 - 0.5 * Math.cos(b.phaseT * 3.4);
          if (!inp.a) throwBall(b);
        }
        if (b.phaseT > AIM_TIME && b.phase === 'aim') {
          b.power = 0.45;
          throwBall(b);
        }
      } else if (b.phase === 'rolling') {
        b.bx += b.bvx * dt;
        b.by += b.bvy * dt;
        b.spin += b.bvy * dt * 0.05;
        // gutter
        if (Math.abs(b.bx) > LANE_W / 2 - BALL_R * 0.4) {
          b.bx = Math.sign(b.bx) * (LANE_W / 2 - BALL_R * 0.4);
          b.bvx = 0;
        }
        // the ghost: touch it and the pumpkin is shoved off its line
        const plan = s.plans?.[b.roll];
        if (plan?.ghost && Math.abs(b.by - GHOST_Y) < BALL_R + GHOST_R && b.phaseT > 0) {
          const gx = ghostX(s, lane, plan.ghost);
          if (Math.abs(b.bx - gx) < BALL_R + GHOST_R && !b.spooked) {
            b.spooked = true;
            b.bvx = (b.bx >= gx ? 1 : -1) * 260;
            b.bvy *= 0.75;
          }
        }
        let fell = 0;
        for (const p of b.pins) {
          if (p.down) continue;
          if (Math.hypot(p.x - b.bx, p.y - b.by) < BALL_R + PIN_R) {
            knock(p, Math.sign(p.x - b.bx) || 1);
            fell++;
            b.bvy *= 0.93;
            b.bvx += (b.bx - p.x) * 0.4;
          }
        }
        // falling pins tip into their neighbours; harder rolls scatter more
        for (const p of b.pins) {
          if (!p.down || p.fall > 0.25) continue;
          for (const q of b.pins)
            if (!q.down && Math.hypot(q.x - p.x, q.y - p.y) < PIN_GAP * 1.15 && rand(s.rng) < 0.035 + b.power * 0.06) {
              knock(q, Math.sign(q.x - p.x) || p.dir);
              fell++;
            }
        }
        for (const p of b.pins) if (p.down) p.fall += dt;
        if (fell) s.hits.push({ lane, n: fell });
        if (b.by > LANE_LEN + PIN_GAP * 4 || b.bvy < 60) {
          b.phase = 'show';
          b.phaseT = 0;
          b.last = b.pins.filter((p) => p.down).length;
          b.scores.push(b.last);
        }
      } else if (b.phase === 'show') {
        for (const p of b.pins) if (p.down) p.fall += dt;
        if (b.phaseT > ROLL_SHOW) {
          b.roll++;
          if (b.roll >= ROLLS) b.phase = 'done';
          else {
            b.phase = 'aim';
            b.pins = rack(s.plans?.[b.roll]?.off ?? 0);
            b.spooked = false;
            b.aim = 0;
            b.power = 0;
          }
          b.phaseT = 0;
        }
      }
    });
  },

  isOver: (s) => s.bowlers.every((b) => b.phase === 'done'),

  results(s): ResultRow[] {
    return s.bowlers.map((b) => ({ id: b.id, value: total(b), label: `${total(b)} pins (${b.scores.join(' + ')})` })).sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.bowlers.map((b) => ({ id: b.id, label: `${total(b)}` })));
    if (s.t < READY) return;
    const roll = Math.min(ROLLS, Math.min(...s.bowlers.map((b) => b.roll)) + 1);
    text(ctx, `Roll ${roll} of ${ROLLS}`, 640, 110, 30, { color: '#ffb347' });
    const plan = s.plans?.[roll - 1];
    const tip = plan?.ghost ? (plan.off ? 'Faster ghost, and the pins moved!' : 'Watch the ghost! Roll past it') : plan?.off ? 'The pins moved! Re-aim' : '';
    if (tip) text(ctx, tip, 640, 148, 22, { color: '#d9c8ff' });
  },

  bot(s, id, k: BotCtx) {
    const b = s.bowlers.find((q) => q.id === id);
    if (!b || s.t < READY) return NO_INPUT;
    if (b.phase !== 'aim' && b.phase !== 'charge') return NO_INPUT;
    // pick a line (dead centre for the best bots, with a little skill-based error) and a power to let go at
    if (remember(k.mem, `pb:${b.roll}`, randRange(k.r, 0.6, 1.8))) {
      k.mem.m = (s.plans?.[b.roll]?.off ?? 0) / (LANE_W / 2 - BALL_R) + (rand(k.r) * 2 - 1) * (1 - k.sk.smart) * 0.7 + (rand(k.r) * 2 - 1) * k.sk.aim * 0.004;
      k.mem.n = Math.round((0.8 + rand(k.r) * 0.2 - (1 - k.sk.smart) * rand(k.r) * 0.5) * 100);
    }
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    if (b.phase === 'aim') {
      if (Math.abs(b.aim - k.mem.m) > 0.04) return stick(Math.sign(k.mem.m - b.aim), 0);
      return press(true);
    }
    // charging: keep holding until the meter is near the planned power (on its way up)
    const want = k.mem.n / 100;
    const rising = Math.sin(b.phaseT * 3.4) > 0;
    if (rising && b.power >= want - 0.03) return NO_INPUT;
    return { ...NO_INPUT, a: true };
  },
};

function throwBall(b: Bowler): void {
  b.phase = 'rolling';
  b.phaseT = 0;
  b.bx = b.aim * (LANE_W / 2 - BALL_R);
  b.by = 0;
  // the stick's aim also angles the roll a touch toward the middle
  b.bvy = 380 + b.power * 520;
  b.bvx = -b.aim * 14;
  b.spin = 0;
}

function knock(p: Pin, dir: number): void {
  p.down = true;
  p.fall = 0;
  p.dir = dir;
}
