import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { mash, nearest, stick, toward } from '../botkit';

/**
 * Treasure Dig (Pirate Kit): sandy mounds dot a pirate beach. Stand on one and mash A to dig it up.
 * Most hold gems (a gold gem is worth 3), but some hide a crab that pinches you and stuns you.
 */
export const DX0 = 120, DX1 = 1160, DY0 = 160, DY1 = 660;
const R = 22;
const SPEED = 290;
const READY = 3;
const TIME = 55;
const DIG = 9; // A presses to dig a mound out
const MOUNDS = 9;
const MOUND_R = 34;

export interface Mound {
  x: number;
  y: number;
  dug: number; // presses so far
  back: number; // seconds until it reappears (0 = present)
}
export interface Digger extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  gems: number;
  stun: number;
  digT: number; // shovel swing, for the view
}
export interface DigState {
  t: number;
  rng: Rng;
  diggers: Digger[];
  mounds: Mound[];
  /** What popped out this tick, for the view. */
  finds: { x: number; y: number; kind: 'gem' | 'gold' | 'crab'; by: string }[];
}

function freeSpot(s: DigState): [number, number] {
  for (let k = 0; k < 30; k++) {
    const x = randRange(s.rng, DX0 + 60, DX1 - 60);
    const y = randRange(s.rng, DY0 + 50, DY1 - 50);
    if (s.mounds.every((m) => m.back > 0 || Math.hypot(m.x - x, m.y - y) > 130)) return [x, y];
  }
  return [randRange(s.rng, DX0 + 60, DX1 - 60), randRange(s.rng, DY0 + 50, DY1 - 50)];
}

const live = (s: DigState) => s.mounds.filter((m) => m.back <= 0);

export const treasureDig: Minigame<DigState> = {
  id: 'treasure-dig',
  name: 'Treasure Dig',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'DIG!',
  blurb: 'Stand on a sand mound and mash A to dig it up. Gems score, gold gems score 3, but watch out for pinching crabs!',
  controls: 'Stick: move   A: dig (mash it!)',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): DigState {
    const n = players.length;
    const s: DigState = {
      t: 0,
      rng: { seed },
      finds: [],
      mounds: [],
      diggers: players.map((p, i) => ({
        id: p.id,
        x: DX0 + 80 + ((DX1 - DX0 - 160) * (i + 0.5)) / n,
        y: i % 2 ? DY1 - 40 : DY0 + 40,
        face: i % 2 ? -Math.PI / 2 : Math.PI / 2,
        gems: 0,
        stun: 0,
        digT: 0,
        ...newBody(),
      })),
    };
    for (let i = 0; i < MOUNDS; i++) {
      const [x, y] = freeSpot(s);
      s.mounds.push({ x, y, dug: 0, back: 0 });
    }
    return s;
  },

  step(s: DigState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.finds = [];
    for (const m of s.mounds) {
      if (m.back > 0) {
        m.back -= dt;
        if (m.back <= 0) {
          m.back = 0;
          [m.x, m.y] = freeSpot(s);
          m.dug = 0;
        }
      }
    }
    if (s.t < READY || s.t > READY + TIME) {
      for (const d of s.diggers) {
        steer(d, 0, 0, SPEED, dt);
        stepVertical(d, dt);
      }
      return;
    }
    for (const d of s.diggers) {
      const inp = inputs[d.id] ?? NO_INPUT;
      d.stun = Math.max(0, d.stun - dt);
      d.digT = Math.max(0, d.digT - dt);
      const on = live(s).find((m) => Math.hypot(m.x - d.x, m.y - d.y) < MOUND_R + 8);
      const digging = on && inp.aTaps > 0 && d.stun <= 0;
      steer(d, d.stun > 0 ? 0 : inp.x, d.stun > 0 ? 0 : inp.y, on ? SPEED * 0.75 : SPEED, dt);
      stepVertical(d, dt);
      d.x = Math.max(DX0 + R, Math.min(DX1 - R, d.x + d.vx * dt));
      d.y = Math.max(DY0 + R, Math.min(DY1 - R, d.y + d.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) d.face = Math.atan2(inp.y, inp.x);
      if (digging && on) {
        on.dug += inp.aTaps;
        d.digT = 0.2;
        if (on.dug >= DIG) {
          const roll = rand(s.rng);
          const kind = roll < 0.2 ? 'crab' : roll < 0.32 ? 'gold' : 'gem';
          if (kind === 'crab') {
            d.stun = 1.6;
            d.vz = 380;
          } else d.gems += kind === 'gold' ? 3 : 1;
          s.finds.push({ x: on.x, y: on.y, kind, by: d.id });
          on.back = 1.2;
        }
      }
    }
    for (let i = 0; i < s.diggers.length; i++) for (let j = i + 1; j < s.diggers.length; j++) bump(s.diggers[i], s.diggers[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5,

  results(s): ResultRow[] {
    return s.diggers.map((d) => ({ id: d.id, value: d.gems, label: `${d.gems} gems` })).sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    playerChips(ctx, players, s.diggers.map((d) => ({ id: d.id, label: `${d.gems} gems` })));
    if (s.t > READY + TIME) text(ctx, 'Shovels down!', 640, 150, 70, { color: '#ffd23f' });
  },

  bot(s, id, k) {
    const me = s.diggers.find((d) => d.id === id);
    if (!me || s.t < READY || me.stun > 0) return NO_INPUT;
    const on = live(s).find((m) => Math.hypot(m.x - me.x, m.y - me.y) < MOUND_R);
    if (on) return mash(k.sk, k.mem, k.dt, k.r);
    // head for the nearest mound nobody else is already digging (hard bots also weigh how far along it is)
    const target = nearest(me, live(s), (m) => {
      const crowd = s.diggers.some((d) => d.id !== id && Math.hypot(d.x - m.x, d.y - m.y) < MOUND_R) ? 140 : 0;
      return crowd - (k.sk.smart >= 1 ? m.dug * 8 : 0);
    });
    if (!target) return NO_INPUT;
    toward(me, target.x, target.y, k.mem);
    return stick(k.mem.sx, k.mem.sy);
  },
};
