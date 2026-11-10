import type { BoardNode, SpaceType } from './types';

export type Pt = [number, number];

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

const CODES: Record<string, SpaceType> = { B: 'blue', R: 'red', E: 'event', L: 'lucky' };

export class Builder {
  nodes: Record<string, BoardNode> = {};

  /** Nodes along pts, linked in order. `pattern` letters (B R E L) repeat to type them. */
  chain(prefix: string, pts: Pt[], pattern: string, loop = false): string[] {
    const ids = pts.map((_, i) => `${prefix}${i}`);
    pts.forEach(([x, z], i) => {
      this.nodes[ids[i]] = { id: ids[i], x, z, type: CODES[pattern[i % pattern.length]] ?? 'blue', next: [] };
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
