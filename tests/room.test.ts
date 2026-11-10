import { describe, expect, it } from 'vitest';
import { Room, type Link } from '../src/shared/room';
import type { ServerMsg } from '../src/shared/protocol';
import { FIRST_MIX } from '../src/shared/party';

const sink = () => {
  const got: ServerMsg[] = [];
  const link: Link = { send: (m) => got.push(m) };
  return { got, link };
};

describe('online room', () => {
  it('a dropped player is played by a CPU and gets their seat back with the same id', () => {
    const room = new Room('ABCD', 7);
    const host = sink();
    const guest = sink();
    const hostId = room.connect(host.link);
    const guestId = room.connect(guest.link);
    room.message(hostId, { t: 'add', deviceKey: 'kb1' });
    room.message(guestId, { t: 'add', deviceKey: 'pad0' });
    expect(room.party.players).toHaveLength(2);
    room.party.selection = FIRST_MIX;
    room.message(hostId, { t: 'input', raws: { kb1: { x: 0, y: 0, a: true, b: false, aCount: 1, bCount: 0 } } });
    room.tick();
    room.message(hostId, { t: 'input', raws: { kb1: { x: 0, y: 0, a: true, b: false, aCount: 2, bCount: 0 } } });
    room.tick();
    expect(room.party.phase).toBe('intro');

    // the guest drops: their player stays, marked away, and a CPU readies up for them
    room.disconnect(guestId, guest.link);
    const gp = room.party.players.find((p) => p.id.startsWith(guestId))!;
    expect(gp.away).toBe(true);
    for (let i = 0; i < 30 * 4; i++) room.tick();
    expect(room.party.phase).toBe('play'); // the host held A, the stand-in CPU readied the guest

    // a stale close from the old connection after a reconnect changes nothing
    const back = sink();
    expect(room.connect(back.link, guestId)).toBe(guestId);
    expect(gp.away).toBeUndefined();
    room.disconnect(guestId, guest.link);
    expect(gp.away).toBeUndefined();
    expect(back.got[0]).toEqual({ t: 'welcome', code: 'ABCD', clientId: guestId });
  });

  it('leaving in the lobby frees the seat', () => {
    const room = new Room('WXYZ', 1);
    const a = sink();
    const id = room.connect(a.link);
    room.message(id, { t: 'add', deviceKey: 'kb1' });
    room.disconnect(id, a.link);
    expect(room.party.players).toHaveLength(0);
  });
});
