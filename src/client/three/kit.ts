import * as THREE from 'three';

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
}

/** A scene with sky, soft fill light and one shadow-casting sun. */
export function makeScene(env: THREE.Texture, o: SceneOpts): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = skyTexture(o.skyTop, o.skyBottom);
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
