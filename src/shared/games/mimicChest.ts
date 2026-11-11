import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { text } from '../draw';
import { rand, randInt, type Rng } from '../rng';
import { pickOne, playerChips } from './hud';
import { press, remember, stick, type BotCtx } from '../botkit';

/**
 * Mimic Chest (Pirate Kit, 1-vs-many): one player is the Mimic Keeper, the rest loot a treasure cave.
 * Each round 6 chests appear with their gold on show. The Keeper secretly marks 2 as mimics, then the
 * looters all pick a chest. Pick a mimic and you're bitten (out). A chest picked by several looters splits
 * its gold. 4 rounds. Most gold wins; the Keeper scores for every bite, with a bonus for biting everyone.
 */
const READY = 3;
export const CHESTS = 6;
export const ROUNDS = 4;
const MARK_T = 7;
const PICK_T = 7;
const REVEAL_T = 3.2;
export const MIMICS = 2;

export type MimicPhase = 'mark' | 'pick' | 'reveal';
export interface Looter {
  id: string;
  sel: number;
  locked: boolean;
  gold: number;
  out: boolean;
  outRound: number;
  /** Which chest they took last reveal (for the view and the bots). */
  took: number;
  /** Stick was pushed last tick (one push = one chest). */
  held: boolean;
}
export interface MimicState {
  t: number;
  rng: Rng;
  keeper: string;
  round: number;
  phase: MimicPhase;
  phaseT: number;
  gold: number[];
  mimics: number[];
  keeperSel: number;
  keeperHeld: boolean;
  looters: Looter[];
  bites: number;
  /** Chests looters picked last round, for the Keeper bots. */
  lastPicks: number[];
  /** This tick's events, for the view. */
  revealed: boolean;
  endAt?: number;
}

const liveLooters = (s: MimicState) => s.looters.filter((l) => !l.out);

function newRound(s: MimicState): void {
  s.round++;
  s.phase = 'mark';
  s.phaseT = 0;
  s.mimics = [];
  s.keeperSel = Math.floor(CHESTS / 2);
  s.gold = Array.from({ length: CHESTS }, () => randInt(s.rng, 2, 8) * 2 + (s.round === ROUNDS ? 6 : 0));
  for (const l of s.looters) {
    l.locked = false;
    l.took = -1;
  }
}

export const mimicChest: Minigame<MimicState> = {
  id: 'mimic-chest',
  name: 'Mimic Chest',
  mode: '1-vs-many',
  ready: READY,
  goWord: 'LOOT!',
  blurb: 'One player is the Mimic Keeper and secretly turns 2 of the 6 chests into mimics. Everyone else picks a chest at the same time. Grab a mimic and you get bitten! Share a chest and you split the gold. 4 rounds, most gold wins.',
  controls: 'Stick: pick a chest   A: lock in (Keeper: mark a mimic)',
  minPlayers: 3,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): MimicState {
    const k = pickOne(players.length, seed);
    const s: MimicState = {
      t: 0,
      rng: { seed },
      keeper: players[k].id,
      round: 0,
      phase: 'mark',
      phaseT: 0,
      gold: [],
      mimics: [],
      keeperSel: 2,
      keeperHeld: false,
      looters: players.filter((_, i) => i !== k).map((p, i) => ({ id: p.id, sel: i % CHESTS, locked: false, gold: 0, out: false, outRound: 0, took: -1, held: false })),
      bites: 0,
      lastPicks: [],
      revealed: false,
    };
    newRound(s);
    return s;
  },

  step(s: MimicState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.revealed = false;
    if (s.t < READY || s.endAt !== undefined) return;
    s.phaseT += dt;
    const move = (sel: number, x: number, held: boolean) => (held || Math.abs(x) < 0.5 ? sel : x > 0 ? Math.min(CHESTS - 1, sel + 1) : Math.max(0, sel - 1));
    if (s.phase === 'mark') {
      const inp = inputs[s.keeper] ?? NO_INPUT;
      s.keeperSel = move(s.keeperSel, inp.x, s.keeperHeld);
      s.keeperHeld = Math.abs(inp.x) >= 0.5;
      if (inp.aPressed && s.phaseT > 0.3) {
        const i = s.mimics.indexOf(s.keeperSel);
        if (i >= 0) s.mimics.splice(i, 1);
        else s.mimics.push(s.keeperSel);
      }
      if (s.phaseT > MARK_T) {
        // out of time: fill the rest at random
        while (s.mimics.length < MIMICS) {
          const c = randInt(s.rng, 0, CHESTS - 1);
          if (!s.mimics.includes(c)) s.mimics.push(c);
        }
      }
      if (s.mimics.length >= MIMICS) {
        s.phase = 'pick';
        s.phaseT = 0;
      }
      return;
    }
    if (s.phase === 'pick') {
      for (const l of liveLooters(s)) {
        if (l.locked) continue;
        const inp = inputs[l.id] ?? NO_INPUT;
        l.sel = move(l.sel, inp.x, l.held);
        l.held = Math.abs(inp.x) >= 0.5;
        if (inp.aPressed && s.phaseT > 0.3) l.locked = true;
      }
      if (s.phaseT > PICK_T || liveLooters(s).every((l) => l.locked)) {
        // reveal: bites first, then split each chest between whoever took it
        s.phase = 'reveal';
        s.phaseT = 0;
        s.revealed = true;
        s.lastPicks = [];
        const takers: string[][] = Array.from({ length: CHESTS }, () => []);
        for (const l of liveLooters(s)) {
          l.locked = true;
          l.took = l.sel;
          s.lastPicks.push(l.sel);
          if (s.mimics.includes(l.sel)) {
            l.out = true;
            l.outRound = s.round;
            s.bites++;
          } else takers[l.sel].push(l.id);
        }
        takers.forEach((ids, c) => {
          for (const id of ids) s.looters.find((l) => l.id === id)!.gold += Math.floor(s.gold[c] / ids.length);
        });
      }
      return;
    }
    // reveal
    if (s.phaseT > REVEAL_T) {
      if (s.round >= ROUNDS || liveLooters(s).length === 0) s.endAt = s.t;
      else newRound(s);
    }
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 1.5,

  results(s): ResultRow[] {
    const rows: ResultRow[] = s.looters.map((l) => ({
      id: l.id,
      value: l.gold * 10 + (l.out ? 0 : 5),
      label: l.out ? `Bitten in round ${l.outRound} (${l.gold} gold)` : `${l.gold} gold`,
    }));
    const all = liveLooters(s).length === 0;
    const kv = s.bites * 12 + (all ? 30 : 0);
    rows.push({ id: s.keeper, value: kv * 10 + 1, label: `Keeper: ${s.bites} ${s.bites === 1 ? 'bite' : 'bites'}${all ? ', ate everyone!' : ''}` });
    return rows.sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    const rows = s.looters.map((l) => ({ id: l.id, label: l.out ? 'BITTEN' : `${l.gold} gold${s.phase === 'pick' && l.locked ? ' ✔' : ''}`, out: l.out }));
    rows.unshift({ id: s.keeper, label: `Keeper · ${s.bites} bites`, out: false });
    playerChips(ctx, players, rows);
    const keeper = players.find((p) => p.id === s.keeper);
    const head = `Round ${s.round} of ${ROUNDS}`;
    if (s.t < READY) return;
    if (s.phase === 'mark') {
      text(ctx, head, 640, 110, 26, { color: '#ffffff' });
      text(ctx, `${keeper?.name ?? 'Keeper'} is hiding the mimics... (${s.mimics.length}/${MIMICS})`, 640, 148, 30, { color: '#ff7b6b' });
      text(ctx, 'Looters, look away!', 640, 182, 22, { color: '#ffd9cc' });
    } else if (s.phase === 'pick') {
      text(ctx, head, 640, 110, 26, { color: '#ffffff' });
      text(ctx, `Pick a chest! ${Math.max(0, Math.ceil(PICK_T - s.phaseT))}`, 640, 148, 34, { color: '#ffd23f' });
    } else if (s.endAt === undefined || s.t - s.endAt < 1.5) {
      const bit = s.looters.filter((l) => l.out && l.outRound === s.round).length;
      text(ctx, bit ? `CHOMP! ${bit} bitten!` : 'Nobody got bitten!', 640, 148, 40, { color: bit ? '#ff5a5f' : '#4cd97b' });
    }
  },

  bot(s, id, k: BotCtx) {
    if (s.t < READY) return NO_INPUT;
    const steer = (cur: number, want: number) => (cur < want ? stick(1, 0) : cur > want ? stick(-1, 0) : press());
    if (id === s.keeper) {
      if (s.phase !== 'mark') return NO_INPUT;
      remember(k.mem, `mk:${s.round}:${s.mimics.length}`, 0.5 + rand(k.r) * 0.6);
      if (k.mem.t < k.mem.wait) return NO_INPUT;
      if (k.mem.n < 0 || s.mimics.includes(k.mem.n)) {
        // favour the chests looters went for last time, and the rich ones
        const score = (c: number) => (s.mimics.includes(c) ? -99 : s.gold[c] * 0.3 + s.lastPicks.filter((p) => p === c).length * 3 * k.sk.smart + rand(k.r) * 9);
        let best = 0;
        for (let c = 1; c < CHESTS; c++) if (score(c) > score(best)) best = c;
        k.mem.n = best;
      }
      // stick steps one chest per press, so tap toward the target
      if (s.keeperSel === k.mem.n) return press();
      return (s.t * 6) % 1 < 0.5 ? steer(s.keeperSel, k.mem.n) : NO_INPUT;
    }
    const me = s.looters.find((l) => l.id === id);
    if (!me || me.out || me.locked || s.phase !== 'pick') return NO_INPUT;
    remember(k.mem, `pk:${s.round}`, 0.6 + rand(k.r) * 2);
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    if (k.mem.n < 0) {
      // rich chests are tempting, but smart looters avoid where the crowd went last round and the richest
      const rich = [...s.gold].sort((a, b) => b - a)[1];
      const score = (c: number) => s.gold[c] * 0.5 - (k.sk.smart > 0.6 && s.gold[c] >= rich ? 4 : 0) - (k.level === 'hard' ? s.lastPicks.filter((p) => p === c).length * 2 : 0) + rand(k.r) * 14;
      let best = 0;
      for (let c = 1; c < CHESTS; c++) if (score(c) > score(best)) best = c;
      k.mem.n = best;
    }
    if (me.sel === k.mem.n) return press();
    return (s.t * 6) % 1 < 0.5 ? steer(me.sel, k.mem.n) : NO_INPUT;
  },
};
