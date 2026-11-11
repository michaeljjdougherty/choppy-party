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
  it('Mister Chunk brings his theme on any board', () => {
    const s = { phase: 'board', board: { boardId: 'cosmo-junction', sub: 'chunk' } } as unknown as PartyState;
    expect(trackFor(s)).toBe('mister-chunk');
  });
  it('a Duel space plays the duel theme from picking a rival to the duel', () => {
    const pick = { phase: 'board', board: { boardId: 'cosmo-junction', sub: 'prompt', prompt: { kind: 'target', purpose: 'duel' } } } as unknown as PartyState;
    const wait = { phase: 'board', board: { boardId: 'cosmo-junction', sub: 'event', event: { kind: 'duel' } } } as unknown as PartyState;
    const item = { phase: 'board', board: { boardId: 'cosmo-junction', sub: 'prompt', prompt: { kind: 'target', purpose: 'item' } } } as unknown as PartyState;
    expect(trackFor(pick)).toBe('duel-space');
    expect(trackFor(wait)).toBe('duel-space');
    expect(trackFor(item)).toBe('board:cosmo-junction');
  });
  it('a Stew Battle space plays its own theme until the battle starts', () => {
    const s = { phase: 'board', board: { boardId: 'stew-court', sub: 'event', event: { kind: 'stew' } } } as unknown as PartyState;
    expect(trackFor(s)).toBe('stew-space');
  });
  it('Evil LeBron brings his anthem when he drops in', () => {
    const s = { phase: 'board', board: { boardId: 'stew-court', choppy: true, sub: 'boss', order: ['a'], cur: 0, players: { a: { node: 's0' } } } } as unknown as PartyState;
    expect(trackFor(s)).toBe('evil-lebron');
  });
});
