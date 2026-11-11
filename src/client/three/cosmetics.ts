import * as THREE from 'three';
import { mesh, toy, darken, lighten } from './kit';
import { prop } from './assets';
import { BODY, HEAD, rbox, buildBackwardsCap, type FolkModel } from './folks';

/**
 * Customize: hats, shirts and accessories for the Choppy crew. Everything is built in code from
 * chunky rounded blocks and flat toy colours so it sits next to the Kenney kits, and held props
 * reuse Kenney models where the kits have one (sword, shield, spatula, pan, lantern...).
 *
 * Many pieces take the player's colour, so a player stays easy to spot whatever they wear.
 * `applyLook(folk, look)` dresses a FolkModel; call it again any time to change the outfit.
 */

export interface Look {
  /** '' = the character's own (e.g. Fick's cap), 'bare' = nothing */
  hat: string;
  shirt: string;
  /** '' = none */
  acc: string;
}

export const DEFAULT_LOOK: Look = { hat: '', shirt: 'tee', acc: '' };

export type Category = 'hat' | 'shirt' | 'acc';

export interface Cosmetic {
  id: string;
  name: string;
  cat: Category;
}

interface HatDef extends Cosmetic {
  cat: 'hat';
  /** keep the top of the hair showing (headbands, halos, headphones) */
  keepHair?: boolean;
  build(c: string): THREE.Object3D;
}

interface ShirtDef extends Cosmetic {
  cat: 'shirt';
  /** pattern painted over the whole shirt (sleeves too) */
  tex?: (c: string) => HTMLCanvasElement;
  /** flat colour of the shirt when there's no pattern (default: player colour) */
  base?: (c: string) => string;
  /** colour of the sleeves when they differ from the body */
  sleeve?: (c: string) => string;
  /** colour of the collar and hem */
  trim?: (c: string) => string;
  sleeves?: 'short' | 'none' | 'long';
  /** extra pieces: `torso` is at the chest centre, `arms` are the two arm pivots */
  extra?: (o: { torso: THREE.Group; arms: THREE.Group[]; c: string }) => void;
}

interface AccDef extends Cosmetic {
  cat: 'acc';
  slot: 'face' | 'neck' | 'back' | 'hand';
  /** take off the character's own glasses so these fit */
  hideGlasses?: boolean;
  build(c: string): THREE.Object3D;
}

// ------------------------------------------------------------------ helpers

const H = HEAD / 2;
const TW = BODY.torsoW;
const TH = BODY.torsoH;
const TD = BODY.torsoD;

type V3 = [number, number, number];

function part(geo: THREE.BufferGeometry, mat: THREE.Material | string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale?: V3): THREE.Mesh {
  const m = mesh(geo, typeof mat === 'string' ? toy(mat, 0.55) : mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  return m;
}
const box = (w: number, h: number, d: number, mat: THREE.Material | string, pos?: V3, rot?: V3, r = 0.04) => part(rbox(w, h, d, r), mat, pos, rot);
const cyl = (rt: number, rb: number, h: number, mat: THREE.Material | string, pos?: V3, rot?: V3, seg = 24) =>
  part(new THREE.CylinderGeometry(rt, rb, h, seg), mat, pos, rot);
const ball = (r: number, mat: THREE.Material | string, pos?: V3, scale?: V3) => part(new THREE.SphereGeometry(r, 16, 12), mat, pos, [0, 0, 0], scale);
const metal = (color: string, rough = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: rough });
const glow = (color: string, k = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const css = (c: THREE.Color) => `#${c.getHexString()}`;
const dk = (c: string, a: number) => css(darken(c, a));
const lt = (c: string, a: number) => css(lighten(c, a));

function group(...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const k of kids) g.add(k);
  return g;
}

/** Animate something without touching the model's update loop. */
function animate(o: THREE.Object3D, fn: (t: number) => void): void {
  const host = o instanceof THREE.Mesh ? o : (o.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined);
  if (!host) return;
  const prev = host.onBeforeRender;
  host.onBeforeRender = function (...args) {
    fn(performance.now() / 1000);
    prev.apply(this, args);
  };
}

/** A Kenney prop, scaled so its longest side is `size` and its base (or centre) at the origin. */
function kenney(name: string, size: number, anchor: 'base' | 'centre' = 'base'): THREE.Object3D {
  const inner = prop(name);
  const b = new THREE.Box3().setFromObject(inner);
  const g = new THREE.Group();
  if (b.isEmpty()) return g;
  const s = b.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  inner.scale.multiplyScalar(k);
  const c = b.getCenter(new THREE.Vector3()).multiplyScalar(k);
  inner.position.set(-c.x, anchor === 'base' ? -b.min.y * k : -c.y, -c.z);
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.add(inner);
  return g;
}

function canvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return [cv, cv.getContext('2d')!];
}

const texCache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, make: () => HTMLCanvasElement): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}
const texMat = (key: string, make: () => HTMLCanvasElement, rough = 0.6) => new THREE.MeshStandardMaterial({ map: tex(key, make), roughness: rough });

/** Text or a symbol on a small front patch. */
function decal(draw: (ctx: CanvasRenderingContext2D, s: number) => void, key: string, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ map: tex(key, () => {
    const [cv, ctx] = canvas(256);
    draw(ctx, 256);
    return cv;
  }), transparent: true, roughness: 0.6 });
  return mesh(new THREE.PlaneGeometry(w, h), mat, { cast: false });
}

/** Seeded random for patterns, so a shirt looks the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------ hats (origin = top of head)

/** a soft crown that hugs the cube head */
const crownBox = (c: string | THREE.Material, h = 0.42, y = 0.06, grow = 0.1, r = 0.18) => box(HEAD + grow, h, HEAD + grow, c, [0, y, 0], [0, 0, 0], r);

function spinny(o: THREE.Object3D, speed: number, axis: 'y' | 'z' = 'y'): void {
  animate(o, (t) => (o.rotation[axis] = t * speed));
}

function headband(color: string): THREE.Mesh {
  // a thin arc over the top of the head, ear to ear
  const m = part(new THREE.TorusGeometry(H + 0.05, 0.045, 6, 24, Math.PI), color, [0, -H + 0.02, 0.05], [0, 0, 0], [1, 1.25, 1]);
  return m;
}

function bentCone(color: string, r: number, h: number, bend: number, segs = 4): THREE.Group {
  // a cone in stacked tapering pieces that lean over more each step (wizard / santa hats)
  const g = new THREE.Group();
  let y = 0;
  let x = 0;
  let a = 0;
  const parent = g;
  for (let i = 0; i < segs; i++) {
    const r0 = r * (1 - i / segs);
    const r1 = r * (1 - (i + 1) / segs);
    const hh = h / segs;
    const piece = cyl(Math.max(0.02, r1), r0, hh, color, [x, y + hh / 2, 0], [0, 0, a], 20);
    parent.add(piece);
    y += Math.cos(a) * hh;
    x -= Math.sin(a) * hh;
    a += bend / segs;
  }
  g.userData.tip = new THREE.Vector3(x, y, 0);
  return g;
}

function partyConeTex(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(128);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : c;
    ctx.fillRect(0, i * 16, 128, 16);
  }
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.arc((i * 37) % 128, (i * 53) % 128, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}

const HATS: HatDef[] = [
  { id: 'cap', name: 'Ball Cap', cat: 'hat', build: (c) => group(crownBox(c), box(0.9, 0.06, 0.55, dk(c, 0.1), [0, -0.1, H + 0.3], [0.1, 0, 0], 0.03), ball(0.07, c, [0, 0.28, 0]), box(0.3, 0.16, 0.02, '#ffffff', [0, 0.05, H + 0.06], [0, 0, 0], 0.02)) },
  { id: 'capback', name: 'Backwards Cap', cat: 'hat', build: (c) => buildBackwardsCap(c) },
  {
    id: 'beanie', name: 'Beanie', cat: 'hat',
    build: (c) => group(crownBox(c, 0.52, 0.08, 0.12, 0.24), box(HEAD + 0.18, 0.18, HEAD + 0.18, dk(c, 0.18), [0, -0.12, 0], [0, 0, 0], 0.07)),
  },
  {
    id: 'bobble', name: 'Bobble Hat', cat: 'hat',
    build: (c) => {
      const g = group(crownBox(c, 0.56, 0.1, 0.12, 0.24), box(HEAD + 0.18, 0.18, HEAD + 0.18, '#ffffff', [0, -0.12, 0], [0, 0, 0], 0.07), box(HEAD + 0.15, 0.1, HEAD + 0.15, '#ffffff', [0, 0.16, 0], [0, 0, 0], 0.04));
      const pom = ball(0.2, '#ffffff', [0, 0.46, 0]);
      g.add(pom);
      animate(pom, (t) => (pom.position.x = Math.sin(t * 3) * 0.03));
      return g;
    },
  },
  {
    id: 'tophat', name: 'Top Hat', cat: 'hat',
    build: (c) => group(cyl(0.88, 0.88, 0.06, '#24222b', [0, -0.02, 0]), cyl(0.5, 0.48, 0.92, '#24222b', [0, 0.46, 0]), cyl(0.505, 0.49, 0.16, c, [0, 0.1, 0])),
  },
  {
    id: 'cowboy', name: 'Cowboy Hat', cat: 'hat',
    build: () => {
      const tan = '#b4814a';
      const brim = part(new THREE.TorusGeometry(0.78, 0.12, 8, 32), tan, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 0.88, 0.5]);
      const flat = cyl(0.8, 0.8, 0.05, tan, [0, -0.02, 0], [0, 0, 0], 32);
      flat.scale.z = 0.88;
      const crown = box(0.92, 0.5, 0.82, tan, [0, 0.26, 0], [0, 0, 0], 0.2);
      const dent = box(0.12, 0.1, 0.6, dk(tan, 0.15), [0, 0.5, 0], [0, 0, 0], 0.04);
      const band = box(0.95, 0.1, 0.85, '#5a3a22', [0, 0.06, 0], [0, 0, 0], 0.04);
      return group(brim, flat, crown, dent, band);
    },
  },
  {
    id: 'tricorn', name: 'Pirate Hat', cat: 'hat',
    build: () => {
      const g = new THREE.Group();
      g.add(crownBox('#23202a', 0.4, 0.08, 0.06, 0.18));
      // three upturned brim walls in a triangle, gold piping along the top
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
        const wall = new THREE.Group();
        wall.rotation.y = a;
        wall.add(box(1.25, 0.42, 0.08, '#23202a', [0, 0.14, 0.7], [-0.35, 0, 0], 0.04), box(1.25, 0.05, 0.1, '#e0b84a', [0, 0.34, 0.63], [-0.35, 0, 0], 0.02));
        g.add(wall);
      }
      const skull = decal((ctx, s) => {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s / 2, s * 0.42, s * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(s * 0.36, s * 0.55, s * 0.28, s * 0.16);
        ctx.fillStyle = '#23202a';
        ctx.beginPath();
        ctx.arc(s * 0.4, s * 0.42, s * 0.07, 0, Math.PI * 2);
        ctx.arc(s * 0.6, s * 0.42, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = s * 0.06;
        ctx.beginPath();
        ctx.moveTo(s * 0.15, s * 0.75);
        ctx.lineTo(s * 0.85, s * 0.95);
        ctx.moveTo(s * 0.85, s * 0.75);
        ctx.lineTo(s * 0.15, s * 0.95);
        ctx.stroke();
      }, 'skull', 0.36, 0.36);
      skull.position.set(0, 0.2, 0.76);
      skull.rotation.x = -0.35;
      g.add(skull);
      return g;
    },
  },
  {
    id: 'chef', name: 'Chef Hat', cat: 'hat',
    build: () => {
      const g = group(cyl(0.6, 0.6, 0.3, '#f7f5f0', [0, 0.08, 0]));
      for (const [x, z, r] of [[0, 0, 0.42], [-0.3, 0.1, 0.32], [0.3, 0.1, 0.32], [0, -0.3, 0.32], [0.05, 0.3, 0.3]] as const) g.add(ball(r, '#ffffff', [x, 0.55, z]));
      return g;
    },
  },
  {
    id: 'party', name: 'Party Hat', cat: 'hat',
    build: (c) => {
      const cone = part(new THREE.ConeGeometry(0.4, 1.0, 24), texMat(`party:${c}`, () => partyConeTex(c)), [0, 0.5, 0]);
      const g = group(cone, ball(0.12, '#ffd23f', [0, 1.02, 0]));
      g.rotation.z = 0.18;
      g.position.x = 0.1;
      return g;
    },
  },
  {
    id: 'crown', name: 'Crown', cat: 'hat',
    build: () => {
      const gold = metal('#ffcc33', 0.25);
      const g = group(part(new THREE.CylinderGeometry(0.58, 0.55, 0.3, 8, 1, true), gold, [0, 0.12, 0]));
      (g.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.75, roughness: 0.25, side: THREE.DoubleSide });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(part(new THREE.ConeGeometry(0.1, 0.28, 4), gold, [Math.sin(a) * 0.56, 0.4, Math.cos(a) * 0.56]));
        g.add(ball(0.05, i % 2 ? glow('#ff3d6e', 0.4) : glow('#3fa9f5', 0.4), [Math.sin(a) * 0.59, 0.42, Math.cos(a) * 0.59]));
        g.add(ball(0.05, '#ffffff', [Math.sin(a) * 0.56, 0.56, Math.cos(a) * 0.56]));
      }
      return g;
    },
  },
  {
    id: 'viking', name: 'Viking Helmet', cat: 'hat',
    build: () => {
      const steel = metal('#a9b2bd');
      const g = group(crownBox(steel, 0.5, 0.06, 0.12, 0.24), box(HEAD + 0.16, 0.12, HEAD + 0.16, metal('#8a6a3a'), [0, -0.12, 0], [0, 0, 0], 0.05), box(0.12, 0.5, 0.12, metal('#8a6a3a'), [0, -0.05, H + 0.07], [0, 0, 0], 0.04));
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4 * s, 0.05, 0), new THREE.Vector3(0.5 * s, 0.55, 0)), 12, 0.09, 8), toy('#f1e6c8', 0.5));
        horn.position.set(s * (H + 0.02), 0.05, 0);
        horn.castShadow = true;
        const tip = part(new THREE.ConeGeometry(0.09, 0.18, 8), '#f1e6c8', [s * (H + 0.52), 0.66, 0], [0, 0, -s * 0.2]);
        g.add(horn, tip);
      }
      return g;
    },
  },
  {
    id: 'hardhat', name: 'Hard Hat', cat: 'hat',
    build: () => group(part(new THREE.SphereGeometry(0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#ffc61a', [0, -0.08, 0], [0, 0, 0], [1, 0.75, 1]), cyl(0.82, 0.82, 0.06, '#f2b400', [0, -0.08, 0.06], [0, 0, 0], 32), box(0.12, 0.08, 1.1, '#f2b400', [0, 0.42, 0], [0, 0, 0], 0.03)),
  },
  {
    id: 'propeller', name: 'Propeller Cap', cat: 'hat',
    build: (c) => {
      const g = new THREE.Group();
      const cols = [c, '#ffd23f', '#3fa9f5', '#ff4d5a'];
      for (let i = 0; i < 4; i++) g.add(part(new THREE.SphereGeometry(0.68, 12, 8, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), cols[i], [0, -0.06, 0], [0, 0, 0], [1, 0.62, 1]));
      g.add(box(0.7, 0.05, 0.4, dk(c, 0.1), [0, -0.06, H + 0.16], [0.1, 0, 0], 0.02), cyl(0.03, 0.03, 0.25, metal('#c0c0c0'), [0, 0.46, 0]));
      const blades = group(box(0.9, 0.03, 0.14, '#ff4d5a', [0, 0, 0], [0.3, 0, 0], 0.02), box(0.14, 0.03, 0.9, '#3fa9f5', [0, 0, 0], [0, 0, 0.3], 0.02), ball(0.06, '#ffd23f'));
      blades.position.y = 0.58;
      spinny(blades, 9);
      g.add(blades);
      return g;
    },
  },
  {
    id: 'wizard', name: 'Wizard Hat', cat: 'hat',
    build: () => {
      const blue = '#3b3a9e';
      const cone = bentCone(blue, 0.55, 1.35, 0.9, 5);
      const g = group(cyl(0.95, 0.95, 0.05, blue, [0, 0, 0], [0, 0, 0], 32), cone);
      const star = (x: number, y: number, z: number, s: number) => part(new THREE.OctahedronGeometry(s), glow('#ffd23f', 0.8), [x, y, z]);
      g.add(star(0.3, 0.3, 0.42, 0.08), star(-0.2, 0.62, 0.3, 0.06), star(0.1, 0.9, 0.22, 0.05), star(0.7, 0.2, 0.3, 0.05));
      return g;
    },
  },
  {
    id: 'bucket', name: 'Bucket Hat', cat: 'hat',
    build: (c) => group(cyl(0.55, 0.68, 0.42, '#c9b98f', [0, 0.14, 0]), cyl(0.68, 0.92, 0.14, '#bfae80', [0, -0.08, 0], [0, 0, 0], 32), cyl(0.69, 0.69, 0.08, c, [0, 0.0, 0])),
  },
  {
    id: 'fedora', name: 'Fedora', cat: 'hat',
    build: (c) => {
      const grey = '#5a5662';
      const brim = cyl(0.92, 0.92, 0.05, grey, [0, -0.04, 0], [0.08, 0, 0], 32);
      brim.scale.z = 0.9;
      return group(brim, box(0.88, 0.48, 0.8, grey, [0, 0.22, 0], [0, 0, 0], 0.22), box(0.14, 0.08, 0.5, dk(grey, 0.2), [0, 0.46, 0], [0, 0, 0], 0.03), box(0.9, 0.12, 0.82, c, [0, 0.06, 0], [0, 0, 0], 0.05), box(0.12, 0.2, 0.04, lt(c, 0.3), [0.3, 0.12, 0.42], [0, 0, 0.3], 0.02));
    },
  },
  {
    id: 'sunhat', name: 'Sun Hat', cat: 'hat',
    build: (c) => {
      const straw = texMat('straw', () => {
        const [cv, ctx] = canvas(128);
        ctx.fillStyle = '#e8c97a';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#c9a457';
        ctx.lineWidth = 3;
        for (let i = 0; i < 128; i += 8) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 128);
          ctx.moveTo(0, i + 4);
          ctx.lineTo(128, i + 4);
          ctx.stroke();
        }
        return cv;
      });
      const g = group(part(new THREE.CylinderGeometry(1.15, 1.2, 0.05, 36), straw, [0, -0.04, 0]), part(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), straw, [0, -0.04, 0], [0, 0, 0], [1, 0.8, 1]), cyl(0.61, 0.61, 0.14, c, [0, 0.04, 0]));
      g.add(ball(0.12, '#ff6fa8', [0.5, 0.08, 0.32]), ball(0.1, '#ffffff', [0.62, 0.06, 0.12]));
      return g;
    },
  },
  {
    id: 'bunny', name: 'Bunny Ears', cat: 'hat', keepHair: true,
    build: () => {
      const g = group(headband('#f4f1e8'));
      for (const s of [-1, 1]) {
        const ear = group(box(0.22, 0.8, 0.1, '#f4f1e8', [0, 0.4, 0], [0, 0, 0], 0.09), box(0.12, 0.6, 0.02, '#ffb0c8', [0, 0.42, 0.05], [0, 0, 0], 0.04));
        ear.position.set(s * 0.25, 0.15, 0.05);
        ear.rotation.z = -s * 0.15;
        animate(ear, (t) => (ear.rotation.x = Math.sin(t * 2.6 + s) * 0.12 - 0.1));
        g.add(ear);
      }
      return g;
    },
  },
  {
    id: 'catears', name: 'Cat Ears', cat: 'hat', keepHair: true,
    build: (c) => {
      const g = group(headband('#2a2730'));
      for (const s of [-1, 1]) {
        g.add(part(new THREE.ConeGeometry(0.28, 0.46, 4), '#2a2730', [s * 0.38, 0.46, 0.1], [0, Math.PI / 4, -s * 0.2], [1, 1, 0.45]));
        g.add(part(new THREE.ConeGeometry(0.16, 0.3, 4), lt(c, 0.3), [s * 0.38, 0.43, 0.18], [0, Math.PI / 4, -s * 0.2], [1, 1, 0.3]));
      }
      return g;
    },
  },
  {
    id: 'halo', name: 'Halo', cat: 'hat', keepHair: true,
    build: () => {
      const ring = part(new THREE.TorusGeometry(0.42, 0.06, 10, 32), glow('#ffe680', 1.4), [0, 0.75, 0], [Math.PI / 2, 0, 0]);
      animate(ring, (t) => (ring.position.y = 0.75 + Math.sin(t * 2) * 0.05));
      return group(ring);
    },
  },
  {
    id: 'devil', name: 'Devil Horns', cat: 'hat', keepHair: true,
    build: () => {
      const g = group(headband('#a3141f'));
      for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.14, 0.5, 12), glow('#e8202e', 0.25), [s * 0.36, 0.32, 0.08], [0, 0, -s * 0.35]));
      return g;
    },
  },
  {
    id: 'space', name: 'Space Helmet', cat: 'hat', keepHair: true,
    build: (c) => {
      const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.22, roughness: 0.02, metalness: 0, clearcoat: 1, depthWrite: false });
      const dome = part(new THREE.SphereGeometry(1.14, 32, 20), glass, [0, -H - 0.04, 0]);
      dome.castShadow = false;
      const ring = part(new THREE.TorusGeometry(0.86, 0.12, 10, 32), '#f4f4f4', [0, -HEAD - 0.06, 0], [Math.PI / 2, 0, 0]);
      const stripe = part(new THREE.TorusGeometry(0.86, 0.06, 8, 32), c, [0, -HEAD + 0.02, 0], [Math.PI / 2, 0, 0]);
      const ant = cyl(0.025, 0.025, 0.4, metal('#c0c0c0'), [0.5, 0.42, -0.3]);
      const bulb = ball(0.07, glow('#ff4d5a', 1.5), [0.5, 0.64, -0.3]);
      animate(bulb, (t) => ((bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 5) > 0 ? 2 : 0.2));
      return group(dome, ring, stripe, ant, bulb);
    },
  },
  {
    id: 'santa', name: 'Holiday Hat', cat: 'hat',
    build: () => {
      const cone = bentCone('#d8232f', 0.66, 1.0, 1.4, 4);
      const tip = cone.userData.tip as THREE.Vector3;
      return group(crownBox('#d8232f', 0.3, 0.02, 0.1, 0.14), cone, box(HEAD + 0.24, 0.24, HEAD + 0.24, '#ffffff', [0, -0.08, 0], [0, 0, 0], 0.1), ball(0.17, '#ffffff', [tip.x, tip.y, 0]));
    },
  },
  {
    id: 'witch', name: 'Witch Hat', cat: 'hat',
    build: () => {
      const black = '#26212e';
      return group(cyl(1.0, 1.0, 0.05, black, [0, 0, 0], [0, 0, 0], 32), bentCone(black, 0.56, 1.3, -0.7, 5), cyl(0.565, 0.565, 0.14, '#8e44d8', [0, 0.1, 0]), box(0.2, 0.18, 0.04, metal('#ffd23f'), [0, 0.1, 0.56], [0, 0, 0], 0.02));
    },
  },
  {
    id: 'cone', name: 'Traffic Cone', cat: 'hat',
    build: () => {
      const g = group(box(1.0, 0.08, 1.0, '#ff6a13', [0, 0, 0], [0, 0, 0], 0.03), cyl(0.06, 0.42, 1.1, '#ff7a1f', [0, 0.58, 0]));
      g.add(cyl(0.255, 0.315, 0.16, '#ffffff', [0, 0.42, 0]), cyl(0.16, 0.2, 0.12, '#ffffff', [0, 0.78, 0]));
      g.rotation.z = -0.12;
      return g;
    },
  },
  {
    id: 'boppers', name: 'Alien Boppers', cat: 'hat', keepHair: true,
    build: (c) => {
      const g = group(headband('#4cd97b'));
      for (const s of [-1, 1]) {
        const stalk = group(cyl(0.025, 0.025, 0.55, '#4cd97b', [0, 0.27, 0]), ball(0.13, glow(c, 0.6), [0, 0.6, 0]));
        stalk.position.set(s * 0.3, 0.12, 0.05);
        stalk.rotation.z = -s * 0.25;
        animate(stalk, (t) => (stalk.rotation.z = -s * 0.25 + Math.sin(t * 6 + s) * 0.15));
        g.add(stalk);
      }
      return g;
    },
  },
  {
    id: 'grad', name: 'Grad Cap', cat: 'hat',
    build: (c) => {
      const g = group(crownBox('#23202a', 0.3, 0.0, 0.06, 0.1), box(1.5, 0.07, 1.5, '#23202a', [0, 0.18, 0], [0, Math.PI / 4, 0], 0.02), ball(0.06, c, [0, 0.23, 0]));
      const tassel = group(box(0.03, 0.03, 0.7, c, [0, 0, 0.35], [0, 0, 0], 0.01), cyl(0.05, 0.07, 0.3, c, [0, -0.15, 0.7]));
      tassel.position.y = 0.23;
      tassel.rotation.y = 0.6;
      g.add(tassel);
      return g;
    },
  },
  {
    id: 'headphones', name: 'Headphones', cat: 'hat', keepHair: true,
    build: (c) => {
      const band = part(new THREE.TorusGeometry(H + 0.26, 0.06, 8, 28, Math.PI), '#2a2730', [0, -H + 0.02, 0], [0, 0, 0], [0.8, 1, 1]);
      const g = group(band);
      for (const s of [-1, 1]) g.add(cyl(0.26, 0.26, 0.16, c, [s * (H + 0.1), -H + 0.02, 0], [0, 0, Math.PI / 2]), cyl(0.2, 0.2, 0.06, '#2a2730', [s * (H + 0.2), -H + 0.02, 0], [0, 0, Math.PI / 2]));
      return g;
    },
  },
  {
    id: 'sweatband', name: 'Sweatband', cat: 'hat', keepHair: true,
    build: (c) => group(box(HEAD + 0.08, 0.16, HEAD + 0.08, c, [0, -0.3, 0], [0, 0, 0], 0.06), box(0.16, 0.06, 0.02, '#ffffff', [0, -0.3, H + 0.05], [0, 0, 0], 0.02)),
  },
  {
    id: 'mushroom', name: 'Mushroom Cap', cat: 'hat',
    build: () => {
      const g = group(part(new THREE.SphereGeometry(0.95, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), '#e8323c', [0, -0.12, 0], [0, 0, 0], [1, 0.72, 1]), cyl(0.95, 0.95, 0.04, '#f3e4c8', [0, -0.12, 0], [0, 0, 0], 28));
      const spots: V3[] = [[0, 0.56, 0], [0.5, 0.34, 0.3], [-0.45, 0.36, 0.35], [0.1, 0.32, -0.6], [-0.55, 0.3, -0.25], [0.6, 0.25, -0.3], [0, 0.3, 0.66]];
      for (const p of spots) g.add(ball(0.13, '#ffffff', p, [1, 0.5, 1]));
      return g;
    },
  },
  {
    id: 'beret', name: 'Beret', cat: 'hat',
    build: (c) => group(ball(0.8, c, [-0.12, 0.08, 0], [1, 0.3, 0.95]), cyl(0.04, 0.04, 0.12, dk(c, 0.2), [-0.12, 0.3, 0])),
  },
  {
    id: 'flowers', name: 'Flower Crown', cat: 'hat', keepHair: true,
    build: () => {
      const g = group(part(new THREE.TorusGeometry(0.7, 0.05, 6, 24), '#3f9a4a', [0, 0.16, 0], [Math.PI / 2, 0, 0], [1, 1, 1]));
      const cols = ['#ff6fa8', '#ffd23f', '#ffffff', '#9a7bff', '#ff8a1f'];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = Math.sin(a) * 0.7;
        const z = Math.cos(a) * 0.7;
        g.add(ball(0.15, cols[i % 5], [x, 0.2, z], [1, 0.6, 1]), ball(0.06, '#ffcc33', [x, 0.28, z]));
      }
      return g;
    },
  },
  {
    id: 'pot', name: 'Cooking Pot', cat: 'hat',
    build: () => {
      const steel = metal('#b7bec8', 0.35);
      const g = group(cyl(0.7, 0.72, 0.7, steel, [0, 0.25, 0], [0, 0, 0], 28), cyl(0.76, 0.76, 0.06, steel, [0, -0.1, 0], [0, 0, 0], 28));
      for (const s of [-1, 1]) g.add(box(0.3, 0.08, 0.2, '#23202a', [s * 0.86, 0.35, 0], [0, 0, 0], 0.03));
      g.rotation.z = 0.08;
      return g;
    },
  },
  { id: 'bare', name: 'No Hat', cat: 'hat', keepHair: true, build: () => new THREE.Group() },
];

// ------------------------------------------------------------------ shirts

function stripes(a: string, b: string, n: number, vertical = false): () => HTMLCanvasElement {
  return () => {
    const [cv, ctx] = canvas(128);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      if (vertical) ctx.fillRect((i * 128) / n, 0, 128 / n + 1, 128);
      else ctx.fillRect(0, (i * 128) / n, 128, 128 / n + 1);
    }
    return cv;
  };
}

function plaid(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(128);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = dk(c, 0.45);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 32 + 4, 0, 14, 128);
    ctx.fillRect(0, i * 32 + 4, 128, 14);
  }
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 32 + 24, 0, 2, 128);
    ctx.fillRect(0, i * 32 + 24, 128, 2);
  }
  return cv;
}

function flowersPattern(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(256);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 256, 256);
  const r = seeded(7);
  for (let i = 0; i < 9; i++) {
    const x = r() * 256;
    const y = r() * 256;
    // leaves
    ctx.fillStyle = 'rgba(30,110,60,0.85)';
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (k ? 22 : -22), y + 14, 22, 9, k ? 0.6 : -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // five-petal flower
    ctx.fillStyle = i % 3 === 0 ? '#ffd23f' : i % 3 === 1 ? '#ffffff' : '#ff6fa8';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 12, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}

function tieDye(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(256);
  const cols = [c, '#ffd23f', '#ff6fa8', '#3fa9f5', lt(c, 0.35)];
  for (let r = 360; r > 0; r -= 18) {
    ctx.fillStyle = cols[(r / 18) % cols.length];
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const rr = r * (1 + Math.sin(a * 5 + r * 0.05) * 0.12);
      const x = 128 + Math.cos(a + r * 0.01) * rr;
      const y = 128 + Math.sin(a + r * 0.01) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();
  }
  return cv;
}

function camo(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(256);
  ctx.fillStyle = '#6b7a45';
  ctx.fillRect(0, 0, 256, 256);
  const r = seeded(3);
  for (const col of ['#4a5530', dk(c, 0.3), '#a39563', c]) {
    ctx.fillStyle = col;
    for (let i = 0; i < 9; i++) {
      const x = r() * 256;
      const y = r() * 256;
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = 14 + r() * 22;
        ctx.lineTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr);
      }
      ctx.fill();
    }
  }
  return cv;
}

function argyle(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(128);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = dk(c, 0.3);
  for (const [x, y] of [[0, 0], [64, 64], [128, 0], [0, 128], [128, 128]]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 32);
    ctx.lineTo(x + 32, y);
    ctx.lineTo(x, y + 32);
    ctx.lineTo(x - 32, y);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(128, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(0, 128);
  ctx.stroke();
  return cv;
}

function holiday(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(128);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  for (const y of [20, 98]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 128; x += 16) ctx.lineTo(x + 8, y + (x % 32 ? -10 : 10));
    ctx.lineTo(128, y + 8);
    ctx.lineTo(0, y + 8);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (const x of [22, 64, 106]) {
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(x, 60);
      ctx.rotate((k * Math.PI) / 3);
      ctx.fillRect(-12, -2, 24, 4);
      ctx.restore();
    }
  }
  ctx.fillStyle = '#21c45a';
  ctx.fillRect(0, 0, 128, 6);
  ctx.fillRect(0, 122, 128, 6);
  return cv;
}

function fluffy(c: string): HTMLCanvasElement {
  const [cv, ctx] = canvas(128);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 128, 128);
  const r = seeded(11);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(r() * 128, r() * 128, 3, 3);
  }
  return cv;
}

function denim(base: string): () => HTMLCanvasElement {
  return () => {
    const [cv, ctx] = canvas(128);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = -128; i < 128; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.stroke();
    }
    return cv;
  };
}

/** Front of the torso in torso-slot space. */
const FZ = TD / 2 + 0.012;
const front = (o: THREE.Object3D, y = 0, x = 0, z = FZ) => {
  o.position.set(x, y, z);
  return o;
};

function buttons(n: number, color: string, x = 0, top = 0.2, step = 0.13): THREE.Object3D[] {
  return Array.from({ length: n }, (_, i) => front(cyl(0.035, 0.035, 0.02, color, [0, 0, 0], [Math.PI / 2, 0, 0], 10), top - i * step, x, FZ + 0.01));
}

/** Two lapels/collar flaps meeting in a V at the chest. */
function lapels(color: string, depth = 0.3): THREE.Object3D[] {
  return [-1, 1].map((s) => front(box(0.2, depth, 0.04, color, [0, 0, 0], [0, 0, s * 0.35], 0.02), TH / 2 - depth / 2 - 0.02, s * 0.12, FZ + 0.02));
}

/** Long sleeves: cover the forearms. */
function longSleeves(arms: THREE.Group[], color: string | THREE.Material, cuff?: string): void {
  for (const arm of arms) {
    arm.add(box(0.24, 0.3, 0.26, color, [0, -0.37, 0], [0, 0, 0], 0.05));
    if (cuff) arm.add(box(0.25, 0.07, 0.27, cuff, [0, -0.49, 0], [0, 0, 0], 0.02));
  }
}

/** A jacket shell over the tee, open at the front so the shirt shows. */
function jacket(torso: THREE.Group, mat: THREE.Material | string, opening = 0.26, long = 0): void {
  const w = (TW + 0.06 - opening) / 2;
  for (const s of [-1, 1]) torso.add(box(w, TH + 0.04 + long, 0.1, mat, [s * (opening / 2 + w / 2), -long / 2, TD / 2 + 0.01], [0, 0, 0], 0.04));
  torso.add(box(TW + 0.06, TH + 0.04 + long, TD - 0.04, mat, [0, -long / 2, -0.03], [0, 0, 0], 0.08));
}

const SHIRTS: ShirtDef[] = [
  { id: 'tee', name: 'Plain Tee', cat: 'shirt' },
  { id: 'stripes', name: 'Striped Tee', cat: 'shirt', tex: (c) => stripes(c, '#ffffff', 8)() },
  {
    id: 'ringer', name: 'Ringer Tee', cat: 'shirt', trim: () => '#ffffff',
    extra: ({ arms }) => arms.forEach((a) => a.add(box(0.28, 0.07, 0.32, '#ffffff', [0, -0.25, 0], [0, 0, 0], 0.02))),
  },
  {
    id: 'hoodie', name: 'Hoodie', cat: 'shirt', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, c, dk(c, 0.2));
      torso.add(front(box(0.5, 0.22, 0.04, dk(c, 0.12), [0, 0, 0], [0, 0, 0], 0.03), -0.14));
      torso.add(box(0.62, 0.34, 0.22, dk(c, 0.1), [0, TH / 2 + 0.02, -TD / 2 - 0.02], [0.4, 0, 0], 0.1));
      for (const s of [-1, 1]) torso.add(front(cyl(0.015, 0.015, 0.24, '#ffffff', [0, 0, 0], [0, 0, 0], 6), 0.16, s * 0.1));
    },
  },
  {
    id: 'jersey', name: 'Hoops Jersey', cat: 'shirt', sleeves: 'none', trim: () => '#ffffff',
    extra: ({ torso, c }) => {
      const num = decal((ctx, s) => {
        ctx.font = `900 ${s * 0.8}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = s * 0.08;
        ctx.strokeStyle = dk(c, 0.4);
        ctx.strokeText('7', s / 2, s * 0.54);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('7', s / 2, s * 0.54);
      }, `num7:${c}`, 0.42, 0.42);
      torso.add(front(num, 0.02));
    },
  },
  { id: 'tank', name: 'Tank Top', cat: 'shirt', sleeves: 'none', tex: (c) => stripes(c, lt(c, 0.2), 2, true)() },
  {
    id: 'hawaiian', name: 'Hawaiian Shirt', cat: 'shirt', tex: flowersPattern,
    extra: ({ torso, c }) => torso.add(...lapels(dk(c, 0.1), 0.24), ...buttons(3, '#ffffff', 0, 0.06)),
  },
  { id: 'flannel', name: 'Flannel', cat: 'shirt', sleeves: 'long', tex: plaid, extra: ({ torso, arms, c }) => (longSleeves(arms, texMat(`plaid:${c}`, () => plaid(c))), torso.add(...buttons(4, '#f4f1e8', 0, 0.2))) },
  {
    id: 'tux', name: 'Tuxedo', cat: 'shirt', base: () => '#ffffff', sleeve: () => '#1f1d26', trim: () => '#1f1d26', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#1f1d26', '#ffffff');
      jacket(torso, '#1f1d26', 0.28);
      torso.add(...lapels('#2f2c38', 0.36));
      const bow = group(box(0.14, 0.11, 0.05, c, [-0.08, 0, 0], [0, 0, 0.4], 0.03), box(0.14, 0.11, 0.05, c, [0.08, 0, 0], [0, 0, -0.4], 0.03), box(0.06, 0.07, 0.06, dk(c, 0.2)));
      torso.add(front(bow, TH / 2 - 0.06, 0, FZ + 0.05));
      torso.add(front(box(0.1, 0.06, 0.03, c), 0.14, -0.28, FZ + 0.08));
      torso.add(...buttons(2, '#1f1d26', 0, 0.08, 0.12));
    },
  },
  {
    id: 'suit', name: 'Suit and Tie', cat: 'shirt', base: () => '#ffffff', sleeve: () => '#3b4a6b', trim: () => '#3b4a6b', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#3b4a6b', '#ffffff');
      jacket(torso, '#3b4a6b', 0.26);
      torso.add(...lapels('#33405c', 0.3));
      torso.add(front(box(0.09, 0.08, 0.04, c), TH / 2 - 0.07, 0, FZ + 0.04), front(box(0.12, 0.4, 0.03, c, [0, 0, 0], [0, 0, 0], 0.02), 0.06, 0, FZ + 0.035));
    },
  },
  {
    id: 'overalls', name: 'Overalls', cat: 'shirt',
    extra: ({ torso }) => {
      const blue = '#3f63a8';
      torso.add(front(box(0.5, 0.34, 0.05, blue, [0, 0, 0], [0, 0, 0], 0.03), -0.12), box(TW + 0.06, 0.2, TD + 0.06, blue, [0, -TH / 2 + 0.06, 0], [0, 0, 0], 0.05));
      for (const s of [-1, 1]) {
        torso.add(front(box(0.1, 0.4, 0.04, blue), 0.14, s * 0.2), box(0.1, 0.5, 0.04, blue, [s * 0.2, 0.08, -TD / 2 - 0.01]), front(cyl(0.04, 0.04, 0.03, metal('#ffd23f'), [0, 0, 0], [Math.PI / 2, 0, 0], 10), 0.04, s * 0.2, FZ + 0.04));
        torso.add(box(0.1, 0.06, TD + 0.04, blue, [s * 0.2, TH / 2 + 0.01, 0], [0, 0, 0], 0.02));
      }
      torso.add(front(box(0.2, 0.12, 0.02, '#35558f'), -0.08, 0, FZ + 0.04));
    },
  },
  {
    id: 'labcoat', name: 'Lab Coat', cat: 'shirt', sleeves: 'long', sleeve: () => '#f7f7f7',
    extra: ({ torso, arms }) => {
      longSleeves(arms, '#f7f7f7');
      jacket(torso, '#f7f7f7', 0.22, 0.2);
      torso.add(...lapels('#ececec', 0.3));
      torso.add(front(box(0.16, 0.14, 0.02, '#ececec'), 0.06, -0.24, FZ + 0.05), front(cyl(0.015, 0.015, 0.14, '#3fa9f5', [0, 0, 0], [0, 0, 0], 6), 0.14, -0.27, FZ + 0.07), front(cyl(0.015, 0.015, 0.14, '#ff4d5a', [0, 0, 0], [0, 0, 0], 6), 0.14, -0.22, FZ + 0.07));
    },
  },
  {
    id: 'chef', name: 'Chef Jacket', cat: 'shirt', base: () => '#fbfaf6', sleeve: () => '#fbfaf6', trim: () => '#fbfaf6', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#fbfaf6', '#e8e4da');
      for (const x of [-0.13, 0.13]) torso.add(...buttons(3, '#23202a', x, 0.14, 0.14));
      torso.add(front(box(0.34, 0.12, 0.06, c, [0, 0, 0], [0, 0, 0], 0.04), TH / 2 - 0.04, 0, FZ + 0.01), front(part(new THREE.ConeGeometry(0.1, 0.18, 3), c, [0, 0, 0], [0, 0, Math.PI]), TH / 2 - 0.16, 0, FZ + 0.04));
    },
  },
  {
    id: 'varsity', name: 'Varsity Jacket', cat: 'shirt', sleeve: () => '#f4f1e8', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#f4f1e8');
      for (const a of arms) a.add(box(0.25, 0.08, 0.27, stripesMat(c), [0, -0.49, 0], [0, 0, 0], 0.02));
      torso.add(box(TW + 0.06, 0.1, TD + 0.06, stripesMat(c), [0, -TH / 2 + 0.05, 0], [0, 0, 0], 0.03));
      const letter = decal((ctx, s) => {
        ctx.font = `900 ${s * 0.9}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = s * 0.12;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText('C', s / 2, s * 0.55);
        ctx.fillStyle = dk(c, 0.4);
        ctx.fillText('C', s / 2, s * 0.55);
      }, `varsityC:${c}`, 0.26, 0.26);
      torso.add(front(letter, 0.08, -0.2), ...buttons(4, '#f4f1e8', 0.02, 0.2, 0.13));
    },
  },
  {
    id: 'puffer', name: 'Puffer Vest', cat: 'shirt', base: () => '#f4f1e8', sleeve: () => '#f4f1e8',
    extra: ({ torso, c }) => {
      for (let i = 0; i < 4; i++) torso.add(box(TW + 0.12, 0.17, TD + 0.12, c, [0, TH / 2 - 0.09 - i * 0.16, 0], [0, 0, 0], 0.08));
      torso.add(front(box(0.03, TH, 0.02, metal('#c0c0c0')), 0, 0, FZ + 0.07), box(0.5, 0.12, TD + 0.1, dk(c, 0.1), [0, TH / 2 + 0.04, 0], [0, 0, 0], 0.05));
    },
  },
  {
    id: 'denim', name: 'Denim Jacket', cat: 'shirt', sleeves: 'long', sleeve: () => '#4a6fae',
    extra: ({ torso, arms }) => {
      const d = texMat('denimMid', denim('#4a6fae'));
      longSleeves(arms, d, '#3d5d94');
      jacket(torso, d, 0.26);
      torso.add(...lapels('#3d5d94', 0.24), front(box(0.16, 0.12, 0.03, '#3d5d94'), 0.12, -0.27, FZ + 0.07), front(box(0.16, 0.12, 0.03, '#3d5d94'), 0.12, 0.27, FZ + 0.07));
    },
  },
  {
    id: 'leather', name: 'Leather Jacket', cat: 'shirt', sleeves: 'long', sleeve: () => '#2a2629',
    extra: ({ torso, arms }) => {
      const lea = new THREE.MeshStandardMaterial({ color: '#2a2629', roughness: 0.35, metalness: 0.1 });
      longSleeves(arms, lea, '#1d1a1c');
      jacket(torso, lea, 0.22);
      torso.add(...lapels('#1d1a1c', 0.28), front(box(0.025, TH - 0.1, 0.02, metal('#d0d0d0')), 0, 0.15, FZ + 0.08));
    },
  },
  {
    id: 'sweatervest', name: 'Sweater Vest', cat: 'shirt', base: () => '#ffffff', sleeve: () => '#ffffff', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#ffffff');
      torso.add(box(TW + 0.05, TH - 0.05, TD + 0.05, texMat(`argyle:${c}`, () => argyle(c)), [0, -0.03, 0], [0, 0, 0], 0.08));
      torso.add(...lapels('#ffffff', 0.14));
    },
  },
  { id: 'holiday', name: 'Holiday Sweater', cat: 'shirt', sleeves: 'long', tex: holiday, extra: ({ arms, c }) => longSleeves(arms, texMat(`holiday:${c}`, () => holiday(c)), '#21c45a') },
  {
    id: 'polo', name: 'Polo', cat: 'shirt',
    extra: ({ torso, c }) => {
      for (const s of [-1, 1]) torso.add(box(0.24, 0.06, 0.2, dk(c, 0.15), [s * 0.14, TH / 2 + 0.02, TD / 2 - 0.08], [0.3, 0, s * 0.2], 0.02));
      torso.add(front(box(0.1, 0.2, 0.02, dk(c, 0.1)), TH / 2 - 0.12), ...buttons(2, '#ffffff', 0, TH / 2 - 0.08, 0.1));
    },
  },
  { id: 'raglan', name: 'Raglan Tee', cat: 'shirt', base: () => '#f4f1e8', sleeve: (c) => c, sleeves: 'long', extra: ({ arms, c }) => longSleeves(arms, c) },
  { id: 'tiedye', name: 'Tie-Dye', cat: 'shirt', tex: tieDye },
  { id: 'camo', name: 'Camo', cat: 'shirt', tex: camo },
  {
    id: 'pirate', name: 'Captain Coat', cat: 'shirt', base: () => '#ffffff', sleeve: (c) => dk(c, 0.15), trim: (c) => dk(c, 0.15), sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      const coat = dk(c, 0.15);
      longSleeves(arms, coat, '#e0b84a');
      jacket(torso, coat, 0.24, 0.24);
      torso.add(box(TW + 0.1, 0.1, TD + 0.08, '#4a3020', [0, -0.12, 0], [0, 0, 0], 0.03), front(box(0.12, 0.1, 0.02, metal('#e0b84a')), -0.12, 0, FZ + 0.05));
      for (const s of [-1, 1]) torso.add(...buttons(3, '#e0b84a', s * 0.2, 0.18, 0.12).map((b) => ((b.position.z += 0.05), b)));
    },
  },
  {
    id: 'hero', name: 'Super Suit', cat: 'shirt', sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, c, '#ffd23f');
      torso.add(box(TW + 0.06, 0.1, TD + 0.06, '#ffd23f', [0, -0.2, 0], [0, 0, 0], 0.03));
      const emblem = decal((ctx, s) => {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(s / 2, s * 0.08);
        ctx.lineTo(s * 0.95, s / 2);
        ctx.lineTo(s / 2, s * 0.92);
        ctx.lineTo(s * 0.05, s / 2);
        ctx.fill();
        ctx.font = `900 ${s * 0.5}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#d8232f';
        ctx.fillText('C', s / 2, s * 0.53);
      }, 'heroEmblem', 0.36, 0.36);
      torso.add(front(emblem, 0.08));
    },
  },
  {
    id: 'spacesuit', name: 'Space Suit', cat: 'shirt', base: () => '#f2f2f2', sleeve: () => '#f2f2f2', trim: (c) => c, sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      longSleeves(arms, '#f2f2f2', c);
      torso.add(front(box(0.36, 0.22, 0.06, '#5a6170', [0, 0, 0], [0, 0, 0], 0.03), 0.02));
      for (let i = 0; i < 3; i++) torso.add(front(ball(0.03, glow(['#ff4d5a', '#ffd23f', '#4cd97b'][i], 1.2)), 0.06, -0.1 + i * 0.1, FZ + 0.06));
      torso.add(front(box(0.24, 0.04, 0.02, glow('#2ee6d6', 0.8)), -0.04, 0, FZ + 0.06));
      for (const s of [-1, 1]) torso.add(box(0.1, TH + 0.02, 0.06, c, [s * (TW / 2 - 0.02), 0, FZ - 0.02], [0, 0, 0], 0.02));
    },
  },
  {
    id: 'referee', name: 'Referee', cat: 'shirt', tex: () => stripes('#f7f7f7', '#1f1d26', 8, true)(), trim: () => '#1f1d26',
    extra: ({ torso }) => {
      const whistle = group(cyl(0.05, 0.05, 0.1, metal('#d0d0d0'), [0, 0, 0], [0, 0, Math.PI / 2], 12));
      torso.add(front(whistle, 0.08, 0.1, FZ + 0.05), front(box(0.02, 0.25, 0.02, '#1f1d26'), 0.2, 0.04, FZ + 0.03));
    },
  },
  {
    id: 'lifevest', name: 'Life Vest', cat: 'shirt',
    extra: ({ torso }) => {
      const o = '#ff6a13';
      for (const s of [-1, 1]) torso.add(box(0.34, TH - 0.04, 0.14, o, [s * 0.22, -0.02, TD / 2 + 0.05], [0, 0, 0], 0.07));
      torso.add(box(TW + 0.1, TH - 0.04, 0.14, o, [0, -0.02, -TD / 2 - 0.04], [0, 0, 0], 0.07));
      for (const y of [-0.1, 0.1]) torso.add(front(box(TW + 0.12, 0.05, 0.03, '#23202a'), y, 0, FZ + 0.12));
      torso.add(front(box(0.1, 0.06, 0.03, '#ffffff'), 0.25, -0.2, FZ + 0.13));
    },
  },
  {
    id: 'apron', name: 'Apron', cat: 'shirt',
    extra: ({ torso, c }) => {
      torso.add(front(box(0.56, TH + 0.12, 0.03, '#fbfaf6', [0, 0, 0], [0, 0, 0], 0.03), -0.06, 0, FZ + 0.02), front(box(0.3, 0.14, 0.02, c), -0.12, 0, FZ + 0.045));
      torso.add(box(TW + 0.08, 0.05, TD + 0.06, '#fbfaf6', [0, -0.1, 0], [0, 0, 0], 0.02));
      for (const s of [-1, 1]) torso.add(box(0.05, 0.3, 0.05, '#fbfaf6', [s * 0.18, TH / 2 + 0.06, TD / 2 - 0.06], [0.2, 0, -s * 0.4], 0.02));
    },
  },
  {
    id: 'knight', name: 'Knight Armor', cat: 'shirt', sleeves: 'long', sleeve: () => '#a9b2bd',
    extra: ({ torso, arms, c }) => {
      const steel = metal('#b6bec9', 0.28);
      longSleeves(arms, steel);
      torso.add(box(TW + 0.08, TH + 0.02, TD + 0.08, steel, [0, 0, 0], [0, 0, 0], 0.12), front(box(0.24, TH - 0.04, 0.03, c), 0, 0, FZ + 0.05));
      for (const a of arms) a.add(ball(0.22, steel, [0, -0.06, 0], [1, 0.8, 1]));
    },
  },
  {
    id: 'hivis', name: 'Hi-Vis Vest', cat: 'shirt',
    extra: ({ torso }) => {
      const yel = glow('#d8ff2a', 0.15);
      for (const s of [-1, 1]) torso.add(box(0.32, TH - 0.02, 0.06, yel, [s * 0.22, 0, TD / 2 + 0.02], [0, 0, 0], 0.03));
      torso.add(box(TW + 0.06, TH - 0.02, 0.06, yel, [0, 0, -TD / 2 - 0.02], [0, 0, 0], 0.03));
      for (const y of [-0.12, 0.08]) torso.add(box(TW + 0.08, 0.05, TD + 0.1, metal('#e6e6e6', 0.15), [0, y, 0], [0, 0, 0], 0.02));
    },
  },
  {
    id: 'choppy', name: 'Choppy Tee', cat: 'shirt',
    extra: ({ torso }) => {
      const key = decal((ctx, s) => {
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = '#2a1b5e';
        ctx.lineWidth = s * 0.05;
        ctx.beginPath();
        ctx.arc(s * 0.32, s * 0.5, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(s * 0.46, s * 0.44, s * 0.44, s * 0.12);
        ctx.strokeRect(s * 0.46, s * 0.44, s * 0.44, s * 0.12);
        ctx.fillRect(s * 0.7, s * 0.56, s * 0.08, s * 0.14);
        ctx.fillRect(s * 0.82, s * 0.56, s * 0.08, s * 0.1);
        ctx.fillStyle = '#2a1b5e';
        ctx.beginPath();
        ctx.arc(s * 0.32, s * 0.5, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }, 'choppyKey', 0.42, 0.42);
      torso.add(front(key, 0.04));
    },
  },
  {
    id: 'robe', name: 'Bathrobe', cat: 'shirt', tex: fluffy, sleeves: 'long',
    extra: ({ torso, arms, c }) => {
      const f = texMat(`fluffy:${c}`, () => fluffy(c));
      longSleeves(arms, f, lt(c, 0.3));
      jacket(torso, f, 0.1, 0.24);
      torso.add(...lapels(lt(c, 0.3), 0.4), box(TW + 0.12, 0.08, TD + 0.08, lt(c, 0.25), [0, -0.12, 0], [0, 0, 0], 0.03), front(box(0.08, 0.24, 0.03, lt(c, 0.25)), -0.26, 0.12, FZ + 0.06));
    },
  },
];

function stripesMat(c: string): THREE.Material {
  return texMat(`varsityStripe:${c}`, () => stripes(c, '#ffffff', 4)());
}

// ------------------------------------------------------------------ accessories

/** Face slot: (0, 0, 0) is the middle of the face; the eyes sit at about y = +0.04. */
const EY = HEAD * (1 - 120 / 256) - H;

function frames(lens: THREE.Material, rim: THREE.Material, shape: (s: number) => THREE.BufferGeometry, gap = 0.27): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const l = mesh(shape(s), lens, { cast: false });
    l.position.set(s * gap, EY, 0.06);
    g.add(l);
  }
  g.add(box(0.12, 0.04, 0.04, rim, [0, EY + 0.04, 0.06], [0, 0, 0], 0.01));
  for (const s of [-1, 1]) g.add(box(0.03, 0.04, HEAD * 0.8, rim, [s * (H + 0.02), EY + 0.04, -H + 0.06], [0, 0, 0], 0.01));
  return g;
}

function heartShape(): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.18);
  sh.bezierCurveTo(-0.28, 0.0, -0.22, 0.22, 0, 0.1);
  sh.bezierCurveTo(0.22, 0.22, 0.28, 0.0, 0, -0.18);
  return sh;
}

function starShape(r = 0.2): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return sh;
}
const extrude = (sh: THREE.Shape, depth = 0.05) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });

/** Turn a flat prop so its thinnest side faces sideways (shields). */
function upright(o: THREE.Object3D): THREE.Object3D {
  const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  const g = group(o);
  if (s.y <= s.x && s.y <= s.z) g.rotation.z = Math.PI / 2;
  else if (s.z <= s.x && s.z <= s.y) g.rotation.y = Math.PI / 2;
  return g;
}

/** Held items: built pointing up (+y) from the grip; the hand slot tips them forward. */
const held = (o: THREE.Object3D) => {
  const g = group(o);
  g.rotation.x = Math.PI / 2 - 0.25;
  return g;
};

const ACCS: AccDef[] = [
  {
    id: 'shades', name: 'Shades', cat: 'acc', slot: 'face', hideGlasses: true,
    build: (c) => frames(new THREE.MeshStandardMaterial({ color: '#15161c', metalness: 0.4, roughness: 0.05 }), toy(c, 0.4), () => rbox(0.42, 0.24, 0.05, 0.06)),
  },
  { id: 'hearts', name: 'Heart Glasses', cat: 'acc', slot: 'face', hideGlasses: true, build: () => frames(new THREE.MeshStandardMaterial({ color: '#ff3d7a', roughness: 0.1, transparent: true, opacity: 0.9 }), toy('#ff8fb5', 0.4), () => extrude(heartShape(), 0.04).scale(1.4, 1.4, 1)) },
  { id: 'stars', name: 'Star Glasses', cat: 'acc', slot: 'face', hideGlasses: true, build: () => frames(new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.2, metalness: 0.3 }), toy('#ffb300', 0.4), () => extrude(starShape(0.24), 0.04)) },
  {
    id: '3d', name: '3D Glasses', cat: 'acc', slot: 'face', hideGlasses: true,
    build: () => {
      const g = frames(new THREE.MeshStandardMaterial({ color: '#ff3040', transparent: true, opacity: 0.75 }), toy('#ffffff', 0.5), () => rbox(0.38, 0.22, 0.03, 0.02));
      ((g.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial) = new THREE.MeshStandardMaterial({ color: '#2fb4ff', transparent: true, opacity: 0.75 });
      g.add(box(1.02, 0.3, 0.03, '#ffffff', [0, EY, 0.045], [0, 0, 0], 0.03));
      return g;
    },
  },
  {
    id: 'monocle', name: 'Monocle', cat: 'acc', slot: 'face', hideGlasses: true,
    build: () => {
      const gold = metal('#e0b84a', 0.25);
      return group(part(new THREE.TorusGeometry(0.17, 0.025, 8, 28), gold, [0.27, EY, 0.06]), part(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.3, roughness: 0.02 }), [0.27, EY, 0.055]), part(new THREE.TorusGeometry(0.3, 0.008, 4, 20, Math.PI * 0.8), gold, [0.36, EY - 0.42, 0.08], [0, 0, Math.PI * 1.15]));
    },
  },
  {
    id: 'patch', name: 'Eye Patch', cat: 'acc', slot: 'face', hideGlasses: true,
    build: () => {
      const g = group(box(0.3, 0.26, 0.04, '#1f1d26', [-0.27, EY, 0.05], [0, 0, 0], 0.08));
      const strap = box(HEAD + 0.04, 0.04, HEAD + 0.04, '#1f1d26', [0, EY + 0.1, -H], [0, 0, -0.3], 0.01);
      strap.scale.z = 1;
      g.add(strap);
      return g;
    },
  },
  { id: 'nose', name: 'Clown Nose', cat: 'acc', slot: 'face', build: () => group(ball(0.13, glow('#ff2a3a', 0.15), [0, HEAD * (1 - 158 / 256) - H, 0.12])) },
  {
    id: 'disguise', name: 'Disguise Kit', cat: 'acc', slot: 'face', hideGlasses: true,
    build: () => {
      const g = frames(new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.25 }), toy('#1f1d26', 0.4), () => new THREE.TorusGeometry(0.17, 0.035, 8, 24));
      const ny = HEAD * (1 - 158 / 256) - H;
      g.add(box(0.18, 0.26, 0.2, '#f1b48f', [0, ny + 0.02, 0.12], [0, 0, 0], 0.08));
      for (const s of [-1, 1]) g.add(box(0.26, 0.09, 0.06, '#2a1f1a', [s * 0.13, ny - 0.14, 0.1], [0, 0, s * -0.25], 0.04));
      for (const s of [-1, 1]) g.add(box(0.32, 0.07, 0.04, '#2a1f1a', [s * 0.27, EY + 0.22, 0.05], [0, 0, s * 0.1], 0.03));
      return g;
    },
  },
  {
    id: 'goggles', name: 'Ski Goggles', cat: 'acc', slot: 'face', hideGlasses: true,
    build: (c) => {
      const lens = new THREE.MeshStandardMaterial({ color: '#ff9f1c', metalness: 0.6, roughness: 0.05, emissive: '#5a2a00', emissiveIntensity: 0.3 });
      return group(box(1.0, 0.36, 0.08, lens, [0, EY, 0.06], [0, 0, 0], 0.14), box(1.08, 0.42, 0.06, '#23202a', [0, EY, 0.02], [0, 0, 0], 0.16), box(HEAD + 0.06, 0.16, HEAD + 0.06, c, [0, EY, -H], [0, 0, 0], 0.05));
    },
  },
  {
    id: 'scarf', name: 'Scarf', cat: 'acc', slot: 'neck',
    build: (c) => {
      const m = texMat(`scarf:${c}`, () => stripes(c, '#ffffff', 6)());
      const g = group(part(new THREE.TorusGeometry(0.28, 0.1, 10, 20), m, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1.4]));
      const tail = box(0.18, 0.42, 0.06, m, [0.16, -0.2, 0.26], [0.1, 0, 0.12], 0.03);
      animate(tail, (t) => (tail.rotation.x = 0.1 + Math.sin(t * 3) * 0.08));
      g.add(tail, box(0.17, 0.34, 0.06, m, [0.26, -0.14, 0.22], [0.15, 0, -0.08], 0.03));
      return g;
    },
  },
  { id: 'bowtie', name: 'Bow Tie', cat: 'acc', slot: 'neck', build: (c) => group(box(0.18, 0.14, 0.06, c, [-0.1, -0.04, 0.27], [0, 0, 0.35], 0.04), box(0.18, 0.14, 0.06, c, [0.1, -0.04, 0.27], [0, 0, -0.35], 0.04), box(0.08, 0.09, 0.08, dk(c, 0.2), [0, -0.04, 0.28])) },
  {
    id: 'chain', name: 'Key Chain', cat: 'acc', slot: 'neck',
    build: () => {
      const gold = metal('#ffcc33', 0.2);
      const g = group(part(new THREE.TorusGeometry(0.32, 0.025, 6, 32), gold, [0, -0.02, 0.06], [Math.PI / 2 - 0.45, 0, 0], [1, 1.2, 1]));
      const key = group(part(new THREE.TorusGeometry(0.07, 0.025, 6, 16), gold), box(0.04, 0.2, 0.03, gold, [0, -0.15, 0]), box(0.07, 0.03, 0.03, gold, [0.03, -0.22, 0]), box(0.05, 0.03, 0.03, gold, [0.025, -0.17, 0]));
      key.position.set(0, -0.28, 0.33);
      g.add(key);
      return g;
    },
  },
  {
    id: 'medal', name: 'Gold Medal', cat: 'acc', slot: 'neck',
    build: (c) => {
      const g = new THREE.Group();
      for (const s of [-1, 1]) g.add(box(0.1, 0.36, 0.03, c, [s * 0.1, -0.12, 0.28], [0.05, 0, s * 0.4], 0.01));
      const coin = cyl(0.12, 0.12, 0.04, metal('#ffcc33', 0.2), [0, -0.32, 0.3], [Math.PI / 2, 0, 0], 24);
      g.add(coin, part(extrude(starShape(0.07), 0.01), glow('#fff1a8', 0.3), [0, -0.32, 0.32]));
      return g;
    },
  },
  {
    id: 'lei', name: 'Flower Lei', cat: 'acc', slot: 'neck',
    build: () => {
      const g = new THREE.Group();
      const cols = ['#ff6fa8', '#ffd23f', '#ffffff', '#ff8a1f', '#c86bff'];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.add(ball(0.08, cols[i % 5], [Math.sin(a) * 0.38, 0.0 - Math.max(0, Math.cos(a)) * 0.22, Math.cos(a) * 0.34], [1, 0.7, 1]));
      }
      return g;
    },
  },
  {
    id: 'bandana', name: 'Bandana', cat: 'acc', slot: 'neck',
    build: (c) => {
      const m = texMat(`bandana:${c}`, () => {
        const [cv, ctx] = canvas(128);
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 40; i++) {
          ctx.beginPath();
          ctx.arc((i * 47) % 128, (i * 29) % 128, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        return cv;
      });
      return group(part(new THREE.TorusGeometry(0.28, 0.06, 8, 20), m, [0, 0.03, 0], [Math.PI / 2, 0, 0]), part(new THREE.ConeGeometry(0.22, 0.3, 3), m, [0, -0.1, 0.27], [0, 0, Math.PI], [1, 1, 0.25]));
    },
  },
  {
    id: 'cape', name: 'Hero Cape', cat: 'acc', slot: 'back',
    build: (c) => {
      const g = new THREE.Group();
      const cape = part(new THREE.BoxGeometry(0.9, 1.0, 0.04, 1, 6, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), [0, -0.3, -0.05]);
      const pivot = group(cape);
      pivot.position.y = 0.32;
      animate(cape, (t) => (pivot.rotation.x = 0.18 + Math.sin(t * 3) * 0.06));
      g.add(pivot, box(0.9, 0.08, 0.1, dk(c, 0.2), [0, 0.32, 0], [0, 0, 0], 0.03));
      return g;
    },
  },
  {
    id: 'backpack', name: 'Backpack', cat: 'acc', slot: 'back',
    build: (c) => group(box(0.62, 0.62, 0.3, c, [0, 0, -0.15], [0, 0, 0], 0.1), box(0.46, 0.26, 0.12, dk(c, 0.15), [0, -0.12, -0.33], [0, 0, 0], 0.06), box(0.4, 0.04, 0.04, '#ffd23f', [0, 0.02, -0.32], [0, 0, 0], 0.01), box(0.1, 0.5, 0.05, '#23202a', [-0.24, 0.05, 0.54]), box(0.1, 0.5, 0.05, '#23202a', [0.24, 0.05, 0.54])),
  },
  {
    id: 'jetpack', name: 'Jetpack', cat: 'acc', slot: 'back',
    build: (c) => {
      const steel = metal('#b6bec9', 0.3);
      const g = group(box(0.3, 0.4, 0.14, c, [0, 0.04, -0.08], [0, 0, 0], 0.05));
      for (const s of [-1, 1]) {
        g.add(cyl(0.13, 0.13, 0.62, steel, [s * 0.2, 0.02, -0.2]), part(new THREE.ConeGeometry(0.13, 0.16, 16), c, [s * 0.2, 0.41, -0.2]), cyl(0.09, 0.12, 0.1, '#3a3f4a', [s * 0.2, -0.34, -0.2]));
        const flame = part(new THREE.ConeGeometry(0.09, 0.34, 12), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85 }), [s * 0.2, -0.55, -0.2], [Math.PI, 0, 0]);
        flame.castShadow = false;
        animate(flame, (t) => flame.scale.set(1, 0.7 + Math.abs(Math.sin(t * 20 + s)) * 0.5, 1));
        g.add(flame);
      }
      return g;
    },
  },
  {
    id: 'angel', name: 'Angel Wings', cat: 'acc', slot: 'back',
    build: () => wings('#ffffff', false),
  },
  {
    id: 'bat', name: 'Bat Wings', cat: 'acc', slot: 'back',
    build: () => wings('#3a2a4a', true),
  },
  {
    id: 'guitar', name: 'Guitar', cat: 'acc', slot: 'back',
    build: (c) => {
      const g = group(ball(0.3, c, [0, -0.15, -0.12], [1, 1.1, 0.35]), ball(0.24, c, [0, 0.18, -0.12], [1, 1.05, 0.35]), cyl(0.07, 0.07, 0.02, '#23202a', [0, -0.05, -0.01], [Math.PI / 2, 0, 0]));
      g.add(box(0.08, 0.7, 0.05, '#6b4a2a', [0, 0.65, -0.12]), box(0.14, 0.18, 0.05, '#3a2a1a', [0, 1.05, -0.12]));
      g.add(box(0.06, 1.0, 0.03, '#23202a', [0.2, 0.0, 0.0], [0, 0, 0.5], 0.01));
      g.rotation.z = 0.5;
      g.scale.setScalar(0.8);
      g.position.y = 0.2;
      return g;
    },
  },
  {
    id: 'balloon', name: 'Balloon', cat: 'acc', slot: 'back',
    build: (c) => {
      const g = new THREE.Group();
      const float = group(ball(0.36, new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.05 }), [0, 0, 0], [1, 1.15, 1]), part(new THREE.ConeGeometry(0.06, 0.08, 8), c, [0, -0.44, 0], [Math.PI, 0, 0]), cyl(0.008, 0.008, 2.1, '#f4f4f4', [0, -1.53, 0], [0, 0, 0], 4));
      // floats up and behind, clear of even the biggest hair
      float.position.set(0.3, 2.5, -0.55);
      animate(float, (t) => {
        float.position.y = 2.5 + Math.sin(t * 1.6) * 0.08;
        float.rotation.z = Math.sin(t * 1.1) * 0.12 - 0.1;
      });
      g.add(float);
      return g;
    },
  },
  {
    id: 'shell', name: 'Turtle Shell', cat: 'acc', slot: 'back',
    build: () => {
      const g = group(part(new THREE.SphereGeometry(0.56, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#3f9a4a', [0, 0, -0.02], [-Math.PI / 2, 0, 0], [1, 1.1, 0.55]), part(new THREE.TorusGeometry(0.55, 0.05, 6, 24), '#f1e6c8', [0, 0, -0.03], [0, 0, 0], [1, 1.1, 1]));
      for (const [x, y] of [[0, 0], [0.26, 0.2], [-0.26, 0.2], [0.26, -0.22], [-0.26, -0.22]]) g.add(part(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 6), '#2f7a3a', [x, y, -0.3 + Math.hypot(x, y) * 0.25], [Math.PI / 2, 0, 0]));
      return g;
    },
  },
  { id: 'sword', name: 'Sword', cat: 'acc', slot: 'hand', build: () => held(kenney('proto/weapon-sword', 0.95)) },
  { id: 'shield', name: 'Shield', cat: 'acc', slot: 'hand', build: () => {
    // stand it up on the outside of the arm, face out
    const s = upright(kenney('proto/weapon-shield', 0.8, 'centre'));
    s.position.set(0.12, 0.1, 0);
    return group(s);
  } },
  { id: 'spatula', name: 'Spatula', cat: 'acc', slot: 'hand', build: () => held(kenney('food/cooking-spatula', 0.85)) },
  { id: 'pan', name: 'Frying Pan', cat: 'acc', slot: 'hand', build: () => {
    const p = kenney('food/frying-pan', 0.9, 'centre');
    const g = group(p);
    g.rotation.set(0, -Math.PI / 2, 0);
    g.position.set(0, -0.05, 0.4);
    return group(g);
  } },
  { id: 'candycane', name: 'Candy Cane', cat: 'acc', slot: 'hand', build: () => {
    const g = held(kenney('holiday/candy-cane-red', 0.75));
    g.rotation.x = 0.7;
    return g;
  } },
  { id: 'lantern', name: 'Lantern', cat: 'acc', slot: 'hand', build: () => {
    const iron = '#3a3330';
    const flame = ball(0.07, glow('#ffb02e', 2.2), [0, -0.3, 0], [1, 1.4, 1]);
    const glass = part(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#fff1c0', emissive: '#ffb02e', emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }), [0, -0.3, 0]);
    const lamp = group(part(new THREE.TorusGeometry(0.07, 0.015, 6, 12), iron, [0, -0.06, 0]), part(new THREE.ConeGeometry(0.17, 0.1, 6), iron, [0, -0.16, 0]), glass, flame, cyl(0.16, 0.16, 0.04, iron, [0, -0.43, 0], [0, 0, 0], 6));
    for (let i = 0; i < 3; i++) lamp.add(cyl(0.012, 0.012, 0.22, iron, [Math.sin((i * Math.PI * 2) / 3) * 0.13, -0.3, Math.cos((i * Math.PI * 2) / 3) * 0.13], [0, 0, 0], 4));
    animate(flame, (t) => (lamp.rotation.x = Math.sin(t * 2.2) * 0.15));
    lamp.position.y = 0.12;
    return group(lamp);
  } },
  { id: 'mug', name: 'Coffee Mug', cat: 'acc', slot: 'hand', build: () => {
    const m = kenney('food/mug', 0.32, 'centre');
    m.position.set(0, -0.05, 0.12);
    return group(m);
  } },
  { id: 'shovel', name: 'Shovel', cat: 'acc', slot: 'hand', build: () => {
    const s = kenney('pirate/tool-shovel', 1.3, 'centre');
    s.position.y = 0.1;
    return held(s);
  } },
  {
    id: 'wand', name: 'Magic Wand', cat: 'acc', slot: 'hand',
    build: () => {
      const tip = part(extrude(starShape(0.14), 0.04), glow('#ffd23f', 1.2), [0, 0.7, -0.02]);
      animate(tip, (t) => (tip.rotation.y = t * 3));
      return held(group(cyl(0.025, 0.03, 0.65, '#23202a', [0, 0.3, 0], [0, 0, 0], 8), cyl(0.032, 0.032, 0.08, '#ffffff', [0, 0.6, 0], [0, 0, 0], 8), tip));
    },
  },
  {
    id: 'foamfinger', name: 'Foam Finger', cat: 'acc', slot: 'hand',
    build: (c) => {
      const g = group(box(0.34, 0.5, 0.18, c, [0, 0.2, 0], [0, 0, 0], 0.08), box(0.14, 0.42, 0.14, c, [0.06, 0.6, 0], [0, 0, 0], 0.06), box(0.12, 0.18, 0.12, c, [-0.18, 0.28, 0.04], [0, 0, 0.5], 0.05));
      const one = decal((ctx, s) => {
        ctx.font = `900 ${s * 0.7}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('#1', s / 2, s / 2);
      }, 'foam1', 0.3, 0.3);
      // held pointing forward, so the "#1" goes on the side that faces up
      one.position.set(0, 0.16, -0.095);
      one.rotation.y = Math.PI;
      g.add(one);
      return held(g);
    },
  },
  {
    id: 'icecream', name: 'Ice Cream', cat: 'acc', slot: 'hand',
    build: () => {
      const waffle = texMat('waffle', () => {
        const [cv, ctx] = canvas(64);
        ctx.fillStyle = '#e0a458';
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#b97a35';
        ctx.lineWidth = 3;
        for (let i = -64; i < 64; i += 12) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 64, 64);
          ctx.moveTo(i + 64, 0);
          ctx.lineTo(i, 64);
          ctx.stroke();
        }
        return cv;
      });
      return group(part(new THREE.ConeGeometry(0.14, 0.4, 16), waffle, [0, 0.05, 0], [Math.PI, 0, 0]), ball(0.16, '#ff9fc4', [0, 0.32, 0]), ball(0.14, '#fff3d6', [0, 0.52, 0]), ball(0.05, '#e8323c', [0, 0.68, 0]));
    },
  },
  {
    id: 'chicken', name: 'Rubber Chicken', cat: 'acc', slot: 'hand',
    build: () => {
      const y = '#ffd84d';
      return held(group(ball(0.13, y, [0, 0.3, 0], [0.8, 1.6, 0.8]), ball(0.09, y, [0, 0.62, 0.03]), part(new THREE.ConeGeometry(0.04, 0.12, 8), '#ff8a1f', [0, 0.62, 0.14], [Math.PI / 2, 0, 0]), part(new THREE.ConeGeometry(0.035, 0.08, 6), '#e8323c', [0, 0.73, 0.02]), ball(0.015, '#1f1d26', [0.05, 0.65, 0.09]), ball(0.015, '#1f1d26', [-0.05, 0.65, 0.09]), cyl(0.02, 0.02, 0.2, '#ff8a1f', [0, 0.02, 0])));
    },
  },
  {
    id: 'cleaver', name: 'Choppy Cleaver', cat: 'acc', slot: 'hand',
    build: () => held(group(box(0.08, 0.32, 0.1, '#5a3a22', [0, 0.14, 0], [0, 0, 0], 0.03), box(0.04, 0.4, 0.34, metal('#d7dde4', 0.2), [0, 0.5, 0.1], [0, 0, 0], 0.02), cyl(0.04, 0.04, 0.05, '#23202a', [0, 0.62, 0.2], [0, 0, Math.PI / 2], 10))),
  },
];

function wings(color: string, bat: boolean): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    const mat = toy(color, bat ? 0.6 : 0.5);
    if (bat) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.75, 0.38);
      sh.lineTo(0.62, 0.04);
      sh.lineTo(0.48, 0.16);
      sh.lineTo(0.36, -0.12);
      sh.lineTo(0.22, 0.02);
      sh.lineTo(0, -0.24);
      const m = mesh(extrude(sh, 0.03), mat);
      m.scale.x = s;
      w.add(m);
    } else {
      for (let i = 0; i < 4; i++) w.add(box(0.6 - i * 0.1, 0.16, 0.06, mat, [s * (0.32 - i * 0.03), 0.22 - i * 0.16, 0], [0, 0, s * (0.35 - i * 0.12)], 0.07));
    }
    w.position.set(s * 0.1, 0.12, -0.08);
    animate(w.children[0], (t) => (w.rotation.y = s * (0.25 + Math.sin(t * (bat ? 7 : 4)) * 0.25)));
    g.add(w);
  }
  return g;
}

// ------------------------------------------------------------------ catalog

export const CATALOG: Record<Category, Cosmetic[]> = { hat: HATS, shirt: SHIRTS, acc: ACCS };
const BY_ID = new Map<string, HatDef | ShirtDef | AccDef>();
for (const list of [HATS, SHIRTS, ACCS]) for (const d of list) BY_ID.set(`${d.cat}:${d.id}`, d);

export function cosmetic(cat: Category, id: string): Cosmetic | undefined {
  return BY_ID.get(`${cat}:${id}`);
}

/** Build one hat or accessory on its own (for menu thumbnails). Shirts need a body: use applyLook. */
export function buildPiece(cat: 'hat' | 'acc', id: string, color: string): THREE.Object3D {
  const d = BY_ID.get(`${cat}:${id}`) as HatDef | AccDef | undefined;
  return d ? d.build(color) : new THREE.Group();
}

export function lookKey(l: Look): string {
  return `${l.hat}.${l.shirt}.${l.acc}`;
}

/** Compact string for saving or sending over the network: "hat.shirt.acc". */
export function encodeLook(l: Look): string {
  return lookKey(l);
}
export function decodeLook(s: string | undefined | null): Look {
  if (!s) return { ...DEFAULT_LOOK };
  const [hat = '', shirt = 'tee', acc = ''] = s.split('.');
  return {
    hat: hat && BY_ID.has(`hat:${hat}`) ? hat : '',
    shirt: BY_ID.has(`shirt:${shirt}`) ? shirt : 'tee',
    acc: acc && BY_ID.has(`acc:${acc}`) ? acc : '',
  };
}

// ------------------------------------------------------------------ dressing a model

interface Worn {
  added: THREE.Object3D[];
  look: Look;
}
const WORN = new WeakMap<FolkModel, Worn>();

/** Hats that ride on top of the hair instead of replacing it. */
const ON_TOP: Record<string, number> = { bunny: 0.12, catears: 0.12, devil: 0.1, boppers: 0.12, halo: 0.42, flowers: 0.14 };
const halfOf = (b: THREE.Box3, axis: 'x' | 'z') => Math.max(-b.min[axis], b.max[axis]);

/**
 * Make a hat fit this character's hair, so nothing passes through anything:
 * - hats that cover the head get widened to the hair, and the hair is trimmed flat where the hat starts;
 * - ears, horns and halos ride up on top of big hair; bands and headphones widen round it;
 * - the space helmet grows until the whole head and hair fit inside the glass.
 */
function fitHat(f: FolkModel, hat: HatDef, o: THREE.Object3D): void {
  if (hat.id === 'bare') return;
  const hair = f.hairBox(!!hat.keepHair);
  if (hair.isEmpty()) return;
  o.updateWorldMatrix(true, true);
  const hb = new THREE.Box3().setFromObject(o); // slot space (the slot sits at y = HEAD in the head)
  const hairX = halfOf(hair, 'x'), hairZ = halfOf(hair, 'z');
  if (!hat.keepHair) {
    const k = Math.min(1.3, Math.max(1, (hairX + 0.02) / halfOf(hb, 'x'), (hairZ + 0.02) / halfOf(hb, 'z')));
    o.scale.x *= k;
    o.scale.z *= k;
    f.clipHair(HEAD + hb.min.y + 0.04);
    return;
  }
  const above = Math.max(0, hair.max.y - HEAD);
  if (hat.id in ON_TOP) {
    // sit on the hair, sunk in a little so it looks worn rather than balanced
    o.position.y += Math.max(0, above - ON_TOP[hat.id]);
    const k = Math.min(1.35, Math.max(1, (hairX + 0.04) / (H + 0.04)));
    o.scale.x *= k;
    o.scale.z *= k;
  } else if (hat.id === 'space') {
    // the glass dome is centred on the head; grow it round the hair's furthest point
    const centre = new THREE.Vector3(0, -H - 0.04, 0);
    let need = 0;
    for (const x of [hair.min.x, hair.max.x]) for (const y of [hair.min.y, hair.max.y]) for (const z of [hair.min.z, hair.max.z]) need = Math.max(need, new THREE.Vector3(x, y - HEAD, z).distanceTo(centre));
    const k = Math.min(1.45, Math.max(1, (need + 0.06) / 1.14));
    o.scale.setScalar(k);
    o.position.y += centre.y * (1 - k);
  } else {
    // bands and headphones go round the hair
    const k = Math.min(1.35, Math.max(1, (hairX + 0.06) / (H + 0.06), (hairZ + 0.06) / (H + 0.06)));
    o.scale.x *= k;
    o.scale.z *= k;
    if (hat.id === 'headphones') o.scale.y *= Math.min(1.35, Math.max(1, (above + H + 0.1) / (H + 0.1)));
  }
}

function undress(f: FolkModel): void {
  const w = WORN.get(f);
  const p = f.parts;
  if (w) for (const o of w.added) o.removeFromParent();
  // put the plain tee back
  p.shirtMat.map = null;
  p.shirtMat.color.set(p.color);
  p.shirtMat.needsUpdate = true;
  p.shirtDark.color.set(darken(p.color, 0.25));
  for (const s of p.sleeves) {
    s.visible = true;
    s.material = p.shirtMat;
  }
  p.torso.material = p.shirtMat;
  if (p.ownHat) p.ownHat.visible = true;
  if (p.ownGlasses) p.ownGlasses.visible = true;
  f.hideHairTop(!!p.ownHat);
  f.clipHair(null);
  WORN.delete(f);
}

/** Dress a crew model. Safe to call repeatedly; re-tints itself when the player's colour changes. */
export function applyLook(f: FolkModel, look: Look): void {
  undress(f);
  const c = f.parts.color;
  const added: THREE.Object3D[] = [];
  const add = (parent: THREE.Object3D, o: THREE.Object3D) => {
    parent.add(o);
    added.push(o);
  };
  const p = f.parts;

  // hat
  const hat = look.hat ? (BY_ID.get(`hat:${look.hat}`) as HatDef | undefined) : undefined;
  if (hat) {
    if (p.ownHat) p.ownHat.visible = false;
    f.hideHairTop(!hat.keepHair);
    const o = hat.build(c);
    // hats that cover the head sit a little lower, over the top of the forehead
    if (!hat.keepHair) o.position.y -= 0.08;
    fitHat(f, hat, o);
    add(f.slots.hat, o);
  }

  // shirt
  const shirt = (BY_ID.get(`shirt:${look.shirt}`) as ShirtDef | undefined) ?? (SHIRTS[0] as ShirtDef);
  if (shirt.tex) {
    p.shirtMat.map = tex(`shirt:${shirt.id}:${c}`, () => shirt.tex!(c));
    p.shirtMat.color.set('#ffffff');
    p.shirtMat.needsUpdate = true;
  } else if (shirt.base) p.shirtMat.color.set(shirt.base(c));
  if (shirt.trim) p.shirtDark.color.set(shirt.trim(c));
  if (shirt.sleeve) {
    const sm = toy(shirt.sleeve(c), 0.55);
    for (const s of p.sleeves) s.material = sm;
  }
  if (shirt.sleeves === 'none') for (const s of p.sleeves) s.visible = false;
  if (shirt.extra) {
    const torso = new THREE.Group();
    add(f.slots.torso, torso);
    const arms = p.arms.map((a) => {
      const g = new THREE.Group();
      add(a, g);
      return g;
    });
    shirt.extra({ torso, arms, c });
  }

  // accessory
  const acc = look.acc ? (BY_ID.get(`acc:${look.acc}`) as AccDef | undefined) : undefined;
  if (acc) {
    if (acc.hideGlasses && p.ownGlasses) p.ownGlasses.visible = false;
    const o = acc.build(c);
    if (acc.slot === 'face') add(f.slots.face, o);
    else if (acc.slot === 'hand') {
      o.scale.multiplyScalar(1.4);
      add(f.slots.handR, o);
      f.holdClear(o);
    }
    else if (acc.slot === 'back') add(f.slots.back, o);
    else {
      // neckwear sits just under the chin, a little forward, so the big head doesn't hide it
      o.position.set(0, TH / 2 - 0.1, 0.04);
      o.scale.setScalar(1.15);
      add(f.slots.torso, o);
    }
  }

  WORN.set(f, { added, look: { ...look } });
  f.onColor = (col) => {
    const w = WORN.get(f);
    if (w && col !== c) applyLook(f, w.look);
  };
}

export function wornLook(f: FolkModel): Look {
  return { ...(WORN.get(f)?.look ?? DEFAULT_LOOK) };
}
