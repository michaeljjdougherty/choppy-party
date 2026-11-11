import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, playerById, roundRect, text } from '../draw';
import { rand, randInt, shuffle, type Rng } from '../rng';
import { TEAM_HEX, TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { press, remember, stick, type BotCtx } from '../botkit';
import { randRange } from '../rng';

/**
 * Burger Builder (Food Kit, team): each team shares one burger and one order ticket. Every cook holds a
 * few of the ingredients. Pick yours with the stick and press A to drop it on when it's next on the
 * ticket. Wrong layer and the top one slides off. Most finished burgers wins.
 */
export const INGREDIENTS = ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'onion', 'bacon'] as const;
export type Ingredient = (typeof INGREDIENTS)[number];
export const ING_NAME: Record<Ingredient, string> = { bun: 'Bun', patty: 'Patty', cheese: 'Cheese', lettuce: 'Lettuce', tomato: 'Tomato', onion: 'Onion', bacon: 'Bacon' };
export const ING_COLOR: Record<Ingredient, string> = { bun: '#e8a24a', patty: '#7a3b1e', cheese: '#ffd23f', lettuce: '#5cc94a', tomato: '#e8402e', onion: '#f2e6ff', bacon: '#c8553d' };
const READY = 3;
const TIME = 50;

export interface Kitchen {
  team: number;
  ticket: Ingredient[]; // bottom to top, starts and ends with a bun
  stack: Ingredient[];
  burgers: number;
  wrong: number; // seconds of the "oops" wobble
  done: number; // seconds of the "order up!" celebration
}
export interface Cook {
  id: string;
  team: number;
  hand: Ingredient[];
  sel: number;
  cool: number;
  stun: number;
  moveCool: number;
  placed: number;
}
export interface BurgerState {
  t: number;
  rng: Rng;
  kitchens: [Kitchen, Kitchen];
  cooks: Cook[];
  events: { team: number; kind: 'good' | 'bad' | 'done'; by: string }[];
}

function newTicket(rng: Rng, layers: number): Ingredient[] {
  const mid: Ingredient[] = [];
  for (let i = 0; i < layers; i++) mid.push(INGREDIENTS[randInt(rng, 1, INGREDIENTS.length - 1)]);
  return ['bun', ...mid, 'bun'];
}

export const burgerBuilder: Minigame<BurgerState> = {
  id: 'burger-builder',
  name: 'Burger Builder',
  mode: 'Team',
  ready: READY,
  blurb: 'Build the burger on your ticket, bottom bun first! Each cook holds a few ingredients: pick yours and drop it on when it is next. Wrong layer and it slides off.',
  controls: 'Stick: pick an ingredient   A: drop it on',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): BurgerState {
    const teams = teamsOf(players);
    const rng = { seed };
    const cooks: Cook[] = players.map((p) => ({ id: p.id, team: teams[p.id], hand: [], sel: 0, cool: 0, stun: 0, moveCool: 0, placed: 0 }));
    // deal every ingredient out round-robin inside each team, so each ingredient has exactly one owner
    for (const k of [0, 1]) {
      const crew = cooks.filter((c) => c.team === k);
      if (!crew.length) continue;
      const deck = shuffle(rng, [...INGREDIENTS]);
      deck.forEach((ing, i) => crew[i % crew.length].hand.push(ing));
    }
    const kitchen = (team: number): Kitchen => ({ team, ticket: newTicket(rng, 3), stack: [], burgers: 0, wrong: 0, done: 0 });
    // both teams get the same ticket so it's a fair race
    const a = kitchen(0);
    const b = kitchen(1);
    b.ticket = [...a.ticket];
    return { t: 0, rng, kitchens: [a, b], cooks, events: [] };
  },

  step(s: BurgerState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.events = [];
    for (const k of s.kitchens) {
      k.wrong = Math.max(0, k.wrong - dt);
      if (k.done > 0) {
        k.done -= dt;
        if (k.done <= 0) {
          k.stack = [];
          k.ticket = newTicket(s.rng, Math.min(7, 3 + k.burgers));
        }
      }
    }
    if (s.t < READY || s.t > READY + TIME) return;
    for (const c of s.cooks) {
      const inp = inputs[c.id] ?? NO_INPUT;
      c.cool = Math.max(0, c.cool - dt);
      c.stun = Math.max(0, c.stun - dt);
      c.moveCool = Math.max(0, c.moveCool - dt);
      const dir = Math.abs(inp.x) > 0.5 ? Math.sign(inp.x) : Math.abs(inp.y) > 0.5 ? Math.sign(inp.y) : 0;
      if (dir && c.moveCool <= 0 && c.hand.length) {
        c.sel = (c.sel + dir + c.hand.length) % c.hand.length;
        c.moveCool = 0.18;
      } else if (!dir) c.moveCool = 0;
      const k = s.kitchens[c.team];
      if (!inp.aPressed || c.cool > 0 || c.stun > 0 || k.done > 0 || !c.hand.length) continue;
      const want = k.ticket[k.stack.length];
      const ing = c.hand[c.sel];
      c.cool = 0.25;
      if (ing === want) {
        k.stack.push(ing);
        c.placed++;
        s.events.push({ team: c.team, kind: 'good', by: c.id });
        if (k.stack.length === k.ticket.length) {
          k.burgers++;
          k.done = 1.1;
          s.events.push({ team: c.team, kind: 'done', by: c.id });
        }
      } else {
        k.stack.pop();
        k.wrong = 0.5;
        c.stun = 0.8;
        s.events.push({ team: c.team, kind: 'bad', by: c.id });
      }
    }
  },

  isOver: (s) => s.t >= READY + TIME + 1.5,

  results(s): ResultRow[] {
    const [a, b] = s.kitchens;
    const sc = (k: Kitchen) => k.burgers * 100 + (k.done > 0 ? 0 : k.stack.length);
    const win = sc(a) === sc(b) ? 2 : sc(a) > sc(b) ? 0 : 1;
    const teams = Object.fromEntries(s.cooks.map((c) => [c.id, c.team]));
    const placed = (id: string) => s.cooks.find((c) => c.id === id)?.placed ?? 0;
    return teamResults(s.cooks.map((c) => c.id), teams, win, placed, (id) => `${TEAM_NAME[teams[id]]}: ${s.kitchens[teams[id]].burgers} burgers`);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    teamScores(ctx, `${s.kitchens[0].burgers}`, `${s.kitchens[1].burgers}`);
    // the two order tickets, with the next layer highlighted
    for (const k of s.kitchens) {
      const x0 = k.team === 0 ? 30 : 1250 - 170;
      ctx.fillStyle = 'rgba(255,250,235,0.94)';
      roundRect(ctx, x0, 140, 170, 40 + k.ticket.length * 30, 12);
      ctx.fill();
      text(ctx, `${TEAM_NAME[k.team]} order`, x0 + 85, 160, 16, { color: TEAM_HEX[k.team], outline: false, weight: 800 });
      // top of the burger at the top of the ticket
      for (let i = k.ticket.length - 1, row = 0; i >= 0; i--, row++) {
        const y = 192 + row * 30;
        const done = i < k.stack.length;
        const next = i === k.stack.length && k.done <= 0;
        if (next) {
          ctx.fillStyle = 'rgba(255,210,63,0.6)';
          roundRect(ctx, x0 + 8, y - 13, 154, 26, 8);
          ctx.fill();
        }
        ctx.fillStyle = ING_COLOR[k.ticket[i]];
        roundRect(ctx, x0 + 16, y - 8, 22, 16, 5);
        ctx.fill();
        text(ctx, `${done ? '✓ ' : ''}${ING_NAME[k.ticket[i]]}`, x0 + 46, y, 16, { align: 'left', color: done ? '#2e9d4a' : '#3a2a5e', outline: false, weight: 700 });
      }
    }
    // each cook's selected ingredient under their name is drawn by the view; show whose turn it is
    for (const k of s.kitchens) {
      if (k.done > 0) {
        text(ctx, 'Order up!', k.team === 0 ? 360 : 920, 150, 40, { color: TEAM_HEX[k.team] });
        continue;
      }
      const want = k.ticket[k.stack.length];
      const owner = s.cooks.find((c) => c.team === k.team && c.hand.includes(want));
      const p = owner ? playerById(players, owner.id) : undefined;
      if (p) text(ctx, `${p.name}: ${ING_NAME[want]}!`, k.team === 0 ? 360 : 920, 150, 22, { color: '#ffffff' });
    }
  },

  bot(s, id, k: BotCtx) {
    const me = s.cooks.find((c) => c.id === id);
    if (!me || s.t < READY || me.stun > 0) return NO_INPUT;
    const kit = s.kitchens[me.team];
    if (kit.done > 0) return NO_INPUT;
    const want = kit.ticket[kit.stack.length];
    const idx = me.hand.indexOf(want);
    if (idx < 0) {
      // not mine: easy bots sometimes butt in anyway
      if (remember(k.mem, `bb:${kit.burgers}:${kit.stack.length}`, randRange(k.r, k.sk.react[0] + 0.3, k.sk.react[1] + 0.8))) k.mem.n = rand(k.r) < (1 - k.sk.smart) * 0.12 ? 1 : 0;
      return k.mem.n === 1 && k.mem.t > k.mem.wait ? press() : NO_INPUT;
    }
    remember(k.mem, `bb:${kit.burgers}:${kit.stack.length}`, randRange(k.r, k.sk.react[0] + 0.15, k.sk.react[1] + 0.35));
    if (me.sel !== idx) return me.moveCool > 0 ? NO_INPUT : stick(1, 0);
    return k.mem.t > k.mem.wait && me.cool <= 0 ? press() : NO_INPUT;
  },
};
