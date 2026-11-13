import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { roundRect, text } from '../draw';
import { rand, randInt, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, remember, stick, type BotCtx } from '../botkit';

/**
 * Alien Count (Space Kit): a stream of aliens and astronauts dashes across the moon base. Count only
 * the aliens, then dial in your guess and lock it. Spot on scores 3, one off scores 1, and the first
 * correct lock-in each round gets a bonus point. Three rounds, each busier than the last.
 */
export const ROUNDS = 3;
/** Set by the client: true for players on this device, so you only see your own number while guessing. */
export const COUNT_HUD = { mine: (_id: string) => true };
const INTRO = 2.5; // "Round N: count the aliens!"
const PARADE = [12, 13, 14]; // Michael: it went too fast
const GUESS = 7;
const REVEAL = 3.5;
const READY = 1;

export interface Runner {
  alien: boolean;
  /** Seconds after the parade starts that it enters. */
  at: number;
  /** Seconds to cross. */
  dur: number;
  lane: number; // 0..4, back to front
  dir: 1 | -1;
  /** 0 walk, 1 hop, 2 decoy (an astronaut in a green suit) */
  style: number;
  kind: number; // which model
}
export interface Guesser {
  id: string;
  guess: number;
  locked: boolean;
  lockedAt: number;
  score: number;
  last: number; // points from the last round
}
export interface CountState {
  t: number;
  rng: Rng;
  round: number;
  phase: 'intro' | 'parade' | 'guess' | 'reveal' | 'done';
  phaseT: number;
  runners: Runner[];
  answer: number;
  guessers: Guesser[];
  moveCd: Record<string, number>;
}

function parade(s: CountState): void {
  const r = s.round;
  const aliens = randInt(s.rng, 5 + r * 2, 8 + r * 3);
  const others = randInt(s.rng, 3 + r * 2, 5 + r * 2);
  const dur = PARADE[r] ?? 10;
  const list: Runner[] = [];
  const add = (alien: boolean) =>
    list.push({
      alien,
      at: randRange(s.rng, 0, dur - 3.4),
      dur: randRange(s.rng, 2.4, 3.4) * (1 - r * 0.08),
      lane: randInt(s.rng, 0, 4),
      dir: rand(s.rng) < 0.5 ? 1 : -1,
      style: rand(s.rng) < 0.4 ? 1 : 0, // (the green-suit decoy astronaut looked like a glitched alien, so it's gone)
      kind: randInt(s.rng, 0, 1),
    });
  for (let i = 0; i < aliens; i++) add(true);
  for (let i = 0; i < others; i++) add(false);
  // from the second round, bursts: several cross at once
  if (r >= 1)
    for (let b = 0; b < r; b++) {
      const at = randRange(s.rng, 1, dur - 4);
      for (const rr of list.slice(b * 3, b * 3 + 3)) rr.at = at + randRange(s.rng, 0, 0.6);
    }
  s.runners = list.sort((a, b) => a.at - b.at);
  s.answer = aliens;
}

const go = (s: CountState, phase: CountState['phase']) => {
  s.phase = phase;
  s.phaseT = 0;
};

export const alienCount: Minigame<CountState> = {
  id: 'alien-count',
  name: 'Alien Count',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'COUNT!',
  blurb: 'Aliens and astronauts walk across the moon base. Count only the aliens! Then dial in your guess and lock it in. Spot on scores 3, one off scores 1.',
  controls: 'Stick: up / down to change your number   A: lock in',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CountState {
    const s: CountState = {
      t: 0,
      rng: { seed },
      round: 0,
      phase: 'intro',
      phaseT: 0,
      runners: [],
      answer: 0,
      guessers: players.map((p) => ({ id: p.id, guess: 10, locked: false, lockedAt: 0, score: 0, last: 0 })),
      moveCd: {},
    };
    parade(s);
    return s;
  },

  step(s: CountState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.t < READY) return;
    s.phaseT += dt;
    if (s.phase === 'intro' && s.phaseT > INTRO) go(s, 'parade');
    else if (s.phase === 'parade' && s.phaseT > (PARADE[s.round] ?? 10) + 0.4) {
      go(s, 'guess');
      for (const g of s.guessers) {
        g.locked = false;
        g.guess = 10;
      }
    } else if (s.phase === 'guess') {
      for (const g of s.guessers) {
        if (g.locked) continue;
        const inp = inputs[g.id] ?? NO_INPUT;
        const cd = (s.moveCd[g.id] = Math.max(0, (s.moveCd[g.id] ?? 0) - dt));
        if (Math.abs(inp.y) > 0.5 && cd === 0) {
          g.guess = Math.max(0, Math.min(40, g.guess + (inp.y < 0 ? 1 : -1)));
          s.moveCd[g.id] = 0.14;
        } else if (Math.abs(inp.y) < 0.3) s.moveCd[g.id] = 0;
        if (inp.aPressed && s.phaseT > 0.3) {
          g.locked = true;
          g.lockedAt = s.phaseT;
        }
      }
      if (s.phaseT > GUESS || s.guessers.every((g) => g.locked)) {
        // score the round
        const right = s.guessers.filter((g) => g.guess === s.answer).sort((a, b) => (a.locked ? a.lockedAt : 99) - (b.locked ? b.lockedAt : 99));
        for (const g of s.guessers) {
          const off = Math.abs(g.guess - s.answer);
          g.last = off === 0 ? 3 : off === 1 ? 1 : 0;
          if (right[0] === g && g.locked) g.last += 1;
          g.score += g.last;
        }
        go(s, 'reveal');
      }
    } else if (s.phase === 'reveal' && s.phaseT > REVEAL) {
      s.round++;
      if (s.round >= ROUNDS) go(s, 'done');
      else {
        parade(s);
        go(s, 'intro');
      }
    }
  },

  isOver: (s) => s.phase === 'done' && s.phaseT > 0.5,

  results(s): ResultRow[] {
    return s.guessers.map((g) => ({ id: g.id, value: g.score, label: `${g.score} points` })).sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.guessers.map((g) => ({ id: g.id, label: `${g.score}`, hot: s.phase === 'guess' && g.locked })));
    const banner = (msg: string, size = 40, color = '#ffffff') => text(ctx, msg, 640, 150, size, { color });
    if (s.phase === 'intro') {
      banner(`Round ${s.round + 1} of ${ROUNDS}`, 44, '#ffd23f');
      text(ctx, 'Count the ALIENS. Not the astronauts!', 640, 200, 26, { color: '#7dff6a' });
    } else if (s.phase === 'parade') {
      text(ctx, 'Count the aliens!', 640, 110, 30, { color: '#7dff6a' });
    } else if (s.phase === 'guess' || s.phase === 'reveal') {
      // everyone's dial in a row along the bottom
      const n = s.guessers.length;
      const w = Math.min(118, 1180 / n);
      s.guessers.forEach((g, i) => {
        const p = players.find((q) => q.id === g.id);
        const x = 640 + (i - (n - 1) / 2) * w;
        const right = s.phase === 'reveal' && g.guess === s.answer;
        ctx.fillStyle = s.phase === 'reveal' ? (right ? '#21c45a' : Math.abs(g.guess - s.answer) === 1 ? '#e0a800' : 'rgba(20,10,50,0.75)') : g.locked ? '#2f8cff' : 'rgba(20,10,50,0.75)';
        roundRect(ctx, x - w / 2 + 6, 560, w - 12, 110, 18);
        ctx.fill();
        ctx.strokeStyle = p?.color ?? '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        // while guessing you only see your own number; everyone else's stays secret until the reveal
        const mine = COUNT_HUD.mine(g.id);
        const shown = s.phase === 'reveal' || mine ? String(g.guess) : g.locked ? '✔' : '?';
        text(ctx, shown, x, 604, 44, { color: '#ffffff' });
        text(ctx, p?.name ?? '', x, 648, 15, { color: '#ffffff', weight: 800 });
        if (s.phase === 'guess' && !g.locked && mine) {
          text(ctx, '▲', x, 572, 16, { color: '#ffd23f' });
          text(ctx, '▼', x, 636, 16, { color: '#ffd23f' });
        }
        if (s.phase === 'reveal' && g.last) text(ctx, `+${g.last}`, x, 545, 26, { color: '#ffd23f' });
      });
      if (s.phase === 'guess') {
        banner('How many aliens?', 44, '#7dff6a');
        const left = Math.max(0, GUESS - s.phaseT);
        text(ctx, `${Math.ceil(left)}`, 640, 210, 34, { color: left < 3 ? '#ff5a5f' : '#ffffff' });
      } else banner(`There were ${s.answer} aliens!`, 44, '#7dff6a');
    }
  },

  bot(s, id, k: BotCtx) {
    const me = s.guessers.find((g) => g.id === id);
    if (!me || s.phase !== 'guess' || me.locked) return NO_INPUT;
    // each bot "counted" the parade with an error that depends on its skill
    if (remember(k.mem, `ac:${s.round}`, randRange(k.r, 1.2, 3.2) + (1 - k.sk.smart) * 1.5)) {
      const spread = Math.round((1 - k.sk.sense) * 4 + 1);
      k.mem.n = Math.max(0, s.answer + (rand(k.r) < 0.25 + 0.4 * k.sk.sense ? 0 : randInt(k.r, -spread, spread)));
    }
    if (me.guess !== k.mem.n) return stick(0, me.guess < k.mem.n ? -1 : 1);
    return k.mem.t > k.mem.wait ? press() : NO_INPUT;
  },
};
