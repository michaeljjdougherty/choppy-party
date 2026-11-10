import { describe, expect, it } from 'vitest';
import { addPlayer, createParty, cycleCharacter, cycleColor } from '../src/shared/party';

describe('lobby character and colour picking', () => {
  it('never gives two players the same character or colour', () => {
    const s = createParty(1);
    for (let i = 0; i < 4; i++) addPlayer(s, `p${i}`);
    const p = s.players[0];
    for (let k = 0; k < 25; k++) {
      cycleCharacter(s, p);
      cycleColor(s, p);
      const chars = s.players.map((q) => q.char);
      const colors = s.players.map((q) => q.color);
      expect(new Set(chars).size).toBe(4);
      expect(new Set(colors).size).toBe(4);
    }
  });
  it('a default name follows the character', () => {
    const s = createParty(1);
    addPlayer(s, 'a');
    const p = s.players[0];
    const before = p.name;
    cycleCharacter(s, p);
    expect(p.name).not.toBe(before);
  });
});

import { FIRST_MIX, stepParty } from '../src/shared/party';
import { DT, NO_INPUT } from '../src/shared/types';

describe('minigame intro', () => {
  const toIntro = () => {
    const s = createParty(5);
    addPlayer(s, 'a');
    addPlayer(s, 'b');
    s.selection = FIRST_MIX;
    stepParty(s, { a: { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 } }, DT);
    expect(s.phase).toBe('intro');
    return s;
  };
  it('a tap does not ready you; holding A for a second does', () => {
    const s = toIntro();
    for (let i = 0; i < 20; i++) stepParty(s, { a: { ...NO_INPUT, a: i % 2 === 0, aPressed: i % 2 === 0 } }, DT);
    expect(s.ready).not.toContain('a');
    for (let i = 0; i < 32; i++) stepParty(s, { a: { ...NO_INPUT, a: true } }, DT);
    expect(s.ready).toContain('a');
    expect(s.phase).toBe('intro'); // b still has to ready
    for (let i = 0; i < 32; i++) stepParty(s, { b: { ...NO_INPUT, a: true } }, DT);
    expect(s.phase).toBe('play');
  });
  it('the host can force the start with X', () => {
    const s = toIntro();
    for (let i = 0; i < 12; i++) stepParty(s, {}, DT);
    stepParty(s, { a: { ...NO_INPUT, xPressed: true } }, DT);
    expect(s.phase).toBe('play');
  });
});
