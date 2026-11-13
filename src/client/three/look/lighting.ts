import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { gfx } from './quality';

/**
 * Image-based lighting from Poly Haven HDRIs (CC0, via @pmndrs/assets at 512px; see
 * public/hdri/CREDITS.txt). They only light and reflect; the visible skies stay painted.
 */
export const HDRIS = ['park', 'forest', 'night', 'sunset', 'sunrise', 'studio', 'dawn', 'sky', 'lobby'] as const;
export type HdriName = (typeof HDRIS)[number];

/** Model-file suffix trick for hosts that refuse unknown extensions (same as the .glb models). */
const SUFFIX: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_SUFFIX ?? '';

const raw = new Map<HdriName, THREE.DataTexture>();
const pm = new Map<HdriName, THREE.Texture>();
let pmrem: THREE.PMREMGenerator | null = null;

export async function loadHdris(): Promise<void> {
  if (!gfx().hdri) return;
  const loader = new EXRLoader();
  await Promise.all(
    HDRIS.map(async (n) => {
      try {
        const t = await loader.loadAsync(`hdri/${n}.exr${SUFFIX}`);
        t.mapping = THREE.EquirectangularReflectionMapping;
        raw.set(n, t);
      } catch (e) {
        console.warn('Could not load HDRI', n, e);
      }
    }),
  );
}

/** A prefiltered environment map for `name`, or null when HDRIs are off or missing. */
export function hdriEnv(renderer: THREE.WebGLRenderer, name: HdriName): THREE.Texture | null {
  if (!gfx().hdri) return null;
  const hit = pm.get(name);
  if (hit) return hit;
  const src = raw.get(name);
  if (!src) return null;
  pmrem ??= new THREE.PMREMGenerator(renderer);
  const t = pmrem.fromEquirectangular(src).texture;
  pm.set(name, t);
  return t;
}

export interface LightMood {
  hdri?: HdriName;
  /** scene.environmentIntensity */
  envIntensity?: number;
  /** Multiplies the existing sun / hemisphere light. */
  sun?: number;
  hemi?: number;
  /** Warm-or-cool rim light from behind the camera's view, to pop characters off the ground. */
  rim?: string;
  rimIntensity?: number;
  exposure?: number;
}

/**
 * Re-light a scene built by makeScene(): swap in the HDRI, tune the existing lights, upgrade the
 * shadows to the quality preset and add a rim light.
 */
export function relight(renderer: THREE.WebGLRenderer, scene: THREE.Scene, m: LightMood): void {
  const g = gfx();
  const env = m.hdri ? hdriEnv(renderer, m.hdri) : null;
  if (env) {
    scene.environment = env;
    scene.environmentIntensity = m.envIntensity ?? 0.55;
  }
  let sun: THREE.DirectionalLight | null = null;
  scene.traverse((o) => {
    const d = o as THREE.DirectionalLight;
    if (d.isDirectionalLight && !o.userData.lookRim) {
      if (!o.userData.lookBase) o.userData.lookBase = d.intensity;
      d.intensity = o.userData.lookBase * (m.sun ?? 1);
      if (d.castShadow) {
        sun ??= d;
        const size = g.shadowMap;
        if (size === 0) d.castShadow = false;
        else if (d.shadow.mapSize.x !== size) {
          d.shadow.mapSize.set(size, size);
          d.shadow.map?.dispose();
          d.shadow.map = null as unknown as THREE.WebGLRenderTarget;
        }
        // bias by shadow texel size, so big arenas and small shadow maps don't get striped "shadow acne"
        const cam = d.shadow.camera;
        const texel = Math.max(cam.right - cam.left, cam.top - cam.bottom) / Math.max(256, size || 1024);
        if (o.userData.lookNB === undefined) o.userData.lookNB = d.shadow.normalBias;
        d.shadow.normalBias = Math.max(o.userData.lookNB, texel * 1.5);
        d.shadow.bias = Math.min(d.shadow.bias, -0.0004);
        d.shadow.radius = g.softShadows ? 5 : 1;
        d.shadow.blurSamples = g.softShadows ? 16 : 8;
      }
    }
    const h = o as THREE.HemisphereLight;
    if (h.isHemisphereLight) {
      if (!o.userData.lookBase) o.userData.lookBase = h.intensity;
      h.intensity = o.userData.lookBase * (m.hemi ?? 1);
    }
  });
  if (m.rim && !scene.userData.lookRim) {
    const rim = new THREE.DirectionalLight(m.rim, m.rimIntensity ?? 0.8);
    const s = sun as THREE.DirectionalLight | null;
    // opposite the sun, a little above the horizon
    const p = s ? s.position.clone().setY(0).normalize().multiplyScalar(-20) : new THREE.Vector3(0, 0, -20);
    rim.position.set(p.x, 9, p.z);
    rim.userData.lookRim = true;
    scene.add(rim);
    scene.userData.lookRim = rim;
  }
}
