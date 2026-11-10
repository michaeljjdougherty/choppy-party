import * as THREE from 'three';

/** Cheap smooth noise from layered sines: no texture, no allocation, stable across reloads. */
export function waves(x: number, z: number): number {
  return (
    Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2.1) * 0.5 +
    Math.sin(z * 0.13 - x * 0.05 + 1.3) * 0.35 +
    Math.sin((x + z) * 0.31 + 0.7) * 0.15
  );
}

/**
 * A low-poly heightfield with per-vertex colours, the Kenney way: flat-shaded facets, bright
 * colours, no textures. `height` and `color` decide everything.
 */
export function terrainMesh(o: {
  w: number;
  d: number;
  seg: number;
  cx?: number;
  cz?: number;
  height: (x: number, z: number) => number;
  color: (x: number, z: number, y: number, slope: number, out: THREE.Color) => void;
}): THREE.Mesh {
  const g = new THREE.PlaneGeometry(o.w, o.d, o.seg, Math.round((o.seg * o.d) / o.w));
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (o.cx ?? 0);
    const z = pos.getZ(i) + (o.cz ?? 0);
    pos.setXYZ(i, x, o.height(x, z), z);
  }
  // flat facets: every triangle gets its own vertices, coloured by its centre
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  const p = flat.getAttribute('position') as THREE.BufferAttribute;
  const nrm = flat.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let t = 0; t < p.count; t += 3) {
    const x = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const z = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const slope = 1 - Math.abs(nrm.getY(t));
    o.color(x, z, y, slope, c);
    for (let k = 0; k < 3; k++) c.toArray(colors, (t + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
  m.receiveShadow = true;
  m.userData.ground = true;
  return m;
}

/** Smooth 0..1 ramp. */
export const ramp = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
