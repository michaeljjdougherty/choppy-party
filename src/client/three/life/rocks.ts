import * as THREE from 'three';

/**
 * Detailed rocks for set pieces: a finely subdivided sphere pushed about by layered noise, so it
 * reads as a real lumpy boulder with smooth shading (not a faceted low-poly blob).
 * Meteors add molten cracks that glow from inside the crevices.
 */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, k: number) => a + (b - a) * k;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
const fbm = (x: number, y: number, z: number) => noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.28 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.17;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** A lumpy rock of about `radius`, with a 'heat' attribute (1 deep in the cracks, 0 on the bumps). */
export function rockGeometry(radius = 1, seed = 1, lumpy = 0.32): THREE.BufferGeometry {
  const key = `${radius}:${seed}:${lumpy}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = new THREE.IcosahedronGeometry(radius, 5);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const heat = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const o = seed * 13.37;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    const n = fbm(p.x * 1.6 + o, p.y * 1.6 + o, p.z * 1.6 + o);
    // ridged detail: sharp creases where the noise crosses its middle
    const ridge = 1 - Math.abs(noise(p.x * 5 + o, p.y * 5 - o, p.z * 5 + o) * 2 - 1);
    const d = 1 + (n - 0.5) * lumpy * 2 - ridge * ridge * 0.06;
    // a slightly squashed, uneven shape rather than a ball
    pos.setXYZ(i, p.x * radius * d * 1.08, p.y * radius * d * 0.86, p.z * radius * d);
    heat[i] = Math.max(0, Math.min(1, (0.5 - n) * 3 + ridge ** 6 * 0.9));
  }
  g.setAttribute('heat', new THREE.BufferAttribute(heat, 1));
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/** Sun-baked canyon stone. */
export function stoneMaterial(color = '#a07a58'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
}

/** Dark basalt with molten cracks glowing out of the crevices. `glow` can be animated (uniform). */
export function moltenMaterial(): THREE.MeshStandardMaterial & { userData: { glow: { value: number } } } {
  const m = new THREE.MeshStandardMaterial({ color: '#3a2c2a', roughness: 0.85, metalness: 0.05, emissive: '#ff5a14', emissiveIntensity: 1 });
  const glow = { value: 1.6 };
  m.userData.glow = glow;
  m.userData.noDetail = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float heat;\nvarying float vHeat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeat;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= pow(vHeat, 2.2) * uGlow;\ndiffuseColor.rgb *= 1.0 - vHeat * 0.6;');
  };
  m.customProgramCacheKey = () => 'molten';
  return m as THREE.MeshStandardMaterial & { userData: { glow: { value: number } } };
}
