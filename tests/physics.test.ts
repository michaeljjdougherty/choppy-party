import { describe, expect, it } from 'vitest';
import { FEEL, bump, jump, newBody, steer, stepVertical } from '../src/shared/physics';
import { coinCloudburst, ANVIL_HIT, type CloudburstState } from '../src/shared/games/coinCloudburst';
import { shrinkingRink, type RinkState } from '../src/shared/games/shrinkingRink';
import { DT, NO_INPUT, type PlayerInfo, type TickInput } from '../src/shared/types';

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', slot: i }));
const press: TickInput = { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 };

describe('bouncy physics', () => {
  it('jumps are floaty: they hang near the top', () => {
    const b = newBody();
    jump(b);
    let t = 0;
    let top = 0;
    let nearTop = 0;
    while (t < 3) {
      stepVertical(b, DT);
      t += DT;
      top = Math.max(top, b.z);
      if (b.z <= 0 && b.vz <= 0 && t > 0.1) break;
    }
    const b2 = newBody();
    jump(b2);
    for (let i = 0; i < 120; i++) {
      stepVertical(b2, DT);
      if (b2.z > top * 0.8) nearTop += DT;
    }
    expect(top).toBeGreaterThan(90);
    // more than a third of the airtime is spent in the top 20% of the arc
    expect(nearTop / t).toBeGreaterThan(0.3);
  });

  it('lands with a little bounce, then settles', () => {
    const b = newBody();
    b.z = 200;
    let bounces = 0;
    for (let i = 0; i < 200; i++) if (stepVertical(b, DT)) bounces++;
    expect(bounces).toBeGreaterThanOrEqual(2);
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });

  it('accelerates fast and stops crisply (Mario Party feel), with a frame of slide', () => {
    const b = newBody();
    let ticks = 0;
    while (b.vx < 299 && ticks < 30) {
      steer(b, 1, 0, 300, DT);
      ticks++;
    }
    expect(ticks * DT).toBeLessThan(0.2);
    expect(ticks * DT).toBeLessThanOrEqual(0.1 + 1e-9);
    steer(b, 0, 0, 300, DT);
    expect(b.vx).toBeGreaterThan(100); // not a dead stop
    let stop = DT;
    while (b.vx > 0 && stop < 1) {
      steer(b, 0, 0, 300, DT);
      stop += DT;
    }
    expect(stop).toBeLessThan(0.15); // but no long glide
    expect(FEEL.turnDecel).toBeGreaterThan(FEEL.accel);
  });

  it('bumps are springy and pop the other body up', () => {
    const a = { ...newBody(), x: 0, y: 0, vx: 300 };
    const c = { ...newBody(), x: 40, y: 0 };
    bump(a, c, 24);
    expect(c.vx).toBeGreaterThan(300); // more than a plain elastic swap
    expect(a.vx).toBeLessThan(0); // the bumper bounces back
    expect(c.vz).toBeGreaterThan(0);
  });
});

describe('Coin Cloudburst bombs', () => {
  it('jumping clears a bomb blast, standing still gets you stunned', () => {
    const s = coinCloudburst.setup(players(2), 1) as CloudburstState;
    s.spawn = 99;
    const [a, b] = s.runners;
    b.x = a.x + ANVIL_HIT * 3;
    s.drops = [
      { kind: 'anvil', x: a.x, y: a.y, fall: 0.5, life: 0.6 },
      { kind: 'anvil', x: b.x, y: b.y, fall: 0.5, life: 0.6 },
    ];
    // a jumps just before the bomb lands
    for (let i = 0; i < 20; i++) {
      coinCloudburst.step(s, { p0: i === 6 ? press : NO_INPUT, p1: NO_INPUT }, DT);
    }
    expect(a.stun).toBe(0);
    expect(b.stun).toBeGreaterThan(0);
  });
});

describe('Shrinking Rink', () => {
  it('a skater knocked over the edge is safe until they come down', () => {
    const s = shrinkingRink.setup(players(2), 1) as RinkState;
    const k = s.skaters[0];
    k.x = 640 + s.rink + 40;
    k.y = 390;
    k.z = 50;
    k.vz = 400;
    shrinkingRink.step(s, {}, DT);
    expect(k.alive).toBe(true);
    for (let i = 0; i < 60; i++) shrinkingRink.step(s, {}, DT);
    expect(k.alive).toBe(false);
  });
});
