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
