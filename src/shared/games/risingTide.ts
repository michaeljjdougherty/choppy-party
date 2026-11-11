import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { pressB, stick, type BotCtx } from '../botkit';

/**
 * Rising Tide Tower (Platformer Kit, side view): climb a tower of platforms while the sea rises below.
 * Some platforms slide back and forth, some crumble a moment after you land. B shoves anyone next to you
 * (knock them off a ledge!). Touch the water and you're out. It rises faster and faster, so there's always
 * a winner: the last one dry. Everyone else ranks by how long they lasted, then how high they got.
 * Coordinates: x across the tower (arena px), h = height above the base in px.
 */
const READY = 3;
export const ROW = 118;
export const ROWS = 100;
const G = 2100;
const JUMP = 930;
const SPEED = 300;
export const P_H = 18; // platform thickness (visual)
const R = 20;
const CRUMBLE = 0.6; // seconds standing before a crumbly platform drops
const SHOVE = 640;
const SHOVE_CD = 0.8;

export const towerW = (n: number) => Math.min(980, 640 + n * 34);

export interface Ledge {
  id: number;
  row: number;
  x: number; // centre now
  x0: number; // home centre
  w: number;
  move: number; // swing amplitude (0 = still)
  speed: number;
  phase: number;
  crumbly: boolean;
  /** Seconds someone has stood on it (crumbly ones drop at CRUMBLE). */
  stood: number;
  gone: boolean;
  /** How far it has fallen since crumbling, for the view. */
  drop: number;
}
export interface Climber {
  id: string;
  x: number;
  h: number;
  vx: number;
  vh: number;
  face: number;
  on: number; // ledge id stood on, -1 in the air, -2 on the base
  best: number; // highest h reached
  out: boolean;
  outAt: number;
  shoveCd: number;
  shoving: number;
  /** Knockback timer: no steering while it runs. */
  stun: number;
}
export interface TideState {
  t: number;
  rng: Rng;
  w: number;
  water: number;
  ledges: Ledge[];
  climbers: Climber[];
  splashes: string[];
  shoves: string[];
  endAt?: number;
}

const X0 = (s: TideState) => 640 - s.w / 2;
const X1 = (s: TideState) => 640 + s.w / 2;
/** Water height at a given time since the start. */
const waterAt = (t: number) => -100 + t * 40 + t * t * 1.5;

export const risingTide: Minigame<TideState> = {
  id: 'rising-tide-tower',
  name: 'Rising Tide Tower',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'CLIMB!',
  blurb: 'The sea is rising! Jump up the tower’s platforms to stay dry. Some slide, some crumble after you land. B shoves anyone next to you. Touch the water and you’re out. Last one dry wins!',
  controls: 'Stick: move   A: jump   B: shove',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): TideState {
    const rng = { seed };
    const n = players.length;
    const w = towerW(n);
    const ledges: Ledge[] = [];
    let id = 0;
    for (let row = 1; row <= ROWS; row++) {
      // 2 or 3 platforms per row, spread out so there's always a way up
      const k = row % 3 === 0 ? 2 : 3;
      const hard = Math.min(1, row / 30);
      for (let i = 0; i < k; i++) {
        const lane = (i + 0.5) / k + randRange(rng, -0.08, 0.08) + (row % 2 ? 0.08 : -0.08);
        const pw = randRange(rng, 150, 210) * (1 - hard * 0.25);
        const x = 640 - w / 2 + Math.max(0.1, Math.min(0.9, lane)) * w;
        const moving = rand(rng) < 0.2 + hard * 0.25;
        ledges.push({
          id: id++,
          row,
          x,
          x0: x,
          w: pw,
          move: moving ? randRange(rng, 50, 120) : 0,
          speed: randRange(rng, 0.6, 1.2),
          phase: rand(rng) * Math.PI * 2,
          crumbly: !moving && rand(rng) < 0.18 + hard * 0.2,
          stood: 0,
          gone: false,
          drop: 0,
        });
      }
    }
    return {
      t: 0,
      rng,
      w,
      water: waterAt(0),
      ledges,
      splashes: [],
      shoves: [],
      climbers: players.map((p, i) => ({
        id: p.id,
        x: 640 + ((i + 0.5) / n - 0.5) * (w - 80),
        h: 0,
        vx: 0,
        vh: 0,
        face: 0,
        on: -2,
        best: 0,
        out: false,
        outAt: 0,
        shoveCd: 0,
        shoving: 0,
        stun: 0,
      })),
    };
  },

  step(s: TideState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.splashes = [];
    s.shoves = [];
    for (const l of s.ledges) if (l.gone) l.drop += dt * 600;
    if (s.t < READY || s.endAt !== undefined) return;
    const time = s.t - READY;
    s.water = waterAt(time);
    for (const l of s.ledges) {
      if (l.gone) continue;
      if (l.move) l.x = l.x0 + Math.sin(time * l.speed + l.phase) * l.move;
    }
    const live = s.climbers.filter((c) => !c.out);
    for (const c of live) {
      const inp = inputs[c.id] ?? NO_INPUT;
      c.shoveCd = Math.max(0, c.shoveCd - dt);
      c.shoving = Math.max(0, c.shoving - dt);
      c.stun = Math.max(0, c.stun - dt);
      const ledge = c.on >= 0 ? s.ledges[c.on] : null;
      // ride a moving platform
      if (ledge && ledge.move) c.x += (ledge.x - (ledge.x0 + Math.sin((time - dt) * ledge.speed + ledge.phase) * ledge.move));
      const grounded = c.on !== -1;
      if (c.stun <= 0) {
        const want = Math.abs(inp.x) > 0.2 ? inp.x * SPEED : 0;
        const rate = (grounded ? 3200 : 1700) * dt;
        c.vx += Math.max(-rate, Math.min(rate, want - c.vx));
        if (Math.abs(inp.x) > 0.2) c.face = inp.x > 0 ? 0 : Math.PI;
        if (inp.aPressed && grounded) {
          c.vh = JUMP;
          c.on = -1;
        }
      }
      if (inp.bPressed && c.shoveCd <= 0) {
        c.shoveCd = SHOVE_CD;
        c.shoving = 0.2;
        s.shoves.push(c.id);
        for (const o of live) {
          if (o === c) continue;
          const dx = o.x - c.x;
          if (Math.abs(dx) < 70 && Math.abs(o.h - c.h) < 50) {
            const dir = dx === 0 ? (c.face === 0 ? 1 : -1) : Math.sign(dx);
            o.vx = dir * SHOVE;
            o.vh = Math.max(o.vh, 260);
            o.on = -1;
            o.stun = 0.35;
          }
        }
      }
      // fall
      if (c.on === -1) c.vh -= G * dt;
      const prevH = c.h;
      c.x += c.vx * dt;
      c.h += c.vh * dt;
      if (c.x < X0(s) + R) {
        c.x = X0(s) + R;
        c.vx = 0;
      }
      if (c.x > X1(s) - R) {
        c.x = X1(s) - R;
        c.vx = 0;
      }
      // standing: check we're still over the ledge
      if (c.on >= 0) {
        const l = s.ledges[c.on];
        if (l.gone || Math.abs(c.x - l.x) > l.w / 2 + R * 0.4) c.on = -1;
        else {
          c.h = l.row * ROW;
          c.vh = 0;
          if (l.crumbly) {
            l.stood += dt;
            if (l.stood > CRUMBLE) l.gone = true;
          }
        }
      }
      // landing: only from above (one-way platforms)
      if (c.on === -1 && c.vh <= 0) {
        for (const l of s.ledges) {
          if (l.gone) continue;
          const top = l.row * ROW;
          if (prevH >= top - 1 && c.h <= top && Math.abs(c.x - l.x) <= l.w / 2 + R * 0.4) {
            c.h = top;
            c.vh = 0;
            c.on = l.id;
            break;
          }
        }
        // the base floor (until it floods)
        if (c.on === -1 && c.h <= 0 && prevH >= 0) {
          c.h = 0;
          c.vh = 0;
          c.on = -2;
        }
      }
      c.best = Math.max(c.best, c.h);
      if (c.h < s.water + 6) {
        c.out = true;
        c.outAt = s.t;
        s.splashes.push(c.id);
      }
    }
    const left = s.climbers.filter((c) => !c.out).length;
    if ((s.climbers.length > 1 && left <= 1) || left === 0) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.2,

  results(s): ResultRow[] {
    return s.climbers
      .map((c) => ({
        id: c.id,
        value: (c.out ? Math.round(c.outAt * 10) : 100000) + Math.round(c.best / 10),
        label: c.out ? `Splashed at ${Math.round(c.best / ROW)} floors` : `Last one dry! (${Math.round(c.best / ROW)} floors)`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    playerChips(ctx, players, s.climbers.map((c) => ({ id: c.id, label: c.out ? 'SPLASH' : `floor ${Math.round(c.h / ROW)}`, out: c.out })));
    const time = s.t - READY;
    if (time > 0 && time < 2.5) text(ctx, 'The tide is coming in!', 640, 150, 36, { color: '#7cf3ff' });
  },

  bot(s, id, k: BotCtx) {
    const c = s.climbers.find((q) => q.id === id);
    if (!c || c.out || s.t < READY) return NO_INPUT;
    const grounded = c.on !== -1;
    const row = c.on >= 0 ? s.ledges[c.on].row : c.on === -2 ? 0 : Math.round(c.h / ROW);
    // hard bots shove a rival standing right next to them
    if (grounded && k.sk.smart > 0.7 && c.shoveCd <= 0 && s.climbers.some((o) => !o.out && o !== c && Math.abs(o.x - c.x) < 60 && Math.abs(o.h - c.h) < 20) && rand(k.r) < 0.08) return pressB();
    // pick a ledge on the next row up (the nearest that's solid), re-picking now and then
    if (k.mem.n < 0 || (grounded && k.mem.prev !== row) || (s.ledges[k.mem.n]?.gone ?? true)) {
      k.mem.prev = row;
      let best = -1, bd = Infinity;
      for (const l of s.ledges) {
        if (l.gone || l.row !== row + 1) continue;
        const d = Math.abs(l.x - c.x) + (l.crumbly ? 60 * k.sk.sense : 0) + rand(k.r) * 40;
        if (d < bd) {
          bd = d;
          best = l.id;
        }
      }
      k.mem.n = best;
    }
    const tgt = s.ledges[k.mem.n];
    if (!tgt) return NO_INPUT;
    const dx = tgt.x - c.x;
    if (!grounded) {
      // steer in the air onto the target
      return stick(Math.max(-1, Math.min(1, (dx + k.mem.m) / 60)), 0);
    }
    // standing on a crumbly one: get moving
    const reach = tgt.w / 2 + 70;
    const react = k.mem.t > k.sk.react[0];
    if (Math.abs(dx) < reach && react) {
      k.mem.t = 0;
      // now and then a bot misjudges the jump and drifts past the ledge
      const slip = k.level === 'easy' ? 0.3 : k.level === 'normal' ? 0.12 : 0.03;
      k.mem.m = rand(k.r) < slip ? (rand(k.r) < 0.5 ? -1 : 1) * (tgt.w / 2 + 60) : 0;
      return stick(Math.max(-1, Math.min(1, dx / 80)), 0, true);
    }
    return stick(Math.sign(dx), 0);
  },
};
