import { describe, expect, it } from 'vitest';
import { BOARDS, recommendedBoard } from '../src/shared/board/boards';
import { createBoard, exits, stepBoard } from '../src/shared/board/engine';
import { DT, NO_INPUT, type Inputs } from '../src/shared/types';
import { addPlayer, createParty, OPTIONS, stepParty } from '../src/shared/party';

describe.each(BOARDS.map((b) => [b.name, b] as const))('%s layout', (_n, def) => {
  const nodes = Object.values(def.nodes);

  it('every exit points at a real space and every space can be reached from the start', () => {
    for (const n of nodes) {
      expect(n.next.length).toBeGreaterThan(0);
      for (const x of n.next) expect(def.nodes[x]).toBeDefined();
    }
    const seen = new Set([def.start]);
    const queue = [def.start];
    while (queue.length) for (const x of def.nodes[queue.shift()!].next) if (!seen.has(x)) (seen.add(x), queue.push(x));
    expect(seen.size).toBe(nodes.length);
  });

  it('spaces do not overlap', () => {
    let min = Infinity;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) min = Math.min(min, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z, nodes[i].y - nodes[j].y));
    expect(min).toBeGreaterThan(1.7);
  });

  it('has enough crown spots for the crowns it keeps out', () => {
    expect(def.crownSpots.length).toBeGreaterThanOrEqual(15);
    expect(def.crownSpots.length).toBeLessThanOrEqual(25);
    expect(new Set(def.crownSpots).size).toBe(def.crownSpots.length);
  });
});

describe('board rules', () => {
  it('recommends a board for each player count', () => {
    expect(recommendedBoard(4).id).toBe('lantern-hollow');
    expect(recommendedBoard(6).id).toBe('cosmo-junction');
    expect(recommendedBoard(8).id).toBe('gold-rush-gulch');
    expect(recommendedBoard(10).id).toBe('gold-rush-gulch');
  });

  it('day and night open different routes in Lantern Hollow', () => {
    const def = BOARDS[0];
    const gate = Object.values(def.nodes).find((n) => n.gate)!;
    const s = createBoard(def.id, ['a'], 5, 1);
    const day = exits(def, s, gate.id);
    s.night = true;
    expect(exits(def, s, gate.id)).not.toEqual(day);
  });

  it('a whole turn plays itself out when nobody touches the controller', () => {
    for (const def of BOARDS) {
      const s = createBoard(def.id, ['a', 'b', 'c'], 5, 9);
      let ticks = 0;
      while (s.sub !== 'done' && ticks++ < 30 * 200) stepBoard(s, {}, DT);
      expect(s.sub).toBe('done');
      // everyone moved off the start or at least has coins from landing
      expect(Object.values(s.players).every((p) => p.keys !== 10 || p.node !== def.start)).toBe(true);
    }
  });
});

describe('board party', () => {
  it.each(BOARDS.map((b) => [b.name, b.id] as const))('plays a full 5-turn game on %s with minigames between turns', (_n, id) => {
    const s = createParty(11);
    for (let i = 0; i < 8; i++) addPlayer(s, `p${i}`);
    s.selection = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === id);
    s.autoPick = false; // the test picks the board itself
    s.turnsIdx = 0; // 5 turns
    const press = (): Inputs => Object.fromEntries(s.players.map((p) => [p.id, { ...NO_INPUT, x: 1, a: true, aPressed: true, aTaps: 1 }]));
    stepParty(s, Object.fromEntries(s.players.map((p) => [p.id, { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 }])), DT);
    expect(s.phase).toBe('board');
    expect(s.board!.boardId).toBe(id);
    const phasesSeen = new Set<string>();
    let guard = 0;
    while (s.phase !== 'final' && guard++ < 30 * 60 * 30) {
      phasesSeen.add(s.phase);
      stepParty(s, guard % 4 === 0 || s.phase === 'intro' ? press() : {}, DT);
    }
    expect(s.phase).toBe('final');
    expect([...phasesSeen].sort()).toEqual(['board', 'intro', 'play', 'results']);
    expect(s.board!.event).toBeNull();
    expect(s.playlist.length).toBe(5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
