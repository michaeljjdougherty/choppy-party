import { describe, expect, it } from 'vitest';
import { READY, SCOPE_CD, scopeSnap, type SnapState } from '../src/shared/games/scopeSnap';
import { DT, NO_INPUT, type TickInput } from '../src/shared/types';

const two = () => [
  { id: 'a', name: 'A', color: '#f00', slot: 0 },
  { id: 'b', name: 'B', color: '#00f', slot: 1 },
];

/** Put a and b on an open line facing each other, past the countdown and spawn shields. */
function faceOff(gap = 8): SnapState {
  const s = scopeSnap.setup(two(), 7);
  s.walls = s.walls.filter((w) => Math.abs(w.x0) > 10 || Math.abs(w.z0) > 10.5); // keep the hull only
  const [a, b] = s.players;
  Object.assign(a, { x: -gap / 2, z: 0, yaw: 0, shield: 0 });
  Object.assign(b, { x: gap / 2, z: 0, yaw: Math.PI, shield: 0 });
  s.t = READY + 2.1;
  for (const p of s.players) p.shield = 0;
  return s;
}

const step = (s: SnapState, a: Partial<TickInput> = {}, b: Partial<TickInput> = {}, n = 1) => {
  for (let i = 0; i < n; i++) scopeSnap.step(s, { a: { ...NO_INPUT, ...a }, b: { ...NO_INPUT, ...b } }, DT);
};

describe('Scope Snap', () => {
  it('the scope snaps off after a second and needs to recharge', () => {
    const s = faceOff();
    const a = s.players[0];
    step(s, { scope: true });
    expect(a.scopeT).toBeGreaterThanOrEqual(0);
    step(s, { scope: true }, {}, 31);
    expect(a.scopeT).toBe(-1);
    expect(a.scopeCd).toBeGreaterThan(SCOPE_CD - 0.1);
    step(s, { scope: true }, {}, 10);
    expect(a.scopeT).toBe(-1);
  });

  it('a quick scope scores 2 and pops the target', () => {
    const s = faceOff();
    step(s, { scope: true }, {}, 5);
    step(s, { scope: true, fire: true, firePressed: true });
    expect(s.players[0].score).toBe(2);
    expect(s.players[1].alive).toBe(false);
    expect(s.feed.at(-1)?.kind).toBe('quick');
  });

  it('a slow scoped shot scores 1', () => {
    const s = faceOff();
    step(s, { scope: true }, {}, 15);
    step(s, { scope: true, fire: true, firePressed: true });
    expect(s.players[0].score).toBe(1);
  });

  it('a no-scope hit scores 3', () => {
    const s = faceOff(2.2);
    // point blank, so hip-fire spread can't miss
    step(s, { fire: true, firePressed: true });
    expect(s.players[0].score).toBe(3);
    expect(s.feed.at(-1)?.kind).toBe('noscope');
  });

  it('a knife takes a point off the victim and gives the knifer nothing', () => {
    const s = faceOff(1.4);
    s.players[1].score = 4;
    step(s, { b: true, bPressed: true, bTaps: 1 });
    expect(s.players[1].score).toBe(3);
    expect(s.players[0].score).toBe(0);
    expect(s.players[1].alive).toBe(false);
  });

  it('walls stop darts', () => {
    const s = faceOff();
    s.walls.push({ x0: -0.5, z0: -2, x1: 0.5, z1: 2, h: 3, kind: 'wall' });
    step(s, { scope: true }, {}, 5);
    step(s, { scope: true, fire: true, firePressed: true });
    expect(s.players[1].alive).toBe(true);
  });

  it('popped players come back after 2 seconds with a shield', () => {
    const s = faceOff(2.2);
    step(s, { fire: true, firePressed: true });
    step(s, {}, {}, 62);
    expect(s.players[1].alive).toBe(true);
    expect(s.players[1].shield).toBeGreaterThan(1);
  });

  it('CPUs play a whole round and rank everyone', () => {
    const ps = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: `#${i}${i}${i}`, slot: i, bot: (['easy', 'normal', 'hard'] as const)[i % 3] }));
    const s = scopeSnap.setup(ps, 3);
    const mem: Record<string, any> = {};
    const r = { seed: 5 };
    let guard = 0;
    while (!scopeSnap.isOver(s) && guard++ < 3000) {
      const inputs: Record<string, TickInput> = {};
      for (const p of ps) {
        mem[p.id] ??= { key: '', wait: 0, t: 0, next: 0, sx: 0, sy: 0, mash: 0, n: -1, m: 0, prev: 0, early: -1, itemTurn: -1 };
        inputs[p.id] = scopeSnap.bot!(s, p.id, { sk: {} as any, mem: mem[p.id], r, dt: DT, level: p.bot });
      }
      scopeSnap.step(s, inputs, DT);
    }
    expect(scopeSnap.isOver(s)).toBe(true);
    const res = scopeSnap.results(s);
    expect(res).toHaveLength(6);
    expect(s.players.reduce((n, p) => n + p.pops, 0)).toBeGreaterThan(5);
    for (const p of s.players) expect(Number.isFinite(p.x + p.z + p.yaw)).toBe(true);
  });
});
