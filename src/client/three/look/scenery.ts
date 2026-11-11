import * as THREE from 'three';
import { prop } from '../assets';
import { gfx } from './quality';

/**
 * Set dressing that fills the empty ground around every arena and board: Kenney props (instanced,
 * so a forest costs a handful of draw calls), swaying grass tufts, flowers and pebbles, clouds,
 * birds, butterflies or fireflies, and a far ring of hills / mesas / peaks for any camera that
 * sees the horizon.
 *
 * Nothing here knows about gameplay. Each view says where play happens (keep-out shapes) and the
 * dresser only builds where a ray from the sky lands on open ground the camera can see.
 */

export type Theme = 'meadow' | 'beach' | 'sea' | 'desert' | 'snow' | 'spooky' | 'space' | 'station' | 'indoor' | 'plaza' | 'prairie';

export type Shape = { circle: [number, number, number] } | { rect: [number, number, number, number] };

export interface DressOpts {
  theme: Theme;
  /** Where the game is played: no props, no clutter. */
  keepOut?: Shape[];
  /** Line segments (paths) to keep clear by `pathClear` units. */
  paths?: [number, number, number, number][];
  pathClear?: number;
  /** Tall props are only allowed beyond this z (smaller = further from the camera). Default: behind the keep-out. */
  frontZ?: number;
  /** Extra multiplier on prop density. */
  density?: number;
  /** Where to look for ground (defaults to what the camera sees). */
  bounds?: [number, number, number, number];
  /** Far backdrop ring radius (0 = none). */
  horizon?: number;
  centre?: [number, number];
  seed?: number;
  /** Max props (before quality scaling). */
  maxProps?: number;
}

type Pick = [name: string, weight: number, scaleMin: number, scaleMax: number];
interface ThemeKit {
  tall: Pick[];
  mid: Pick[];
  low: Pick[];
  grass: string | null;
  flowers: string[];
  pebble: string;
  sky: 'birds' | 'gulls' | 'bats' | 'none';
  ground: 'butterflies' | 'fireflies' | 'none';
  clouds: string | null;
  hills: [string, string] | null;
}

const KITS: Record<Theme, ThemeKit> = {
  meadow: {
    tall: [['forest/tree', 3, 1.6, 2.4], ['forest/tree-high', 2, 1.6, 2.2], ['platformer/tree', 2, 1.4, 2], ['platformer/tree-pine', 2, 1.4, 2], ['forest/rocks-high', 1, 1.2, 1.8]],
    mid: [['platformer/hedge', 2, 1, 1.4], ['platformer/flowers-tall', 2, 1, 1.4], ['platformer/mushrooms', 1, 1, 1.4], ['forest/rocks-low', 2, 1, 1.5], ['platformer/rocks', 1, 0.9, 1.3], ['forest/plant', 2, 1.2, 1.8], ['platformer/plant', 1, 1, 1.4]],
    low: [['platformer/flowers', 3, 1, 1.4], ['platformer/grass', 3, 1, 1.5], ['forest/stones', 1, 1, 1.4], ['platformer/stones', 1, 1, 1.4]],
    grass: '#6fc24c',
    flowers: ['#fff7e0', '#ffd23f', '#ff7eb6', '#b48cff'],
    pebble: '#b9b2a6',
    sky: 'birds',
    ground: 'butterflies',
    clouds: '#ffffff',
    hills: ['#6fbf5a', '#8fb7d9'],
  },
  plaza: {
    tall: [['platformer/tree', 3, 1.4, 1.9], ['forest/tree', 2, 1.5, 2], ['platformer/flag', 1, 1.4, 1.8]],
    mid: [['platformer/hedge', 3, 1, 1.3], ['platformer/flowers-tall', 2, 1, 1.3], ['platformer/fence-straight', 1, 1, 1.2], ['holiday/bench', 1, 1, 1.2]],
    low: [['platformer/flowers', 3, 1, 1.3], ['platformer/grass', 2, 1, 1.3]],
    grass: '#74c851',
    flowers: ['#ffffff', '#ffd23f', '#ff6f91'],
    pebble: '#c4bcb0',
    sky: 'birds',
    ground: 'butterflies',
    clouds: '#ffffff',
    hills: ['#76c060', '#9cc3e0'],
  },
  prairie: {
    tall: [['forest/tree', 2, 1.4, 2], ['forest/rocks-high', 2, 1.2, 1.8], ['pirate/rocks-sand-a', 1, 1.4, 2]],
    mid: [['forest/fence', 2, 1, 1.3], ['forest/rocks-low', 2, 1, 1.4], ['pirate/barrel', 1, 0.9, 1.1], ['forest/tent', 1, 1, 1.2], ['platformer/sign', 1, 1, 1.2]],
    low: [['platformer/grass', 4, 1, 1.5], ['forest/stones', 2, 1, 1.3], ['platformer/flowers', 1, 1, 1.2]],
    grass: '#a8c45a',
    flowers: ['#ffe28a', '#ffffff', '#ff9b5c'],
    pebble: '#bba68a',
    sky: 'birds',
    ground: 'butterflies',
    clouds: '#ffffff',
    hills: ['#c7b56c', '#b9a3c9'],
  },
  beach: {
    tall: [['pirate/palm-detailed-straight', 3, 1.3, 1.9], ['pirate/palm-detailed-bend', 3, 1.3, 1.9], ['pirate/palm-bend', 2, 1.3, 1.8], ['pirate/rocks-a', 1, 1, 1.4]],
    mid: [['pirate/rocks-sand-a', 2, 1, 1.4], ['pirate/rocks-sand-b', 2, 1, 1.4], ['pirate/barrel', 1, 0.9, 1.1], ['pirate/crate', 1, 0.9, 1.1], ['pirate/grass-plant', 3, 1.2, 1.8], ['pirate/boat-row-small', 0.5, 1, 1.1], ['pirate/chest', 0.3, 0.9, 1]],
    low: [['pirate/patch-grass-foliage', 2, 1, 1.4], ['pirate/bottle-large', 0.4, 1, 1.2], ['pirate/rocks-sand-c', 1, 0.8, 1.2]],
    grass: '#86cf55',
    flowers: ['#ff7eb6', '#ffffff', '#ffb347'],
    pebble: '#e9dcc0',
    sky: 'gulls',
    ground: 'butterflies',
    clouds: '#ffffff',
    hills: ['#5fb36a', '#7fb8d8'],
  },
  sea: {
    tall: [['pirate/rocks-a', 2, 1.2, 2], ['pirate/rocks-b', 2, 1.2, 2], ['pirate/palm-detailed-bend', 1, 1.3, 1.8]],
    mid: [['pirate/rocks-sand-a', 2, 1, 1.4], ['pirate/rocks-c', 1, 1, 1.4], ['pirate/barrel', 1, 0.9, 1.1], ['pirate/boat-row-small', 0.6, 1, 1.1]],
    low: [['pirate/rocks-sand-c', 1, 0.8, 1.2]],
    grass: '#86cf55',
    flowers: ['#ffffff'],
    pebble: '#e9dcc0',
    sky: 'gulls',
    ground: 'none',
    clouds: '#ffffff',
    hills: ['#5aa66a', '#8cc3e3'],
  },
  desert: {
    tall: [['pirate/rocks-sand-a', 2, 1.6, 2.6], ['pirate/rocks-sand-b', 2, 1.6, 2.6], ['forest/rocks-high', 1, 1.4, 2.2]],
    mid: [['pirate/barrel', 1, 0.9, 1.1], ['pirate/crate', 1, 0.9, 1.1], ['forest/fence', 1, 1, 1.2], ['forest/rocks-low', 2, 1, 1.5], ['platformer/sign', 0.5, 1, 1.2], ['cactus', 4, 0.8, 1.5]],
    low: [['forest/stones', 2, 1, 1.4], ['platformer/stones', 2, 1, 1.3], ['platformer/grass', 1, 0.9, 1.2]],
    grass: '#c9b25e',
    flowers: ['#ff9b5c', '#ffe28a'],
    pebble: '#c79a6a',
    sky: 'birds',
    ground: 'none',
    clouds: '#fff3e6',
    hills: ['#d98b55', '#c99a8e'],
  },
  snow: {
    tall: [['holiday/tree-snow-a', 3, 1.4, 2.2], ['holiday/tree-snow-b', 3, 1.4, 2.2], ['platformer/tree-pine', 1, 1.4, 2]],
    mid: [['holiday/snow-pile', 3, 1, 1.6], ['holiday/snowman', 1, 1, 1.2], ['holiday/lantern', 1, 1, 1.2], ['holiday/bench', 0.5, 1, 1.1], ['holiday/present-a-cube', 1, 0.9, 1.2], ['holiday/candy-cane-red', 1, 1, 1.3], ['holiday/sled', 0.4, 1, 1.1]],
    low: [['holiday/snow-pile', 3, 0.5, 0.8], ['holiday/present-b-round', 0.6, 0.8, 1]],
    grass: null,
    flowers: [],
    pebble: '#dfe8f2',
    sky: 'none',
    ground: 'none',
    clouds: '#ffffff',
    hills: ['#eef4ff', '#b7c8e8'],
  },
  spooky: {
    tall: [['graveyard/pine-crooked', 3, 1.4, 2.2], ['graveyard/pine-fall', 2, 1.4, 2.2], ['graveyard/crypt', 0.3, 1, 1.2]],
    mid: [['graveyard/gravestone-round', 2, 1, 1.3], ['graveyard/gravestone-cross', 2, 1, 1.3], ['graveyard/gravestone-bevel', 1, 1, 1.3], ['graveyard/gravestone-decorative', 1, 1, 1.2], ['graveyard/pumpkin-carved', 2, 1, 1.3], ['graveyard/pumpkin-tall-carved', 1, 1, 1.3], ['graveyard/lantern-candle', 1, 1, 1.2], ['graveyard/urn-round', 0.5, 1, 1.2], ['graveyard/iron-fence', 1, 1, 1.1]],
    low: [['platformer/mushrooms', 2, 0.9, 1.3], ['platformer/grass', 2, 1, 1.4], ['graveyard/candle-multiple', 0.6, 1, 1.2]],
    grass: '#3e6b45',
    flowers: ['#b48cff', '#7fe0ff'],
    pebble: '#6f6a80',
    sky: 'bats',
    ground: 'fireflies',
    clouds: null,
    hills: ['#2c2a4a', '#3d3263'],
  },
  space: {
    tall: [['space/rock_crystalsLargeA', 2, 1.2, 1.8], ['space/satelliteDish_large', 1, 1, 1.3], ['space/hangar_roundGlass', 0.4, 1, 1.2], ['station/container-tall', 0.6, 1, 1.2]],
    mid: [['space/craterLarge', 2, 1, 1.5], ['space/crater', 2, 1, 1.4], ['space/rock_crystals', 3, 1, 1.5], ['space/meteor', 1, 0.8, 1.2], ['space/machine_generator', 1, 1, 1.2], ['space/machine_wireless', 1, 1, 1.2], ['space/rover', 0.5, 1, 1.1], ['station/container', 0.6, 1, 1.1]],
    low: [['space/crater', 2, 0.5, 0.8], ['space/rock_crystals', 1, 0.5, 0.8]],
    grass: null,
    flowers: [],
    pebble: '#8e8aa8',
    sky: 'none',
    ground: 'fireflies',
    clouds: null,
    hills: ['#4b4570', '#2a2550'],
  },
  station: {
    tall: [['station/container-tall', 2, 1, 1.2], ['space/satelliteDish_large', 1, 0.9, 1.1]],
    mid: [['station/container', 3, 1, 1.2], ['space/machine_generator', 2, 1, 1.2], ['space/machine_wireless', 2, 1, 1.2], ['station/computer-wide', 1, 1, 1.1], ['space/rover', 0.5, 1, 1.1]],
    low: [['modspace/cables', 1, 1, 1.2]],
    grass: null,
    flowers: [],
    pebble: '#8e8aa8',
    sky: 'none',
    ground: 'none',
    clouds: null,
    hills: null,
  },
  indoor: {
    tall: [],
    mid: [],
    low: [],
    grass: null,
    flowers: [],
    pebble: '#999999',
    sky: 'none',
    ground: 'none',
    clouds: null,
    hills: null,
  },
};

/* ---------- small helpers */
function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
function weighted<T extends Pick>(r: () => number, list: T[]): T | null {
  const tot = list.reduce((a, p) => a + p[1], 0);
  if (!tot) return null;
  let k = r() * tot;
  for (const p of list) if ((k -= p[1]) <= 0) return p;
  return list[list.length - 1];
}
function inShape(x: number, z: number, s: Shape, pad: number): boolean {
  if ('circle' in s) return Math.hypot(x - s.circle[0], z - s.circle[1]) < s.circle[2] + pad;
  const [x0, z0, x1, z1] = s.rect;
  return x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;
}
function segDist(px: number, pz: number, s: [number, number, number, number]): number {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** Ground rectangle the camera can see (screen corners projected onto y = 0, a bit enlarged). */
export function visibleGround(cam: THREE.PerspectiveCamera, pad = 4, far = 140): [number, number, number, number] {
  cam.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  const o = cam.position.clone();
  for (const [x, y] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15], [0, 1.15], [0, -1.15]]) {
    const d = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(o).normalize();
    let t = d.y < -0.02 ? -o.y / d.y : far;
    t = Math.min(t, far);
    pts.push(o.clone().addScaledVector(d, t));
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

/* ---------- prop instancing */
const protoCache = new Map<string, { parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[]; h: number; r: number }>();
function proto(name: string) {
  const hit = protoCache.get(name);
  if (hit) return hit;
  const root = name === 'cactus' ? cactusModel() : prop(name);
  root.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh) parts.push({ geo: me.geometry, mat: me.material, m: me.matrixWorld.clone() });
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const p = { parts, h: box.isEmpty() ? 0 : size.y, r: box.isEmpty() ? 0 : Math.max(size.x, size.z) / 2 };
  protoCache.set(name, p);
  return p;
}

let cactusMat: THREE.MeshStandardMaterial | null = null;
/** A chunky low-poly saguaro (there's no cactus in the Kenney kits we have). */
function cactusModel(): THREE.Object3D {
  cactusMat ??= new THREE.MeshStandardMaterial({ color: '#4f9e48', roughness: 0.75, flatShading: true });
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.6, 3, 8), cactusMat);
  trunk.position.y = 1.08;
  g.add(trunk);
  for (const [side, h, len] of [[-1, 0.9, 0.55], [1, 1.25, 0.45]] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, len, 3, 8), cactusMat);
    arm.position.set(side * 0.5, h + len / 2 + 0.1, 0);
    g.add(arm);
    const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 3, 8), cactusMat);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.33, h, 0);
    g.add(elbow);
  }
  return g;
}

class PropBatch {
  private lists = new Map<string, THREE.Matrix4[]>();
  add(name: string, m: THREE.Matrix4) {
    let l = this.lists.get(name);
    if (!l) this.lists.set(name, (l = []));
    l.push(m);
  }
  build(parent: THREE.Object3D, shadows: boolean) {
    const tmp = new THREE.Matrix4();
    for (const [name, mats] of this.lists) {
      const p = proto(name);
      for (const part of p.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, part.m)));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = shadows;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.name = 'scenery:' + name;
        im.userData.noSway = true;
        // shared Kenney geometry must survive the view being disposed
        im.userData.sharedGeo = true;
        parent.add(im);
      }
    }
  }
}

/* ---------- grass tufts, flowers, pebbles */
const windUniform = { value: 0 };
function windy(mat: THREE.MeshStandardMaterial, amp = 0.12) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float k = max(0.0, position.y);
          float gust = 0.7 + 0.3 * sin(uWind * 0.37 + ip.x * 0.05);
          transformed.x += sin(uWind * 1.7 + ip.x * 0.6 + ip.z * 0.4) * ${amp.toFixed(3)} * k * gust;
          transformed.z += cos(uWind * 1.3 + ip.z * 0.5) * ${(amp * 0.6).toFixed(3)} * k * gust;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  mat.userData.noDetail = true;
}

function tuftGeometry(): THREE.BufferGeometry {
  // five tapered blades fanned around the centre, dark at the root, light at the tip
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const lean = 0.12 + (i % 3) * 0.06;
    const h = 0.36 + ((i * 37) % 10) / 30;
    const w = 0.075;
    const cx = Math.cos(a) * 0.05, cz = Math.sin(a) * 0.05;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = cx + Math.cos(a) * lean, tz = cz + Math.sin(a) * lean;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, tx, h, tz);
    col.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.25, 1.25, 1.25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // blades are lit like the ground below them, so they don't flicker dark when seen edge-on
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function flowerGeometry(): THREE.BufferGeometry {
  const head = new THREE.IcosahedronGeometry(0.07, 0);
  head.translate(0, 0.26, 0);
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 4);
  stem.translate(0, 0.13, 0);
  const pos = [...(stem.toNonIndexed().getAttribute('position').array as Float32Array), ...(head.toNonIndexed().getAttribute('position').array as Float32Array)];
  const sc = stem.toNonIndexed().getAttribute('position').count;
  const hc = head.toNonIndexed().getAttribute('position').count;
  const col: number[] = [];
  for (let i = 0; i < sc; i++) col.push(0.25, 0.55, 0.22);
  for (let i = 0; i < hc; i++) col.push(1, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ---------- life: birds, butterflies, fireflies, clouds */
export interface Life {
  update(t: number, dt: number): void;
}

function makeClouds(parent: THREE.Object3D, colour: string, cx: number, cz: number, R: number, r: () => number, n: number): Life {
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 1, flatShading: true, emissive: colour, emissiveIntensity: 0.25 });
  mat.userData.noDetail = true;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const puffs = 4 + Math.floor(r() * 4);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(geo, mat);
      const s = 1.4 + r() * 1.8;
      m.scale.set(s * 1.2, s * 0.75, s);
      m.position.set((k - puffs / 2) * 1.6 + r(), r() * 0.8, (r() - 0.5) * 1.6);
      m.castShadow = false;
      c.add(m);
    }
    const a = r() * Math.PI * 2;
    const d = R * (0.5 + r() * 0.7);
    c.position.set(cx + Math.cos(a) * d, 26 + r() * 16, cz + Math.sin(a) * d);
    c.scale.setScalar(1 + r() * 1.5);
    c.userData.sky = true;
    parent.add(c);
    clouds.push(c);
  }
  return {
    update(_t, dt) {
      for (const c of clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > cx + R * 1.3) c.position.x = cx - R * 1.3;
      }
    },
  };
}

function makeFlyers(parent: THREE.Object3D, kind: 'birds' | 'gulls' | 'bats', cx: number, cz: number, R: number, r: () => number, n: number): Life {
  const colour = kind === 'gulls' ? '#ffffff' : kind === 'bats' ? '#1c1430' : '#3a3a48';
  const mat = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, fog: true });
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.12, 0.55, 0.05, 0], 3));
  const birds: { g: THREE.Group; l: THREE.Mesh; rw: THREE.Mesh; a: number; rad: number; h: number; sp: number; ph: number }[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wing, mat);
    const rw = new THREE.Mesh(wing, mat);
    rw.scale.x = -1;
    g.add(l, rw);
    g.scale.setScalar(kind === 'bats' ? 0.9 : 1.2);
    g.userData.sky = true;
    parent.add(g);
    birds.push({ g, l, rw, a: r() * Math.PI * 2, rad: R * (0.25 + r() * 0.5), h: 9 + r() * 8, sp: (0.12 + r() * 0.12) * (r() < 0.5 ? 1 : -1), ph: r() * 6 });
  }
  return {
    update(t) {
      for (const b of birds) {
        const a = b.a + t * b.sp;
        b.g.position.set(cx + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + b.ph) * 0.6, cz + Math.sin(a) * b.rad);
        b.g.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * (kind === 'bats' ? 16 : 9) + b.ph) * 0.7;
        b.l.rotation.z = flap;
        b.rw.rotation.z = -flap;
      }
    },
  };
}

function makeBugs(parent: THREE.Object3D, kind: 'butterflies' | 'fireflies', spots: THREE.Vector3[], r: () => number): Life {
  if (!spots.length) return { update() {} };
  if (kind === 'fireflies') {
    const n = spots.length;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,220,1)');
    gr.addColorStop(0.3, 'rgba(255,240,140,0.6)');
    gr.addColorStop(1, 'rgba(255,220,80,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: '#fff3a0', size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    parent.add(pts);
    const ph = spots.map(() => r() * 10);
    return {
      update(t) {
        for (let i = 0; i < n; i++) {
          const s = spots[i];
          pos[i * 3] = s.x + Math.sin(t * 0.5 + ph[i]) * 0.8;
          pos[i * 3 + 1] = s.y + 0.6 + Math.sin(t * 0.9 + ph[i] * 2) * 0.35;
          pos[i * 3 + 2] = s.z + Math.cos(t * 0.4 + ph[i]) * 0.8;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.75 + Math.sin(t * 3) * 0.15;
      },
    };
  }
  const colours = ['#ffd23f', '#ff7eb6', '#7fd3ff', '#ffffff'];
  const wing = new THREE.CircleGeometry(0.09, 5);
  wing.translate(0.09, 0, 0);
  const flies: { g: THREE.Group; a: THREE.Mesh; b: THREE.Mesh; s: THREE.Vector3; ph: number }[] = [];
  for (const s of spots) {
    const mat = new THREE.MeshBasicMaterial({ color: colours[Math.floor(r() * colours.length)], side: THREE.DoubleSide });
    const g = new THREE.Group();
    const a = new THREE.Mesh(wing, mat);
    const b = new THREE.Mesh(wing, mat);
    a.rotation.x = b.rotation.x = -Math.PI / 2;
    b.scale.x = -1;
    g.add(a, b);
    parent.add(g);
    flies.push({ g, a, b, s, ph: r() * 10 });
  }
  return {
    update(t) {
      for (const f of flies) {
        const k = t * 0.6 + f.ph;
        f.g.position.set(f.s.x + Math.sin(k) * 1.4, f.s.y + 0.5 + Math.abs(Math.sin(k * 2.3)) * 0.5, f.s.z + Math.sin(k * 0.7) * 1.2);
        f.g.rotation.y = Math.cos(k) * 1.2;
        const flap = Math.sin(t * 14 + f.ph) * 1.1;
        f.a.rotation.y = flap;
        f.b.rotation.y = -flap;
      }
    },
  };
}

/** A far ring of low-poly hills, coloured from base to top, sunk into the fog. */
function makeHills(parent: THREE.Object3D, cols: [string, string], cx: number, cz: number, R: number, r: () => number, theme: Theme): void {
  const seg = 96;
  const rows = 4;
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(cols[0]);
  const top = new THREE.Color(cols[1]);
  const peaks: number[] = [];
  const mesa = theme === 'desert';
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let h = 0;
    for (let k = 1; k <= 4; k++) h += Math.sin(a * (k * 3 + 1) + r() * 0.2 + k * 1.7) / k;
    h = 0.55 + h * 0.35;
    if (mesa) h = h > 0.7 ? 1.05 : h > 0.45 ? 0.55 : 0.2;
    peaks.push(Math.max(0.15, h));
  }
  const H = R * (theme === 'snow' ? 0.28 : mesa ? 0.16 : 0.18);
  const c = new THREE.Color();
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rows; j++) {
      const quad = [
        [i, j], [i + 1, j], [i + 1, j + 1],
        [i, j], [i + 1, j + 1], [i, j + 1],
      ];
      for (const [ii, jj] of quad) {
        const a = (ii / seg) * Math.PI * 2;
        const f = jj / rows;
        const rad = R * (1 + f * 0.12);
        const hh = peaks[ii] * H * Math.sin(f * Math.PI * 0.5 + 0.0) * (mesa ? 1 : 1 - f * 0.2);
        pos.push(cx + Math.cos(a) * rad, hh * (1 - (jj === rows ? 0.3 : 0)) - 1, cz + Math.sin(a) * rad);
        c.copy(base).lerp(top, Math.min(1, (hh / H) * 1.1));
        if (theme === 'snow' && hh > H * 0.55) c.set('#ffffff');
        col.push(c.r, c.g, c.b);
      }
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
  m.material.userData.noDetail = true;
  m.receiveShadow = false;
  m.castShadow = false;
  m.userData.sky = true;
  m.name = 'horizon';
  parent.add(m);
}

/* ---------- fast "what ground is under (x, z)": triangles bucketed on a 2D grid */
type GroundHit = { y: number; color: THREE.Color; up: number };
function groundIndex(meshes: THREE.Object3D[]): (x: number, z: number) => GroundHit | null {
  const CELL = 2;
  const tris: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; col: THREE.Color; up: number }[] = [];
  const cells = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const ob of meshes) {
    const me = ob as THREE.Mesh;
    const geo = me.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!pos) continue;
    const idx = geo.getIndex();
    const vcol = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    const mats = Array.isArray(me.material) ? me.material : [me.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = mats[grp.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      const base = mat?.color ? mat.color : new THREE.Color('#888');
      for (let k = grp.start; k + 2 < grp.start + grp.count; k += 3) {
        const ia = idx ? idx.getX(k) : k, ib = idx ? idx.getX(k + 1) : k + 1, ic = idx ? idx.getX(k + 2) : k + 2;
        va.fromBufferAttribute(pos, ia).applyMatrix4(me.matrixWorld);
        vb.fromBufferAttribute(pos, ib).applyMatrix4(me.matrixWorld);
        vc.fromBufferAttribute(pos, ic).applyMatrix4(me.matrixWorld);
        e1.subVectors(vb, va);
        e2.subVectors(vc, va);
        const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
        const up = Math.abs(n.y);
        if (up < 0.3) continue;
        const col = base.clone();
        if (vcol && mat?.vertexColors) col.multiply(new THREE.Color(vcol.getX(ia), vcol.getY(ia), vcol.getZ(ia)));
        const t = tris.length;
        tris.push({ a: va.clone(), b: vb.clone(), c: vc.clone(), col, up });
        const i0 = Math.floor(Math.min(va.x, vb.x, vc.x) / CELL), i1 = Math.floor(Math.max(va.x, vb.x, vc.x) / CELL);
        const j0 = Math.floor(Math.min(va.z, vb.z, vc.z) / CELL), j1 = Math.floor(Math.max(va.z, vb.z, vc.z) / CELL);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) continue;
        for (let i = i0; i <= i1; i++)
          for (let j = j0; j <= j1; j++) {
            const kk = key(i, j);
            let l = cells.get(kk);
            if (!l) cells.set(kk, (l = []));
            l.push(t);
          }
      }
    }
  }
  return (x, z) => {
    const l = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return null;
    let best: GroundHit | null = null;
    for (const t of l) {
      const { a, b, c } = tris[t];
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const w2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      const y = a.y * w1 + b.y * w2 + c.y * w3;
      if (!best || y > best.y) best = { y, color: tris[t].col, up: tris[t].up };
    }
    return best;
  };
}

/* ---------- the dresser */
export function dressScene(scene: THREE.Scene, cam: THREE.PerspectiveCamera, o: DressOpts): Life[] {
  const g = gfx();
  const kit = KITS[o.theme];
  const lives: Life[] = [];
  const root = new THREE.Group();
  root.name = 'look:scenery';
  scene.add(root);
  const r = rng(o.seed ?? 1337);
  const keep = o.keepOut ?? [];
  const pathClear = o.pathClear ?? 1.6;
  const [bx0, bz0, bx1, bz1] = o.bounds ?? visibleGround(cam);
  const cx = o.centre?.[0] ?? (bx0 + bx1) / 2;
  const cz = o.centre?.[1] ?? (bz0 + bz1) / 2;
  // keep-out boxes: how far forward tall things may stand
  let frontZ = o.frontZ;
  if (frontZ === undefined) {
    frontZ = -Infinity;
    for (const s of keep) frontZ = Math.max(frontZ, 'circle' in s ? s.circle[1] - s.circle[2] : s.rect[1]) as number;
    if (!isFinite(frontZ)) frontZ = 0;
    frontZ -= 1;
  }
  const keepX = keep.reduce((m, s) => Math.max(m, 'circle' in s ? Math.abs(s.circle[0]) + s.circle[2] : Math.max(Math.abs(s.rect[0]), Math.abs(s.rect[2]))), 0);

  // what counts as ground: big flat meshes (not water, not the sky)
  scene.updateMatrixWorld(true);
  const grounds: THREE.Object3D[] = [];
  const blockers: THREE.Box3[] = [];
  const bb = new THREE.Box3();
  const sz = new THREE.Vector3();
  scene.traverse((ob) => {
    if (ob === root || ob.userData.sky) return;
    const me = ob as THREE.Mesh;
    if (!me.isMesh) return;
    bb.setFromObject(me);
    if (bb.isEmpty()) return;
    bb.getSize(sz);
    const mat = me.material as THREE.MeshStandardMaterial;
    const watery = !!mat && !Array.isArray(mat) && (/sea|water/i.test(me.name) || /sea/.test(mat.customProgramCacheKey?.() ?? '') || (mat.transparent && mat.opacity < 0.9));
    if (Math.max(sz.x, sz.z) > 5 && (sz.y < 4 || me.userData.ground || Math.max(sz.x, sz.z) > sz.y * 3) && !watery && !(me as THREE.InstancedMesh).isInstancedMesh) grounds.push(me);
    else if (Math.max(sz.x, sz.z) < 30 && sz.y > 0.15) blockers.push(bb.clone().expandByScalar(0.35));
  });
  if (!grounds.length) return lives;

  const groundAt = groundIndex(grounds);
  const blocked = (x: number, z: number, y: number, rad: number) => {
    for (const s of keep) if (inShape(x, z, s, rad + 0.6)) return true;
    if (o.paths) for (const p of o.paths) if (segDist(x, z, p) < pathClear + rad) return true;
    for (const b of blockers) if (x > b.min.x - rad && x < b.max.x + rad && z > b.min.z - rad && z < b.max.z + rad && y < b.max.y && y + 0.2 > b.min.y - 0.5) return true;
    return false;
  };
  const isWater = (c: THREE.Color) => {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return hsl.h > 0.5 && hsl.h < 0.66 && hsl.s > 0.45;
  };

  /* props */
  const area = Math.max(1, (bx1 - bx0) * (bz1 - bz0));
  const dens = g.scenery * (o.density ?? 1);
  const target = Math.min((o.maxProps ?? 160) * g.scenery, area * 0.06 * dens);
  const batch = new PropBatch();
  let placed = 0;
  const placedSpots: [number, number, number][] = [];
  for (let tries = 0; tries < target * 6 && placed < target; tries++) {
    const x = bx0 + r() * (bx1 - bx0);
    const z = bz0 + r() * (bz1 - bz0);
    const behind = z < frontZ || Math.abs(x) > keepX + 3.5;
    const front = z > frontZ + 1 && Math.abs(x) < keepX + 6;
    const list = !front && behind && r() < 0.55 ? kit.tall : r() < 0.6 ? kit.mid : kit.low;
    const pick = weighted(r, front ? kit.low : list);
    if (!pick) continue;
    const p = proto(pick[0]);
    if (!p.parts.length) continue;
    const s = pick[2] + r() * (pick[3] - pick[2]);
    const rad = p.r * s;
    if (front && p.h * s > 0.9) continue;
    const gnd = groundAt(x, z);
    if (!gnd || gnd.up < 0.75 || isWater(gnd.color)) continue;
    if (blocked(x, z, gnd.y, rad)) continue;
    // don't stack props on each other
    if (placedSpots.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + rad + 0.2)) continue;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, gnd.y - 0.02, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2), new THREE.Vector3(s, s * (0.9 + r() * 0.2), s));
    batch.add(pick[0], m);
    placedSpots.push([x, z, rad]);
    placed++;
  }
  batch.build(root, g.shadowMap > 0);

  /* clutter: grass tufts, flowers, pebbles */
  const bugSpots: THREE.Vector3[] = [];
  if (g.clutter > 0) {
    const tufts: THREE.Matrix4[] = [];
    const tuftCols: THREE.Color[] = [];
    const flowers: THREE.Matrix4[] = [];
    const flowerCols: THREE.Color[] = [];
    const pebbles: THREE.Matrix4[] = [];
    const step = 1.25 / Math.sqrt(g.clutter);
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (let x = bx0; x < bx1; x += step) {
      for (let z = bz0; z < bz1; z += step) {
        const jx = x + (r() - 0.5) * step * 1.6;
        const jz = z + (r() - 0.5) * step * 1.6;
        const gnd = groundAt(jx, jz);
        if (!gnd || gnd.up < 0.8 || isWater(gnd.color)) continue;
        if (blocked(jx, jz, gnd.y, 0.15)) continue;
        if (placedSpots.some(([px, pz, pr]) => Math.hypot(px - jx, pz - jz) < pr * 0.8)) continue;
        const hsl = { h: 0, s: 0, l: 0 };
        gnd.color.getHSL(hsl);
        const greenish = hsl.h > 0.17 && hsl.h < 0.45 && hsl.s > 0.2;
        const k = r();
        if (kit.grass && greenish && k < 0.75) {
          const s = 0.8 + r() * 1.1;
          tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(jx, gnd.y, jz), q.setFromAxisAngle(yAxis, r() * 6.28), new THREE.Vector3(s, s * (0.8 + r() * 0.6), s)));
          // tufts take the ground's own colour, a touch brighter, so they melt into it
          tuftCols.push(gnd.color.clone().lerp(new THREE.Color(kit.grass), 0.35).multiplyScalar(1.05 + r() * 0.2));
          if (kit.flowers.length && r() < 0.07) {
            const fs = 0.8 + r() * 0.6;
            flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(jx + 0.15, gnd.y, jz + 0.1), q.setFromAxisAngle(yAxis, r() * 6.28), new THREE.Vector3(fs, fs, fs)));
            flowerCols.push(new THREE.Color(kit.flowers[Math.floor(r() * kit.flowers.length)]));
          }
        } else if (greenish ? k < 0.8 : k < 0.22) {
          const s = 0.06 + r() * 0.12;
          pebbles.push(new THREE.Matrix4().compose(new THREE.Vector3(jx, gnd.y + s * 0.2, jz), q.setFromEuler(new THREE.Euler(r(), r() * 6, r())), new THREE.Vector3(s * 1.4, s * 0.6, s)));
        }
        if (kit.ground !== 'none' && r() < 0.012 * g.particles) bugSpots.push(new THREE.Vector3(jx, gnd.y, jz));
      }
    }
    if (tufts.length) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
      windy(mat, 0.14);
      const im = new THREE.InstancedMesh(tuftGeometry(), mat, tufts.length);
      tufts.forEach((m, i) => {
        im.setMatrixAt(i, m);
        im.setColorAt(i, tuftCols[i]);
      });
      im.receiveShadow = true;
      im.castShadow = false;
      im.name = 'scenery:tufts';
      root.add(im);
    }
    if (flowers.length) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      windy(mat, 0.2);
      const im = new THREE.InstancedMesh(flowerGeometry(), mat, flowers.length);
      flowers.forEach((m, i) => {
        im.setMatrixAt(i, m);
        im.setColorAt(i, flowerCols[i]);
      });
      im.castShadow = false;
      im.receiveShadow = true;
      im.name = 'scenery:flowers';
      root.add(im);
    }
    if (pebbles.length) {
      const mat = new THREE.MeshStandardMaterial({ color: kit.pebble, roughness: 0.85, flatShading: true });
      const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat, pebbles.length);
      pebbles.forEach((m, i) => im.setMatrixAt(i, m));
      im.receiveShadow = true;
      im.castShadow = false;
      im.name = 'scenery:pebbles';
      root.add(im);
    }
  }

  /* life */
  const span = Math.max(bx1 - bx0, bz1 - bz0);
  if (kit.clouds && g.scenery > 0.5) lives.push(makeClouds(root, kit.clouds, cx, cz, span * 0.8, r, Math.round(8 * g.scenery)));
  if (kit.sky !== 'none' && g.particles > 0.3) lives.push(makeFlyers(root, kit.sky, cx, cz, span * 0.6, r, Math.round(6 * g.particles)));
  if (bugSpots.length) lives.push(makeBugs(root, kit.ground as 'butterflies' | 'fireflies', bugSpots.slice(0, Math.round(26 * g.particles)), r));
  if (kit.hills && (o.horizon ?? 0) > 0) makeHills(root, kit.hills, cx, cz, o.horizon!, r, o.theme);
  return lives;
}

/** Advance the shared wind clock (grass and flowers). */
export function tickScenery(t: number): void {
  windUniform.value = t;
}
