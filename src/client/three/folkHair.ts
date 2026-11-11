import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Strand-by-strand hair for the Choppy crew. Each head gets a few hundred little tapered
 * clumps (or curls) grown from roots on its scalp and combed by a simple flow field, then
 * merged into two meshes (top and sides) so a full lobby is still only two draw calls each.
 */

export interface HairParams {
  color: string;
  /** strand length on top of the head */
  top: number;
  /** how far down the sides and back the hair reaches (0 = shaved) */
  sides: number;
  /** strand length on the sides/back (how thick that hair looks) */
  sideLen: number;
  /** main combing direction on top */
  flow: 'back' | 'up' | 'forward' | 'out';
  /** x of a parting: strands lean away from it */
  part?: number;
  /** how much the front rises (quiff) */
  lift?: number;
  /** how far strands hang over the forehead */
  fringe?: number;
  /** which way the fringe sweeps (-1 left .. 1 right); with a part, it splits away from it */
  fringeSide?: number;
  /** messiness and bend, 0..1 */
  wave?: number;
  /** 0 = straight strands, 1 = all curls, in between = a mix */
  curl?: number;
  curlSize?: number;
  /** how far the hair stands off the scalp */
  volume?: number;
  /** strand radius */
  thick?: number;
  /** bare temples (front corners) */
  recede?: number;
  /** roots per side of the scalp grid */
  grid?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildStrandHair(seed: string, p: HairParams, HEAD: number): { top: THREE.Mesh; sides: THREE.Mesh } {
  const H = HEAD / 2;
  const T = HEAD;
  const r = rng(hash(seed + ':hair'));
  const base = new THREE.Color(p.color);
  // shade in linear space by scaling, which keeps dark hair dark instead of washing it grey
  const dark = base.clone().multiplyScalar(0.62);
  const light = base.clone().multiplyScalar(1.45);
  const wave = p.wave ?? 0.3;
  const vol = p.volume ?? 0.8;
  const thick = p.thick ?? 0.06;
  const curl = p.curl ?? 0;
  const cs = p.curlSize ?? 0.1;
  const topGeos: THREE.BufferGeometry[] = [];
  const sideGeos: THREE.BufferGeometry[] = [];

  const paint = (g: THREE.BufferGeometry, c: THREE.Color, tipLift = 0) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const pos = g.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    for (let i = 0; i < n; i++) {
      // tips catch a little more light than roots
      const k = tipLift * ((pos.getY(i) - minY) / Math.max(1e-6, maxY - minY));
      const cc = c.clone().lerp(light, k);
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const tone = () => dark.clone().lerp(light, 0.15 + r() * 0.6);

  /** One clump: two tapered capsule segments, the second bent by `bend`. */
  const strand = (out: THREE.BufferGeometry[], root: THREE.Vector3, dir: THREE.Vector3, len: number, bend: THREE.Vector3, rad = thick) => {
    const c = tone();
    let start = root.clone();
    let d = dir.clone().normalize();
    const segs = len > 0.12 ? 2 : 1;
    for (let s = 0; s < segs; s++) {
      const L = len / segs;
      const rr = rad * (s === 0 ? 1 : 0.72);
      const g = new THREE.CapsuleGeometry(rr, Math.max(0.01, L - rr), 2, 6).toNonIndexed();
      g.scale(1.6, 1, 0.75); // flat, like a lock of hair
      paint(g, c, s === segs - 1 ? 0.5 : 0.15);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
      // spin the flat side to face out from the head a bit randomly
      const spin = new THREE.Quaternion().setFromAxisAngle(d, r() * Math.PI);
      const m = new THREE.Matrix4().compose(start.clone().addScaledVector(d, L / 2), spin.multiply(q), new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      out.push(g);
      start = start.clone().addScaledVector(d, L * 0.8);
      d = d.clone().add(bend).normalize();
    }
  };
  const curlBlob = (out: THREE.BufferGeometry[], at: THREE.Vector3, rad: number) => {
    const g = new THREE.IcosahedronGeometry(rad, 1);
    g.scale(1, 0.85 + r() * 0.3, 1);
    g.rotateY(r() * 6);
    paint(g, tone(), 0.35);
    g.translate(at.x, at.y, at.z);
    out.push(g);
  };
  const jit = (a: number) => (r() - 0.5) * a;

  // ---------------- under-layer: a snug cap and side plates so no scalp shows between strands
  const shellMat = dark.clone().lerp(base, 0.7);
  const recede = p.recede ?? 0;
  if (p.top > 0) {
    const g = new THREE.BoxGeometry(HEAD - 0.04, 0.06, HEAD - 0.1 - recede * 0.6).toNonIndexed();
    paint(g, shellMat);
    g.translate(0, T - 0.01, -0.04 - recede * 0.3);
    topGeos.push(g);
  }
  if (p.sides > 0) {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.03, p.sides, HEAD - 0.22).toNonIndexed();
      paint(g, shellMat);
      g.translate(sx * (H + 0.015), T - p.sides / 2 + 0.01, -0.11);
      sideGeos.push(g);
    }
    const g = new THREE.BoxGeometry(HEAD + 0.03, p.sides + 0.08, 0.03).toNonIndexed();
    paint(g, shellMat);
    g.translate(0, T - (p.sides + 0.08) / 2 + 0.01, -H - 0.015);
    sideGeos.push(g);
  }

  // ---------------- top
  const n = p.grid ?? 9;
  const flowVec = (x: number, z: number) => {
    switch (p.flow) {
      case 'back':
        return new THREE.Vector3(x * 0.25, 0, -1);
      case 'forward':
        return new THREE.Vector3(x * 0.3, 0, 1);
      case 'up':
        return new THREE.Vector3(x * 0.2, 0.3, -0.8);
      case 'out':
        return new THREE.Vector3(x, 0, z * 0.6 - 0.2);
    }
  };
  if (p.top > 0) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = -H + 0.04 + ((i + 0.5 + jit(0.8)) / n) * (HEAD - 0.08);
        const z = -H + 0.04 + ((j + 0.5 + jit(0.8)) / n) * (HEAD - 0.08);
        // bare temples
        if (recede > 0 && z > H - recede && Math.abs(x) > H - recede * 1.6) continue;
        const front = THREE.MathUtils.clamp((z + H * 0.2) / (H * 1.2), 0, 1);
        const crown = 1 - Math.min(1, Math.hypot(x / H, z / H) * 0.6);
        const root = new THREE.Vector3(x, T + 0.02 + vol * 0.07 * crown + (p.lift ?? 0) * 0.12 * front * front, z);
        if (r() < curl) {
          // a stack of curls, bigger and higher toward the middle
          const layers = 1 + Math.round(vol * 1.5);
          for (let k = 0; k < layers; k++) {
            const rad = cs * (0.75 + r() * 0.5);
            curlBlob(topGeos, root.clone().add(new THREE.Vector3(jit(0.12), cs * 0.4 + k * cs * 0.9 * (1 - Math.abs(x) / H * 0.4), jit(0.12))), rad);
          }
          continue;
        }
        const dir = flowVec(x / H, z / H);
        if (p.part !== undefined) dir.x += Math.sign(x - p.part || 1) * 0.9 * (1 - Math.min(1, Math.abs(x - p.part) * 1.2) * 0.4);
        dir.y += 0.06 + vol * 0.16 + (p.lift ?? 0) * 1.8 * front * front;
        dir.x += jit(wave);
        dir.z += jit(wave * 0.6);
        dir.y += jit(wave * 0.4);
        const len = p.top * (0.75 + r() * 0.5) * (1 + (p.lift ?? 0) * 0.4 * front);
        const bend = new THREE.Vector3(jit(wave * 0.6), -0.55 - wave * 0.2, p.flow === 'forward' ? 0.3 : -0.5);
        // a quiff: front locks rise, then roll back over the top
        if ((p.lift ?? 0) > 0 && front > 0.5) bend.set(bend.x, -0.25, -0.9 - (p.lift ?? 0) * 0.4);
        if (p.flow === 'out') bend.set(Math.sign(x || 1) * 0.3, -0.7, 0);
        strand(topGeos, root, dir, len, bend, thick * (0.8 + r() * 0.5));
      }
  }

  // ---------------- fringe over the forehead
  if (p.fringe && p.fringe > 0) {
    const m = Math.round(n * 1.1);
    for (let i = 0; i < m; i++) {
      const x = -H + 0.08 + ((i + 0.5 + jit(0.6)) / m) * (HEAD - 0.16);
      if (recede > 0 && Math.abs(x) > H - recede * 1.6) continue;
      let side = p.fringeSide ?? 0;
      if (p.part !== undefined) side = Math.sign(x - p.part || 1) * 0.9;
      if (r() < curl) {
        const drop = r() * p.fringe;
        curlBlob(topGeos, new THREE.Vector3(x + side * drop * 0.5, T - drop + cs * 0.5, H + cs * 0.5), cs * (0.7 + r() * 0.5));
        continue;
      }
      const root = new THREE.Vector3(x, T + 0.06, H - 0.08);
      const dir = new THREE.Vector3(side * 0.7 + jit(wave * 0.5), -0.15, 1);
      const bend = new THREE.Vector3(side * 0.5, -1.3, -0.25);
      strand(topGeos, root, dir, p.fringe * (0.7 + r() * 0.6) + 0.1, bend, thick * 0.9);
    }
  }

  // ---------------- sides and back
  if (p.sides > 0 && p.sideLen > 0.015) {
    const rows = Math.max(2, Math.round(p.sides / 0.12));
    const cols = Math.round(n * 0.8);
    for (const sx of [-1, 1])
      for (let a = 0; a < rows; a++)
        for (let b = 0; b < cols; b++) {
          const y = T - 0.02 - ((a + jit(0.6)) / rows) * p.sides * 0.8;
          const z = -H + 0.06 + ((b + 0.5 + jit(0.6)) / cols) * (HEAD - 0.3);
          if (r() < curl * 0.8) {
            curlBlob(sideGeos, new THREE.Vector3(sx * (H + cs * 0.3), y, z), cs * 0.75 * (0.8 + r() * 0.4));
            continue;
          }
          const dir = new THREE.Vector3(sx * 0.3, -1, -0.35 + jit(wave));
          strand(sideGeos, new THREE.Vector3(sx * (H + 0.01), y, z), dir, p.sideLen * (0.8 + r() * 0.4), new THREE.Vector3(sx * -0.2, -0.2, 0), thick * 0.8);
        }
    for (let a = 0; a < rows; a++)
      for (let b = 0; b < n; b++) {
        const y = T - 0.02 - ((a + jit(0.6)) / rows) * p.sides * 0.85;
        const x = -H + 0.04 + ((b + 0.5 + jit(0.6)) / n) * (HEAD - 0.08);
        if (r() < curl * 0.8) {
          curlBlob(sideGeos, new THREE.Vector3(x, y, -H - cs * 0.3), cs * 0.75 * (0.8 + r() * 0.4));
          continue;
        }
        const dir = new THREE.Vector3(jit(wave * 0.5), -1, -0.3);
        strand(sideGeos, new THREE.Vector3(x, y, -H - 0.01), dir, p.sideLen * (0.8 + r() * 0.4), new THREE.Vector3(0, -0.2, 0.25), thick * 0.8);
      }
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
  const make = (list: THREE.BufferGeometry[]) => {
    for (const g of list) {
      // keep attribute sets identical for merging
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    }
    const geo = list.length ? mergeGeometries(list)! : new THREE.BufferGeometry();
    list.forEach((g) => g.dispose());
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  return { top: make(topGeos), sides: make(sideGeos) };
}
