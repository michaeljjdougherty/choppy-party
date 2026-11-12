import * as THREE from 'three';

/**
 * Lush grass tufts swaying in the breeze: one instanced mesh of curved, tapered blades with a dark
 * root and sunlit tips. Scatter it over lawns and around arena edges so grass reads as grass, not a
 * flat green floor.
 */
let tuftGeo: THREE.BufferGeometry | null = null;
function tuft(): THREE.BufferGeometry {
  if (tuftGeo) return tuftGeo;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const BLADES = 7, SEG = 4;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + b * 0.7;
    const lean = 0.25 + ((b * 37) % 10) / 25;
    const h = 0.55 + ((b * 53) % 10) / 22;
    const w = 0.07;
    const ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08;
    const dx = Math.cos(a), dz = Math.sin(a);
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const k = s / SEG;
      const bend = lean * k * k;
      const cx = ox + dx * bend, cz = oz + dz * bend, cy = h * k;
      const ww = w * (1 - k * 0.92);
      // blade faces sideways to its lean
      pos.push(cx - dz * ww, cy, cz + dx * ww, cx + dz * ww, cy, cz - dx * ww);
      const shade = 0.35 + k * 0.75;
      col.push(shade, shade, shade, shade, shade, shade);
    }
    for (let s = 0; s < SEG; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // grass looks best lit from above: point all normals up-ish so blades don't go black edge-on
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  g.normalizeNormals?.();
  tuftGeo = g;
  return g;
}

export interface GrassOpts {
  /** [x0, z0, x1, z1] to scatter over. */
  area: [number, number, number, number];
  count: number;
  color?: THREE.ColorRepresentation;
  /** Size of a tuft (about its height). */
  size?: number;
  /** Return true to keep a spot (e.g. only outside the arena). */
  keep?: (x: number, z: number) => boolean;
  /** Ground height. */
  gy?: (x: number, z: number) => number;
}

export function scatterGrass(parent: THREE.Object3D, o: GrassOpts): THREE.InstancedMesh {
  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? '#5fae3c', vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  mat.userData.noDetail = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.22) * 0.6 + sin(uTime * 3.1 + wp.x * 0.9) * 0.25;
        transformed.x += sway * 0.12 * position.y * position.y;
        transformed.z += sway * 0.06 * position.y * position.y;`,
      );
  };
  mat.customProgramCacheKey = () => 'grass-sway';
  const im = new THREE.InstancedMesh(tuft(), mat, o.count);
  const m = new THREE.Object3D();
  const c = new THREE.Color();
  const base = new THREE.Color(o.color ?? '#5fae3c');
  let n = 0;
  for (let tries = 0; n < o.count && tries < o.count * 6; tries++) {
    const x = o.area[0] + Math.random() * (o.area[2] - o.area[0]);
    const z = o.area[1] + Math.random() * (o.area[3] - o.area[1]);
    if (o.keep && !o.keep(x, z)) continue;
    m.position.set(x, o.gy ? o.gy(x, z) : 0, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar((o.size ?? 0.7) * (0.6 + Math.random() * 0.8));
    m.updateMatrix();
    im.setMatrixAt(n, m.matrix);
    c.copy(base).offsetHSL((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08);
    im.setColorAt(n, c);
    n++;
  }
  im.count = n;
  im.receiveShadow = true;
  im.onBeforeRender = () => {
    time.value = performance.now() / 1000;
  };
  parent.add(im);
  return im;
}
