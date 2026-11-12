import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, roundRect, text } from '../draw';
import { rand, randInt, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, pressB, stick, type BotCtx } from '../botkit';

/**
 * Sushi Belt (Food Kit, conveyor counter): plates loop round the counter on a belt. Everyone has a
 * ticket of dishes to collect. Slide along your seat with the stick and press A to grab the dish in
 * front of you. The wrong dish sticks to your hands for 2 seconds (B puts it back). Finish a ticket and
 * you get a longer one, and the belt speeds up. Most tickets wins.
 */
const READY = 3;
const TIME = 45;
export const DISHES = ['salmon-roll', 'roe-roll', 'veggie-roll', 'salmon-nigiri', 'egg-nigiri'] as const;
export type Dish = (typeof DISHES)[number];
export const DISH_NAME: Record<Dish, string> = { 'salmon-roll': 'Salmon Roll', 'roe-roll': 'Roe Roll', 'veggie-roll': 'Veggie Roll', 'salmon-nigiri': 'Salmon Nigiri', 'egg-nigiri': 'Egg Nigiri' };
/** The Kenney Food Kit model for each dish (the view uses them, and the ticket shows pictures of them). */
export const DISH_MODEL: Record<Dish, string> = {
  'salmon-roll': 'food/maki-salmon',
  'roe-roll': 'food/maki-roe',
  'veggie-roll': 'food/maki-vegetable',
  'salmon-nigiri': 'food/sushi-salmon',
  'egg-nigiri': 'food/sushi-egg',
};
/** Set by the client: a little picture of a dish for the tickets (null = draw a coloured dot). */
export const DISH_ICONS: { get: (d: Dish) => CanvasImageSource | null } = { get: () => null };
export const DISH_COLOR: Record<Dish, string> = { 'salmon-roll': '#ff8a5c', 'roe-roll': '#ff4d3d', 'veggie-roll': '#5cc94a', 'salmon-nigiri': '#ffb08a', 'egg-nigiri': '#ffd23f' };
const REACH = 0.018; // of the loop
const SEAT_HALF = 0.03; // how far you can slide either side of your seat
const SLIDE = 0.06; // loop per second
const STUCK = 2;
const BASE_SPEED = 0.05; // loops per second

export interface Plate {
  u: number;
  dish: Dish;
  gone: number; // seconds until it's back on the belt (0 = on it)
}
export interface Diner {
  id: string;
  seat: number; // centre of their reach on the loop
  u: number;
  ticket: Dish[]; // still needed
  size: number; // ticket length
  tickets: number;
  got: number; // dishes collected in all
  held: Dish | null;
  stuck: number;
  cool: number;
}
export interface SushiState {
  t: number;
  rng: Rng;
  speed: number;
  plates: Plate[];
  diners: Diner[];
  /** This tick, for the view. */
  grabs: { id: string; dish: Dish; ok: boolean }[];
  done: string[];
}

/** Where u (0..1 round the loop) is on the counter, in arena px. The kitchen hatch is at u = 0. */
export const beltR = (n: number) => ({ rx: Math.min(470, 300 + n * 18), ry: Math.min(230, 150 + n * 8) });
export const beltXY = (s: { diners: unknown[] }, u: number): [number, number] => {
  const { rx, ry } = beltR(s.diners.length);
  const a = -Math.PI / 2 + u * Math.PI * 2;
  return [640 + Math.cos(a) * rx, 400 + Math.sin(a) * ry];
};
const wrap = (u: number) => ((u % 1) + 1) % 1;
const gap = (a: number, b: number) => {
  const d = wrap(a - b);
  return d > 0.5 ? d - 1 : d;
};

function newTicket(rng: Rng, size: number): Dish[] {
  return Array.from({ length: size }, () => DISHES[randInt(rng, 0, DISHES.length - 1)]);
}

export const sushiBelt: Minigame<SushiState> = {
  id: 'sushi-belt',
  name: 'Sushi Belt',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'ITADAKI-GO!',
  blurb: 'Grab the dishes on your ticket as they roll past! Slide along your seat and press A to grab. The wrong dish sticks to your hands for 2 seconds (B puts it back). Finished tickets get longer and the belt gets faster.',
  controls: 'Stick: slide   A: grab   B: put back',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): SushiState {
    const rng = { seed };
    const n = players.length;
    const count = 16 + n * 2;
    return {
      t: 0,
      rng,
      speed: BASE_SPEED,
      grabs: [],
      done: [],
      plates: Array.from({ length: count }, (_, i) => ({ u: i / count, dish: DISHES[randInt(rng, 0, DISHES.length - 1)], gone: 0 })),
      diners: players.map((p, i) => {
        // seats spread round the counter, clear of the kitchen hatch at the top
        const seat = 0.08 + ((i + 0.5) / n) * 0.84;
        return { id: p.id, seat, u: seat, ticket: newTicket(rng, 3), size: 3, tickets: 0, got: 0, held: null, stuck: 0, cool: 0 };
      }),
    };
  },

  step(s: SushiState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.grabs = [];
    s.done = [];
    if (s.t < READY) return;
    const on = s.t <= READY + TIME;
    for (const p of s.plates) {
      if (p.gone > 0) {
        p.gone -= dt;
        if (p.gone <= 0) {
          // the chef sets a fresh plate down somewhere on the belt (anywhere, so no seat gets first pick)
          p.gone = 0;
          p.u = rand(s.rng);
          p.dish = DISHES[randInt(s.rng, 0, DISHES.length - 1)];
        }
        continue;
      }
      p.u = wrap(p.u + s.speed * dt);
    }
    if (!on) return;
    for (const d of s.diners) {
      const inp = inputs[d.id] ?? NO_INPUT;
      d.cool = Math.max(0, d.cool - dt);
      // the stick slides you along your bit of counter: right/down moves with the belt
      const along = Math.abs(inp.x) > Math.abs(inp.y) ? inp.x : inp.y;
      if (Math.abs(along) > 0.2) d.u = d.seat + Math.max(-SEAT_HALF, Math.min(SEAT_HALF, gap(d.u, d.seat) + along * SLIDE * dt));
      d.u = wrap(d.u);
      if (d.held) {
        d.stuck -= dt;
        if (inp.bPressed || d.stuck <= 0) {
          // back on the belt it goes
          const free = s.plates.find((p) => p.gone > 0);
          if (free) {
            free.gone = 0;
            free.u = d.u;
            free.dish = d.held;
          }
          d.held = null;
          d.cool = 0.25;
        }
        continue;
      }
      if (!inp.aPressed || d.cool > 0) continue;
      d.cool = 0.2;
      let best: Plate | null = null;
      let bd = REACH;
      for (const p of s.plates) {
        if (p.gone > 0) continue;
        const g = Math.abs(gap(p.u, d.u));
        if (g < bd) {
          bd = g;
          best = p;
        }
      }
      if (!best) continue;
      best.gone = 1.2;
      const k = d.ticket.indexOf(best.dish);
      s.grabs.push({ id: d.id, dish: best.dish, ok: k >= 0 });
      if (k < 0) {
        d.held = best.dish;
        d.stuck = STUCK;
        continue;
      }
      d.ticket.splice(k, 1);
      d.got++;
      if (!d.ticket.length) {
        d.tickets++;
        d.size = Math.min(7, d.size + 1);
        d.ticket = newTicket(s.rng, d.size);
        s.done.push(d.id);
        // every finished ticket nudges the whole belt faster
        s.speed = Math.min(0.11, s.speed + 0.004);
      }
    }
  },

  isOver: (s) => s.t >= READY + TIME + 1.5,

  results(s): ResultRow[] {
    return s.diners
      .map((d) => ({ id: d.id, value: d.tickets * 100 + (d.size - d.ticket.length), label: `${d.tickets} tickets (${d.got} dishes)` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    playerChips(ctx, players, s.diners.map((d) => ({ id: d.id, label: `${d.tickets} 🎫` })));
    // tickets along the bottom: one little card per diner
    const n = s.diners.length;
    const w = Math.min(150, 1240 / n - 8);
    s.diners.forEach((d, i) => {
      const x = 640 - (n * (w + 8)) / 2 + i * (w + 8);
      const y = 638;
      const p = players.find((q) => q.id === d.id);
      ctx.fillStyle = 'rgba(255,250,240,0.92)';
      roundRect(ctx, x, y, w, 70, 10);
      ctx.fill();
      ctx.fillStyle = p?.color ?? '#999';
      ctx.fillRect(x, y, w, 6);
      // a picture of each dish still needed, so you know exactly what to grab off the belt
      const dot = Math.min(40, (w - 12) / Math.max(1, d.ticket.length) - 3);
      const x0 = x + w / 2 - (d.ticket.length * (dot + 3) - 3) / 2;
      d.ticket.forEach((dish, j) => {
        const cx = x0 + dot / 2 + j * (dot + 3);
        ctx.fillStyle = DISH_COLOR[dish] + '55';
        ctx.beginPath();
        ctx.arc(cx, y + 28, dot / 2, 0, Math.PI * 2);
        ctx.fill();
        const icon = DISH_ICONS.get(dish);
        if (icon && (icon as HTMLCanvasElement).width) ctx.drawImage(icon, cx - dot / 2 - 2, y + 26 - dot / 2 - 2, dot + 4, dot + 4);
        else {
          ctx.fillStyle = DISH_COLOR[dish];
          ctx.beginPath();
          ctx.arc(cx, y + 28, dot / 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      // the next dish by name too
      const next = d.ticket[0];
      text(ctx, d.held ? 'Wrong dish! B to put back' : next ? `${DISH_NAME[next]}  ${d.size - d.ticket.length}/${d.size}` : `${d.size}/${d.size}`, x + w / 2, y + 58, w < 120 ? 11 : 13, { color: d.held ? '#ff4d5a' : '#5a4630', outline: false, weight: 800 });
    });
  },

  bot(s, id, k: BotCtx) {
    const d = s.diners.find((q) => q.id === id);
    if (!d || s.t < READY) return NO_INPUT;
    if (d.held) return d.stuck < STUCK - 0.4 - (1 - k.sk.smart) * 0.8 ? pressB() : NO_INPUT;
    // the nearest wanted plate coming our way (inside our slide range)
    let target: Plate | null = null;
    let td = Infinity;
    for (const p of s.plates) {
      if (p.gone > 0) continue;
      const g = gap(d.seat, p.u); // how far upstream it is
      if (g < -SEAT_HALF || g > 0.25) continue;
      if (!d.ticket.includes(p.dish)) continue;
      if (g < td) {
        td = g;
        target = p;
      }
    }
    const here = s.plates.filter((p) => p.gone <= 0 && Math.abs(gap(p.u, d.u)) < REACH * 0.8);
    // slower hands let a plate slip by now and then; easy ones sometimes snatch the wrong plate
    if (here.some((p) => d.ticket.includes(p.dish)) && d.cool <= 0 && rand(k.r) < 0.25 + 0.75 * k.sk.smart) return press();
    if (here.length && d.cool <= 0 && rand(k.r) < 0.05 * (1 - k.sk.smart)) return press();
    if (!target) {
      const back = gap(d.seat, d.u);
      return Math.abs(back) > 0.004 ? stick(Math.sign(back) * 0.6, 0) : NO_INPUT;
    }
    // slide upstream to meet it (good bots meet it early so they can wait)
    const meet = Math.max(-SEAT_HALF, Math.min(SEAT_HALF, gap(target.u, d.seat) + 0.01 * k.sk.smart));
    const off = gap(d.seat + meet, d.u);
    return Math.abs(off) > 0.003 ? stick(Math.sign(off) * Math.min(1, Math.abs(off) * 60), 0) : NO_INPUT;
  },
};
