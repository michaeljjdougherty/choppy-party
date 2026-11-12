import type { BoardState, BoardPlayer } from './types';
import { rand, shuffle, type Rng } from '../rng';

/**
 * Bonus Chobglobs: at the end of a board game, a few random awards for the stats the board kept all game.
 * Everyone tied for an award gets one. Awards nobody earned (all zero, or everyone tied) are never picked.
 */
export interface Award {
  id: string;
  title: string;
  line: string;
  /** What the bar chart counts, e.g. "minigames won". */
  unit: string;
  values: Record<string, number>;
  winners: string[];
}

interface Def {
  id: string;
  title: string;
  line: string;
  unit: string;
  /** Higher wins unless low is set. */
  low?: boolean;
  /** Has to be above zero to win (for "most" awards). */
  need?: boolean;
  value: (p: BoardPlayer, b: BoardState) => number;
}

const DEFS: Def[] = [
  { id: 'master', title: 'Minigame Master', line: 'Won the most minigames. Show-off.', unit: 'minigames won', need: true, value: (p) => p.stats.wins },
  { id: 'bag', title: 'Punching Bag', line: 'Took the most damage. Ouch, ouch, and ouch.', unit: 'damage taken', need: true, value: (p) => p.stats.damageTaken },
  { id: 'sevens', title: 'Lucky Sevens', line: 'Rolled the most sevens. Somebody check those dice.', unit: 'sevens rolled', need: true, value: (p) => p.stats.sevens },
  { id: 'doubles', title: 'Double Trouble', line: 'Rolled the most doubles.', unit: 'doubles rolled', need: true, value: (p) => p.stats.doubles ?? 0 },
  { id: 'runner', title: 'Road Runner', line: 'Moved the most spaces. Where are you even going?', unit: 'spaces moved', need: true, value: (p) => p.stats.spaces },
  { id: 'slow', title: 'Slowpoke', line: 'Moved the fewest spaces. Taking in the view.', unit: 'spaces moved', low: true, value: (p) => p.stats.spaces },
  { id: 'bully', title: 'Bully', line: 'Dealt the most damage. Nobody is inviting you back.', unit: 'damage dealt', need: true, value: (p) => p.stats.damageDealt },
  { id: 'untouchable', title: 'Untouchable', line: 'Took the least damage all game.', unit: 'damage taken', low: true, value: (p) => p.stats.damageTaken },
  { id: 'lives', title: 'Nine Lives', line: 'Got knocked out the most. Still here, somehow.', unit: 'knockouts', need: true, value: (p) => p.stats.kos },
  { id: 'rich', title: 'Coin Hoarder', line: 'Sitting on the biggest pile of Pit Coin.', unit: 'Pit Coin', need: true, value: (p) => p.keys },
  { id: 'favorite', title: "Brian's Favorite", line: 'No reason. Brian just likes them.', unit: '', value: () => 0 },
  { id: 'participation', title: 'Participation Trophy', line: 'In last place before the bonuses. You tried!', unit: '', value: () => 0 },
];

export const BONUS_COUNT = 3;

function score(p: BoardPlayer): number {
  return p.crowns * 10000 + p.keys;
}

export function pickAwards(b: BoardState, rng: Rng, count = BONUS_COUNT): Award[] {
  const ps = Object.values(b.players);
  if (ps.length < 2) return [];
  const out: Award[] = [];
  for (const d of shuffle(rng, [...DEFS])) {
    if (out.length >= count) break;
    const values: Record<string, number> = {};
    let winners: string[];
    if (d.id === 'favorite') {
      winners = [ps[Math.floor(rand(rng) * ps.length)].id];
    } else if (d.id === 'participation') {
      const low = Math.min(...ps.map(score));
      winners = ps.filter((p) => score(p) === low).map((p) => p.id);
      // only fun when it's one person, not half the party
      if (winners.length !== 1) continue;
    } else {
      for (const p of ps) values[p.id] = d.value(p, b);
      const vs = Object.values(values);
      const best = d.low ? Math.min(...vs) : Math.max(...vs);
      if (d.need && best <= 0) continue;
      winners = ps.filter((p) => values[p.id] === best).map((p) => p.id);
      // an award everybody shares says nothing
      if (winners.length === ps.length || winners.length > Math.max(1, Math.floor(ps.length / 2))) continue;
    }
    out.push({ id: d.id, title: d.title, line: d.line, unit: d.unit, values, winners });
  }
  return out;
}
