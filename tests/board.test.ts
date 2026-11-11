import { describe, expect, it } from 'vitest';
import { BOARDS, recommendedBoard } from '../src/shared/board/boards';
import { createBoard, exits, stepBoard, winnerGoesFirst } from '../src/shared/board/engine';
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

describe('board tour', () => {
  it('waits on each stop until someone presses A, B goes back, and it ends in the turn-order roll', () => {
    for (const def of BOARDS) {
      const s = createBoard(def.id, ['a', 'b'], 5, 3, true);
      expect(s.sub).toBe('tour');
      const n = s.tour!.steps.length;
      expect(n).toBeGreaterThan(8);
      for (let i = 0; i < 30 * 60; i++) stepBoard(s, {}, DT);
      expect(s.tour!.i).toBe(0); // no timer: it waits
      const a = { b: { ...NO_INPUT, aPressed: true } };
      const back = { a: { ...NO_INPUT, bPressed: true } };
      const tick = (inp: Inputs) => {
        for (let i = 0; i < 12; i++) stepBoard(s, {}, DT);
        stepBoard(s, inp, DT);
      };
      tick(a);
      tick(a);
      expect(s.tour!.i).toBe(2);
      tick(back);
      expect(s.tour!.i).toBe(1);
      for (let k = 1; k < n; k++) tick(a);
      expect(s.sub).toBe('orderRoll');
      expect(s.tour).toBeNull();
    }
  });
});

describe('turn order', () => {
  it('everyone rolls at the start, no ties, and the highest roll goes first', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const s = createBoard(BOARDS[0].id, ids, 5, 3);
    expect(s.sub).toBe('orderRoll');
    const a = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
    for (let i = 0; i < 30; i++) stepBoard(s, {}, DT);
    stepBoard(s, { a, c: a }, DT);
    expect(Object.keys(s.orderRolls).sort()).toEqual(['a', 'c']);
    expect(s.sub).toBe('orderRoll');
    stepBoard(s, { b: a, d: a }, DT);
    expect(s.sub).toBe('orderShow');
    const rolls = ids.map((id) => s.orderRolls[id]);
    expect(new Set(rolls).size).toBe(4);
    expect(s.order.map((id) => s.orderRolls[id])).toEqual([...rolls].sort((x, y) => y - x));
    expect(s.baseOrder).toEqual(s.order);
    while (s.sub === 'orderShow') stepBoard(s, {}, DT);
    expect(s.sub).toBe('turnIntro');
    expect(s.cur).toBe(0);
  });

  it('idle players roll by themselves', () => {
    const s = createBoard(BOARDS[1].id, ['a', 'b'], 5, 4);
    for (let i = 0; i < 30 * 9 && s.sub === 'orderRoll'; i++) stepBoard(s, {}, DT);
    expect(s.sub).toBe('orderShow');
  });

  it('next turn goes in minigame finishing order, ties keep the rolled order', () => {
    const s = createBoard(BOARDS[0].id, ['a', 'b', 'c', 'd'], 5, 3);
    s.order = ['b', 'd', 'a', 'c'];
    s.baseOrder = [...s.order];
    winnerGoesFirst(s, [{ id: 'a', place: 1 }, { id: 'b', place: 2 }, { id: 'c', place: 3 }, { id: 'd', place: 4 }]);
    expect(s.order).toEqual(['a', 'b', 'c', 'd']);
    expect(s.wonFirst).toEqual(['a']);
    winnerGoesFirst(s, [{ id: 'c', place: 1 }, { id: 'd', place: 1 }, { id: 'a', place: 3 }, { id: 'b', place: 4 }]);
    expect(s.order).toEqual(['d', 'c', 'a', 'b']);
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

describe('two dice', () => {
  const press: Inputs = { a: { ...NO_INPUT, aPressed: true } };
  const run = (s: ReturnType<typeof createBoard>, sub: string, max = 600) => {
    for (let i = 0; i < max && s.sub !== sub; i++) stepBoard(s, {}, DT);
  };

  it('rolls two dice one at a time, then moves the total', () => {
    const s = createBoard('lantern-hollow', ['a'], 5, 3);
    run(s, 'roll');
    for (let i = 0; i < 20; i++) stepBoard(s, {}, DT);
    stepBoard(s, press, DT);
    expect(s.sub).toBe('rolling');
    expect(s.rolls.length).toBe(1);
    run(s, 'rolled');
    run(s, 'roll'); // waits for the second press
    expect(s.rolls.length).toBe(1);
    for (let i = 0; i < 20; i++) stepBoard(s, {}, DT);
    expect(s.sub).toBe('roll');
    stepBoard(s, press, DT);
    expect(s.rolls.length).toBe(2);
    expect(s.rolls.every((n) => n >= 1 && n <= 6)).toBe(true);
    expect(s.roll).toBe(s.rolls[0] + s.rolls[1]);
    run(s, 'move');
    expect(s.stepsLeft).toBe(s.roll);
  });

  it('doubles pay 5 bonus keys', () => {
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const s = createBoard('lantern-hollow', ['a'], 5, seed);
      run(s, 'roll');
      const keys = s.players.a.keys;
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 20; i++) stepBoard(s, {}, DT);
        stepBoard(s, press, DT);
        if (k === 0) run(s, 'roll');
      }
      expect(s.doubles).toBe(s.rolls[0] === s.rolls[1]);
      if (s.doubles) {
        found = true;
        expect(s.players.a.keys).toBe(keys + 5);
      } else expect(s.players.a.keys).toBe(keys);
    }
    expect(found).toBe(true);
  });
});

describe('item crate reel', () => {
  it('spins before giving the item', () => {
    const ids = ['a', 'b'];
    const s = createBoard('lantern-hollow', ids, 5, 3);
    const def = BOARDS.find((d) => d.id === s.boardId)!;
    const crate = Object.values(def.nodes).find((n) => n.type === 'crate')!;
    const me = s.order[0];
    s.cur = 0;
    s.players[me].node = crate.id;
    s.players[me].items = [];
    s.stepsLeft = 0;
    s.hop = null;
    s.sub = 'move';
    s.t = 0;
    const none: Inputs = { a: { ...NO_INPUT }, b: { ...NO_INPUT } };
    stepBoard(s, none, DT);
    expect(s.sub).toBe('itemSpin');
    expect(s.players[me].items.length).toBe(0);
    const pick = s.spin!.pick;
    expect(s.spin!.reel[s.spin!.at]).toBe(pick);
    for (let i = 0; i < 400 && (s.sub as string) === 'itemSpin'; i++) stepBoard(s, none, DT);
    expect(s.sub).toBe('land');
    expect(s.players[me].items).toEqual([pick]);
  });
});
