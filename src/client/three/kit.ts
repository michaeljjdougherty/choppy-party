import * as THREE from 'three';
import { sky, type SkyName } from './assets';
import { hasWaves, seaWater } from './nature';

/** Shared look: glossy, saturated "painted toy" plastic. */
export function toy(color: THREE.ColorRepresentation, rough = 0.42): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

export function lighten(color: THREE.ColorRepresentation, amt: number): THREE.Color {
  return new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amt);
}

export function darken(color: THREE.ColorRepresentation, amt: number): THREE.Color {
  return new THREE.Color(color).lerp(new THREE.Color('#000000'), amt);
}

/** Vertical gradient used as a sky. */
export function skyTexture(top: string, bottom: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function checkerTexture(a: string, b: string, cells = 8, size = 256): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const s = size / cells;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * s, y * s, s, s);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function stripeTexture(a: string, b: string, stripes = 8, size = 256): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const s = size / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(i * s, 0, s, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface SceneOpts {
  skyTop: string;
  skyBottom: string;
  fog?: [string, number, number];
  sunDir?: [number, number, number];
  sunColor?: string;
  sunIntensity?: number;
  shadowSize?: number;
  /** A Kenney skybox; the gradient colours are the fallback. */
  sky?: SkyName;
  skyRotation?: number;
}

/** A scene with sky, soft fill light and one shadow-casting sun. */
export function makeScene(env: THREE.Texture, o: SceneOpts): THREE.Scene {
  const scene = new THREE.Scene();
  const real = o.sky ? sky(o.sky) : null;
  scene.background = real ?? skyTexture(o.skyTop, o.skyBottom);
  if (real && o.skyRotation) scene.backgroundRotation.set(0, o.skyRotation, 0);
  scene.environment = env;
  scene.environmentIntensity = 0.4;
  if (o.fog) scene.fog = new THREE.Fog(o.fog[0], o.fog[1], o.fog[2]);
  scene.add(new THREE.HemisphereLight('#cfe9ff', '#a87c52', 0.85));
  const sun = new THREE.DirectionalLight(o.sunColor ?? '#fff4dc', o.sunIntensity ?? 2.2);
  const d = o.sunDir ?? [8, 18, 10];
  sun.position.set(d[0], d[1], d[2]);
  sun.castShadow = true;
  const sz = o.shadowSize ?? 20;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -sz;
  sun.shadow.camera.right = sz;
  sun.shadow.camera.top = sz;
  sun.shadow.camera.bottom = -sz;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);
  return scene;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? false;
  return m;
}

/** Arena pixels (1280x720 logic space used by game rules) to world units. */
export const PX = 1 / 40;
export const wx = (x: number) => (x - 640) * PX;
export const wz = (y: number) => (y - 360) * PX;

/** 2D facing angle (x right, y down) to a Y rotation for a model that looks down +Z. */
export const yaw = (face: number) => Math.atan2(Math.cos(face), Math.sin(face));

export function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

/**
 * Cartoon water to match the Kenney kits: flat glossy blue with soft wave bands and white
 * glints, drawn once on a tileable canvas. Call `update(t)` each frame to make it drift.
 */
export function toonWater(base: string, repeat: number): { material: THREE.MeshStandardMaterial; update: (t: number) => void } {
  // the animated sea (from Michael's Sea part model) everywhere it loaded; painted bands otherwise
  if (hasWaves()) return seaWater(base, 11);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  c.fillStyle = base;
  c.fillRect(0, 0, S, S);
  // wave bands: sine curves with a whole number of periods so the tile wraps cleanly
  const light = '#' + lighten(base, 0.18).getHexString();
  for (let i = 0; i < 5; i++) {
    const y0 = (i / 5) * S + 10;
    c.strokeStyle = i % 2 ? light : '#' + lighten(base, 0.1).getHexString();
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    for (let x = 0; x <= S; x += 4) {
      const y = y0 + Math.sin((x / S) * Math.PI * 2 * 2 + i) * 7;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  // little white glints
  c.fillStyle = 'rgba(255,255,255,0.85)';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const w = 6 + rnd() * 12;
    c.beginPath();
    c.ellipse(x, y, w, 2.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0.05 });
  return {
    material,
    update(t: number) {
      tex.offset.set((t * 0.012) % 1, (Math.sin(t * 0.4) * 0.02 + t * 0.006) % 1);
    },
  };
}
