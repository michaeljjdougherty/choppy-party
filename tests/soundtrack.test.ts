import { describe, expect, it } from 'vitest';
import { trackFor } from '../src/client/soundtrack';
import type { PartyState } from '../src/shared/party';

const onBoard = (boardId: string, night: boolean) => ({ phase: 'board', board: { boardId, night } }) as unknown as PartyState;

describe('board music', () => {
  it('Lantern Hollow swaps to its night song after dark', () => {
    expect(trackFor(onBoard('lantern-hollow', false))).toBe('board:lantern-hollow');
    expect(trackFor(onBoard('lantern-hollow', true))).toBe('board:lantern-hollow-night');
  });
  it('other boards keep one song', () => {
    expect(trackFor(onBoard('cosmo-junction', true))).toBe('board:cosmo-junction');
  });
});
