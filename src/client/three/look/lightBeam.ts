import * as THREE from 'three';

/**
 * Real-looking light for lanterns, torches and searchlights: a soft volumetric shaft (bright at the
 * source, fading with distance and toward its edges, with slow drifting dust in it), a soft-edged
 * pool where it meets the ground, a glow halo at the source and a few motes glinting in the beam.
 * Pair it with a real THREE.SpotLight for the actual lighting.
 */
const VERT = /* glsl */ `
varying float vAlong;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  // the cone is built apex at y=0 opening down to y=-1
  vAlong = clamp(-position.y, 0.0, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying float vAlong;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z);
}
void main() {
  // soft at the rim (where we look across the surface edge-on), strongest down the middle
  float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
  float fall = pow(1.0 - vAlong, 1.3) * smoothstep(0.0, 0.06, vAlong);
  float dust = 0.75 + 0.5 * n3(vWorld * 1.3 + vec3(0.0, uTime * 0.25, uTime * 0.15));
  float a = edge * fall * dust * uStrength;
  gl_FragColor = vec4(uColor * a, a);
}`;

const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uHalf;
varying vec2 vUv;
void main() {
  // vUv: x along the beam (0 at the source), y across it (-1..1 of the half angle)
  float r = vUv.x;
  float ang = abs(vUv.y);
  float side = 1.0 - smoothstep(0.55, 1.0, ang);
  float len = smoothstep(0.0, 0.12, r) * (1.0 - smoothstep(0.55, 1.0, r));
  float a = side * len * uStrength;
  gl_FragColor = vec4(uColor * a, a);
}`;
const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

let haloTex: THREE.Texture | null = null;
function halo(): THREE.Texture {
  if (haloTex) return haloTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,240,1)');
  r.addColorStop(0.2, 'rgba(255,220,150,0.6)');
  r.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

export interface Beam {
  group: THREE.Group;
  /** Point the beam: source position, a direction (any length) and how strong (0..1+). */
  aim(from: THREE.Vector3, dir: THREE.Vector3, strength?: number, poolFrom?: THREE.Vector3): void;
  update(t: number, dt: number): void;
}

/**
 * `length`: how far the shaft reaches; `half`: the half-angle of the cone in radians.
 * `ground`: draw the pool of light on the ground plane at y = groundY (for beams pointed down/along the floor).
 */
export function makeBeam(color: THREE.ColorRepresentation, length: number, half: number, opts: { ground?: boolean; groundY?: number; strength?: number } = {}): Beam {
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  const strength = { value: opts.strength ?? 0.55 };
  const time = { value: 0 };
  // the shaft
  const geo = new THREE.ConeGeometry(Math.tan(half), 1, 40, 12, true);
  geo.translate(0, -0.5, 0); // apex at the origin, opening toward -y
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col }, uStrength: strength, uTime: time },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const shaft = new THREE.Mesh(geo, shaftMat);
  shaft.scale.set(length, length, length);
  shaft.renderOrder = 5;
  shaft.frustumCulled = false;
  const pivot = new THREE.Group(); // turned so local -y points along the beam
  pivot.add(shaft);
  group.add(pivot);
  // the pool on the ground: a fan with its own soft edges
  let pool: THREE.Mesh | null = null;
  const poolStrength = { value: (opts.strength ?? 0.55) * 0.7 };
  if (opts.ground) {
    const segs = 32;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const rings = 10;
    for (let r = 0; r <= rings; r++)
      for (let s = 0; s <= segs; s++) {
        const k = r / rings, a = -half + (s / segs) * half * 2;
        pos.push(Math.cos(a) * k * length, 0, Math.sin(a) * k * length);
        uv.push(k, (s / segs) * 2 - 1);
      }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const i = r * (segs + 1) + s;
        idx.push(i, i + segs + 1, i + 1, i + 1, i + segs + 1, i + segs + 2);
      }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    pg.setIndex(idx);
    pool = new THREE.Mesh(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col }, uStrength: poolStrength, uHalf: { value: half } },
        vertexShader: POOL_VERT,
        fragmentShader: POOL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    pool.renderOrder = 4;
    group.add(pool);
  }
  // a glow at the source
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(1.6);
  group.add(glow);
  // dust motes drifting in the light
  const N = 70;
  const mPos = new Float32Array(N * 3);
  const seeds = Array.from({ length: N }, () => [Math.random(), Math.random(), Math.random()]);
  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mPos, 3)),
    new THREE.PointsMaterial({ color: col, size: 0.07, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  motes.frustumCulled = false;
  group.add(motes);

  const src = new THREE.Vector3();
  const fwd = new THREE.Vector3(1, 0, 0);
  const flat = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const down = new THREE.Vector3(0, -1, 0);
  let str = 1;
  return {
    group,
    aim(from, dir, s = 1, poolFrom) {
      src.copy(from);
      fwd.copy(dir).normalize();
      str = s;
      pivot.position.copy(from);
      q.setFromUnitVectors(down, fwd);
      pivot.quaternion.copy(q);
      glow.position.copy(from);
      if (pool) {
        pool.position.set((poolFrom ?? from).x, opts.groundY ?? 0.03, (poolFrom ?? from).z);
        flat.set(fwd.x, 0, fwd.z);
        pool.rotation.y = -Math.atan2(flat.z, flat.x);
      }
    },
    update(t, dt) {
      time.value = t;
      const flick = 1 + Math.sin(t * 11) * 0.03 + Math.sin(t * 23.7) * 0.02;
      strength.value = (opts.strength ?? 0.55) * str * flick;
      poolStrength.value = (opts.strength ?? 0.55) * 1.05 * str * flick;
      glow.material.opacity = Math.min(1, 0.9 * str * flick);
      // motes: slow drifting points kept inside the cone
      const side = new THREE.Vector3().crossVectors(fwd, Math.abs(fwd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, fwd).normalize();
      for (let i = 0; i < N; i++) {
        const [a, b, c] = seeds[i];
        const along = ((a + t * 0.03 * (0.5 + c)) % 1) * length * 0.85 + 0.3;
        const r = Math.tan(half) * along * Math.sqrt(b) * 0.85;
        const ang = c * Math.PI * 2 + t * 0.2 * (b - 0.5);
        const p = src.clone().addScaledVector(fwd, along).addScaledVector(side, Math.cos(ang) * r).addScaledVector(up, Math.sin(ang) * r);
        mPos[i * 3] = p.x;
        mPos[i * 3 + 1] = p.y;
        mPos[i * 3 + 2] = p.z;
      }
      motes.geometry.attributes.position.needsUpdate = true;
      (motes.material as THREE.PointsMaterial).opacity = 0.7 * str;
      void dt;
    },
  };
}
