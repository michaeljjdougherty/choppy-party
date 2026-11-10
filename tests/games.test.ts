import { describe, expect, it } from 'vitest';
import { GAMES } from '../src/shared/games';
import { DT, NO_INPUT, type Inputs, type PlayerInfo, type TickInput } from '../src/shared/types';
import { FIRST_MIX, addPlayer, createParty, placementsFrom, stepParty, type PartyState } from '../src/shared/party';
import { rand } from '../src/shared/rng';
import { shrinkingRink, type RinkState } from '../src/shared/games/shrinkingRink';
import { quickDrawCactus, type QuickDrawState } from '../src/shared/games/quickDrawCactus';
import { pancakePanic, type PancakeState } from '../src/shared/games/pancakePanic';

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', slot: i }));

function randomInputs(ids: string[], r: { seed: number }): Inputs {
  const out: Inputs = {};
  for (const id of ids) {
    const press = rand(r) < 0.1;
    out[id] = { x: rand(r) * 2 - 1, y: rand(r) * 2 - 1, a: press, b: false, aPressed: press, bPressed: false, aTaps: press ? 1 : 0, bTaps: 0 };
  }
  return out;
}

describe.each(GAMES.map((g) => [g.name, g] as const))('%s', (_name, game) => {
  for (const n of [...new Set([1, 2, 10].map((k) => Math.min(game.maxPlayers, Math.max(game.minPlayers, k))))]) {
    it(`finishes within 90s with ${n} players and ranks everyone`, () => {
      const ps = players(n);
      const s = game.setup(ps, 1234);
      const r = { seed: 99 };
      let ticks = 0;
      while (!game.isOver(s) && ticks < 90 / DT) {
        game.step(s, randomInputs(ps.map((p) => p.id), r), DT);
        ticks++;
      }
      expect(game.isOver(s)).toBe(true);
      const res = game.results(s);
      expect(res.map((x) => x.id).sort()).toEqual(ps.map((p) => p.id).sort());
      // state must survive a JSON round trip, because that's what the server sends
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    });
  }

  it('is deterministic for the same seed and inputs', () => {
    const ps = players(4);
    const run = () => {
      const s = game.setup(ps, 42);
      const r = { seed: 7 };
      for (let i = 0; i < 300; i++) game.step(s, randomInputs(ps.map((p) => p.id), r), DT);
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });
});

describe('game rules', () => {
  it('Shrinking Rink: a skater pushed out of the rink is eliminated and ranked last', () => {
    const s = shrinkingRink.setup(players(2), 1) as RinkState;
    s.skaters[0].x = 640 + 400; // well outside the rink
    shrinkingRink.step(s, {}, DT);
    expect(s.skaters[0].alive).toBe(false);
    expect(shrinkingRink.isOver(s)).toBe(true);
    expect(shrinkingRink.results(s)[0].id).toBe('p1');
  });

  it('Quick Draw: pressing before the bloom costs a penalty', () => {
    const s = quickDrawCactus.setup(players(2), 5) as QuickDrawState;
    const press: TickInput = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
    quickDrawCactus.step(s, { p0: press }, DT);
    expect(s.reaction.p0).toBe(-1);
    while (s.phase === 'wait') quickDrawCactus.step(s, {}, DT);
    quickDrawCactus.step(s, { p1: press }, DT);
    while (s.phase === 'bloom') quickDrawCactus.step(s, {}, DT);
    expect(s.totals.p0).toBe(1000);
    expect(s.totals.p1).toBeLessThan(100);
  });

  it('Pancake Panic: taps before "MASH!" do not count', () => {
    const s = pancakePanic.setup(players(1), 1) as PancakeState;
    const tap: TickInput = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
    pancakePanic.step(s, { p0: tap }, DT);
    expect(s.stacks.p0).toBe(0);
    while (s.t < 3.1) pancakePanic.step(s, {}, DT);
    pancakePanic.step(s, { p0: tap }, DT);
    expect(s.stacks.p0).toBe(1);
  });
});

describe('party flow', () => {
  it('ties share a place and points', () => {
    const pl = placementsFrom([
      { id: 'a', value: 10, label: '' },
      { id: 'b', value: 10, label: '' },
      { id: 'c', value: 3, label: '' },
    ]);
    expect(pl.map((p) => p.place)).toEqual([1, 1, 3]);
    expect(pl.map((p) => p.points)).toEqual([5, 5, 2]);
  });

  it('runs a 3-round party from lobby to final and back', () => {
    const s: PartyState = createParty(3);
    for (let i = 0; i < 10; i++) addPlayer(s, `p${i}`);
    expect(addPlayer(s, 'extra')).toBeNull();
    s.selection = FIRST_MIX;
    s.roundsIdx = 0; // 3 rounds
    const tapAll = (): Inputs =>
      Object.fromEntries(s.players.map((p) => [p.id, { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 }]));
    stepParty(s, tapAll(), DT);
    expect(s.phase).toBe('intro');
    expect(s.playlist).toHaveLength(3);
    let guard = 0;
    while (s.phase !== 'final' && guard++ < 20000) stepParty(s, guard % 3 === 0 ? tapAll() : {}, DT);
    expect(s.phase).toBe('final');
    expect(Object.values(s.scores).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    while (s.phase === 'final') stepParty(s, tapAll(), DT);
    expect(s.phase).toBe('lobby');
  });
});
