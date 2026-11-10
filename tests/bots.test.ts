import { describe, expect, it } from 'vitest';
import { addBot, createParty, OPTIONS, stepParty, type PartyState } from '../src/shared/party';
import { GAMES } from '../src/shared/games';
import { DT } from '../src/shared/types';
import type { BotLevel } from '../src/shared/bots';

/** Run a party with only bots until `until` says stop (or the time cap). */
function run(s: PartyState, until: (s: PartyState) => boolean, cap = 600): number {
  let t = 0;
  while (!until(s) && t < cap) {
    stepParty(s, {}, DT);
    t += DT;
  }
  return t;
}

function freePlay(gameId: string, levels: BotLevel[], seed: number): PartyState {
  const s = createParty(seed);
  for (const l of levels) addBot(s, l);
  s.selection = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === gameId);
  s.phase = 'lobby';
  // the host (a bot here) never presses start in the lobby, so start directly
  stepParty(s, {}, DT);
  return s;
}

describe('bots', () => {
  for (const g of GAMES) {
    it(`play ${g.name} to the end, and Hard beats Easy on average`, async () => {
      const { startParty } = await import('../src/shared/party');
      const avg: Record<string, number> = { easy: 0, hard: 0 };
      const n = 12;
      for (let seed = 1; seed <= n; seed++) {
        const levels: BotLevel[] = g.minPlayers <= 2 && g.maxPlayers === 2 ? ['easy', 'hard'] : g.mode === 'Team' ? ['easy', 'hard', 'easy', 'hard'] : ['easy', 'normal', 'hard'];
        const s = freePlay(g.id, levels, seed * 7919);
        if (g.mode === 'Team') s.players.forEach((p, i) => (p.team = p.bot === 'hard' ? 1 : 0));
        startParty(s);
        if (g.mode === 'Team') {
          // teams: put the hard bots together
          const st = s as any;
          st.game = g.setup(s.players.map((p) => ({ ...p, team: p.bot === 'hard' ? 1 : 0 })), seed);
        }
        const t = run(s, (x) => x.phase === 'results');
        expect(s.phase, `${g.id} seed ${seed} stuck in ${s.phase} after ${t.toFixed(0)}s`).toBe('results');
        for (const pl of s.placements) {
          const lvl = s.players.find((p) => p.id === pl.id)!.bot!;
          if (lvl in avg) avg[lvl] += pl.place;
        }
      }
      console.log(g.id, 'avg place  easy', (avg.easy / n).toFixed(2), ' hard', (avg.hard / n).toFixed(2));
      expect(avg.hard).toBeLessThanOrEqual(avg.easy);
    });
  }

  it('bots play a whole board party by themselves', () => {
    const s = createParty(4242);
    for (const l of ['easy', 'normal', 'hard', 'hard'] as BotLevel[]) addBot(s, l);
    s.selection = 0; // first board
    s.turnsIdx = 0;
    // the only "host" is a bot, which doesn't start lobbies, so start by hand
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return import('../src/shared/party').then(({ startParty }) => {
      startParty(s);
      const t = run(s, (x) => x.phase === 'final', 1500);
      expect(s.phase, `stuck in ${s.phase} after ${t.toFixed(0)}s`).toBe('final');
      const b = s.board!;
      const crowns = Object.values(b.players).reduce((a, p) => a + p.crowns, 0);
      console.log('board finished in', t.toFixed(0), 's; crowns', crowns, Object.values(b.players).map((p) => `${p.id}:${p.keys}k/${p.crowns}c`).join(' '));
    });
  });
});
