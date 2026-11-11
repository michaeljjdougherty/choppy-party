import { describe, expect, it } from 'vitest';
import { addBot, createParty, OPTIONS, startParty, stepParty, type PartyState } from '../src/shared/party';
import { DT } from '../src/shared/types';
import { getBoard } from '../src/shared/board/boards';
import { currentPlayer } from '../src/shared/board/engine';
import * as dev from '../src/shared/dev';

function board(id: string, n = 4): PartyState {
  const s = createParty(1234);
  s.selection = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === id);
  s.autoPick = false;
  for (let i = 0; i < n; i++) addBot(s, 'normal');
  startParty(s);
  dev.devSkipBoardIntro(s);
  return s;
}
function run(s: PartyState, secs: number, until?: () => boolean) {
  for (let t = 0; t < secs; t += DT) {
    stepParty(s, {}, DT);
    if (until?.()) return;
  }
}

describe('developer mode', () => {
  it('skips the board intro straight to the first turn', () => {
    const s = board('lantern-hollow');
    expect(s.board!.sub).toBe('turnIntro');
    expect(s.board!.baseOrder.length).toBe(4);
  });

  it('teleports the current player onto a space and they land on it', () => {
    const s = board('cosmo-junction');
    run(s, 5, () => s.board!.sub === 'roll');
    const b = s.board!;
    const id = currentPlayer(b);
    const def = getBoard(b.boardId);
    const heart = Object.values(def.nodes).find((n) => n.type === 'heart')!;
    b.players[id].hp = 5;
    dev.devTeleport(s, id, heart.id, true);
    run(s, 0.2);
    expect(b.players[id].node).toBe(heart.id);
    expect(b.players[id].hp).toBeGreaterThan(5);
  });

  it('loads the dice', () => {
    const s = board('gold-rush-gulch');
    dev.devDice(s, [6, 6]);
    run(s, 30, () => s.board!.sub === 'move');
    expect(s.board!.rolls).toEqual([6, 6]);
    expect(s.board!.doubles).toBe(true);
  });

  it('plays a minigame mid-turn and comes back to the same turn', () => {
    const s = board('lantern-hollow');
    run(s, 5, () => s.board!.sub === 'roll');
    const turn = s.board!.turn;
    const cur = s.board!.cur;
    dev.devPlayGame(s, 'shrinking-rink');
    expect(s.phase).toBe('intro');
    dev.devEndGame(s);
    expect(s.phase).toBe('results');
    run(s, 12, () => s.phase === 'board');
    expect(s.phase).toBe('board');
    expect(s.board!.turn).toBe(turn);
    expect(s.board!.cur).toBe(cur);
  });

  it('forces the next round minigame', () => {
    const s = board('lantern-hollow', 2);
    s.devNext = 'pancake-panic';
    dev.devRoundEnd(s);
    run(s, 8, () => s.phase === 'intro');
    expect(s.gameId).toBe('pancake-panic');
  });

  it('summons the Stew Court villain right away', () => {
    const s = board('stew-court');
    run(s, 5, () => s.board!.sub === 'roll');
    expect(dev.devBoss(s)).toBe(true);
    expect(s.board!.sub).toBe('boss');
  });

  it('flips day and night, and ends the game', () => {
    const s = board('lantern-hollow');
    dev.devFlipTime(s);
    expect(s.board!.night).toBe(true);
    dev.devEndBoard(s);
    expect(s.phase).toBe('final');
  });
});
