import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { press, remember, stick, toward, type BotCtx } from '../botkit';

/**
 * Last Seat (Furniture Kit, musical chairs): a ring of armchairs, stools and beanbags in a cozy living
 * room. While Square Brian hums, everyone circles outside the ring (the chairs slowly turn, so camping
 * doesn't work). When the humming stops, run for a seat and press A to sit. For one second after
 * someone sits, a rival can bump them off with A. Whoever ends up standing is out, and a chair goes.
 * A hiccup in the hum is a fake-out: sitting during it stuns you. Last one seated wins.
 */
const R = 22;
const SPEED = 300;
const READY = 2;
const SIT_R = 46; // how close you must be to a seat to sit
const LOCK = 0.5; // seconds a seat can still be stolen
const SCRAMBLE = 4.5; // after this, anyone not seated is out
const STUN = 1;

export interface Seat {
  ang: number;
  by: string | null;
  at: number; // when they sat
  kind: number; // which chair model
}
export interface Sitter extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  outAt: number; // round they went out (-1 = still in)
  stun: number;
}
export interface SeatState {
  t: number;
  rng: Rng;
  round: number;
  phase: 'hum' | 'scramble' | 'verdict' | 'done';
  phaseT: number;
  humLen: number;
  hiccupAt: number; // seconds into the hum of the fake-out (-1 = none)
  ringR: number;
  spin: number; // ring rotation
  seats: Seat[];
  sitters: Sitter[];
  outNow: string[];
}

export const ringRadius = (n: number) => Math.min(250, 120 + n * 14);
export const seatPos = (s: SeatState, seat: Seat): [number, number] => [640 + Math.cos(seat.ang + s.spin) * s.ringR, 400 + Math.sin(seat.ang + s.spin) * s.ringR * 0.62];
const alive = (s: SeatState) => s.sitters.filter((p) => p.outAt < 0);

function newRound(s: SeatState): void {
  const n = alive(s).length;
  const k = Math.max(1, n - 1);
  s.seats = Array.from({ length: k }, (_, i) => ({ ang: (i / k) * Math.PI * 2 + rand(s.rng) * 0.3, by: null, at: 0, kind: Math.floor(rand(s.rng) * 4) }));
  s.phase = 'hum';
  s.phaseT = 0;
  // fewer players, longer hum, so a duel isn't over in ten seconds
  s.humLen = randRange(s.rng, 3.5, 6.5) + (n <= 3 ? 2 : 0);
  s.hiccupAt = rand(s.rng) < 0.5 ? randRange(s.rng, 1.2, s.humLen - 1) : -1;
}

export const lastSeat: Minigame<SeatState> = {
  id: 'last-seat',
  name: 'Last Seat',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'HMMM~',
  blurb: 'Musical chairs! Circle the chairs while Brian hums. When the humming stops, run and press A to sit. You can bump someone off a seat for a split second after they sit. Careful: a hiccup in the hum is a trick!',
  controls: 'Stick: walk   A: sit / bump',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): SeatState {
    const n = players.length;
    const ringR = ringRadius(n);
    const s: SeatState = {
      t: 0,
      rng: { seed },
      round: 0,
      phase: 'hum',
      phaseT: 0,
      humLen: 5,
      hiccupAt: -1,
      ringR,
      spin: 0,
      seats: [],
      outNow: [],
      sitters: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2;
        return { id: p.id, x: 640 + Math.cos(a) * (ringR + 90), y: 400 + Math.sin(a) * (ringR + 90) * 0.62, face: a + Math.PI / 2, outAt: -1, stun: 0, ...newBody() };
      }),
    };
    newRound(s);
    return s;
  },

  step(s: SeatState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.outNow = [];
    if (s.t < READY) return;
    s.phaseT += dt;
    if (s.phase === 'hum') s.spin += dt * 0.35;
    const humming = s.phase === 'hum';
    const hiccup = humming && s.hiccupAt >= 0 && s.phaseT > s.hiccupAt && s.phaseT < s.hiccupAt + 0.45;
    for (const p of s.sitters) {
      if (p.outAt >= 0) continue;
      p.stun = Math.max(0, p.stun - dt);
      const seat = s.seats.find((q) => q.by === p.id);
      if (seat) {
        // seated: stay put on the chair
        [p.x, p.y] = seatPos(s, seat);
        p.vx = p.vy = 0;
        continue;
      }
      const inp = p.stun > 0 || s.phase === 'verdict' ? NO_INPUT : inputs[p.id] ?? NO_INPUT;
      steer(p, inp.x, inp.y, SPEED, dt);
      stepVertical(p, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.hypot(inp.x, inp.y) > 0.3) p.face = Math.atan2(inp.y, inp.x);
      // the room's walls
      p.x = Math.max(640 - s.ringR - 220, Math.min(640 + s.ringR + 220, p.x));
      p.y = Math.max(400 - s.ringR * 0.62 - 150, Math.min(400 + s.ringR * 0.62 + 130, p.y));
      if (humming) {
        // while the hum plays, nobody may stand inside the ring
        const dx = (p.x - 640) / s.ringR, dy = (p.y - 400) / (s.ringR * 0.62);
        const d = Math.hypot(dx, dy);
        const minD = 1 + (R + 26) / s.ringR;
        if (d < minD) {
          const k = minD / Math.max(0.01, d);
          p.x = 640 + (p.x - 640) * k;
          p.y = 400 + (p.y - 400) * k;
        }
        if (inp.aPressed && hiccup) {
          p.stun = STUN;
          p.vz = 300;
        }
        continue;
      }
      if (s.phase !== 'scramble' || !inp.aPressed) continue;
      // sit in (or steal) the nearest seat in reach
      let best: Seat | null = null;
      let bd = SIT_R;
      for (const q of s.seats) {
        const [sx, sy] = seatPos(s, q);
        const d = Math.hypot(sx - p.x, sy - p.y);
        if (d < bd && (!q.by || s.phaseT - q.at < LOCK)) {
          bd = d;
          best = q;
        }
      }
      if (!best) continue;
      if (best.by) {
        const old = s.sitters.find((o) => o.id === best!.by)!;
        old.stun = 0.6;
        old.vz = 340;
        const [sx, sy] = seatPos(s, best);
        old.x = sx + (sx - 640) * 0.25;
        old.y = sy + (sy - 400) * 0.25;
      }
      // the steal window counts from the first time anyone sat here, so a seat can't be fought over forever
      if (!best.by) best.at = s.phaseT;
      best.by = p.id;
    }
    const up = alive(s).filter((p) => !s.seats.some((q) => q.by === p.id));
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) bump(up[i], up[j], R);

    if (s.phase === 'hum' && s.phaseT > s.humLen) {
      s.phase = 'scramble';
      s.phaseT = 0;
    } else if (s.phase === 'scramble') {
      const settled = s.seats.every((q) => q.by && s.phaseT - q.at > LOCK);
      if (settled || s.phaseT > SCRAMBLE) {
        for (const p of alive(s))
          if (!s.seats.some((q) => q.by === p.id)) {
            p.outAt = s.round;
            s.outNow.push(p.id);
          }
        s.phase = 'verdict';
        s.phaseT = 0;
      }
    } else if (s.phase === 'verdict' && s.phaseT > 2) {
      s.round++;
      if (alive(s).length <= 1) {
        s.phase = 'done';
        s.phaseT = 0;
      } else {
        // everyone stands up and the ring loses a chair
        for (const p of alive(s)) {
          const q = s.seats.find((z) => z.by === p.id);
          if (q) {
            const [sx, sy] = seatPos(s, q);
            p.x = 640 + (sx - 640) * 1.4;
            p.y = 400 + (sy - 400) * 1.4;
          }
        }
        newRound(s);
      }
    }
  },

  isOver: (s) => s.phase === 'done' && s.phaseT > 1,

  results(s): ResultRow[] {
    return s.sitters
      .map((p) => ({ id: p.id, value: p.outAt < 0 ? 1000 : p.outAt, label: p.outAt < 0 ? 'Last one seated!' : `Out in round ${p.outAt + 1}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.sitters.map((p) => ({ id: p.id, label: p.outAt >= 0 ? 'OUT' : 'IN', out: p.outAt >= 0 })));
    if (s.t < READY) return;
    if (s.phase === 'hum') {
      const hic = s.hiccupAt >= 0 && s.phaseT > s.hiccupAt && s.phaseT < s.hiccupAt + 0.45;
      text(ctx, hic ? 'hm...?' : '♪ hmm hmm hmmm ♪', 640, 120, 34, { color: hic ? '#ff9f1c' : '#ffe14d' });
    } else if (s.phase === 'scramble') text(ctx, 'SIT DOWN!', 640, 120, 56, { color: '#ff5a5f' });
    else if (s.phase === 'verdict') {
      const names = s.outNow.map((id) => players.find((p) => p.id === id)?.name ?? '').join(', ');
      text(ctx, names ? `${names} ${s.outNow.length > 1 ? 'are' : 'is'} out!` : 'Everyone made it!', 640, 120, 40, { color: '#ffffff' });
    }
  },

  bot(s, id, k: BotCtx) {
    const me = s.sitters.find((p) => p.id === id);
    if (!me || me.outAt >= 0 || me.stun > 0 || s.t < READY) return NO_INPUT;
    if (s.seats.some((q) => q.by === id)) return NO_INPUT;
    if (s.phase === 'hum') {
      // circle the ring, staying close to it; less careful bots sometimes try to sit at the hiccup
      // sharp bots shadow the nearest free chair as the ring turns; others just wander round
      let a = Math.atan2((me.y - 400) / 0.62, me.x - 640) + 0.5;
      if (k.sk.smart > 0.5) {
        const mine = Math.atan2((me.y - 400) / 0.62, me.x - 640);
        const near = s.seats.reduce((b, q) => (Math.abs(Math.sin((q.ang + s.spin - mine) / 2)) < Math.abs(Math.sin((b.ang + s.spin - mine) / 2)) ? q : b), s.seats[0]);
        a = near.ang + s.spin + 0.25;
      }
      const r = s.ringR + 50;
      toward(me, 640 + Math.cos(a) * r, 400 + Math.sin(a) * r * 0.62, k.mem);
      const hic = s.hiccupAt >= 0 && s.phaseT > s.hiccupAt && s.phaseT < s.hiccupAt + 0.45;
      if (hic && remember(k.mem, `ls:h:${s.round}`, 0.15) && rand(k.r) < (1 - k.sk.sense) * 0.6) return press();
      return stick(k.mem.sx, k.mem.sy);
    }
    if (s.phase !== 'scramble') return NO_INPUT;
    remember(k.mem, `ls:${s.round}`, randRange(k.r, k.sk.react[0], k.sk.react[1]) + (1 - k.sk.smart) * 0.2);
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    // the nearest seat that's free (or still stealable)
    let best: Seat | null = null;
    let bd = Infinity;
    for (const q of s.seats) {
      if (q.by && s.phaseT - q.at >= LOCK) continue;
      const [sx, sy] = seatPos(s, q);
      const d = Math.hypot(sx - me.x, sy - me.y) + (q.by ? 420 : 0);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    if (!best) return NO_INPUT;
    const [sx, sy] = seatPos(s, best);
    toward(me, sx, sy, k.mem);
    return stick(k.mem.sx, k.mem.sy, Math.hypot(sx - me.x, sy - me.y) < SIT_R - 6);
  },
};
