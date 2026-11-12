import * as THREE from 'three';

/**
 * Small pieces that stop effects reading as flat polygons: soft blob shadows with feathered edges,
 * telegraph markers (a crisp glowing ring with a soft fill that closes in as the danger arrives),
 * glow sprites and soft fire/energy trails. Shared by the minigame views.
 */
const cache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** A feathered dark disc for contact/blob shadows. */
export function softShadowTex(): THREE.Texture {
  return canvasTex('shadow', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(0,0,0,1)');
    r.addColorStop(0.45, 'rgba(0,0,0,0.75)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}
/** Material for a blob shadow (use on a plane/circle of the shadow's diameter). */
export function softShadowMat(opacity = 0.4): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: softShadowTex(), color: '#000', transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** A white glow (hot centre, long soft falloff) to tint with a sprite colour. */
export function glowTex(): THREE.Texture {
  return canvasTex('glow', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.18, 'rgba(255,255,255,0.65)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}
export function glowSprite(color: THREE.ColorRepresentation, size = 1, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

/**
 * A danger telegraph on the floor: a bright anti-aliased ring with a soft inner glow, plus a fill that
 * grows from the centre as `prog` goes 0 -> 1 (arrival), and a heartbeat pulse as it gets close.
 * Geometry: a unit plane (2x2) laid flat; scale it to the radius.
 */
export interface Telegraph extends THREE.Mesh {
  userData: { prog: { value: number }; time: { value: number } };
}
const TELE_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
export function telegraph(color: THREE.ColorRepresentation = '#ff3b3b'): Telegraph {
  const prog = { value: 0 };
  const time = { value: 0 };
  const m = new THREE.Mesh(
    TELE_GEO,
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uProg: prog, uTime: time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uProg; uniform float uTime; varying vec2 vUv;
        void main(){
          float d = length(vUv);
          float aa = fwidth(d) * 1.5;
          float pulse = 1.0 + 0.35 * uProg * sin(uTime * (8.0 + uProg * 14.0));
          // crisp ring at the edge, with a glow bleeding inward
          float ring = smoothstep(0.86 - aa, 0.88, d) * (1.0 - smoothstep(0.98, 1.0 + aa, d));
          float inner = smoothstep(0.35, 0.98, d) * (1.0 - step(1.0, d)) * 0.35;
          // the fill closing in: a soft disc whose edge is at uProg
          float fill = (1.0 - smoothstep(uProg - 0.08, uProg + aa, d)) * (0.18 + 0.32 * uProg);
          float alpha = clamp((ring * 0.95 + inner + fill) * pulse, 0.0, 1.0);
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor * (1.0 + ring * 0.6), alpha);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  ) as unknown as Telegraph;
  m.userData = { prog, time };
  m.renderOrder = 3;
  return m;
}

/**
 * A soft, tapering trail (fire, energy, a comet tail) along +y from the origin, `len` long.
 * Bright and wide at the head, thinning and fading to nothing at the tail, soft on its sides.
 */
const TRAIL_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.15, 1, 1, 20, 8, true);
  g.translate(0, 0.5, 0);
  return g;
})();
export function trailMaterial(head: THREE.ColorRepresentation, tail: THREE.ColorRepresentation): THREE.ShaderMaterial & { userData: { time: { value: number } } } {
  const time = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: new THREE.Color(head) }, uTail: { value: new THREE.Color(tail) }, uTime: time },
    vertexShader: /* glsl */ `
      varying float vK; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vK = position.y; vP = position;
        vec4 w = modelMatrix * vec4(position,1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHead; uniform vec3 uTail; uniform float uTime;
      varying float vK; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float along = pow(1.0 - vK, 1.6);
        float flick = 0.75 + 0.25 * sin(vK * 22.0 - uTime * 30.0 + atan(vP.z, vP.x) * 3.0);
        float a = edge * along * flick;
        vec3 c = mix(uTail, uHead, pow(1.0 - vK, 2.0)) * (1.0 + (1.0 - vK) * 0.8);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.userData.time = time;
  return m as THREE.ShaderMaterial & { userData: { time: { value: number } } };
}
export function trail(mat: THREE.ShaderMaterial, radius: number, len: number): THREE.Mesh {
  const t = new THREE.Mesh(TRAIL_GEO, mat);
  t.scale.set(radius, len, radius);
  t.frustumCulled = false;
  t.renderOrder = 6;
  return t;
}

/** A teardrop flame texture: white-hot core, orange body, transparent edges. */
function flameTex(): THREE.Texture {
  return canvasTex('flame', 128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s * 0.72, 0, s / 2, s * 0.62, s * 0.5);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.25, 'rgba(255,214,110,0.95)');
    grd.addColorStop(0.55, 'rgba(255,120,30,0.6)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    // a teardrop: round at the bottom, licking up to a point
    g.moveTo(s / 2, s * 0.04);
    g.bezierCurveTo(s * 0.62, s * 0.3, s * 0.9, s * 0.55, s * 0.82, s * 0.78);
    g.arc(s / 2, s * 0.72, s * 0.33, 0.2, Math.PI - 0.2);
    g.bezierCurveTo(s * 0.1, s * 0.55, s * 0.38, s * 0.3, s / 2, s * 0.04);
    g.fill();
  });
}

const clock = () => performance.now() / 1000;

/**
 * A living flame (for braziers, torches, candles, fire baskets): a few flickering, swaying flame cards
 * around a hot glow, with an optional real point light that flickers with it. Animates itself, so a
 * view can just add it and forget it. `size` is roughly the flame's height in world units.
 */
export function flame(size = 1, opts: { light?: number; color?: THREE.ColorRepresentation } = {}): THREE.Group {
  const g = new THREE.Group();
  const tex = flameTex();
  const seed = Math.random() * 100;
  const cards: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: opts.color ?? '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: i === 0 ? 1 : 0.7 }));
    sp.center.set(0.5, 0.2);
    cards.push(sp);
    g.add(sp);
  }
  const glow = glowSprite('#ff9a3a', size * 2.6, 0.55);
  glow.position.y = size * 0.25;
  g.add(glow);
  let light: THREE.PointLight | null = null;
  if (opts.light) {
    light = new THREE.PointLight('#ff9a46', opts.light, size * 9, 2);
    light.position.y = size * 0.5;
    g.add(light);
  }
  cards[0].onBeforeRender = () => {
    const t = clock() + seed;
    cards.forEach((c, i) => {
      const f = 1 + Math.sin(t * (13 + i * 4)) * 0.08 + Math.sin(t * (7.3 + i)) * 0.1;
      const w = size * (i === 0 ? 0.62 : 0.5);
      c.scale.set(w * (2 - f) * 0.9, size * f * (i === 0 ? 1 : 0.8), 1);
      c.position.set(Math.sin(t * (3 + i)) * size * 0.05 + (i - 1) * size * 0.1, 0, (i - 1) * size * 0.05);
      c.material.rotation = Math.sin(t * (2.3 + i * 0.7)) * 0.12;
    });
    glow.material.opacity = 0.5 + Math.sin(t * 11) * 0.06;
    if (light) light.intensity = (opts.light ?? 0) * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.07);
  };
  return g;
}

/** A soft lamp glow (halo at a lamp head), gently breathing. */
export function lampGlow(color: THREE.ColorRepresentation = '#ffc070', size = 1.6): THREE.Sprite {
  const s = glowSprite(color, size, 0.8);
  const seed = Math.random() * 10;
  s.onBeforeRender = () => {
    s.material.opacity = 0.75 + Math.sin(clock() * 2.1 + seed) * 0.06;
  };
  return s;
}

/** A soft glowing floor disc (auras, magic circles), feathered instead of a hard circle. */
export function glowDisc(color: THREE.ColorRepresentation, radius: number, opacity = 0.6): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.4, radius * 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.renderOrder = 2;
  return m;
}

/** Sit `child` on top of a placed prop (at `frac` of its height), in the prop's parent's space. */
export function onTop(o: THREE.Object3D, child: THREE.Object3D, frac = 1, dy = 0): THREE.Object3D {
  o.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  const p = new THREE.Vector3(c.x, box.min.y + (box.max.y - box.min.y) * frac + dy, c.z);
  const parent = o.parent!;
  parent.add(child);
  child.position.copy(parent.worldToLocal(p));
  return child;
}

/** A soft, lumpy fog patch texture. */
function fogTex(): THREE.Texture {
  return canvasTex('fog', 256, (g, s) => {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.22;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, r = s * (0.12 + Math.random() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
  });
}

/**
 * Low ground mist that rolls slowly across an area (graveyards, swamps, night scenes). Layers of soft
 * patches just above the ground, drifting with a breeze and wrapping round. Animates itself.
 */
export function groundFog(area: [number, number, number, number], opts: { count?: number; color?: THREE.ColorRepresentation; opacity?: number; y?: number; size?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: fogTex(), color: opts.color ?? '#c8d4ff', transparent: true, opacity: opts.opacity ?? 0.55, depthWrite: false, fog: false });
  const n = opts.count ?? 24;
  const [x0, z0, x1, z1] = area;
  const W = x1 - x0, D = z1 - z0;
  const patches: { m: THREE.Mesh; x: number; z: number; v: number; spin: number }[] = [];
  for (let i = 0; i < n; i++) {
    const sz = (opts.size ?? 7) * (0.7 + Math.random() * 0.7);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), mat);
    m.position.y = (opts.y ?? 0.25) + (i % 3) * 0.18;
    m.renderOrder = 7;
    g.add(m);
    patches.push({ m, x: Math.random() * W, z: Math.random() * D, v: 0.25 + Math.random() * 0.35, spin: (Math.random() - 0.5) * 0.08 });
  }
  let lastT = clock();
  patches[0].m.onBeforeRender = () => {
    const t = clock();
    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    for (const p of patches) {
      p.x = (p.x + p.v * dt + W) % W;
      p.m.position.x = x0 + p.x;
      p.m.position.z = z0 + p.z + Math.sin(t * 0.2 + p.x) * 0.6;
      p.m.rotation.y += p.spin * dt;
    }
  };
  return g;
}
