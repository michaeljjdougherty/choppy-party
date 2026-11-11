import { describe, expect, it } from 'vitest';
import { BOARDS } from '../src/shared/board/boards';
import { createBoard, slowFace, stepBoard } from '../src/shared/board/engine';
import { NO_INPUT } from '../src/shared/types';

const DT = 1 / 60;
const A = { ...NO_INPUT, a: true, aPressed: true };

describe('dice items', () => {
  it('High Roller: every die lands on 4, 5 or 6', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = createBoard(BOARDS[0].id, ['a'], 10, seed);
      s.players.a.rollMin = 4;
      s.sub = 'roll';
      s.t = 1;
      stepBoard(s, { a: A }, DT);
      expect(s.rolls[0]).toBeGreaterThanOrEqual(4);
      expect(s.rolls[0]).toBeLessThanOrEqual(6);
    }
  });

  it('Slow Roller: the die stops on the face showing when A is pressed', () => {
    const s = createBoard(BOARDS[0].id, ['a'], 10, 3);
    s.players.a.slowRoll = true;
    s.sub = 'roll';
    for (const t of [0.5, 1.4, 2.0, 2.9]) {
      s.sub = 'roll';
      s.rolls = [];
      s.t = t;
      const want = slowFace(s, s.players.a);
      stepBoard(s, { a: A }, DT);
      expect(s.rolls[0]).toBe(want);
    }
  });
});
