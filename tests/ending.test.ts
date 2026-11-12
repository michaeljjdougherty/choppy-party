import { describe, expect, it } from 'vitest';
import { addBot, addPlayer, createParty, freshGames, startEnding, startParty, stepParty, CHAMP_HOLD, type PartyState } from '../src/shared/party';
import { DT, NO_INPUT } from '../src/shared/types';
import { pickAwards } from '../src/shared/board/bonus';

function boardParty(): PartyState {
  const s = createParty(77);
  addPlayer(s, 'me', 'Me');
  for (let i = 0; i < 3; i++) addBot(s, 'normal');
  s.selection = 0;
  startParty(s);
  return s;
}

describe('end of a board game', () => {
  it('hands out Bonus Chobglobs, then a champion that a mashed A cannot skip', () => {
    const s = boardParty();
    const b = s.board!;
    const ids = Object.keys(b.players);
    // a game's worth of stats, all different, so every award has one winner
    ids.forEach((id, i) => Object.assign(b.players[id].stats, { wins: i, damageTaken: 3 + i * 2, sevens: i, doubles: 3 - i, spaces: 40 + i * 7, damageDealt: 9 - i, kos: i }));
    const before = ids.reduce((a, id) => a + b.players[id].crowns, 0);
    startEnding(s);
    expect(s.phase).toBe('final');
    expect(s.ending!.stage).toBe('awards');
    expect(s.ending!.awards.length).toBe(3);
    const stages = new Set<string>();
    let frame = 0;
    // the host mashes A the whole way
    for (let t = 0; t < 120 && s.phase === 'final'; t += DT) {
      stages.add(s.ending!.stage);
      stepParty(s, { me: { ...NO_INPUT, a: true, aPressed: frame++ % 2 === 0 } }, DT);
    }
    expect([...stages]).toEqual(['awards', 'drum', 'champ']);
    expect(s.phase).toBe('lobby');
    // each award paid at least one Chobglob
    expect(ids.reduce((a, id) => a + b.players[id].crowns, 0)).toBeGreaterThanOrEqual(before + 3);
  });

  it('the champion screen stays up for a few seconds even with A held down', () => {
    const s = boardParty();
    startEnding(s);
    s.ending!.stage = 'champ';
    s.ending!.t = 0;
    let frame = 0;
    let t = 0;
    while (s.phase === 'final' && t < 30) {
      stepParty(s, { me: { ...NO_INPUT, a: true, aPressed: frame++ % 2 === 0 } }, DT);
      t += DT;
    }
    expect(t).toBeGreaterThanOrEqual(CHAMP_HOLD - 0.1);
  });

  it('awards skip stats nobody earned and give ties to everyone tied', () => {
    const s = boardParty();
    const b = s.board!;
    const ids = Object.keys(b.players);
    b.players[ids[0]].stats.wins = 4;
    b.players[ids[1]].stats.wins = 4;
    for (let seed = 1; seed < 40; seed++) {
      for (const a of pickAwards(b, { seed })) {
        if (a.id === 'master') expect(a.winners.sort()).toEqual([ids[0], ids[1]].sort());
        // nothing else was earned: no damage, rolls or moves, so only the no-stat ones can show up
        expect(['master', 'favorite', 'participation', 'untouchable', 'slow', 'rich'].includes(a.id) || a.winners.length < ids.length).toBe(true);
      }
    }
  });
});

describe('minigame picks', () => {
  it('deal every game once before any repeats', () => {
    const pool = Array.from({ length: 30 }, (_, i) => `g${i}`);
    const played: string[] = [];
    for (let i = 0; i < 30; i++) {
      const f = freshGames(pool, played);
      played.push(f[i % f.length]);
    }
    expect(new Set(played).size).toBe(30);
    expect(freshGames(pool, played)).not.toContain(played[29]);
  });

  it('a long board game plays lots of different minigames', () => {
    const s = createParty(5);
    for (let i = 0; i < 4; i++) addBot(s, 'hard');
    s.selection = 0;
    startParty(s);
    s.board!.maxTurns = 12;
    let t = 0;
    while (s.phase !== 'final' && t < 4000) {
      stepParty(s, {}, DT);
      t += DT;
    }
    const regular = s.playlist;
    expect(regular.length).toBeGreaterThanOrEqual(10);
    expect(new Set(regular).size).toBe(regular.length);
  });
});
