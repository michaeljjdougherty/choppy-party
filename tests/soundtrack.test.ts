import { describe, expect, it } from 'vitest';
import { trackFor } from '../src/client/soundtrack';
import type { PartyState } from '../src/shared/party';
import { getBoard } from '../src/shared/board/boards';

const onBoard = (boardId: string, night: boolean) => ({ phase: 'board', board: { boardId, night } }) as unknown as PartyState;

describe('board music', () => {
  it('Lantern Hollow swaps to its night song after dark', () => {
    expect(trackFor(onBoard('lantern-hollow', false))).toBe('board:lantern-hollow');
    expect(trackFor(onBoard('lantern-hollow', true))).toBe('board:lantern-hollow-night');
  });
  it('other boards keep one song', () => {
    expect(trackFor(onBoard('cosmo-junction', true))).toBe('board:cosmo-junction');
  });
  it('Stew Court swaps verses, and the Chop Pit gets its own cue', () => {
    const pit = getBoard('stew-court').pit!;
    const court = (choppy: boolean, node: string) =>
      ({ phase: 'board', board: { boardId: 'stew-court', choppy, order: ['a'], cur: 0, players: { a: { node } } } }) as unknown as PartyState;
    expect(trackFor(court(false, 's0'))).toBe('board:stew-court');
    expect(trackFor(court(true, 's0'))).toBe('board:stew-court-choppy');
    expect(trackFor(court(true, pit[2]))).toBe('board:stew-court-pit');
  });
});
