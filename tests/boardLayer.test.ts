import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard } from '../src/shared/board/boards';
import { createBoard, finishEvent, forwardDist, hurt, placeChest, stepBoard } from '../src/shared/board/engine';
import { DT, NO_INPUT, type Inputs } from '../src/shared/types';
import { addPlayer, createParty, OPTIONS, stepParty } from '../src/shared/party';

const A = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
const B = { ...NO_INPUT, b: true, bPressed: true, bTaps: 1 };
const run = (s: ReturnType<typeof createBoard>, inp: Inputs, secs: number) => {
  for (let i = 0; i < secs / DT; i++) stepBoard(s, inp, DT);
};

describe('board layer', () => {
  it('every map has the spec pieces: posts, duels, Stew Battles, camp, 15-25 chest spots', () => {
    for (const def of BOARDS) {
      const types = Object.values(def.nodes).map((n) => n.type);
      expect(types.filter((t) => t === 'post').length).toBeGreaterThanOrEqual(4);
      expect(types).toContain('duel');
      expect(types).toContain('stew');
      expect(types).toContain('camp');
      const common = types.filter((t) => t === 'key' || t === 'heart' || t === 'thorn').length;
      expect(common / types.length).toBeGreaterThan(0.5);
      expect(def.crownSpots.length).toBeGreaterThanOrEqual(15);
    }
  });

  it('knocking someone out drops half their keys to the attacker and sends them to camp', () => {
    const def = BOARDS[0];
    const s = createBoard(def.id, ['a', 'b'], 10, 3);
    s.players.b.keys = 20;
    s.players.b.node = Object.keys(def.nodes)[5];
    expect(hurt(s, def, 'b', 31, 'a')).toBe(true);
    expect(s.players.b.keys).toBe(10);
    expect(s.players.a.keys).toBe(s.preset.startKeys + 10);
    expect(s.players.b.node).toBe(def.camp);
    expect(s.players.b.hp).toBe(30);
    expect(s.players.b.ko).toBe(true);
  });

  it('a new Crown Chest lands far from every player', () => {
    for (const def of BOARDS) {
      const s = createBoard(def.id, ['a', 'b', 'c'], 10, 7);
      s.crowns = [];
      const spot = placeChest(s, def)!;
      const d = Math.min(...Object.values(s.players).map((p) => forwardDist(def, s, p.node).get(spot) ?? 999));
      expect(d).toBeGreaterThanOrEqual(s.preset.chestMinDist);
    }
  });

  it('claiming a Sting Post hurts the next visitor and heals the owner', () => {
    const def = getBoard('cosmo-junction');
    const s = createBoard(def.id, ['a', 'b'], 10, 5);
    const post = Object.values(def.nodes).find((n) => n.type === 'post')!;
    s.posts[post.id] = { owner: 'a', mode: 'sting' };
    s.players.a.hp = 20;
    // put b one step before the post and roll a 1
    const before = Object.values(def.nodes).find((n) => n.next.includes(post.id))!;
    s.order = ['b', 'a'];
    s.players.b.node = before.id;
    s.sub = 'rolled';
    s.roll = s.stepsLeft = 1;
    run(s, {}, 1.6);
    expect(s.players.b.hp).toBe(30 - s.preset.postSting);
    expect(s.players.a.hp).toBe(20 + s.preset.postStingHeal);
  });

  it('a duel winner jumps to the space right behind a Crown Chest', () => {
    const def = getBoard('lantern-hollow');
    const s = createBoard(def.id, ['a', 'b'], 10, 2);
    s.event = { kind: 'duel', gameId: 'fuse-draw', lander: 'a', players: ['a', 'b'] };
    s.sub = 'event';
    finishEvent(s, [{ id: 'b', value: 3 }, { id: 'a', value: 1 }]);
    expect(def.nodes[s.players.b.node].next).toContain(s.crowns[0]);
    expect(s.sub).toBe('land');
  });

  it('an odd party spins the sit-out wheel between first and last place before a Stew Battle', () => {
    const def = getBoard('lantern-hollow');
    const s = createBoard(def.id, ['a', 'b', 'c'], 10, 4);
    s.players.a.crowns = 2;
    s.players.c.keys = 0;
    const stew = Object.values(def.nodes).find((n) => n.type === 'stew')!;
    const before = Object.values(def.nodes).find((n) => n.next.includes(stew.id))!;
    s.order = ['b', 'a', 'c'];
    s.players.b.node = before.id;
    s.sub = 'rolled';
    s.roll = s.stepsLeft = 1;
    run(s, {}, 1.6);
    expect(s.sub).toBe('wheel');
    expect(s.event!.wheel!.sort()).toEqual(['a', 'c']);
    run(s, {}, 3.2);
    expect(s.sub).toBe('event');
    expect(s.event!.players.length).toBe(2);
    expect(['a', 'c']).toContain(s.event!.sitOut);
  });

  it('items: Spring Boots add 5, and the item menu only allows one item per turn', () => {
    const def = BOARDS[0];
    const s = createBoard(def.id, ['a'], 10, 1);
    s.players.a.items = ['spring-boots', 'heart-snack'];
    s.sub = 'roll';
    s.t = 1;
    stepBoard(s, { a: B }, DT);
    expect(s.prompt?.kind).toBe('items');
    s.t = 1;
    stepBoard(s, { a: A }, DT);
    expect(s.players.a.rollBonus).toBe(5);
    expect(s.sub).toBe('roll');
    s.t = 1;
    stepBoard(s, { a: B }, DT);
    expect(s.sub).toBe('roll'); // already used an item this turn
  });

  it('a duel space in a real party runs the duel minigame with just two players and returns to the board', () => {
    const p = createParty(3);
    for (let i = 0; i < 4; i++) addPlayer(p, `p${i}`);
    p.selection = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === 'lantern-hollow');
    p.autoPick = false;
    stepParty(p, { p0: A }, DT);
    const b = p.board!;
    const def = getBoard(b.boardId);
    const duel = Object.values(def.nodes).find((n) => n.type === 'duel')!;
    const before = Object.values(def.nodes).find((n) => n.next.includes(duel.id))!;
    const first = b.order[0];
    b.players[first].node = before.id;
    b.sub = 'rolled';
    b.roll = b.stepsLeft = 1;
    let guard = 0;
    while (p.phase === 'board' && guard++ < 30 * 20) stepParty(p, {}, DT);
    expect(p.phase).toBe('intro');
    expect(p.gameId && ['fuse-draw', 'paddle-clash'].includes(p.gameId)).toBe(true);
    expect(p.gamePlayers!.length).toBe(2);
    guard = 0;
    while (p.phase !== 'board' && guard++ < 30 * 120) stepParty(p, {}, DT);
    expect(p.phase).toBe('board');
    expect(p.board!.cur).toBeGreaterThanOrEqual(0);
  });
});
