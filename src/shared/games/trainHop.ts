import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, playerById, popText, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';

/**
 * Train Hop (Train Kit): the yard has five tracks. A signal flashes on a track, then a train
 * thunders through. Grab the coins that land on the rails and get off before the train comes.
 * A train sends you flying out of the game. Survivors rank above everyone, then by coins.
 */
export const TX0 = 60, TX1 = 1220, TY0 = 140, TY1 = 680;
export const TRACKS = [220, 320, 420, 520, 620];
export const TRACK_HALF = 30; // half the width of the danger band
export const CAR_LEN = 130;
export const WARN = 1.3;
const R = 22;
const SPEED = 310;
const TRAIN_SPEED = 950;
const DURATION = 45;
const MAX_COINS = 7;

export interface Train {
  track: number;
  /** +1 runs left to right, -1 right to left. */
  dir: number;
  cars: number;
  /** x of the locomotive's nose. */
  x: number;
  warn: number;
}
export interface RailCoin {
  x: number;
  y: number;
}
export interface Hopper extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  coins: number;
  outAt: number;
}
export interface TrainState {
  t: number;
  rng: Rng;
  spawn: number;
  coinSpawn: number;
  trains: Train[];
  coins: RailCoin[];
  hoppers: Hopper[];
}

export const trainLength = (tr: Train) => tr.cars * CAR_LEN;
/** The x span a train covers right now. */
export function trainSpan(tr: Train): [number, number] {
  const len = trainLength(tr);
  return tr.dir > 0 ? [tr.x - len, tr.x] : [tr.x, tr.x + len];
}
const live = (s: TrainState) => s.hoppers.filter((h) => h.outAt < 0);

export const trainHop: Minigame<TrainState> = {
  id: 'train-hop',
  name: 'Train Hop',
  mode: 'Free-for-all',
  blurb: 'Coins keep landing on the rails. Grab them, but watch the signals! When a light flashes, a train is coming down that track.',
  controls: 'Stick: move   A: jump',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): TrainState {
    const n = players.length;
    const s: TrainState = {
      t: 0,
      rng: { seed },
      spawn: 2,
      coinSpawn: 0,
      trains: [],
      coins: [],
      hoppers: players.map((p, i) => ({
        id: p.id,
        x: TX0 + ((i + 0.5) / n) * (TX1 - TX0),
        y: (TRACKS[i % 2 ? 2 : 1] + TRACKS[i % 2 ? 3 : 2]) / 2,
        face: -Math.PI / 2,
        coins: 0,
        outAt: -1,
        ...newBody(),
      })),
    };
    return s;
  },

  step(s: TrainState, inputs: Inputs, dt: number): void {
    s.t += dt;
    const k = Math.min(1, s.t / DURATION);

    // signals and trains: busier as the clock runs down, never two on one track
    s.spawn -= dt;
    if (s.spawn <= 0 && s.t < DURATION - 1.5) {
      s.spawn = 2.1 - 1.2 * k;
      const free = TRACKS.map((_, i) => i).filter((i) => !s.trains.some((tr) => tr.track === i));
      if (free.length) {
        const track = free[Math.floor(rand(s.rng) * free.length)];
        const dir = rand(s.rng) < 0.5 ? 1 : -1;
        const cars = 2 + Math.floor(rand(s.rng) * 3);
        s.trains.push({ track, dir, cars, x: dir > 0 ? TX0 - 120 : TX1 + 120, warn: WARN - 0.3 * k });
      }
    }
    for (const tr of s.trains) {
      if (tr.warn > 0) tr.warn -= dt;
      else tr.x += tr.dir * TRAIN_SPEED * dt;
    }
    s.trains = s.trains.filter((tr) => {
      const [a, b] = trainSpan(tr);
      return tr.dir > 0 ? a < TX1 + 200 : b > TX0 - 200;
    });

    s.coinSpawn -= dt;
    if (s.coinSpawn <= 0 && s.coins.length < MAX_COINS + Math.floor(s.hoppers.length / 2)) {
      s.coinSpawn = 0.7;
      const track = TRACKS[Math.floor(rand(s.rng) * TRACKS.length)];
      s.coins.push({ x: randRange(s.rng, TX0 + 60, TX1 - 60), y: track });
    }

    for (const h of s.hoppers) {
      if (h.outAt >= 0) {
        // flung off the screen
        stepVertical(h, dt);
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        continue;
      }
      const inp = inputs[h.id] ?? NO_INPUT;
      steer(h, inp.x, inp.y, SPEED, dt);
      if (inp.aPressed) jump(h);
      stepVertical(h, dt);
      h.x = clamp(h.x + h.vx * dt, TX0 + R, TX1 - R);
      h.y = clamp(h.y + h.vy * dt, TY0 + R, TY1 - R);
      if (Math.hypot(h.vx, h.vy) > 30) h.face = Math.atan2(h.vy, h.vx);
    }
    const ls = live(s);
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) bump(ls[i], ls[j], R);

    for (const tr of s.trains) {
      if (tr.warn > 0) continue;
      const ty = TRACKS[tr.track];
      const [a, b] = trainSpan(tr);
      // coins on the rails get swept away
      s.coins = s.coins.filter((c) => !(c.y === ty && c.x > a && c.x < b));
      for (const h of ls) {
        // trains are too tall to jump
        if (Math.abs(h.y - ty) > TRACK_HALF + R * 0.5 || h.x < a - R || h.x > b + R) continue;
        h.outAt = s.t;
        h.vz = 900;
        h.vx = tr.dir * 700;
        h.vy = h.y < ty ? -200 : 200;
      }
    }

    for (const h of live(s)) {
      if (h.z > 60) continue;
      const before = s.coins.length;
      s.coins = s.coins.filter((c) => Math.hypot(c.x - h.x, c.y - h.y) >= R + 18);
      h.coins += before - s.coins.length;
    }
  },

  isOver: (s) => s.t >= DURATION || live(s).length === 0,

  results(s): ResultRow[] {
    return s.hoppers
      .map((h) => ({
        id: h.id,
        value: h.outAt < 0 ? 100000 + h.coins : Math.round(h.outAt * 100),
        label: h.outAt < 0 ? `Made it! ${h.coins} ${h.coins === 1 ? 'coin' : 'coins'}` : `Hit at ${h.outAt.toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    const n = s.hoppers.length;
    const half = Math.ceil(n / 2);
    s.hoppers.forEach((h, i) => {
      const pl = playerById(players, h.id);
      if (!pl) return;
      const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
      ctx.globalAlpha = h.outAt >= 0 ? 0.4 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(x - 18, 20, 92, 36, 18);
      ctx.fill();
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(x, 38, 11, 0, Math.PI * 2);
      ctx.fill();
      popText(ctx, `th:${h.id}`, h.coins, x + 20, 38, 22, { align: 'left', color: '#ffd23f' });
      ctx.globalAlpha = 1;
    });
    drawTimer(ctx, DURATION - s.t);
    if (s.t < 2) text(ctx, 'Watch the signals!', 640, 120, 40, { color: '#ffd23f' });
  },
};
