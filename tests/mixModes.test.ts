import { describe, expect, it } from 'vitest';
import { addBot, createParty, OPTIONS, startParty, stepParty } from '../src/shared/party';
import { DUEL_GAMES, STEW_GAMES } from '../src/shared/board/engine';
import { DT } from '../src/shared/types';

describe('Minigame Mix modes', () => {
  for (const [mode, pool] of [[1, DUEL_GAMES], [2, STEW_GAMES]] as const) {
    it(`mode ${mode} only deals its games, rotates players, and finishes`, () => {
      const s = createParty(99 + mode);
      for (let i = 0; i < 5; i++) addBot(s, 'normal');
      s.selection = OPTIONS.findIndex((o) => o.kind === 'mix');
      s.mixMode = mode;
      s.roundsIdx = 2; // 10 rounds
      startParty(s);
      expect(s.playlist.every((g) => (pool as readonly string[]).includes(g))).toBe(true);
      const seen = new Set<string>();
      let t = 0;
      let round = -1;
      while (s.phase !== 'final' && t < 1500) {
        if (s.round !== round && s.phase === 'intro') {
          round = s.round;
          const who = s.gamePlayers!;
          expect(who.length).toBe(mode === 1 ? 2 : 4);
          if (mode === 2) expect(new Set(who.map((p) => p.team)).size).toBe(2);
          who.forEach((p) => seen.add(p.id));
        }
        stepParty(s, {}, DT);
        t += DT;
      }
      expect(s.phase).toBe('final');
      expect(seen.size).toBe(5);
    });
  }
});
