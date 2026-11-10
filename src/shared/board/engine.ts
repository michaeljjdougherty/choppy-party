import type { Inputs, TickInput } from '../types';
import { NO_INPUT } from '../types';
import { rand, randInt, shuffle } from '../rng';
import { getBoard } from './boards';
import type { BoardDef, BoardState, Prompt } from './types';
import { COUNTER_START, CROWN_PRICE, HOP_TIME, TRAIN_PRICE, WISP_PRICE } from './types';

/** Coins for minigame placings on a board night. */
export const MINIGAME_COINS = [10, 6, 4, 2];
const AUTO_ROLL = 8; // seconds before the game rolls for an idle player
const AUTO_CHOICE = 7;
const BANNER = 1.6;

export function createBoard(boardId: string, playerIds: string[], maxTurns: number, seed: number): BoardState {
  const def = getBoard(boardId);
  const rng = { seed };
  const s: BoardState = {
    boardId,
    turn: 1,
    maxTurns,
    order: shuffle(rng, [...playerIds]),
    cur: 0,
    sub: 'turnIntro',
    t: 0,
    roll: 0,
    stepsLeft: 0,
    hop: null,
    branch: null,
    prompt: null,
    players: {},
    crowns: [],
    night: false,
    counter: COUNTER_START,
    banner: null,
    log: [],
    rng,
  };
  for (const id of playerIds) s.players[id] = { id, node: def.start, coins: 10, crowns: 0 };
  while (s.crowns.length < def.crownsActive) placeCrown(s, def);
  return s;
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

function placeCrown(s: BoardState, def: BoardDef): void {
  const free = def.crownSpots.filter((c) => !s.crowns.includes(c));
  // keep new crowns away from where everyone is standing, when possible
  const occupied = new Set(Object.values(s.players).map((p) => p.node));
  const pool = free.filter((c) => !occupied.has(c));
  const pick = (pool.length ? pool : free)[Math.floor(rand(s.rng) * (pool.length ? pool.length : free.length))];
  if (pick) s.crowns.push(pick);
}

function say(s: BoardState, text: string, color = '#ffffff'): void {
  s.banner = { text, color, t: BANNER };
  s.log.unshift(text);
  if (s.log.length > 6) s.log.pop();
}

function set(s: BoardState, sub: BoardState['sub']): void {
  s.sub = sub;
  s.t = 0;
}

/** Rank for the end of the game: crowns first, then coins. */
export function boardRanking(s: BoardState): { id: string; value: number; label: string }[] {
  return Object.values(s.players)
    .map((p) => ({ id: p.id, value: p.crowns * 10000 + p.coins, label: `${p.crowns} crown${p.crowns === 1 ? '' : 's'} · ${p.coins} coins` }))
    .sort((a, b) => b.value - a.value);
}

/** Award coins after the turn's minigame; returns coins given per player. */
export function awardMinigame(s: BoardState, placements: { id: string; place: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pl of placements) {
    const c = MINIGAME_COINS[pl.place - 1] ?? 2;
    out[pl.id] = c;
    if (s.players[pl.id]) s.players[pl.id].coins += c;
  }
  return out;
}

export function nextTurn(s: BoardState): void {
  s.turn++;
  s.cur = 0;
  set(s, 'turnIntro');
}

export function boardOver(s: BoardState): boolean {
  return s.sub === 'done' && s.turn >= s.maxTurns;
}

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
  if (s.sub === 'done') return;
  const id = currentPlayer(s);
  const me = s.players[id];
  const inp: TickInput = inputs[id] ?? NO_INPUT;

  switch (s.sub) {
    case 'turnIntro':
      if (s.t > (s.cur === 0 ? 2.2 : 0.9)) set(s, 'roll');
      break;

    case 'roll':
      if ((inp.aPressed && s.t > 0.3) || s.t > AUTO_ROLL) {
        s.roll = randInt(s.rng, 1, 10);
        s.stepsLeft = s.roll;
        set(s, 'rolled');
      }
      break;

    case 'rolled':
      if (s.t > 0.9) set(s, 'move');
      break;

    case 'move': {
      if (s.hop) {
        s.hop.t += dt / HOP_TIME;
        if (s.hop.t >= 1) {
          me.node = s.hop.to;
          s.hop = null;
          s.stepsLeft--;
          onPass(s, def, id);
        }
        break;
      }
      if (s.stepsLeft <= 0) {
        set(s, 'land');
        onLand(s, def, id);
        break;
      }
      const ex = exits(def, s, me.node);
      if (ex.length > 1) {
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

    case 'prompt': {
      const p = s.prompt!;
      const yes = inp.aPressed && s.t > 0.3;
      const no = inp.bPressed && s.t > 0.3;
      // idle players accept anything they can afford: it is almost always the right call
      const auto = s.t > AUTO_CHOICE;
      if (yes || no || auto) {
        if (yes || (auto && !no)) resolvePrompt(s, def, id, p);
        s.prompt = null;
        set(s, 'move');
      }
      break;
    }

    case 'land':
      if (s.t > BANNER + 0.2) {
        if (s.cur < s.order.length - 1) {
          s.cur++;
          set(s, 'turnIntro');
        } else set(s, 'done');
      }
      break;
  }
}

function ask(s: BoardState, p: Prompt): void {
  s.prompt = p;
  set(s, 'prompt');
}

function onPass(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  const node = def.nodes[me.node];
  if (s.crowns.includes(me.node)) {
    if (me.coins >= CROWN_PRICE) ask(s, { kind: 'crown', node: me.node });
    else say(s, `Need ${CROWN_PRICE} coins for the crown`, '#ffd23f');
    return;
  }
  if (node.type === 'wisp' && me.coins >= WISP_PRICE && leaderOtherThan(s, id)) {
    ask(s, { kind: 'wisp' });
    return;
  }
  if (node.type === 'station' && def.stations && me.coins >= TRAIN_PRICE) {
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
          p.coins = Math.floor(p.coins / 2);
          hit++;
        }
      }
      say(s, hit ? `LASER! ${hit} player${hit > 1 ? 's' : ''} lost half their coins` : 'LASER! The lane was empty', '#ff4fd8');
    } else say(s, `Laser charging: ${s.counter}`, '#ff9cf0');
  }
}

function leaderOtherThan(s: BoardState, id: string): string | null {
  const others = Object.values(s.players).filter((p) => p.id !== id && p.coins > 0);
  others.sort((a, b) => b.crowns - a.crowns || b.coins - a.coins);
  return others[0]?.id ?? null;
}

function resolvePrompt(s: BoardState, def: BoardDef, id: string, p: Prompt): void {
  const me = s.players[id];
  if (p.kind === 'crown' && me.coins >= CROWN_PRICE) {
    me.coins -= CROWN_PRICE;
    me.crowns++;
    s.crowns = s.crowns.filter((c) => c !== p.node);
    placeCrown(s, def);
    say(s, 'Got a crown!', '#ffd23f');
  } else if (p.kind === 'wisp' && me.coins >= WISP_PRICE) {
    const target = leaderOtherThan(s, id);
    if (!target) return;
    me.coins -= WISP_PRICE;
    const take = Math.min(s.players[target].coins, randInt(s.rng, 6, 15));
    s.players[target].coins -= take;
    me.coins += take;
    say(s, `The Wisp stole ${take} coins from the leader!`, '#c79bff');
  } else if (p.kind === 'train' && me.coins >= TRAIN_PRICE) {
    me.coins -= TRAIN_PRICE;
    s.hop = { from: me.node, to: p.to, t: -1.5 }; // a longer hop: the train ride
    say(s, 'All aboard!', '#ffb347');
  }
}

function onLand(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  const node = def.nodes[me.node];
  switch (node.type) {
    case 'blue':
    case 'counter':
    case 'station':
    case 'wisp':
      me.coins += 3;
      say(s, '+3 coins', '#5fb8ff');
      break;
    case 'red':
      me.coins = Math.max(0, me.coins - 3);
      say(s, '-3 coins', '#ff5a5f');
      break;
    case 'lucky': {
      const roll = rand(s.rng);
      if (roll < 0.15 && me.coins >= 0) {
        // jackpot: a free trip to the nearest crown
        const target = s.crowns[0];
        if (target) {
          me.node = target;
          say(s, 'Lucky! Warped to a crown space!', '#4cd97b');
          if (me.coins >= CROWN_PRICE) ask(s, { kind: 'crown', node: target });
          break;
        }
      }
      const c = randInt(s.rng, 4, 10);
      me.coins += c;
      say(s, `Lucky! +${c} coins`, '#4cd97b');
      break;
    }
    case 'event':
      boardEvent(s, def, id);
      break;
  }
}

function boardEvent(s: BoardState, def: BoardDef, id: string): void {
  const me = s.players[id];
  if (def.theme === 'hollow') {
    s.night = !s.night;
    say(s, s.night ? 'The bell tolls... night falls! The Root Cellar opens.' : 'Dawn breaks! The Moon Bridge is open.', s.night ? '#c79bff' : '#ffd23f');
  } else if (def.theme === 'cosmo') {
    const pads = Object.values(def.nodes).filter((n) => n.type === 'event' && n.id !== me.node);
    const to = pads[Math.floor(rand(s.rng) * pads.length)];
    if (to) me.node = to.id;
    say(s, 'Warp pad! Zoom!', '#45e3ff');
  } else {
    if (rand(s.rng) < 0.7) {
      const c = randInt(s.rng, 5, 12);
      me.coins += c;
      say(s, `Struck gold! +${c} coins`, '#ffd23f');
    } else {
      me.coins = Math.max(0, me.coins - 6);
      say(s, 'Dynamite! -6 coins', '#ff5a5f');
    }
  }
}
