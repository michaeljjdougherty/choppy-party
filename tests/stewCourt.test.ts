import { describe, expect, it } from 'vitest';
import { getBoard } from '../src/shared/board/boards';
import { bossIn, createBoard, finishEvent, nextTurn, stepBoard } from '../src/shared/board/engine';
import type { BoardState } from '../src/shared/board/types';
import { DT } from '../src/shared/types';

/** Play the board with idle (auto) players for `turns` rounds, calling `watch` every tick. */
function play(s: BoardState, turns: number, watch: (s: BoardState) => void): void {
  let ticks = 0;
  while (ticks++ < 30 * 2000) {
    watch(s);
    if (s.sub === 'event' && s.event) {
      finishEvent(s, s.event.players.map((id, i) => ({ id, value: i })));
      continue;
    }
    if (s.sub === 'done') {
      if (s.turn >= turns) return;
      nextTurn(s);
      continue;
    }
    stepBoard(s, {}, DT);
  }
}

describe('Stew Court', () => {
  const def = getBoard('stew-court');

  it('the hoops are the only chest spots, one lit at a time', () => {
    expect(def.crownSpots.length).toBe(2);
    expect(def.crownSpots.map((id) => Math.sign(def.nodes[id].x)).sort()).toEqual([-1, 1]);
    expect(createBoard('stew-court', ['a', 'b'], 5, 1).crowns.length).toBe(1);
  });

  it('has exactly four Verse Flip spaces, and starts in the calm Fucci Verse', () => {
    expect(Object.values(def.nodes).filter((n) => n.type === 'event').length).toBe(4);
    const s = createBoard('stew-court', ['a', 'b'], 5, 1);
    expect(!!s.choppy).toBe(false);
    expect(bossIn(s, def)).toBe(null);
  });

  it('the villain only comes in the Choppy Verse, and knocks out the player his reel stops on', () => {
    let strikes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createBoard('stew-court', ['a', 'b', 'c', 'd'], 8, seed);
      s.choppy = true; // start in the Choppy Verse so he has a chance to show up
      let seen = '';
      play(s, 8, (st) => {
        if (st.sub === 'boss' && st.boss && st.boss.pick + st.turn !== seen) {
          seen = st.boss.pick + st.turn;
          expect(st.choppy).toBe(true);
          for (const p of Object.values(st.players)) p.shield = false;
        }
        if (st.sub === 'roundEnd' && st.bossLast && st.bossTurn === st.turn && seen.endsWith(String(st.turn))) {
          if (st.players[st.bossLast].ko) strikes++;
          seen += '!';
        }
      });
    }
    expect(strikes).toBeGreaterThan(0);
  });

  it('the Chop Pit is a closed ring of mostly bad spaces with no way in or out', () => {
    const pit = def.pit!;
    expect(pit.length).toBeGreaterThanOrEqual(8);
    const bad = pit.filter((id) => ['thorn', 'chunk', 'dynamite'].includes(def.nodes[id].type)).length;
    expect(bad / pit.length).toBeGreaterThanOrEqual(0.75);
    const into = Object.values(def.nodes).filter((n) => !pit.includes(n.id) && n.next.some((x) => pit.includes(x)));
    expect(into).toEqual([]);
    // a closed ring: the only way out is the escape roll (or a flip back to the Fucci Verse)
    for (const id of pit) expect(def.nodes[id].next.every((x) => pit.includes(x))).toBe(true);
  });

  it('Alley-Oop Pads dunk you into the glowing hoop in the Fucci Verse and into the Chop Pit in the Choppy Verse', () => {
    const pad = Object.values(def.nodes).find((n) => n.type === 'oop')!;
    for (const choppy of [false, true]) {
      const s = createBoard('stew-court', ['a', 'b'], 5, 1);
      s.sub = 'turnIntro';
      s.choppy = choppy;
      const me = s.players[s.order[0]];
      me.keys = 0;
      me.node = pad.id;
      s.stepsLeft = 0;
      s.sub = 'land';
      s.t = 0;
      // landing is resolved by the move step; call it through a zero-step move
      s.sub = 'move';
      stepBoard(s, {}, DT);
      expect(me.node).toBe(choppy ? def.pit![0] : s.crowns[0]);
    }
  });

  it('flipping back to the Fucci Verse sends everyone in the Chop Pit back to the start', () => {
    const flip = Object.values(def.nodes).find((n) => n.type === 'event')!;
    const s = createBoard('stew-court', ['a', 'b'], 5, 1);
    s.choppy = true;
    const [a, b] = s.order;
    s.players[b].node = def.pit![3];
    s.players[a].node = flip.id;
    s.cur = 0;
    s.stepsLeft = 0;
    s.sub = 'move';
    stepBoard(s, {}, DT);
    expect(!!s.choppy).toBe(false);
    expect(s.players[b].node).toBe(def.start);
  });

  it('the Chop Pit: 7 or more breaks you out to the start and you move the roll from there; under goes round the pit; 3 turns max', () => {
    // play whole games with idle input, throwing one player into the pit, and check the rule holds on every roll
    let escapes = 0, rounds = 0, timeouts = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createBoard('stew-court', ['a', 'b'], 12, seed);
      const me = s.players[s.order[0]];
      let wasIn = false;
      let lastTurn = 0;
      play(s, 12, (st) => {
        if (st.sub === 'turnIntro' && st.order[st.cur] === me.id && st.turn !== lastTurn) {
          lastTurn = st.turn;
          // throw them back in at the start of each of their turns about half the time
          if (st.turn % 2 === 1) {
            me.node = def.pit![0];
            me.pitTurns = 0;
          }
          wasIn = def.pit!.includes(me.node);
        }
        if (wasIn && st.sub === 'move' && st.order[st.cur] === me.id && st.rolls.length) {
          wasIn = false;
          const sum = st.rolls.reduce((a, b) => a + b, 0);
          const out = !def.pit!.includes(me.node) || me.pitTurns === 0;
          if (sum >= 7) {
            expect(out).toBe(true);
            escapes++;
          } else if (out) timeouts++;
          else rounds++;
        }
      });
    }
    expect(escapes).toBeGreaterThan(0);
    expect(rounds + timeouts).toBeGreaterThan(0);
  });
});
