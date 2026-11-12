import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { randRange, shuffle, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, pressB, remember, type BotCtx } from '../botkit';

/**
 * Chili Challenge (Food Kit, cook-off table): everyone has a bowl of peppers. A eats the next one. You
 * only find out how hot it was when you bite: green is mild, red is hot, the rare gold one is a scorcher.
 * Your heat cools while you wait. Go over 100 and you BURST (you're out). B locks in your count.
 * Most peppers eaten without bursting wins; ties go to the cooler mouth.
 */
const READY = 3;
const TIME = 35;
const CHEW = 0.4;
const COOL = 3; // heat per second
export const BURST = 100;
export type Pepper = 'green' | 'red' | 'gold';
export const PEPPER_HEAT: Record<Pepper, [number, number]> = { green: [8, 12], red: [18, 24], gold: [34, 38] };
const BOWL: Pepper[] = ['green', 'green', 'green', 'green', 'green', 'green', 'red', 'red', 'red', 'red', 'red', 'red', 'gold', 'gold'];

export interface Eater {
  id: string;
  bowl: Pepper[]; // still to eat, next one last
  heats: number[]; // the hidden heat of each pepper in the bowl
  eaten: number;
  heat: number;
  chew: number;
  last: Pepper | null;
  lastHeat: number;
  locked: boolean;
  burst: boolean;
  burstAt: number;
}
export interface ChiliState {
  t: number;
  rng: Rng;
  eaters: Eater[];
  /** This tick's bites and bursts, for the view. */
  bites: { id: string; pepper: Pepper }[];
  bursts: string[];
  endAt?: number;
}

const left = (e: Eater, p: Pepper) => e.bowl.filter((q) => q === p).length;

export const chiliChallenge: Minigame<ChiliState> = {
  id: 'chili-challenge',
  name: 'Chili Challenge',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'EAT!',
  blurb: "Press A to eat a pepper. You won't know how hot it is until you bite: green is mild, red is hot, gold is a scorcher! Heat cools while you wait. Over 100 and you burst. B locks in your count.",
  controls: 'A: eat a pepper   B: lock in',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): ChiliState {
    const rng = { seed };
    return {
      t: 0,
      rng,
      bites: [],
      bursts: [],
      eaters: players.map((p) => {
        const bowl = shuffle(rng, [...BOWL]);
        return {
          id: p.id,
          bowl,
          heats: bowl.map((q) => Math.round(randRange(rng, PEPPER_HEAT[q][0], PEPPER_HEAT[q][1]))),
          eaten: 0,
          heat: 0,
          chew: 0,
          last: null,
          lastHeat: 0,
          locked: false,
          burst: false,
          burstAt: 0,
        };
      }),
    };
  },

  step(s: ChiliState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.bites = [];
    s.bursts = [];
    if (s.t < READY || s.endAt !== undefined) return;
    const over = s.t >= READY + TIME;
    for (const e of s.eaters) {
      if (e.burst) continue;
      e.heat = Math.max(0, e.heat - COOL * dt);
      e.chew = Math.max(0, e.chew - dt);
      if (e.locked || over) continue;
      const inp = inputs[e.id] ?? NO_INPUT;
      if (inp.bPressed && e.eaten > 0) {
        e.locked = true;
        continue;
      }
      if (inp.aPressed && e.chew <= 0 && e.bowl.length) {
        const pep = e.bowl.pop()!;
        const h = e.heats.pop()!;
        e.chew = CHEW;
        e.last = pep;
        e.lastHeat = h;
        e.heat += h;
        s.bites.push({ id: e.id, pepper: pep });
        if (e.heat > BURST) {
          e.burst = true;
          e.burstAt = s.t;
          s.bursts.push(e.id);
        } else e.eaten++;
        if (!e.bowl.length) e.locked = true;
      }
    }
    if (over || s.eaters.every((e) => e.burst || e.locked)) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    return s.eaters
      .map((e) => ({
        id: e.id,
        value: e.burst ? e.eaten : 1000 + e.eaten * 100 + (100 - Math.round(e.heat)),
        label: e.burst ? `BURST after ${e.eaten}` : `${e.eaten} peppers (heat ${Math.round(e.heat)})`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + TIME - s.t);
    playerChips(
      ctx,
      players,
      s.eaters.map((e) => ({ id: e.id, label: e.burst ? 'BURST' : `${e.eaten} 🌶${e.locked ? ' ✔' : ''}`, out: e.burst })),
    );
    if (s.endAt !== undefined) text(ctx, 'Pencils... er, forks down!', 640, 150, 40, { color: '#ffd23f' });
    else if (s.t >= READY) {
      // the pepper legend, so everyone knows what a bite can cost
      const row: [string, string][] = [
        [`Green: mild +${PEPPER_HEAT.green[0]}-${PEPPER_HEAT.green[1]}`, '#45c23a'],
        [`Red: hot +${PEPPER_HEAT.red[0]}-${PEPPER_HEAT.red[1]}`, '#ff4a3a'],
        [`Gold: scorcher +${PEPPER_HEAT.gold[0]}-${PEPPER_HEAT.gold[1]}`, '#ffc21a'],
        [`Burst over ${BURST}`, '#ffffff'],
      ];
      row.forEach(([t, c], i) => text(ctx, t, 640 + (i - 1.5) * 270, 690, 20, { color: c }));
    }
  },

  bot(s, id, k: BotCtx) {
    const e = s.eaters.find((q) => q.id === id);
    if (!e || s.t < READY || e.burst || e.locked || e.chew > 0 || !e.bowl.length) return NO_INPUT;
    const timeLeft = READY + TIME - s.t;
    // a little thinking time between peppers
    if (remember(k.mem, `chili:${e.eaten}`, randRange(k.r, 0.15, 0.5) + (1 - k.sk.smart) * 0.4)) return NO_INPUT;
    if (k.mem.t < k.mem.wait) return NO_INPUT;
    // the hottest thing still in the bowl
    const worst = left(e, 'gold') ? PEPPER_HEAT.gold[1] : left(e, 'red') ? PEPPER_HEAT.red[1] : PEPPER_HEAT.green[1];
    const avg = (left(e, 'green') * 10 + left(e, 'red') * 21 + left(e, 'gold') * 36) / e.bowl.length;
    let safe: boolean;
    if (k.level === 'easy') {
      // easy bots go by gut: a fixed "that's enough" line, a bit too high
      if (k.mem.n < 0) k.mem.n = randRange(k.r, 62, 82);
      safe = e.heat < k.mem.n;
    } else {
      // smart bots count what's left: risk the worst case only when the clock is running out
      const margin = k.level === 'hard' ? 2 : 10;
      safe = e.heat + worst <= BURST - margin || (timeLeft < 4 && e.heat + avg < BURST - margin);
    }
    if (safe) return press();
    // can't eat safely and time's nearly up: lock it in
    if (timeLeft < 1.5 || e.heat - COOL * timeLeft + avg > BURST) return pressB();
    return NO_INPUT;
  },
};
