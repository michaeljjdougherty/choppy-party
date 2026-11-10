import { describe, expect, it } from 'vitest';
import { presentPileUp, swingX, type PileState } from '../src/shared/games/presentPileUp';
import { trainHop, TRACKS, type TrainState } from '../src/shared/games/trainHop';
import { graveyardShift, type GraveyardState } from '../src/shared/games/graveyardShift';
import { meteorShower, BLAST, type MeteorState } from '../src/shared/games/meteorShower';
import { DT, NO_INPUT, type PlayerInfo, type TickInput } from '../src/shared/types';

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', slot: i }));
const press: TickInput = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };
const idle = { p0: NO_INPUT };

describe('wave 2 minigames', () => {
  it('Present Pile-Up: a centred drop stacks, a wide miss knocks a gift off', () => {
    const s: PileState = presentPileUp.setup(players(1), 1);
    while (s.t < 2.05) presentPileUp.step(s, idle, DT);
    const drop = () => {
      presentPileUp.step(s, { p0: press }, DT);
      for (let i = 0; i < 15; i++) presentPileUp.step(s, idle, DT);
    };
    drop();
    expect(s.piles[0].gifts.length).toBe(1);
    // wait until the swing is at the far edge, then drop: too far off the top gift
    const p = s.piles[0];
    let guard = 0;
    while (Math.abs(swingX(p) - p.gifts[0]) < 60 && guard++ < 200) presentPileUp.step(s, idle, DT);
    drop();
    expect(p.tumbles).toBe(1);
    expect(p.gifts.length).toBe(0);
  });

  it('Train Hop: standing on a track when the train comes knocks you out', () => {
    const s: TrainState = trainHop.setup(players(1), 3);
    s.spawn = 99;
    s.hoppers[0].x = 640;
    s.hoppers[0].y = TRACKS[0];
    s.trains.push({ track: 0, dir: 1, cars: 2, x: -60, warn: 0.1 });
    for (let i = 0; i < 60 && s.hoppers[0].outAt < 0; i++) trainHop.step(s, idle, DT);
    expect(s.hoppers[0].outAt).toBeGreaterThan(0);
    expect(trainHop.isOver(s)).toBe(true);
  });

  it('Graveyard Shift: a ghost touch drops half your candles', () => {
    const s: GraveyardState = graveyardShift.setup(players(1), 5);
    s.ghostSpawn = 99;
    s.candleSpawn = 99;
    s.candles = [];
    const k = s.keepers[0];
    k.candles = 6;
    s.ghosts.push({ x: k.x + 10, y: k.y, rise: 1, grave: 0, life: 10 });
    graveyardShift.step(s, idle, DT);
    expect(k.candles).toBe(3);
    expect(s.candles.length).toBe(3);
  });

  it('Meteor Shower: one meteor hit knocks you out unless you are high in the air', () => {
    const s: MeteorState = meteorShower.setup(players(2), 7);
    s.spawn = 99;
    const [a, b] = s.astros;
    s.meteors.push({ x: a.x, y: a.y, fall: 0.01 }, { x: b.x + BLAST / 2, y: b.y, fall: 0.01 });
    b.z = 80;
    b.vz = 0;
    meteorShower.step(s, { p0: NO_INPUT, p1: NO_INPUT }, DT);
    expect(a.hearts).toBe(0);
    expect(a.outAt).toBeGreaterThanOrEqual(0);
    expect(b.hearts).toBe(1);
  });
});
