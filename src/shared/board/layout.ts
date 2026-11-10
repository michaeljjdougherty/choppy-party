import type { BoardNode, Hill, SpaceType } from './types';
import { groundAt } from './terrain';

export type Pt = [number, number];
/** A point with an explicit height: [x, z, y]. */
export type Pt3 = [number, number, number];

/** Evenly spaced points around a rounded rectangle, clockwise seen from above, starting bottom-middle. */
export function roundedRect(w: number, h: number, r: number, n: number, cx = 0, cz = 0): Pt[] {
  // sample densely along the outline, then resample to n evenly spaced points
  const dense: Pt[] = [];
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const seg = (pts: Pt[]) => dense.push(...pts);
  const line = (a: Pt, b: Pt, k = 40) => seg(Array.from({ length: k }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k] as Pt));
  const arc = (c: Pt, a0: number, k = 30) =>
    seg(Array.from({ length: k }, (_, i) => {
      const a = a0 + (i / k) * (Math.PI / 2);
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Pt;
    }));
  // bottom edge (z = +h/2) going left (clockwise from above with +z toward the camera)
  line([0, hh + r], [-hw, hh + r]);
  arc([-hw, hh], Math.PI / 2);
  line([-hw - r, hh], [-hw - r, -hh]);
  arc([-hw, -hh], Math.PI);
  line([-hw, -hh - r], [hw, -hh - r]);
  arc([hw, -hh], -Math.PI / 2);
  line([hw + r, -hh], [hw + r, hh]);
  arc([hw, hh], 0);
  line([hw, hh + r], [0, hh + r]);
  return resample(dense, n).map(([x, z]) => [x + cx, z + cz]);
}

export function ellipse(rx: number, rz: number, n: number): Pt[] {
  const dense: Pt[] = Array.from({ length: 400 }, (_, i) => {
    const a = Math.PI / 2 + (i / 400) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * rz] as Pt;
  });
  return resample(dense, n);
}

function resample(pts: Pt[], n: number): Pt[] {
  const d: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    d.push(d[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = d[pts.length];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (d[j + 1] < target) j++;
    const a = pts[j];
    const b = pts[(j + 1) % pts.length];
    const f = (target - d[j]) / Math.max(1e-9, d[j + 1] - d[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Interior points strictly between a and b. */
export function between(a: Pt, b: Pt, n: number, bend = 0): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const f = (i + 1) / (n + 1);
    const nx = -(b[1] - a[1]);
    const nz = b[0] - a[0];
    const len = Math.hypot(nx, nz) || 1;
    const off = Math.sin(f * Math.PI) * bend;
    return [a[0] + (b[0] - a[0]) * f + (nx / len) * off, a[1] + (b[1] - a[1]) * f + (nz / len) * off] as Pt;
  });
}

/** Pattern letters: Key, Thorn (red), Heart, Crate, Event, Lucky. */
const CODES: Record<string, SpaceType> = { B: 'key', R: 'thorn', H: 'heart', C: 'crate', E: 'event', L: 'lucky' };

export class Builder {
  nodes: Record<string, BoardNode> = {};

  /** Spaces without an explicit height sit on these hills. */
  constructor(private hills?: Hill[]) {}

  /** Nodes along pts, linked in order. `pattern` letters (B R E L) repeat to type them. */
  chain(prefix: string, pts: (Pt | Pt3)[], pattern: string, loop = false): string[] {
    const ids = pts.map((_, i) => `${prefix}${i}`);
    pts.forEach((p, i) => {
      const [x, z] = p;
      const y = p.length > 2 ? (p as Pt3)[2] : groundAt(this.hills, x, z);
      this.nodes[ids[i]] = { id: ids[i], x, z, y, type: CODES[pattern[i % pattern.length]] ?? 'key', next: [] };
    });
    for (let i = 0; i < ids.length - 1; i++) this.nodes[ids[i]].next.push(ids[i + 1]);
    if (loop) this.nodes[ids[ids.length - 1]].next.push(ids[0]);
    return ids;
  }

  link(from: string, to: string): void {
    this.nodes[from].next.push(to);
  }

  set(id: string, type: SpaceType): void {
    this.nodes[id].type = type;
  }
}

/**
 * A smooth path through control points (Catmull-Rom), with spaces every `gap` units measured in
 * 3D, so climbs don't bunch up. Points are [x, z] (height from the hills) or [x, z, y].
 * `ends` false leaves off the first and last control points (they are usually existing spaces).
 */
export function trail(ctrl: (Pt | Pt3)[], gap: number, hills?: Hill[], o: { closed?: boolean; ends?: boolean } = {}): Pt3[] {
  const P: Pt3[] = ctrl.map((p) => (p.length > 2 ? (p as Pt3) : [p[0], p[1], groundAt(hills, p[0], p[1])]));
  const n = P.length;
  const get = (i: number) => (o.closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const dense: Pt3[] = [];
  const segs = o.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const c = (j: number) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      dense.push([c(0), c(1), c(2)]);
    }
  }
  if (!o.closed) dense.push(P[n - 1]);
  // explicit heights stay; ground heights follow the hills under the curve
  if (hills) for (const d of dense) d[2] = groundAt(hills, d[0], d[1]);
  const len = (a: Pt3, b: Pt3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + len(dense[i - 1], dense[i]));
  const total = acc[acc.length - 1] + (o.closed ? len(dense[dense.length - 1], dense[0]) : 0);
  const count = Math.max(1, Math.round(total / gap));
  const out: Pt3[] = [];
  let j = 0;
  const first = o.closed || o.ends !== false ? 0 : 1;
  const last = o.closed ? count - 1 : o.ends !== false ? count : count - 1;
  for (let k = first; k <= last; k++) {
    const target = (k / count) * total;
    while (j < acc.length - 2 && acc[j + 1] < target) j++;
    const a = dense[j], b = dense[Math.min(dense.length - 1, j + 1)];
    const f = Math.max(0, Math.min(1, (target - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j])));
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  return out;
}
