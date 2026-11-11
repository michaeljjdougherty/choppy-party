import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard } from '../src/shared/board/boards';
import { createBoard, exits, prevs, stepBoard } from '../src/shared/board/engine';
import { WEATHER } from '../src/shared/board/weather';
import { DT, NO_INPUT } from '../src/shared/types';
import type { BoardState } from '../src/shared/board/types';

const endRound = (s: BoardState) => {
  s.sub = 'land';
  s.cur = s.order.length - 1;
  s.t = 10;
  stepBoard(s, {}, DT);
  expect(s.sub).toBe('roundEnd');
};
const zone = (boardId: string, kind: string) => getBoard(boardId).weather!.find((z) => z.kind === kind)!;
const fresh = (boardId: string) => {
  const s = createBoard(boardId, ['a', 'b'], 10, 4);
  s.tour = null;
  s.order = ['a', 'b'];
  return s;
};

describe('weather zones', () => {
  it('every board has its zones, on real spaces', () => {
    const kinds = BOARDS.map((b) => (b.weather ?? []).map((z) => z.kind).join(','));
    expect(kinds).toEqual(['fog,wind', 'flare,lowgrav', 'sandstorm,flood,heat', 'lowgrav,wind']);
    for (const b of BOARDS)
      for (const z of b.weather!) {
        expect(z.nodes.length).toBeGreaterThan(4);
        for (const id of z.nodes) expect(b.nodes[id]).toBeDefined();
      }
  });

  it("Will-o'-Wind pushes everyone on the hilltop 2 spaces with the wind", () => {
    const s = fresh('lantern-hollow');
    const def = getBoard(s.boardId);
    const z = zone(s.boardId, 'wind');
    const at = z.nodes[5];
    s.players.a.node = at;
    s.weather.wind = 1;
    endRound(s);
    let want = at;
    for (let i = 0; i < WEATHER.windPush; i++) want = exits(def, s, want)[0];
    expect(s.players.a.node).toBe(want);
    // and the other way
    s.players.a.node = at;
    s.weather.wind = -1;
    s.sub = 'land';
    endRound(s);
    want = at;
    for (let i = 0; i < WEATHER.windPush; i++) want = prevs(def)[want][0];
    expect(s.players.a.node).toBe(want);
  });

  it('a solar flare every 3 rounds hits the outer ring, but not under a dome', () => {
    const s = fresh('cosmo-junction');
    const z = zone(s.boardId, 'flare');
    s.hazards.meteors = [];
    s.players.a.node = z.nodes[3];
    s.players.b.node = z.shelters![1];
    s.turn = 2;
    endRound(s);
    expect(s.players.a.hp).toBe(30);
    s.turn = 3;
    s.hazards.meteors = [];
    endRound(s);
    expect(s.players.a.hp).toBe(30 - WEATHER.flareDamage);
    expect(s.players.b.hp).toBe(30);
  });

  it('low gravity adds 2 to a roll from the Command Core', () => {
    const s = fresh('cosmo-junction');
    s.players.a.node = zone(s.boardId, 'lowgrav').nodes[2];
    s.players.a.dice = 1;
    s.sub = 'roll';
    s.cur = 0;
    s.t = 1;
    stepBoard(s, { a: { ...NO_INPUT, aPressed: true } }, DT);
    expect(s.roll).toBe(s.rolls[0] + WEATHER.lowGravBonus);
  });

  it('a sandstorm hurts, pushes and blinds whoever is in the dunes', () => {
    const s = fresh('gold-rush-gulch');
    const z = zone(s.boardId, 'sandstorm');
    s.players.a.node = z.nodes[4];
    s.turn = 3;
    endRound(s);
    expect(s.players.a.hp).toBe(30 - WEATHER.stormDamage);
    expect(s.players.a.node).not.toBe(z.nodes[4]);
    expect(s.weather.blind).toContain('a');
  });

  it('a flash flood washes you downstream and leaves your keys behind for others', () => {
    const s = fresh('gold-rush-gulch');
    const z = zone(s.boardId, 'flood');
    const at = z.nodes[3];
    s.players.a.node = at;
    s.players.a.keys = 10;
    s.weather.rain = true;
    s.turn = 1;
    endRound(s);
    expect(s.players.a.keys).toBe(10 - WEATHER.floodDrop);
    expect(s.weather.loose[at]).toBe(WEATHER.floodDrop);
    expect(s.players.a.node).not.toBe(at);
  });

  it('a heatwave costs HP per step on the salt flats', () => {
    const s = fresh('gold-rush-gulch');
    const z = zone(s.boardId, 'heat');
    s.weather.heat = true;
    s.players.a.node = z.nodes[2];
    s.cur = 0;
    s.sub = 'move';
    s.stepsLeft = 1;
    s.t = 0;
    for (let i = 0; i < 40 && s.sub === 'move'; i++) stepBoard(s, {}, DT);
    if (z.nodes.includes(s.players.a.node)) expect(s.players.a.hp).toBeLessThan(30);
  });

  it('nobody can target a player hiding in the Fog Marsh at night', () => {
    const s = fresh('lantern-hollow');
    s.night = true;
    s.players.b.node = zone(s.boardId, 'fog').nodes[2];
    s.players.a.items = ['pirate-cannon'];
    s.players.a.node = getBoard(s.boardId).weather![0].nodes[0];
    // pirate cannon fires at the nearest player ahead, skipping the fog
    s.cur = 0;
    s.sub = 'roll';
    s.t = 1;
    stepBoard(s, { a: { ...NO_INPUT, bPressed: true } }, DT);
    expect(s.players.b.hp).toBe(30);
  });
});
