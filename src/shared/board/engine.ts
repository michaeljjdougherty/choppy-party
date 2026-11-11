import type { Inputs, TickInput } from '../types';
import { NO_INPUT } from '../types';
import { rand, randInt, shuffle } from '../rng';
import { getBoard } from './boards';
import { buildTour } from './tour';
import { WEATHER, flareThisRound, inZone, newWeather, stormThisRound } from './weather';
import { ITEMS, ITEM_COLS, ITEM_GRID, ITEM_IDS, SHOP_PRICE, SHOP_STOCK } from './items';
import type { BoardDef, BoardEvent, BoardPlayer, BoardState, ItemId, Prompt } from './types';
import { COUNTER_START, HOP_TIME, TRAIN_PRICE, WISP_PRICE } from './types';

/** Keys for minigame placings on a board night (the spec says minigames pay 3 to 10 keys). */
export const MINIGAME_KEYS = [10, 7, 5, 3];
/** Duel and Stew Battle games the board can start mid-turn. */
export const DUEL_GAMES = ['fuse-draw', 'paddle-clash'];
export const STEW_GAMES = ['rope-pull', 'crate-grab'];

const AUTO_ROLL = 8; // seconds before the game rolls for an idle player
const AUTO_CHOICE = 7;
const BANNER = 2;
/** The die spins this long before the number shows, then the number stays up for ROLL_SHOW. */
export const ROLL_SPIN = 1.3;
export const ROLL_SHOW = 1.7;
/** How long a single die stays up before the next one can be rolled. */
export const DIE_SHOW = 0.9;
/** Extra beat on the total when it's doubles. */
export const DOUBLES_EXTRA = 1.1;
export const DOUBLES_KEYS = 5;

/** Last die is down: add it up, pay out doubles, clear the one-roll boosts. */
function finishRoll(s: BoardState, def: BoardDef, me: BoardPlayer): void {
  const sum = s.rolls.reduce((a, b) => a + b, 0);
  // Low Gravity: rolls from the Command Core float a little further
  if (inZone(def, me.node, 'lowgrav')) {
    me.rollBonus += WEATHER.lowGravBonus;
    say(s, `Low gravity! +${WEATHER.lowGravBonus} to your roll`, '#b48cff');
  }

  if (sum === 7) me.stats.sevens++;
  s.doubles = s.rolls.length >= 2 && new Set(s.rolls).size < s.rolls.length;
  if (s.doubles) {
    me.keys += DOUBLES_KEYS;
    me.stats.doubles = (me.stats.doubles ?? 0) + 1;
  }
  s.roll = Math.max(1, sum + me.rollBonus);
  s.stepsLeft = s.roll;
  s.bounced = false;
  me.rollCap = 0;
  me.rollBonus = 0;
  me.dice = 2;
}
const WHEEL_TIME = 3;
/** Item Crate reel: how many items scroll past and how long it runs (the last ~0.9 s shows the prize). */
export const SPIN_LEN = 26;
export const SPIN_STOP = 2.8;
/** Gold Strike payouts (keys) and cave-ins. */
export const GOLD_WINS = [5, 8, 10, 12, 20];
export const GOLD_LOSSES = [-5, -10];
const SPIN_TIME = SPIN_STOP + 0.9;

export function createBoard(boardId: string, playerIds: string[], maxTurns: number, seed: number, tour = false): BoardState {
  const def = getBoard(boardId);
  const pr = def.preset;
  const rng = { seed };
  const s: BoardState = {
    boardId,
    preset: { ...pr },
    turn: 1,
    maxTurns,
    order: shuffle(rng, [...playerIds]),
    baseOrder: [],
    orderRolls: {},
    wonFirst: [],
    tour: null,
    cur: 0,
    sub: 'orderRoll',
    t: 0,
    roll: 0,
    rolls: [],
    diceN: 0,
    doubles: false,
    stepsLeft: 0,
    hop: null,
    pushBack: 0,
    bounced: false,
    branch: null,
    prompt: null,
    players: {},
    crowns: [],
    lastChest: [],
    posts: {},
    hazards: { meteors: [], pine: [], boulderLane: 0, spikes: {} },
    event: null,
    resume: null,
    night: false,
    weather: newWeather(),
    counter: COUNTER_START,
    banner: null,
    fx: [],
    fxSeq: 0,
    log: [],
    rng,
  };
  for (const id of playerIds) {
    s.players[id] = {
      id,
      node: def.start,
      keys: pr.startKeys,
      crowns: 0,
      hp: pr.maxHp,
      items: [],
      ko: false,
      rollCap: 0,
      rollBonus: 0,
      dice: 2,
      shield: false,
      usedItemTurn: 0,
      stats: { damageTaken: 0, damageDealt: 0, kos: 0, spaces: 0, sevens: 0, wins: 0 },
    };
    // everyone starts with an item so they can try the item menu on turn 1
    for (let i = 0; i < pr.startItems; i++) s.players[id].items.push(ITEM_IDS[Math.floor(rand(rng) * ITEM_IDS.length)]);
  }
  while (s.crowns.length < pr.chests) placeChest(s, def);
  planHazards(s, def);
  const w = s.weather;
  w.wind = rand(rng) < 0.5 ? 1 : -1;
  w.windNext = rand(rng) < 0.5 ? 1 : -1;
  w.heatNext = rand(rng) < WEATHER.heatChance;
  w.rainNext = !w.heatNext && rand(rng) < WEATHER.rainChance;
  if (tour) {
    s.tour = { steps: buildTour(def, s), i: 0 };
    s.sub = 'tour';
  }
  return s;
}

/** The tour: any player's A goes to the next stop, B goes back one, the host's X skips (handled by the party). */
function stepTour(s: BoardState, inputs: Inputs): void {
  const tr = s.tour;
  if (!tr) return set(s, 'orderRoll');
  const pressed = (k: 'aPressed' | 'bPressed') => Object.values(inputs).some((i) => i?.[k]);
  if (s.t < 0.35) return;
  if (pressed('aPressed')) {
    tr.i++;
    s.t = 0;
    if (tr.i >= tr.steps.length) endTour(s);
  } else if (pressed('bPressed') && tr.i > 0) {
    tr.i--;
    s.t = 0;
  }
}

export function endTour(s: BoardState): void {
  s.tour = null;
  set(s, 'orderRoll');
}

export function currentPlayer(s: BoardState): string {
  return s.order[s.cur];
}

/** Exits from a node, taking day and night gates into account. */
export function exits(def: BoardDef, s: BoardState, nodeId: string): string[] {
  const n = def.nodes[nodeId];
  if (n.gate) return s.night ? n.gate.night : n.gate.day;
  return n.next;
}

const prevCache = new Map<string, Record<string, string[]>>();
/** Spaces that lead into each space. */
export function prevs(def: BoardDef): Record<string, string[]> {
  let m = prevCache.get(def.id);
  if (!m) {
    m = {};
    for (const n of Object.values(def.nodes)) for (const x of n.next) (m[x] ??= []).push(n.id);
    prevCache.set(def.id, m);
  }
  return m;
}

/** Steps along the path (forward only) from a space to every space it can reach. */
export function forwardDist(def: BoardDef, s: BoardState, from: string, max = 999): Map<string, number> {
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const a = q.shift()!;
    const da = d.get(a)!;
    if (da >= max) continue;
    for (const b of exits(def, s, a)) if (!d.has(b)) (d.set(b, da + 1), q.push(b));
  }
  return d;
}

/** Spaces within `max` steps either way along the path (for item ranges and blasts). */
export function nearDist(def: BoardDef, from: string, max: number): Map<string, number> {
  const p = prevs(def);
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const a = q.shift()!;
    const da = d.get(a)!;
    if (da >= max) continue;
    for (const b of [...def.nodes[a].next, ...(p[a] ?? [])]) if (!d.has(b)) (d.set(b, da + 1), q.push(b));
  }
  return d;
}

/**
 * Smart Crown Chest placement: score every free spot by how far the closest player would have
 * to walk to it, skip spots within chestMinDist of anyone, and pick at random from the 3 farthest.
 */
export function placeChest(s: BoardState, def: BoardDef): string | null {
  const free = def.crownSpots.filter((c) => !s.crowns.includes(c) && !s.lastChest.includes(c));
  if (!free.length) return null;
  const dists = Object.values(s.players).map((p) => forwardDist(def, s, p.node));
  const score = (c: string) => Math.min(...dists.map((d) => d.get(c) ?? 999));
  const scored = free.map((c) => ({ c, d: score(c) }));
  const far = scored.filter((x) => x.d >= s.preset.chestMinDist);
  const pool = (far.length ? far : scored).sort((a, b) => b.d - a.d).slice(0, 3);
  const pick = pool[Math.floor(rand(s.rng) * pool.length)].c;
  s.crowns.push(pick);
  return pick;
}

function say(s: BoardState, text: string, color = '#ffffff'): void {
  s.banner = { text, color, t: BANNER };
  s.log.unshift(text);
  if (s.log.length > 6) s.log.pop();
}

function fx(s: BoardState, kind: string, node: string, id?: string, amount?: number): void {
  s.fx.push({ n: ++s.fxSeq, kind, node, id, amount, t: 0 });
}

function set(s: BoardState, sub: BoardState['sub']): void {
  s.sub = sub;
  s.t = 0;
}

/** Rank for the end of the game: crowns first, then keys. */
export function boardRanking(s: BoardState): { id: string; value: number; label: string }[] {
  return Object.values(s.players)
    .map((p) => ({ id: p.id, value: p.crowns * 10000 + p.keys, label: `${p.crowns} crown${p.crowns === 1 ? '' : 's'} · ${p.keys} keys` }))
    .sort((a, b) => b.value - a.value);
}

/** Award keys after the turn's minigame; returns keys given per player. */
export function awardMinigame(s: BoardState, placements: { id: string; place: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pl of placements) {
    const c = MINIGAME_KEYS[pl.place - 1] ?? 3;
    out[pl.id] = c;
    const p = s.players[pl.id];
    if (p) {
      p.keys += c;
      if (pl.place === 1) p.stats.wins++;
    }
  }
  return out;
}

/**
 * The minigame winner (or winners, on a tie) goes first next turn; everyone else keeps their
 * place from the opening roll.
 */
/**
 * Next turn goes in the order everyone finished the minigame: 1st place moves first, then 2nd,
 * and so on. Ties (and anyone who sat the game out) fall back to the rolled order.
 */
export function winnerGoesFirst(s: BoardState, placements: { id: string; place: number }[]): void {
  const base = s.baseOrder.length ? s.baseOrder : s.order;
  const place = new Map(placements.map((p) => [p.id, p.place]));
  const won = new Set(placements.filter((p) => p.place === 1).map((p) => p.id));
  s.wonFirst = won.size < base.length ? base.filter((id) => won.has(id)) : [];
  s.order = [...base].sort((x, y) => (place.get(x) ?? 99) - (place.get(y) ?? 99) || base.indexOf(x) - base.indexOf(y));
}

const ORDER_SHOW = 4.5;

/** Game start: everyone rolls together. Numbers never repeat, so there are no ties. */
function stepOrderRoll(s: BoardState, inputs: Inputs): void {
  if (s.sub === 'orderShow') {
    if (s.t > ORDER_SHOW) set(s, 'turnIntro');
    return;
  }
  for (const id of s.order) {
    if (s.orderRolls[id]) continue;
    const inp = inputs[id] ?? NO_INPUT;
    if ((inp.aPressed && s.t > 0.6) || s.t > AUTO_ROLL) {
      const used = new Set(Object.values(s.orderRolls));
      const free = Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => !used.has(n));
      s.orderRolls[id] = free[Math.floor(rand(s.rng) * free.length)] ?? 1;
    }
  }
  if (s.order.every((id) => s.orderRolls[id])) {
    s.order.sort((a, b) => s.orderRolls[b] - s.orderRolls[a]);
    s.baseOrder = [...s.order];
    set(s, 'orderShow');
  }
}

export function nextTurn(s: BoardState): void {
  s.turn++;
  s.cur = 0;
  set(s, 'turnIntro');
}

export function boardOver(s: BoardState): boolean {
  return s.sub === 'done' && s.turn >= s.maxTurns;
}

const lateGame = (s: BoardState) => s.maxTurns - s.turn < s.preset.doubleTurns;

// ---- damage, healing and knockouts ---------------------------------------------------------------

/** Damage a player. Returns true if it knocked them out. */
export function hurt(s: BoardState, def: BoardDef, id: string, amount: number, by?: string): boolean {
  const p = s.players[id];
  if (!p || p.ko) return false;
  if (p.shield) {
    p.shield = false;
    fx(s, 'block', p.node, id);
    say(s, 'Blocked by the Knight Shield!', '#3fa9f5');
    return false;
  }
  p.hp -= amount;
  p.stats.damageTaken += amount;
  if (by && s.players[by]) s.players[by].stats.damageDealt += amount;
  fx(s, 'hit', p.node, id, amount);
  if (p.hp > 0) return false;
  // knocked out: drop half the keys (to whoever did it), lose a post, respawn at camp next turn
  const drop = Math.floor(p.keys / 2);
  p.keys -= drop;
  if (by && s.players[by] && by !== id) s.players[by].keys += drop;
  p.hp = s.preset.maxHp;
  p.ko = true;
  p.stats.kos++;
  fx(s, 'ko', p.node, id, drop);
  p.node = def.camp;
  const mine = Object.entries(s.posts).filter(([, c]) => c.owner === id);
  if (mine.length) delete s.posts[mine[Math.floor(rand(s.rng) * mine.length)][0]];
  say(s, `Knocked out! Dropped ${drop} keys`, '#ff5a5f');
  return true;
}

function heal(s: BoardState, p: BoardPlayer, amount: number): number {
  const before = p.hp;
  p.hp = Math.min(s.preset.maxHp, p.hp + amount);
  if (p.hp > before) fx(s, 'heal', p.node, p.id, p.hp - before);
  return p.hp - before;
}

// ---- the turn ------------------------------------------------------------------------------------

/**
 * Advance the board by one tick. Only the current player's input matters; idle players are
 * played for automatically after a few seconds so a party never stalls.
 */
export function stepBoard(s: BoardState, inputs: Inputs, dt: number): void {
  const def = getBoard(s.boardId);
  s.t += dt;
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
  }
  for (const f of s.fx) f.t += dt;
  s.fx = s.fx.filter((f) => f.t < 2);
  if (s.sub === 'done' || s.sub === 'event') return;
  if (s.sub === 'roundEnd') {
    if (s.t > 3.2) set(s, 'done');
    return;
  }
  if (s.sub === 'tour') {
    stepTour(s, inputs);
    return;
  }
  if (s.sub === 'orderRoll' || s.sub === 'orderShow') {
    stepOrderRoll(s, inputs);
    return;
  }
  const id = currentPlayer(s);
  const me = s.players[id];
  const inp: TickInput = inputs[id] ?? NO_INPUT;

  switch (s.sub) {
    case 'turnIntro':
      s.rolls = [];
      s.diceN = 0;
      s.doubles = false;
      s.weather.hiddenRoll = false;
      if (me.ko) {
        // knocked out last time: rest at camp this turn
        if (s.t < dt * 1.5) say(s, 'Resting at the Respawn Camp', '#ffb347');
        if (s.t > BANNER + 0.4) {
          me.ko = false;
          endTurn(s, def);
        }
        break;
      }
      if (s.t > (s.cur === 0 ? 3 : 1.6)) set(s, 'roll');
      break;

    case 'roll': {
      // B opens the item bag before the first die: browse every item, use one you own
      if (inp.bPressed && s.rolls.length === 0 && s.t > 0.2) {
        const owned = ITEM_GRID.findIndex((it) => me.items.includes(it));
        ask(s, { kind: 'items', sel: Math.max(0, owned) });
        break;
      }
      if ((inp.aPressed && s.t > 0.3) || s.t > AUTO_ROLL) {
        // dice come out one at a time: A for the first die, A again for the next
        if (s.rolls.length === 0) {
          s.diceN = me.rollCap ? 1 : Math.max(1, me.dice);
          // Fog Marsh at night: nobody sees the roll until the move is over
          s.weather.hiddenRoll = s.night && inZone(def, me.node, 'fog');
        }
        // Sticky Cube and Root Snare: a single die that only shows 1 to 3
        s.rolls.push(randInt(s.rng, 1, me.rollCap || 6));
        if (s.rolls.length >= s.diceN) finishRoll(s, def, me);
        set(s, 'rolling');
      }
      break;
    }

    case 'rolling':
      if (s.t > ROLL_SPIN) set(s, 'rolled');
      break;

    case 'rolled':
      if (s.rolls.length > 0 && s.rolls.length < s.diceN) {
        // one die is down; wait for the next press
        if (s.t > DIE_SHOW) set(s, 'roll');
      } else if (s.t > ROLL_SHOW + (s.doubles ? DOUBLES_EXTRA : 0)) set(s, 'move');
      break;

    case 'move': {
      if (s.hop) {
        s.hop.t += dt / HOP_TIME;
        if (s.hop.t >= 1) {
          const back = s.hop.back;
          me.node = s.hop.to;
          s.hop = null;
          me.stats.spaces++;
          if (back) {
            s.pushBack--;
            if (s.pushBack <= 0) set(s, 'land');
            break;
          }
          // shops sit beside the path: walking past one doesn't use up a step
          if (def.nodes[me.node].type !== 'shop' || s.stepsLeft <= 0) s.stepsLeft--;
          onPass(s, def, id);
        }
        break;
      }
      if (s.pushBack > 0) {
        const from = prevs(def)[me.node]?.[0];
        if (!from) {
          s.pushBack = 0;
          set(s, 'land');
        } else s.hop = { from: me.node, to: from, t: 0, back: true };
        break;
      }
      if (s.stepsLeft <= 0 || me.ko) {
        set(s, 'land');
        if (!me.ko) onLand(s, def, id);
        break;
      }
      const ex = exits(def, s, me.node);
      if (ex.length > 1 && inZone(def, me.node, 'lowgrav')) {
        // Low Gravity: no steering at forks, you float off down any path
        s.hop = { from: me.node, to: ex[Math.floor(rand(s.rng) * ex.length)], t: 0 };
        say(s, 'Low gravity! Drifting down a random path', '#b48cff');
      } else if (ex.length > 1) {
        s.branch = { options: ex, sel: 0 };
        set(s, 'branch');
      } else {
        s.hop = { from: me.node, to: ex[0], t: 0 };
      }
      break;
    }

    case 'branch': {
      const br = s.branch!;
      // pick the exit whose direction best matches the stick
      if (Math.hypot(inp.x, inp.y) > 0.5) {
        const here = def.nodes[me.node];
        let best = br.sel;
        let bestDot = -Infinity;
        br.options.forEach((o, i) => {
          const n = def.nodes[o];
          const dx = n.x - here.x;
          const dz = n.z - here.z;
          const dot = (dx * inp.x + dz * inp.y) / (Math.hypot(dx, dz) || 1);
          if (dot > bestDot) {
            bestDot = dot;
            best = i;
          }
        });
        br.sel = best;
      }
      if ((inp.aPressed && s.t > 0.25) || s.t > AUTO_CHOICE) {
        if (s.t > AUTO_CHOICE) br.sel = Math.floor(rand(s.rng) * br.options.length);
        s.hop = { from: me.node, to: br.options[br.sel], t: 0 };
        s.branch = null;
        set(s, 'move');
      }
      break;
    }

    case 'prompt':
      stepPrompt(s, def, id, inp);
      break;

    case 'wheel':
      if (s.t > WHEEL_TIME) {
        const ev = s.event!;
        const sit = ev.wheel![Math.floor(rand(s.rng) * ev.wheel!.length)];
        startStew(s, def, ev, sit);
      }
      break;

    case 'itemSpin':
      if (s.t > SPIN_TIME && s.spin) {
        const it = s.spin.pick;
        s.spin = null;
        if (me.items.length < s.preset.maxItems) me.items.push(it);
        say(s, `Got ${ITEMS[it].name}!`, '#ffb347');
        set(s, 'land');
      }
      break;

    case 'gamble':
      if (s.t > SPIN_TIME && s.gamble) {
        const v = s.gamble.pick;
        s.gamble = null;
        if (v >= 0) {
          me.keys += v;
          fx(s, 'keys', me.node, id, v);
          say(s, `Struck gold! +${v} keys`, '#ffd23f');
        } else {
          const c = Math.min(me.keys, -v);
          me.keys -= c;
          fx(s, 'keys', me.node, id, -c);
          say(s, `Cave-in! -${c} keys`, '#ff5a5f');
        }
        set(s, 'land');
      }
      break;

    case 'land':
      if (s.t > BANNER + 0.6) endTurn(s, def);
      break;
  }
}

function endTurn(s: BoardState, def: BoardDef): void {
  if (s.cur < s.order.length - 1) {
    s.cur++;
    set(s, 'turnIntro');
  } else roundEnd(s, def);
}

/** A two-choice prompt locks out presses for this long, so a button mashed on the way in can't answer it. */
export const PROMPT_LOCK = 0.6;
const TWO_CHOICE = new Set(['crown', 'wisp', 'train', 'claim', 'steal']);

function ask(s: BoardState, p: Prompt): void {
  // spending prompts start on "No"; the Crown Chest (what everyone wants) and claiming start on the first option
  if (TWO_CHOICE.has(p.kind) && !('sel' in p)) (p as { sel?: number }).sel = p.kind === 'crown' || p.kind === 'claim' ? 0 : 1;
  s.prompt = p;
  set(s, 'prompt');
}

/** After a prompt or item: go back to rolling, keep moving, or finish the landing. */
function afterPrompt(s: BoardState): void {
  s.prompt = null;
  const back = s.resume ?? 'move';
  s.resume = null;
  set(s, back);
}

function stepPrompt(s: BoardState, def: BoardDef, id: string, inp: TickInput): void {
  const p = s.prompt!;
  const me = s.players[id];
  const yes = inp.aPressed && s.t > 0.3;
  const no = inp.bPressed && s.t > 0.3;
  const auto = s.t > AUTO_CHOICE;
  const stick = s.t > 0.2 && Math.abs(inp.x) > 0.6 ? Math.sign(inp.x) : 0;
  const stickY = s.t > 0.2 && Math.abs(inp.y) > 0.6 ? Math.sign(inp.y) : 0;

  if (p.kind === 'items') {
    // a cursor over the item grid: left/right steps through it, up/down jumps a row
    const n = ITEM_GRID.length;
    if (stick || stickY) {
      p.sel = (p.sel + (stick || stickY * ITEM_COLS) + n) % n;
      s.t = 0.05; // tiny repeat delay
    }
    if (no || auto) {
      s.prompt = null;
      set(s, 'roll');
      return;
    }
    if (yes) {
      const item = ITEM_GRID[p.sel];
      const slot = me.items.indexOf(item);
      if (slot < 0) {
        say(s, `You don't have a ${ITEMS[item].name}`, '#ff5a5f');
        s.t = 0.05;
      } else if (me.usedItemTurn === s.turn) {
        say(s, 'Only 1 item per turn', '#ff5a5f');
        s.t = 0.05;
      } else useItem(s, def, id, slot);
    }
    return;
  }
  if (p.kind === 'shop') {
    const n = p.stock.length + 1; // the last row is "Leave"
    if ((stick || stickY) && s.t > 0.2) {
      p.sel = (p.sel + (stickY || stick) + n) % n;
      s.t = 0.05;
    }
    if (yes && p.sel < p.stock.length) {
      const it = p.stock[p.sel];
      const price = SHOP_PRICE[it];
      if (me.keys < price) {
        say(s, `Not enough keys (${price})`, '#ff5a5f');
        s.t = 0.05;
        return;
      }
      me.keys -= price;
      me.items.push(it);
      fx(s, 'keys', p.node, id, -price);
      say(s, `Bought ${ITEMS[it].name}!`, '#ffb347');
      afterPrompt(s);
      return;
    }
    if (yes || no || auto) afterPrompt(s);
    return;
  }
  if (p.kind === 'target') {
    if (stick || stickY) {
      p.sel = (p.sel + (stick || stickY) + p.options.length) % p.options.length;
      s.t = 0.05;
    }
    if (no && p.purpose === 'item') {
      s.prompt = null;
      set(s, 'roll');
      return;
    }
    if (yes || auto) {
      if (auto) p.sel = Math.floor(rand(s.rng) * p.options.length);
      resolveTarget(s, def, id, p, p.options[p.sel]);
    }
    return;
  }
  // the two-choice prompts: stick left/right moves the cursor, A confirms it, B is always "no"
  const tp = p as { sel?: number };
  tp.sel ??= 0;
  const live = s.t > PROMPT_LOCK;
  if (live && stick) tp.sel = stick < 0 ? 0 : 1;
  const confirm = inp.aPressed && live;
  if (p.kind === 'claim') {
    if (confirm || auto) {
      const sting = !auto && tp.sel === 1;
      s.posts[p.node] = { owner: id, mode: sting ? 'sting' : 'toll' };
      say(s, sting ? 'Claimed a Sting Post!' : 'Claimed a Toll Post!', '#ffd23f');
      fx(s, 'claim', p.node, id);
      s.prompt = null;
      set(s, 'land');
    }
    return;
  }
  const accept = confirm && tp.sel === 0;
  const decline = (confirm && tp.sel === 1) || (no && s.t > PROMPT_LOCK);
  if (p.kind === 'steal') {
    // idle players don't spend keys stealing posts
    if (accept && me.keys >= s.preset.postStealCost) {
      me.keys -= s.preset.postStealCost;
      s.posts[p.node] = { owner: id, mode: 'toll' };
      s.prompt = null;
      ask(s, { kind: 'claim', node: p.node });
      say(s, 'Post stolen! Pick its mode', '#ffd23f');
      return;
    }
    if (decline || auto || accept) {
      s.prompt = null;
      set(s, 'land');
    }
    return;
  }
  // crown, wisp and train: idle players accept anything they can afford
  if (accept || decline || auto) {
    if (accept || (auto && !decline)) resolvePrompt(s, def, id, p);
    if (s.sub === 'prompt') {
      if (me.ko) s.resume = 'land';
      afterPrompt(s);
    }
  }
}

function targetsFor(s: BoardState, id: string): string[] {
  return s.order.filter((o) => o !== id);
}

/** Item targets: anyone except players hidden in the Fog Marsh at night. */
function fogged(s: BoardState, def: BoardDef, id: string): boolean {
  return s.night && inZone(def, s.players[id].node, 'fog');
}
function itemTargets(s: BoardState, def: BoardDef, id: string): string[] {
  return targetsFor(s, id).filter((o) => !fogged(s, def, o));
}

function useItem(s: BoardState, def: BoardDef, id: string, slot: number): void {
  const me = s.players[id];
  const item = me.items[slot];
  if (!item) return;
  const info = ITEMS[item];
  if (info.target) {
    const options = itemTargets(s, def, id);
    if (!options.length) {
      if (targetsFor(s, id).length) say(s, 'Everyone is hidden in the fog!', '#c9d6e8');
      return;
    }
    s.prompt = { kind: 'target', purpose: 'item', item, options, sel: 0 };
    s.t = 0;
    return;
  }
  consume(s, me, slot);
  const at = me.node;
  switch (item) {
    case 'spring-boots':
      me.rollBonus += 5;
      say(s, 'Spring Boots! +5 to your roll', info.color);
      break;
    case 'double-barrel':
      me.dice = 3;
      say(s, 'Double Barrel! Roll 3 dice', info.color);
      break;
    case 'heart-snack':
      heal(s, me, 20);
      say(s, 'Heart Snack! +20 HP', info.color);
      break;
    case 'knight-shield':
      me.shield = true;
      say(s, 'Knight Shield up!', info.color);
      break;
    case 'spike-trap':
      s.hazards.spikes[at] = id;
      say(s, 'Spikes hidden here...', info.color);
      break;
    case 'pirate-cannon': {
      const d = forwardDist(def, s, at, 10);
      let hit: string | null = null;
      let best = 99;
      for (const o of s.order) {
        if (o === id || fogged(s, def, o)) continue;
        const k = d.get(s.players[o].node);
        if (k !== undefined && k > 0 && k < best) {
          best = k;
          hit = o;
        }
      }
      fx(s, 'cannon', at, id);
      if (hit) {
        hurt(s, def, hit, 15, id);
        if (!s.players[hit].ko) say(s, 'BOOM! Cannonball hit for 15!', info.color);
      } else say(s, 'The cannonball missed everyone', info.color);
      break;
    }
    case 'treasure-shovel': {
      const near = nearDist(def, at, 2);
      let got = 0;
      for (const o of s.order) {
        const p = s.players[o];
        if (o === id || !near.has(p.node) || fogged(s, def, o)) continue;
        if (p.shield) {
          p.shield = false;
          fx(s, 'block', p.node, o);
          continue;
        }
        const k = Math.min(5, p.keys);
        p.keys -= k;
        got += k;
      }
      me.keys += got;
      fx(s, 'dig', at, id, got);
      say(s, got ? `Dug up ${got} keys!` : 'Nothing to dig up nearby', info.color);
      break;
    }
  }
  s.prompt = null;
  set(s, 'roll');
}

function consume(s: BoardState, me: BoardPlayer, slot: number): void {
  const item = me.items.splice(slot, 1)[0];
  me.usedItemTurn = s.turn;
  // using any other item drops your shield
  if (item !== 'knight-shield') me.shield = false;
  fx(s, 'item', me.node, me.id);
  s.log.unshift(`item:${item}`);
}

function resolveTarget(s: BoardState, def: BoardDef, id: string, p: Extract<Prompt, { kind: 'target' }>, target: string): void {
  const me = s.players[id];
  const tp = s.players[target];
  s.prompt = null;
  if (p.purpose === 'duel') {
    startDuel(s, id, target);
    return;
  }
  if (p.purpose === 'cannon') {
    fx(s, 'cannon', me.node, id);
    hurt(s, def, target, s.preset.cannonDamage, id);
    if (!tp.ko) say(s, `Cannon hit for ${s.preset.cannonDamage}!`, '#ff9f1c');
    set(s, 'land');
    return;
  }
  const item = p.item!;
  const slot = me.items.indexOf(item);
  if (slot >= 0) consume(s, me, slot);
  const color = ITEMS[item].color;
  if (item === 'hunting-bow') {
    fx(s, 'arrow', tp.node, target);
    hurt(s, def, target, 10, id);
    if (!tp.ko) say(s, 'Bullseye! 10 damage', color);
    set(s, 'roll');
  } else if (item === 'sticky-cube') {
    if (tp.shield) {
      tp.shield = false;
      say(s, 'Blocked by the Knight Shield!', '#3fa9f5');
    } else {
      tp.rollCap = 3;
      say(s, 'Sticky! Their next roll is 1 to 3', color);
    }
    fx(s, 'sticky', tp.node, target);
    set(s, 'roll');
  } else if (item === 'swap-pipe') {
    if (tp.shield) {
      tp.shield = false;
      say(s, 'Blocked by the Knight Shield!', '#3fa9f5');
      set(s, 'roll');
    } else {
      const a = me.node;
      me.node = tp.node;
      tp.node = a;
      fx(s, 'swap', me.node, id);
      fx(s, 'swap', tp.node, target);
      say(s, 'Swapped places!', color);
      set(s, 'land'); // your turn ends
    }
  }
}

function resolvePrompt(s: BoardState, def: BoardDef, id: string, p: Prompt): void {
  const me = s.players[id];
  if (p.kind === 'crown' && me.keys >= s.preset.crownPrice) {
    me.keys -= s.preset.crownPrice;
    me.crowns++;
    s.crowns = s.crowns.filter((c) => c !== p.node);
    s.lastChest = [p.node];
    placeChest(s, def);
    fx(s, 'crown', p.node, id);
    say(s, 'Got a Choppy Crown!', '#ffd23f');
  } else if (p.kind === 'wisp' && me.keys >= WISP_PRICE) {
    const target = leaderOtherThan(s, id);
    if (!target) return;
    me.keys -= WISP_PRICE;
    const take = Math.min(s.players[target].keys, randInt(s.rng, 6, 15));
    s.players[target].keys -= take;
    me.keys += take;
    say(s, `The Wisp stole ${take} keys from the leader!`, '#c79bff');
  } else if (p.kind === 'train' && me.keys >= TRAIN_PRICE) {
    me.keys -= TRAIN_PRICE;
    s.hop = { from: me.node, to: p.to, t: -1.5 }; // a longer hop: the train ride
    say(s, 'All aboard!', '#ffb347');
  }
}

function leaderOtherThan(s: BoardState, id: string): string | null {
  const others = Object.values(s.players).filter((p) => p.id !== id && p.keys > 0);
  others.sort((a, b) => b.crowns - a.crowns || b.keys - a.keys);
  return others[0]?.id ?? null;
}

function onPass(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  const node = def.nodes[me.node];
  const passing = s.stepsLeft > 0;
  // keys a flash flood washed out are free to grab
  const loose = s.weather.loose[me.node];
  if (loose) {
    delete s.weather.loose[me.node];
    me.keys += loose;
    fx(s, 'keys', me.node, id, loose);
    say(s, `Picked up ${loose} washed-up keys!`, '#3fa9f5');
  }
  // Heatwave: every step on the salt flats costs HP
  if (s.weather.heat && inZone(def, me.node, 'heat')) {
    if (hurt(s, def, id, WEATHER.heatDamage)) return;
  }
  if (s.crowns.includes(me.node)) {
    if (me.keys >= s.preset.crownPrice) ask(s, { kind: 'crown', node: me.node });
    else say(s, `Need ${s.preset.crownPrice} keys for the crown`, '#ffd23f');
    return;
  }
  if (passing) {
    const post = s.posts[me.node];
    if (post && post.owner !== id) {
      const owner = s.players[post.owner];
      if (post.mode === 'toll') {
        const k = Math.min(me.keys, s.preset.passToll);
        me.keys -= k;
        owner.keys += k;
        if (k) fx(s, 'toll', me.node, id, k);
      } else hurt(s, def, id, s.preset.passSting, post.owner);
      if (me.ko) return;
    }
    if (node.type === 'fountain') {
      const h = heal(s, me, s.preset.fountainPass);
      if (h) say(s, `Heart Fountain: +${h} HP`, '#ff7bd5');
    }
  }
  if (node.type === 'shop' && passing) {
    const cheapest = Math.min(...ITEM_IDS.map((i) => SHOP_PRICE[i]));
    if (me.items.length >= s.preset.maxItems) say(s, 'Shop: your bag is full!', '#ffb347');
    else if (me.keys < cheapest) say(s, `Shop: items start at ${cheapest} keys`, '#ffb347');
    else {
      // a fresh counter every visit, cheapest first
      const pool = [...ITEM_IDS];
      const stock: ItemId[] = [];
      while (stock.length < SHOP_STOCK && pool.length) stock.push(pool.splice(Math.floor(rand(s.rng) * pool.length), 1)[0]);
      stock.sort((a, b) => SHOP_PRICE[a] - SHOP_PRICE[b]);
      ask(s, { kind: 'shop', node: me.node, stock, sel: 0 });
    }
    return;
  }
  if (node.type === 'wisp' && me.keys >= WISP_PRICE && leaderOtherThan(s, id)) {
    ask(s, { kind: 'wisp' });
    return;
  }
  if (node.type === 'station' && def.stations && me.keys >= TRAIN_PRICE && passing) {
    const i = def.stations.indexOf(me.node);
    ask(s, { kind: 'train', to: def.stations[(i + 1) % def.stations.length] });
    return;
  }
  if (node.type === 'counter') {
    s.counter--;
    if (s.counter <= 0) {
      s.counter = COUNTER_START;
      let hit = 0;
      for (const p of Object.values(s.players)) {
        if (def.nodes[p.node].lane && p.id !== id) {
          hurt(s, def, p.id, s.preset.laserDamage);
          hit++;
        }
      }
      fx(s, 'laser', me.node);
      say(s, hit ? `LASER! ${hit} player${hit > 1 ? 's' : ''} took ${s.preset.laserDamage} damage` : 'LASER! The lane was empty', '#ff4fd8');
    } else say(s, `Laser charging: ${s.counter}`, '#ff9cf0');
  }
}

function onLand(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  s.weather.hiddenRoll = false;
  clearBlind(s, def);
  const node = def.nodes[me.node];
  const pr = s.preset;
  const dbl = lateGame(s) ? 2 : 1;
  // a hidden spike trap goes off first
  const trap = s.hazards.spikes[me.node];
  if (trap && trap !== id) {
    delete s.hazards.spikes[me.node];
    fx(s, 'spikes', me.node, id);
    say(s, 'Spike trap! 10 damage', '#9aa3b5');
    if (hurt(s, def, id, 10, trap)) return;
  }
  switch (node.type) {
    case 'key':
    case 'counter':
    case 'station':
    case 'wisp':
    case 'camp': {
      const k = pr.keySpace * dbl;
      me.keys += k;
      fx(s, 'keys', me.node, id, k);
      say(s, `+${k} keys`, '#5fb8ff');
      break;
    }
    case 'heart': {
      if (s.weather.heat && inZone(def, me.node, 'heat')) {
        say(s, 'Heatwave! This heart is all dried up', '#ff6a3d');
        break;
      }
      const h = heal(s, me, pr.heartSpace * dbl);
      say(s, h ? `+${h} HP` : 'Already at full HP', '#4cd97b');
      break;
    }
    case 'thorn': {
      const k = Math.min(me.keys, pr.thornSpace);
      me.keys -= k;
      fx(s, 'keys', me.node, id, -k);
      say(s, `-${pr.thornSpace} keys`, '#ff5a5f');
      break;
    }
    case 'fountain':
      heal(s, me, pr.maxHp);
      say(s, 'Heart Fountain: full HP!', '#ff7bd5');
      break;
    case 'crate': {
      fx(s, 'crate', me.node, id);
      if (me.items.length >= pr.maxItems) {
        say(s, 'Your bag is full!', '#ffb347');
        break;
      }
      // the crate spins a reel of items and stops on the prize
      const pick = ITEM_IDS[Math.floor(rand(s.rng) * ITEM_IDS.length)];
      const reel: ItemId[] = [];
      for (let i = 0; i < SPIN_LEN + 4; i++) reel.push(ITEM_IDS[(i * 7 + Math.floor(rand(s.rng) * ITEM_IDS.length)) % ITEM_IDS.length]);
      reel[SPIN_LEN] = pick;
      s.spin = { reel, at: SPIN_LEN, pick };
      set(s, 'itemSpin');
      break;
    }
    case 'lucky': {
      if (rand(s.rng) < 0.12 && s.crowns.length) {
        // jackpot: a free trip to a Crown Chest
        const target = s.crowns[0];
        me.node = target;
        fx(s, 'warp', target, id);
        say(s, 'Lucky! Warped to a Crown Chest!', '#4cd97b');
        if (me.keys >= pr.crownPrice) {
          s.resume = 'land';
          ask(s, { kind: 'crown', node: target });
        }
        break;
      }
      const c = randInt(s.rng, 5, 10);
      me.keys += c;
      fx(s, 'keys', me.node, id, c);
      say(s, `Lucky! +${c} keys`, '#4cd97b');
      break;
    }
    case 'post': {
      const post = s.posts[me.node];
      if (!post) {
        ask(s, { kind: 'claim', node: me.node });
        break;
      }
      if (post.owner === id) {
        say(s, 'Your post is working for you', '#ffd23f');
        break;
      }
      const owner = s.players[post.owner];
      if (post.mode === 'toll') {
        const k = Math.min(me.keys, pr.postToll);
        me.keys -= k;
        owner.keys += k;
        fx(s, 'toll', me.node, id, k);
        say(s, `Toll Post: paid ${k} keys`, '#ffd23f');
      } else {
        heal(s, owner, pr.postStingHeal);
        say(s, `Sting Post: ${pr.postSting} damage`, '#ff5a5f');
        if (hurt(s, def, id, pr.postSting, post.owner)) break;
      }
      if (me.keys >= pr.postStealCost) ask(s, { kind: 'steal', node: me.node });
      break;
    }
    case 'duel': {
      const options = targetsFor(s, id);
      if (!options.length) {
        say(s, 'Nobody to duel!', '#ff9f1c');
        break;
      }
      say(s, 'Duel Spot! Pick your rival', '#ff9f1c');
      ask(s, { kind: 'target', purpose: 'duel', options, sel: 0 });
      break;
    }
    case 'stew':
      beginStew(s, def, id);
      break;
    case 'cannon': {
      const near = nearDist(def, me.node, pr.cannonRange);
      const options = targetsFor(s, id).filter((o) => near.has(s.players[o].node));
      if (!options.length) {
        say(s, 'Cannon Space: nobody in range', '#ff9f1c');
        break;
      }
      say(s, 'Cannon Space! Take aim', '#ff9f1c');
      ask(s, { kind: 'target', purpose: 'cannon', options, sel: 0 });
      break;
    }
    case 'spring':
      if (s.bounced) break;
      s.bounced = true;
      s.stepsLeft = randInt(s.rng, 1, 5);
      fx(s, 'spring', me.node, id, s.stepsLeft);
      say(s, `Boing! ${s.stepsLeft} more spaces`, '#4cd97b');
      set(s, 'move');
      break;
    case 'vent':
      s.pushBack = 3;
      fx(s, 'vent', me.node, id);
      say(s, 'Airlock vent! Blasted back 3 spaces', '#45e3ff');
      set(s, 'move');
      break;
    case 'dynamite': {
      const near = nearDist(def, me.node, 1);
      fx(s, 'boom', me.node, id);
      say(s, `Dynamite! ${pr.dynamiteDamage} damage nearby`, '#ff5a5f');
      for (const o of s.order) if (near.has(s.players[o].node)) hurt(s, def, o, pr.dynamiteDamage);
      break;
    }
    case 'snare':
      if (s.night) {
        me.rollCap = 3;
        fx(s, 'snare', me.node, id);
        say(s, 'Root Snare! Your next roll is capped at 3', '#8bc34a');
      } else {
        me.keys += pr.keySpace * dbl;
        say(s, `+${pr.keySpace * dbl} keys`, '#5fb8ff');
      }
      break;
    case 'event':
      boardEvent(s, def, id);
      break;
  }
}

function boardEvent(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  if (def.theme === 'hollow') {
    s.night = !s.night;
    if (s.night && !s.hazards.pine.length) pickPine(s, def);
    say(s, s.night ? 'The bell tolls... night falls! Watch the pines.' : 'Dawn breaks! The Moon Bridge is open.', s.night ? '#c79bff' : '#ffd23f');
  } else if (def.theme === 'cosmo') {
    const pads = Object.values(def.nodes).filter((n) => n.type === 'event' && n.id !== me.node);
    const to = pads[Math.floor(rand(s.rng) * pads.length)];
    if (to) me.node = to.id;
    fx(s, 'warp', me.node, id);
    say(s, 'Warp pad! Zoom!', '#45e3ff');
  } else {
    // Gold Strike: a gamble reel of nuggets and cave-ins spins, then pays out
    const pick = rand(s.rng) < 0.65 ? GOLD_WINS[Math.floor(rand(s.rng) * GOLD_WINS.length)] : GOLD_LOSSES[Math.floor(rand(s.rng) * GOLD_LOSSES.length)];
    const all = [...GOLD_WINS, ...GOLD_LOSSES];
    const reel: number[] = [];
    for (let i = 0; i < SPIN_LEN + 4; i++) reel.push(all[Math.floor(rand(s.rng) * all.length)]);
    reel[SPIN_LEN] = pick;
    s.gamble = { reel, at: SPIN_LEN, pick };
    set(s, 'gamble');
  }
}

// ---- duels and Stew Battles ------------------------------------------------------------------------

function startDuel(s: BoardState, id: string, rival: string): void {
  const gameId = DUEL_GAMES[Math.floor(rand(s.rng) * DUEL_GAMES.length)];
  s.event = { kind: 'duel', gameId, lander: id, players: [id, rival] };
  say(s, 'DUEL!', '#ff9f1c');
  set(s, 'event');
}

function standingOrder(s: BoardState): string[] {
  return [...s.order].sort((a, b) => {
    const pa = s.players[a];
    const pb = s.players[b];
    return pb.crowns - pa.crowns || pb.keys - pa.keys;
  });
}

function beginStew(s: BoardState, def: BoardDef, lander: string): void {
  const gameId = STEW_GAMES[Math.floor(rand(s.rng) * STEW_GAMES.length)];
  const ev: BoardEvent = { kind: 'stew', gameId, lander, players: [], teams: {}, sitOut: null };
  s.event = ev;
  if (s.order.length < 2) {
    s.event = null;
    say(s, 'Not enough players for a Stew Battle', '#ff9f1c');
    return;
  }
  if (s.order.length % 2 === 1 && s.order.length > 2) {
    // odd count: the wheel picks first or last place to sit out
    const st = standingOrder(s);
    ev.wheel = [st[0], st[st.length - 1]];
    say(s, 'Stew Battle! Spinning the sit-out wheel...', '#ffb347');
    set(s, 'wheel');
    return;
  }
  startStew(s, def, ev, s.order.length % 2 === 1 ? standingOrder(s)[s.order.length - 1] : null);
}

function startStew(s: BoardState, _def: BoardDef, ev: BoardEvent, sitOut: string | null): void {
  ev.sitOut = sitOut;
  if (sitOut) {
    s.players[sitOut].keys += s.preset.sitOutKeys;
    fx(s, 'keys', s.players[sitOut].node, sitOut, s.preset.sitOutKeys);
  }
  // balanced by crowns: shuffle, sort by standing, then deal A B B A A B ...
  const playing = shuffle(s.rng, s.order.filter((o) => o !== sitOut));
  const ranked = playing.sort((a, b) => s.players[b].crowns - s.players[a].crowns || s.players[b].keys - s.players[a].keys);
  ev.players = ranked;
  ev.teams = {};
  ranked.forEach((id, i) => (ev.teams![id] = [0, 1, 1, 0][i % 4]));
  say(s, sitOut ? 'Stew Battle! Teams are set' : 'Stew Battle!', '#ffb347');
  set(s, 'event');
}

/** The space just before a Crown Chest that is closest to a player. */
function behindChest(s: BoardState, def: BoardDef, id: string): string | null {
  const from = s.players[id].node;
  const near = nearDist(def, from, 999);
  let best: string | null = null;
  let bd = Infinity;
  for (const c of s.crowns) {
    for (const p of prevs(def)[c] ?? []) {
      const d = near.get(p) ?? 999;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  return best;
}

/**
 * Called by the party when a duel or Stew Battle minigame ends. `ranking` is the game's
 * results, best first. Returns a line for the results screen.
 */
export function finishEvent(s: BoardState, ranking: { id: string; value: number }[]): string {
  const def = getBoard(s.boardId);
  const ev = s.event;
  s.event = null;
  let line = '';
  if (ev?.kind === 'duel') {
    const top = ranking[0];
    const tie = ranking.length > 1 && ranking[1].value === top.value;
    if (top && !tie) {
      const spot = behindChest(s, def, top.id);
      if (spot) s.players[top.id].node = spot;
      s.players[top.id].stats.wins++;
      fx(s, 'warp', s.players[top.id].node, top.id);
      line = 'Duel winner jumps right behind the Crown Chest!';
    } else line = 'The duel was a draw';
  } else if (ev?.kind === 'stew' && ev.teams) {
    const teamOf = (id: string) => ev.teams![id];
    const best = ranking[0];
    const tie = ranking.some((r) => r.value === best.value && teamOf(r.id) !== teamOf(best.id));
    if (best && !tie) {
      const win = teamOf(best.id);
      for (const id of ev.players) {
        if (teamOf(id) !== win) continue;
        s.players[id].keys += s.preset.stewWin;
        s.players[id].stats.wins++;
      }
      if (teamOf(ev.lander) === win) s.players[ev.lander].keys += s.preset.stewLanderBonus;
      line = `Winning team gets +${s.preset.stewWin} keys each!`;
    } else line = 'The Stew Battle was a draw';
  }
  s.banner = null;
  say(s, line, '#ffd23f');
  set(s, 'land');
  return line;
}

// ---- end of round hazards -------------------------------------------------------------------------

function pickPine(s: BoardState, def: BoardDef): void {
  const pines = def.pines ?? [];
  s.hazards.pine = pines.length ? pines[Math.floor(rand(s.rng) * pines.length)] : [];
}

/** Choose where the next round's hazards will hit, so the board can show warnings. */
function planHazards(s: BoardState, def: BoardDef): void {
  if (def.theme === 'cosmo') {
    const all = Object.keys(def.nodes).filter((n) => n !== def.camp && n !== def.start);
    s.hazards.meteors = shuffle(s.rng, all).slice(0, 3);
  }
  if (def.theme === 'hollow') s.hazards.pine = s.night ? s.hazards.pine : [];
  if (def.theme === 'hollow' && s.night && !s.hazards.pine.length) pickPine(s, def);
  if (def.theme === 'gulch') s.hazards.boulderLane = Math.floor(rand(s.rng) * 2);
}

function roundEnd(s: BoardState, def: BoardDef): void {
  set(s, 'roundEnd');
  const lines: string[] = [];
  const dmg = s.preset.hazardDamage;
  const on = (nodes: string[]) => s.order.filter((o) => nodes.includes(s.players[o].node));
  if (def.theme === 'hollow' && s.night && s.hazards.pine.length) {
    const hit = on(s.hazards.pine);
    for (const o of hit) hurt(s, def, o, dmg);
    fx(s, 'pine', s.hazards.pine[0]);
    lines.push(hit.length ? `TIMBER! A pine fell on ${hit.length}` : 'TIMBER! A pine crashed down');
    s.hazards.pine = [];
    pickPine(s, def);
  }
  if (def.theme === 'cosmo' && s.hazards.meteors.length) {
    const hit = on(s.hazards.meteors);
    for (const o of hit) hurt(s, def, o, dmg);
    for (const m of s.hazards.meteors) fx(s, 'meteor', m);
    lines.push(hit.length ? `Meteors hit ${hit.length} player${hit.length > 1 ? 's' : ''}!` : 'Meteors crash down!');
  }
  if (def.theme === 'gulch') {
    const lane = Object.values(def.nodes).filter((n) => n.canyon === s.hazards.boulderLane).map((n) => n.id);
    const hit = on(lane);
    for (const o of hit) hurt(s, def, o, dmg);
    if (lane.length) fx(s, 'boulder', lane[0]);
    lines.push(hit.length ? `Rolling boulder hit ${hit.length}!` : 'A boulder rolls down the canyon');
    // the train sweeps anyone standing at a station along to the next one
    if (def.stations) {
      for (const o of s.order) {
        const i = def.stations.indexOf(s.players[o].node);
        if (i >= 0) s.players[o].node = def.stations[(i + 1) % def.stations.length];
      }
    }
  }
  weatherRoundEnd(s, def, lines);
  planHazards(s, def);
  if (lines.length) say(s, lines.join('  ·  '), '#ff9f1c');
  else s.t = 2.2; // nothing happened: move on quickly
}


// ---- weather ------------------------------------------------------------------------------------

/** Slide a player n spaces along the path (dir 1) or back down it (dir -1). */
function push(s: BoardState, def: BoardDef, id: string, n: number, dir: number): void {
  const p = s.players[id];
  for (let i = 0; i < n; i++) {
    const to = dir > 0 ? exits(def, s, p.node)[0] : prevs(def)[p.node]?.[0];
    if (!to) break;
    p.node = to;
  }
}

/** Sandstorm blindness lasts until you're out of the dunes. */
function clearBlind(s: BoardState, def: BoardDef): void {
  s.weather.blind = s.weather.blind.filter((o) => s.players[o] && inZone(def, s.players[o].node, 'sandstorm'));
}

function weatherRoundEnd(s: BoardState, def: BoardDef, lines: string[]): void {
  const w = s.weather;
  for (const z of def.weather ?? []) {
    const here = s.order.filter((o) => !s.players[o].ko && z.nodes.includes(s.players[o].node));
    switch (z.kind) {
      case 'wind':
        for (const o of here) {
          fx(s, 'gust', s.players[o].node, o, w.wind);
          push(s, def, o, WEATHER.windPush, w.wind);
        }
        if (here.length) lines.push(`Will-o'-Wind blew ${here.length} ${w.wind > 0 ? 'ahead' : 'back'}`);
        break;
      case 'flare':
        if (!flareThisRound(s)) break;
        fx(s, 'flare', z.nodes[0]);
        for (const o of here) hurt(s, def, o, WEATHER.flareDamage);
        lines.push(here.length ? `SOLAR FLARE scorched ${here.length}!` : 'A solar flare lit up the ring');
        break;
      case 'sandstorm':
        if (!stormThisRound(s)) break;
        fx(s, 'sandstorm', z.nodes[Math.floor(z.nodes.length / 2)]);
        for (const o of here) {
          if (hurt(s, def, o, WEATHER.stormDamage)) continue;
          push(s, def, o, WEATHER.stormPush, 1);
          if (!w.blind.includes(o)) w.blind.push(o);
        }
        lines.push(here.length ? `SANDSTORM caught ${here.length}!` : 'A sandstorm swept the dunes');
        break;
      case 'flood':
        if (!w.rain) break;
        fx(s, 'flood', z.nodes[Math.floor(z.nodes.length / 2)]);
        for (const o of here) {
          const p = s.players[o];
          const drop = Math.min(WEATHER.floodDrop, p.keys);
          if (drop) {
            p.keys -= drop;
            w.loose[p.node] = (w.loose[p.node] ?? 0) + drop;
            fx(s, 'keys', p.node, o, -drop);
          }
          push(s, def, o, WEATHER.floodPush, 1);
          fx(s, 'gust', p.node, o, 1);
        }
        lines.push(here.length ? `FLASH FLOOD washed ${here.length} downstream!` : 'The riverbed flooded');
        break;
    }
  }
  // tomorrow's weather becomes today's, and a new forecast rolls in
  w.wind = w.windNext;
  w.windNext = rand(s.rng) < 0.5 ? 1 : -1;
  w.rain = w.rainNext;
  w.heat = w.heatNext;
  w.heatNext = rand(s.rng) < WEATHER.heatChance;
  w.rainNext = !w.heatNext && rand(s.rng) < WEATHER.rainChance;
}
