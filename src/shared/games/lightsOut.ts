import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { remember, stick, type BotCtx } from '../botkit';

/**
 * Lights Out Freeze (Holiday Kit): a long snowy path to the big decorated tree, strung with lights.
 * While the lights are on, run! When they flicker and go dark, freeze. Anyone still moving in the dark
 * gets yanked back. Sometimes the lights only flicker and stay on. First to the tree wins, everyone
 * else ranks by how far they got. The path is wider for a bigger crowd.
 */
export const TRACK = 4000; // how far it is to the tree (progress units, px)
const R = 22;
const SPEED = 230;
const READY = 3;
const TIME = 58;
const WARN = 0.45; // the flicker before the dark
const GRACE = 0.18; // a moment to stop after it goes dark
const SENDBACK = 420;
const MOVING = 30; // px/s: faster than this in the dark and you're caught

export interface Walker extends Body {
  id: string;
  /** Along the path, 0 = start, TRACK = the tree. */
  x: number;
  /** Across the path. */
  y: number;
  face: number;
  doneAt: number;
  caught: number; // seconds of "caught!" stun left
}
export interface LightsState {
  t: number;
  rng: Rng;
  halfW: number;
  phase: 'on' | 'warn' | 'dark';
  phaseT: number;
  phaseLen: number;
  fake: boolean; // this flicker is a fake-out
  walkers: Walker[];
  caughtNow: string[];
  finishers: number;
}

export const pathHalfWidth = (n: number) => Math.min(300, 120 + n * 18);

function next(s: LightsState): void {
  if (s.phase === 'on') {
    s.phase = 'warn';
    s.fake = rand(s.rng) < 0.25;
    s.phaseLen = WARN;
  } else if (s.phase === 'warn') {
    if (s.fake) {
      s.phase = 'on';
      s.phaseLen = randRange(s.rng, 1.2, 2.6);
    } else {
      s.phase = 'dark';
      s.phaseLen = randRange(s.rng, 1.6, 3);
    }
  } else {
    s.phase = 'on';
    s.phaseLen = randRange(s.rng, 1, 2.8);
  }
  s.phaseT = 0;
}

export const lightsOut: Minigame<LightsState> = {
  id: 'lights-out-freeze',
  name: 'Lights Out Freeze',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'RUN!',
  blurb: 'Race to the big tree while the lights are on. When they flicker and go dark, FREEZE! Anyone moving in the dark gets sent back. Watch out for fake flickers.',
  controls: 'Stick: run (and stop!)',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): LightsState {
    const n = players.length;
    const halfW = pathHalfWidth(n);
    return {
      t: 0,
      rng: { seed },
      halfW,
      phase: 'on',
      phaseT: 0,
      phaseLen: 2.4,
      fake: false,
      caughtNow: [],
      finishers: 0,
      walkers: players.map((p, i) => ({ id: p.id, x: 0, y: n === 1 ? 0 : -halfW + 40 + ((halfW * 2 - 80) * i) / (n - 1), face: 0, doneAt: -1, caught: 0, ...newBody() })),
    };
  },

  step(s: LightsState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.caughtNow = [];
    if (s.t < READY) return;
    s.phaseT += dt;
    if (s.phaseT > s.phaseLen) next(s);
    const live = s.t <= READY + TIME;
    for (const w of s.walkers) {
      w.caught = Math.max(0, w.caught - dt);
      const inp = w.doneAt >= 0 || w.caught > 0 || !live ? NO_INPUT : inputs[w.id] ?? NO_INPUT;
      steer(w, inp.x, inp.y, SPEED, dt);
      stepVertical(w, dt);
      w.x = Math.max(0, w.x + w.vx * dt);
      w.y = Math.max(-s.halfW + R, Math.min(s.halfW - R, w.y + w.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) w.face = Math.atan2(inp.y, inp.x);
      if (w.doneAt < 0 && w.x >= TRACK) {
        w.doneAt = s.t;
        w.x = TRACK;
        s.finishers++;
      }
      // caught moving in the dark
      if (s.phase === 'dark' && s.phaseT > GRACE && w.doneAt < 0 && w.caught <= 0 && Math.hypot(w.vx, w.vy) > MOVING) {
        w.x = Math.max(0, w.x - SENDBACK);
        w.vx = w.vy = 0;
        w.vz = 380;
        w.caught = 1.2;
        s.caughtNow.push(w.id);
      }
    }
    const up = s.walkers.filter((w) => w.doneAt < 0);
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) bump(up[i], up[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5 || (s.t > READY && s.walkers.every((w) => w.doneAt >= 0)) || (s.walkers.length > 1 && s.finishers >= Math.min(3, s.walkers.length - 1) && s.t > READY + 1),

  results(s): ResultRow[] {
    return s.walkers
      .map((w) => ({
        id: w.id,
        value: w.doneAt >= 0 ? 100000 - Math.round(w.doneAt * 10) : Math.round(w.x),
        label: w.doneAt >= 0 ? `Reached the tree at ${(w.doneAt - READY).toFixed(1)}s` : `${Math.round((w.x / TRACK) * 100)}% of the way`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    playerChips(ctx, players, s.walkers.map((w) => ({ id: w.id, label: w.doneAt >= 0 ? 'Tree!' : `${Math.round((w.x / TRACK) * 100)}%`, hot: w.doneAt >= 0 })));
    if (s.t < READY) return;
    if (s.phase === 'dark') text(ctx, 'FREEZE!', 640, 140, 64, { color: '#7fd6ff' });
    else if (s.phase === 'warn') text(ctx, 'Flicker...', 640, 140, 40, { color: '#ffd23f' });
    // a progress strip along the top
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(340, 690, 600, 8);
    for (const w of s.walkers) {
      const p = players.find((q) => q.id === w.id);
      ctx.fillStyle = p?.color ?? '#fff';
      ctx.beginPath();
      ctx.arc(340 + (600 * w.x) / TRACK, 694, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, '🎄', 952, 692, 22);
  },

  bot(s, id, k: BotCtx) {
    const me = s.walkers.find((w) => w.id === id);
    if (!me || s.t < READY || me.doneAt >= 0 || me.caught > 0) return NO_INPUT;
    // how fast this bot reacts to the flicker; easy bots sometimes ignore it, hard ones never fall for fakes
    if (s.phase === 'warn' || s.phase === 'dark') {
      if (remember(k.mem, `lo:${Math.round((s.t - s.phaseT - (s.phase === 'dark' ? WARN : 0)) * 10)}`, randRange(k.r, k.sk.react[0], k.sk.react[1]))) k.mem.n = rand(k.r) < k.sk.sense * 0.8 + 0.2 ? 1 : 0;
      const stopNow = k.mem.n === 1 && k.mem.t > k.mem.wait;
      if (stopNow) return NO_INPUT;
      // a careless bot keeps running (and only stops late, in the dark)
      if (s.phase === 'dark' && k.mem.t > k.mem.wait + 0.25) return NO_INPUT;
    }
    // drift toward its own lane while running forward
    const lane = (s.walkers.indexOf(me) / Math.max(1, s.walkers.length - 1) - 0.5) * s.halfW;
    return stick(1, Math.max(-0.4, Math.min(0.4, (lane - me.y) / 120)));
  },
};
