import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randInt, type Rng } from '../rng';
import { bump, jump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { outside, press, stick, toward, type BotCtx } from '../botkit';

/**
 * Zombie Tag (Graveyard Kit, night fog): one player starts as a zombie. Anyone a zombie touches turns
 * into a zombie too. Survivors can vault (A) over the low graves; zombies can't, but they lunge (A).
 * Survivors score by how long they last, zombies by tags (the first zombie's tags count double).
 * Ends at 45 seconds, or when one survivor is left. The graveyard grows with the crowd.
 */
const R = 22;
const GRAVE_R = 26;
const SURV_SPEED = 310;
const ZOMBIE_SPEED = 220;
const LUNGE = 440;
const LUNGE_CD = 3.5;
const READY = 3;
const TIME = 45;

export interface Walker extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  zombie: boolean;
  first: boolean;
  turnedAt: number; // seconds into the game they were caught (-1 = never)
  tags: number;
  lungeCd: number;
  lunging: number;
  stun: number;
}
export interface ZombieState {
  t: number;
  rng: Rng;
  w: number;
  h: number;
  graves: { x: number; y: number; kind: number }[];
  walkers: Walker[];
  turned: { id: string; x: number; y: number }[]; // this tick, for the view
  endAt?: number;
}

export const yardSize = (n: number) => ({ w: Math.min(1160, 880 + n * 30), h: Math.min(560, 440 + n * 12) });
const live = (s: ZombieState) => s.walkers.filter((w) => !w.zombie);

export const zombieTag: Minigame<ZombieState> = {
  id: 'zombie-tag',
  name: 'Zombie Tag',
  mode: '1-vs-many',
  ready: READY,
  goWord: 'RUN!',
  blurb: "One of you starts as a zombie, and anyone a zombie touches joins the horde! Survivors vault the graves with A. Zombies lunge with A. Last one human wins.",
  controls: 'Stick: run   A: vault (survivor) / lunge (zombie)',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): ZombieState {
    const rng = { seed };
    const { w, h } = yardSize(players.length);
    const graves: ZombieState['graves'] = [];
    const cols = Math.round(w / 170), rows = Math.round(h / 150);
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        if (rand(rng) < 0.3) continue;
        graves.push({ x: 640 - w / 2 + ((c + 0.5) * w) / cols + (rand(rng) - 0.5) * 50, y: 400 - h / 2 + ((r + 0.5) * h) / rows + (rand(rng) - 0.5) * 40, kind: randInt(rng, 0, 3) });
      }
    const first = randInt(rng, 0, players.length - 1);
    const n = players.length;
    const s: ZombieState = {
      t: 0,
      rng,
      w,
      h,
      graves,
      turned: [],
      walkers: players.map((p, i) => {
        // the zombie starts in the middle; everyone else round the edge
        const a = (i / n) * Math.PI * 2;
        const z = i === first;
        return {
          id: p.id,
          x: z ? 640 : 640 + Math.cos(a) * w * 0.42,
          y: z ? 400 : 400 + Math.sin(a) * h * 0.4,
          face: a + Math.PI,
          zombie: z,
          first: z,
          turnedAt: z ? 0 : -1,
          tags: 0,
          lungeCd: 1,
          lunging: 0,
          stun: z ? 2 : 0,
          ...newBody(),
        };
      }),
    };
    // keep the start spots clear of graves
    s.graves = s.graves.filter((g) => s.walkers.every((w2) => Math.hypot(g.x - w2.x, g.y - w2.y) > 80));
    return s;
  },

  step(s: ZombieState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.turned = [];
    if (s.t < READY) return;
    const on = s.endAt === undefined && s.t <= READY + TIME;
    const x0 = 640 - s.w / 2, x1 = 640 + s.w / 2, y0 = 400 - s.h / 2, y1 = 400 + s.h / 2;
    for (const w of s.walkers) {
      const inp = on && w.stun <= 0 ? inputs[w.id] ?? NO_INPUT : NO_INPUT;
      w.stun = Math.max(0, w.stun - dt);
      w.lungeCd = Math.max(0, w.lungeCd - dt);
      w.lunging = Math.max(0, w.lunging - dt);
      if (w.lunging <= 0) steer(w, inp.x, inp.y, w.zombie ? ZOMBIE_SPEED : SURV_SPEED, dt);
      if (inp.aPressed) {
        if (!w.zombie) jump(w, 0.8);
        else if (w.lungeCd <= 0) {
          w.lungeCd = LUNGE_CD;
          w.lunging = 0.18;
          w.vx = Math.cos(w.face) * LUNGE;
          w.vy = Math.sin(w.face) * LUNGE;
        }
      }
      stepVertical(w, dt);
      w.x = Math.max(x0 + R, Math.min(x1 - R, w.x + w.vx * dt));
      w.y = Math.max(y0 + R, Math.min(y1 - R, w.y + w.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) w.face = Math.atan2(inp.y, inp.x);
      // graves block anyone on the ground (a survivor in mid-vault sails over)
      if (w.z < 12)
        for (const g of s.graves) {
          const dx = w.x - g.x, dy = w.y - g.y, d = Math.hypot(dx, dy);
          if (d < R + GRAVE_R && d > 0.01) {
            w.x = g.x + (dx / d) * (R + GRAVE_R);
            w.y = g.y + (dy / d) * (R + GRAVE_R);
          }
        }
    }
    if (!on) return;
    // tags
    for (const z of s.walkers) {
      if (!z.zombie || z.stun > 0) continue;
      for (const v of s.walkers) {
        if (v.zombie) continue;
        if (Math.hypot(v.x - z.x, v.y - z.y) < R * 2 + (z.lunging > 0 ? 6 : 0) && v.z < 30) {
          v.zombie = true;
          v.turnedAt = s.t - READY;
          v.stun = 2.4;
          v.vz = 300;
          z.tags++;
          s.turned.push({ id: v.id, x: v.x, y: v.y });
        }
      }
    }
    // the last human standing wins it (one-on-one, the zombie has to catch them)
    if (live(s).length <= (s.walkers.length >= 3 ? 1 : 0)) s.endAt = s.t;
    const all = s.walkers;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].zombie === all[j].zombie) bump(all[i], all[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5 || (s.endAt !== undefined && s.t - s.endAt > 1.5),

  results(s): ResultRow[] {
    const end = Math.min(TIME, (s.endAt ?? s.t) - READY);
    return s.walkers
      .map((w) => {
        const lasted = w.turnedAt < 0 ? end : w.turnedAt;
        const tagPts = w.tags * (w.first ? 2 : 1);
        const value = (w.first ? 0 : Math.round(lasted * 10)) + tagPts * 60 + (w.turnedAt < 0 ? 400 : 0);
        return { id: w.id, value, label: w.turnedAt < 0 ? `Survived! ${w.tags ? `(${w.tags} tags)` : ''}`.trim() : w.first ? `First zombie: ${w.tags} tags (x2)` : `Lasted ${lasted.toFixed(1)}s, ${w.tags} tags` };
      })
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    playerChips(ctx, players, s.walkers.map((w) => ({ id: w.id, label: w.zombie ? '🧟' : 'Human', out: w.zombie && !w.first })));
    if (s.t < READY) {
      const z = s.walkers.find((w) => w.first);
      const p = players.find((q) => q.id === z?.id);
      text(ctx, `${p?.name ?? ''} is the first zombie!`, 640, 150, 34, { color: '#7dff6a' });
    } else if (s.endAt !== undefined) text(ctx, live(s).length ? 'Last human standing!' : 'The horde wins!', 640, 150, 44, { color: '#7dff6a' });
    else text(ctx, `${live(s).length} human${live(s).length === 1 ? '' : 's'} left`, 640, 110, 24, { color: '#d6ffd0' });
  },

  bot(s, id, k: BotCtx) {
    const me = s.walkers.find((w) => w.id === id);
    if (!me || s.t < READY || me.stun > 0) return NO_INPUT;
    const x0 = 640 - s.w / 2, x1 = 640 + s.w / 2, y0 = 400 - s.h / 2, y1 = 400 + s.h / 2;
    if (me.zombie) {
      // chase the nearest human; good bots aim where they're going
      const prey = live(s).reduce<Walker | null>((a, b) => (!a || Math.hypot(b.x - me.x, b.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? b : a), null);
      if (!prey) return NO_INPUT;
      const lead = 0.35 * k.sk.smart;
      toward(me, prey.x + prey.vx * lead, prey.y + prey.vy * lead, k.mem);
      const d = Math.hypot(prey.x - me.x, prey.y - me.y);
      if (d < 70 + 40 * k.sk.smart && me.lungeCd <= 0 && Math.cos(me.face - Math.atan2(prey.y - me.y, prey.x - me.x)) > 0.85 && k.mem.t > 0.2 + (1 - k.sk.smart) * 0.6) {
        k.mem.t = 0;
        return press();
      }
      return stick(k.mem.sx, k.mem.sy);
    }
    // human: run where the zombies aren't, keeping off the walls; vault a grave in the way
    const zs = s.walkers.filter((w) => w.zombie);
    if (k.mem.next <= 0) {
      // try 16 headings and take the one that keeps the horde furthest away, staying off walls and out of
      // corners (always keep moving: standing still is how you get caught)
      k.mem.next = k.sk.think * (0.8 + rand(k.r) * 0.4);
      let best = Infinity;
      let bx = k.mem.sx, by = k.mem.sy;
      // a zombie right on you: forget the loop and just get away
      const close = zs.some((z) => Math.hypot(z.x - me.x, z.y - me.y) < 190);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = me.x + Math.cos(a) * 150, y = me.y + Math.sin(a) * 150;
        if (outside(x, y, x0, x1, y0, y1, 10)) continue;
        let c = 0;
        for (const z of zs) c += (5000 * k.sk.sense + 1500) / Math.max(25, Math.hypot(z.x + z.vx * 0.3 - x, z.y + z.vy * 0.3 - y));
        // stay on a big loop round the yard: you're faster than a zombie, so circling never corners you
        const rn = Math.hypot((x - 640) / (s.w / 2 - 110), (y - 400) / (s.h / 2 - 90));
        c += 45 * Math.abs(rn - 1) * k.sk.smart * (close ? 0.25 : 1) + (rn > 1.15 ? 60 * (rn - 1.15) : 0);
        c += rand(k.r) * 4 * (1 - k.sk.smart);
        // commit to a heading: turning back costs, so it doesn't dither between two equal escapes
        if (k.mem.sx || k.mem.sy) c += 12 * (1 - (Math.cos(a) * k.mem.sx + Math.sin(a) * k.mem.sy));
        if (c < best) {
          best = c;
          bx = Math.cos(a);
          by = Math.sin(a);
        }
      }
      k.mem.sx = bx;
      k.mem.sy = by;
    }
    const near = zs.some((z) => Math.hypot(z.x - me.x, z.y - me.y) < 70);
    const grave = s.graves.some((g) => Math.hypot(g.x - (me.x + k.mem.sx * 40), g.y - (me.y + k.mem.sy * 40)) < GRAVE_R + R);
    if ((grave || (near && rand(k.r) < 0.05 * k.sk.smart)) && me.z <= 0) return stick(k.mem.sx, k.mem.sy, true);
    return stick(k.mem.sx, k.mem.sy);
  },
};
