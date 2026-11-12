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
