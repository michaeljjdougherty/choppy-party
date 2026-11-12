import { describe, expect, it } from 'vitest';
import { awardMinigame, createBoard } from '../src/shared/board/engine';
import { PRIZE_COINS, PRIZE_TIERS, ITEMS } from '../src/shared/board/items';

describe('minigame prizes', () => {
  it('1st, 2nd and 3rd each get an item from their tier; 4th gets none', () => {
    const s = createBoard('lantern-hollow', ['a', 'b', 'c', 'd'], 10, 3);
    for (const p of Object.values(s.players)) p.items = [];
    awardMinigame(s, [{ id: 'a', place: 1 }, { id: 'b', place: 2 }, { id: 'c', place: 3 }, { id: 'd', place: 4 }]);
    expect(PRIZE_TIERS[0]).toContain(s.players.a.items[0]);
    expect(PRIZE_TIERS[1]).toContain(s.players.b.items[0]);
    expect(PRIZE_TIERS[2]).toContain(s.players.c.items[0]);
    expect(s.players.d.items).toEqual([]);
    expect(s.prizes!.d).toBeUndefined();
  });

  it('a full bag gets Pit Coin instead', () => {
    const s = createBoard('lantern-hollow', ['a', 'b'], 10, 3);
    s.players.a.items = ['spring-boots', 'spring-boots', 'spring-boots'];
    const before = s.players.a.keys;
    const got = awardMinigame(s, [{ id: 'a', place: 1 }, { id: 'b', place: 2 }]);
    expect(s.players.a.items.length).toBe(3);
    expect(s.prizes!.a).toBe('coins');
    expect(s.players.a.keys - before).toBe(got.a);
    expect(got.a).toBeGreaterThanOrEqual(PRIZE_COINS);
  });

  it('every tier has close and long range attacks', () => {
    for (const tier of PRIZE_TIERS) expect(tier.some((it) => ITEMS[it].attack)).toBe(true);
    expect(PRIZE_TIERS.flat().some((it) => ITEMS[it].attack === 'close')).toBe(true);
    expect(PRIZE_TIERS.flat().some((it) => ITEMS[it].attack === 'long')).toBe(true);
  });
});
