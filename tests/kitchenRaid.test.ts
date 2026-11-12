import { describe, expect, it } from 'vitest';
import { kitchenRaid } from '../src/shared/games/kitchenRaid';
import { SKILL } from '../src/shared/bots';
import type { TickInput } from '../src/shared/types';

const DT = 1 / 30;
describe('Kitchen Raid', () => {
  it('CPU raiders actually get snacks home, and the CPU chef catches some', () => {
    const ps = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', slot: i, bot: (['easy', 'normal', 'hard'] as const)[i % 3] }));
    const s = kitchenRaid.setup(ps as never, 4);
    const mem: Record<string, any> = {};
    const r = { seed: 9 };
    let guard = 0;
    while (!kitchenRaid.isOver(s) && guard++ < 4000) {
      const inputs: Record<string, TickInput> = {};
      for (const p of ps) {
        mem[p.id] ??= { key: '', wait: 0, t: 0, next: 0, sx: 0, sy: 0, mash: 0, n: -1, m: 0, prev: 0, early: -1, itemTurn: -1 };
        inputs[p.id] = kitchenRaid.bot!(s, p.id, { sk: SKILL[p.bot], mem: mem[p.id], r, dt: DT, level: p.bot });
      }
      kitchenRaid.step(s, inputs, DT);
    }
    const raiders = s.cooks.filter((c) => !c.chef);
    const chef = s.cooks.find((c) => c.chef)!;
    const delivered = raiders.reduce((n, c) => n + c.score, 0);
    console.log('delivered', delivered, 'pounces', chef.score, raiders.map((c) => c.score));
    expect(delivered).toBeGreaterThan(8);
    expect(chef.score).toBeGreaterThan(1);
  });
});
