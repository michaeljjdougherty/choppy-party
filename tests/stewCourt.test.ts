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
});
