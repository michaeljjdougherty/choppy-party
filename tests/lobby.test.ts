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

describe('pause menu', () => {
  const start = { ...NO_INPUT, startPressed: true };
  const down = { ...NO_INPUT, y: 1 };
  const a = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
  const boardParty = () => {
    const s = createParty(5);
    addPlayer(s, 'h');
    addPlayer(s, 'g');
    stepParty(s, { h: a }, DT);
    return s;
  };

  it('Start freezes the party until the pauser resumes', () => {
    const s = boardParty();
    expect(s.phase).toBe('board');
    stepParty(s, { g: start }, DT);
    expect(s.pause?.by).toBe('g');
    const t = s.phaseT;
    for (let i = 0; i < 60; i++) stepParty(s, { h: a }, DT);
    expect(s.phaseT).toBe(t);
    stepParty(s, { g: start }, DT);
    expect(s.pause).toBeNull();
    stepParty(s, {}, DT);
    expect(s.phaseT).toBeGreaterThan(t);
  });

  it('only the host can end the party; anyone can quit to the menu', () => {
    const s = boardParty();
    stepParty(s, { g: start }, DT);
    for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    stepParty(s, { g: down }, DT);
    for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    stepParty(s, { g: down }, DT);
    for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    expect(s.pause?.sel).toBe(2);
    stepParty(s, { g: a }, DT);
    expect(s.phase).toBe('board'); // the guest can't end it
    stepParty(s, { g: down }, DT);
    for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    stepParty(s, { g: a }, DT);
    expect(s.quit).toEqual({ id: 'g', n: 1 });
    expect(s.pause).toBeNull();
    stepParty(s, { h: start }, DT);
    for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    for (const _ of [0, 1]) {
      stepParty(s, { h: down }, DT);
      for (let i = 0; i < 10; i++) stepParty(s, {}, DT);
    }
    stepParty(s, { h: a }, DT);
    expect(s.phase).toBe('lobby');
    expect(s.players.length).toBe(2);
  });
});
