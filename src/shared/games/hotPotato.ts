import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';

/**
 * Hot Potato Bomb (Pirate Kit): a ticking bomb on a ship's deck. Bump someone to pass it on.
 * Whoever holds it when the fuse runs out is blown overboard. A fresh bomb then goes to a random
 * player. Last one on deck wins.
 */
export const HX0 = 230, HX1 = 1050, HY0 = 150, HY1 = 640;
const R = 24;
const SPEED = 300;
const HOLDER_BOOST = 1.1;
const DASH = 700;
const DASH_CD = 1.1;
const PASS_CD = 0.6;
const MAX_T = 80;

export interface Sailor extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  dashCd: number;
  outAt: number;
}
export interface PotatoState {
  t: number;
  rng: Rng;
  holder: string | null;
  fuse: number;
  fuseMax: number;
  passCd: number;
  /** Pause between bombs. */
  gap: number;
  sailors: Sailor[];
  booms: { x: number; y: number }[];
  passes: { from: string; to: string }[];
}

const live = (s: PotatoState) => s.sailors.filter((a) => a.outAt < 0);

function newBomb(s: PotatoState): void {
  const l = live(s);
  if (l.length < 2) return;
  s.holder = l[Math.floor(rand(s.rng) * l.length)].id;
  // fuses get shorter as the deck empties, so the end game stays tense
  s.fuseMax = randRange(s.rng, 7, 12) * (0.6 + 0.4 * Math.min(1, l.length / 6));
  s.fuse = s.fuseMax;
  s.passCd = 1;
}

export const hotPotato: Minigame<PotatoState> = {
  id: 'hot-potato-bomb',
  name: 'Hot Potato Bomb',
  mode: 'Free-for-all',
  blurb: 'A bomb is ticking on deck! Bump into someone to pass it on. Whoever holds it when it blows is out. Last sailor standing wins!',
  controls: 'Stick: move   A: dash',
  minPlayers: 2,
  maxPlayers: 10,
  ready: 3,

  setup(players: PlayerInfo[], seed: number): PotatoState {
    const n = players.length;
    const s: PotatoState = {
      t: 0,
      rng: { seed },
      holder: null,
      fuse: 0,
      fuseMax: 1,
      passCd: 0,
      gap: 0,
      booms: [],
      passes: [],
      sailors: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2;
        return {
          id: p.id,
          x: (HX0 + HX1) / 2 + Math.cos(a) * 280,
          y: (HY0 + HY1) / 2 + Math.sin(a) * 170,
          face: a + Math.PI,
          dashCd: 0,
          outAt: -1,
          ...newBody(),
        };
      }),
    };
    return s;
  },

  step(s: PotatoState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.booms = [];
    s.passes = [];
    if (s.t < 3) return;
    if (!s.holder) {
      s.gap -= dt;
      if (s.gap <= 0) newBomb(s);
    }
    for (const a of s.sailors) {
      if (a.outAt >= 0) {
        stepVertical(a, dt);
        continue;
      }
      const inp = inputs[a.id] ?? NO_INPUT;
      a.dashCd = Math.max(0, a.dashCd - dt);
      const top = SPEED * (a.id === s.holder ? HOLDER_BOOST : 1);
      // a dash briefly overrides the speed cap
      if (Math.hypot(a.vx, a.vy) <= top * 1.05) steer(a, inp.x, inp.y, top, dt);
      else {
        a.vx *= 1 - Math.min(1, dt * 3.2);
        a.vy *= 1 - Math.min(1, dt * 3.2);
      }
      if (inp.aPressed && a.dashCd === 0) {
        const m = Math.hypot(inp.x, inp.y);
        const dx = m > 0.2 ? inp.x / m : Math.cos(a.face);
        const dy = m > 0.2 ? inp.y / m : Math.sin(a.face);
        a.vx = dx * DASH;
        a.vy = dy * DASH;
        a.dashCd = DASH_CD;
      }
      stepVertical(a, dt);
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < HX0 + R) (a.x = HX0 + R), (a.vx = Math.abs(a.vx) * 0.5);
      if (a.x > HX1 - R) (a.x = HX1 - R), (a.vx = -Math.abs(a.vx) * 0.5);
      if (a.y < HY0 + R) (a.y = HY0 + R), (a.vy = Math.abs(a.vy) * 0.5);
      if (a.y > HY1 - R) (a.y = HY1 - R), (a.vy = -Math.abs(a.vy) * 0.5);
      if (Math.hypot(a.vx, a.vy) > 30) a.face = Math.atan2(a.vy, a.vx);
    }
    s.passCd = Math.max(0, s.passCd - dt);
    for (let i = 0; i < s.sailors.length; i++)
      for (let j = i + 1; j < s.sailors.length; j++) {
        const a = s.sailors[i];
        const b = s.sailors[j];
        if (a.outAt >= 0 || b.outAt >= 0) continue;
        const touching = Math.hypot(a.x - b.x, a.y - b.y) < R * 2 + 4;
        bump(a, b, R);
        if (touching && s.holder && s.passCd === 0 && (s.holder === a.id || s.holder === b.id)) {
          const to = s.holder === a.id ? b.id : a.id;
          s.passes.push({ from: s.holder, to });
          s.holder = to;
          s.passCd = PASS_CD;
        }
      }
    if (s.holder) {
      s.fuse -= dt;
      if (s.fuse <= 0) {
        const h = s.sailors.find((a) => a.id === s.holder)!;
        s.booms.push({ x: h.x, y: h.y });
        h.outAt = s.t;
        h.vz = 1100;
        const cx = (HX0 + HX1) / 2;
        h.vx = (h.x < cx ? -1 : 1) * 500;
        for (const o of live(s)) {
          const d = Math.hypot(o.x - h.x, o.y - h.y);
          if (d < 120 && d > 0) {
            o.vx += ((o.x - h.x) / d) * 500;
            o.vy += ((o.y - h.y) / d) * 500;
            o.vz = 400;
          }
        }
        s.holder = null;
        s.gap = 1.6;
      }
    }
  },

  isOver(s) {
    return live(s).length <= 1 || s.t >= MAX_T;
  },

  results(s): ResultRow[] {
    return s.sailors
      .map((a) => ({
        id: a.id,
        value: a.outAt < 0 ? (a.id === s.holder ? 5000 : 10000) : Math.round(a.outAt * 100),
        label: a.outAt < 0 ? 'Still on deck' : `Blown up at ${a.outAt.toFixed(1)}s`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T - s.t);
    playerChips(
      ctx,
      players,
      s.sailors.map((a) => ({ id: a.id, label: a.outAt >= 0 ? 'OUT' : a.id === s.holder ? 'BOMB!' : 'safe', out: a.outAt >= 0, hot: a.id === s.holder })),
    );
    if (s.holder) {
      const name = players.find((p) => p.id === s.holder)?.name ?? '';
      const hurry = s.fuse < 3;
      text(ctx, `${name} has the bomb!`, 640, 104, hurry ? 30 : 26, { color: hurry ? '#ff5a5f' : '#ffd23f' });
    } else if (s.t > 3 && live(s).length > 1) text(ctx, 'Here comes another bomb...', 640, 104, 26, { color: '#fff' });
  },
};
