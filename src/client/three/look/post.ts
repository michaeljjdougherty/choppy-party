import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { gfx, type Gfx } from './quality';

/**
 * The post-processing chain: render, ambient occlusion (Ultra), bloom, tone mapping, then our
 * grade (contrast, saturation, warm/cool split, vignette, film grain, impact flashes), FXAA when
 * there's no MSAA, and a miniature tilt-shift for the boards.
 *
 * Gameplay code can kick a screen effect with postPulse('impact') etc.; it decays on its own.
 */

export interface Grade {
  exposure: number;
  contrast: number;
  saturation: number;
  /** Shadow tint (added) and highlight tint (multiplied). */
  lift: [number, number, number];
  gain: [number, number, number];
  vignette: number;
  vignetteColor: string;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** Tilt-shift strength (0 = off). Only on the boards. */
  tilt: number;
  /** Ambient occlusion strength multiplier. */
  ao: number;
}

export const DEFAULT_GRADE: Grade = {
  exposure: 1,
  contrast: 1.08,
  saturation: 1.12,
  lift: [0.0, 0.0, 0.012],
  gain: [1.02, 1.0, 0.97],
  vignette: 0.32,
  vignetteColor: '#1a1030',
  bloom: 0.3,
  bloomThreshold: 1.45,
  bloomRadius: 0.45,
  tilt: 0,
  ao: 1,
};

/* ---------- pulses */
type PulseKind = 'impact' | 'flash' | 'vignette' | 'dramatic';
const pulse = { flash: 0, flashColor: new THREE.Color('#ffffff'), squeeze: 0, drama: 0, shake: 0 };
/** Kick a screen effect. impact = quick white flash + vignette squeeze; dramatic = slow edge darkening. */
export function postPulse(kind: PulseKind, strength = 1, color = '#ffffff'): void {
  const k = Math.max(0, Math.min(2, strength));
  if (kind === 'impact') {
    pulse.flash = Math.max(pulse.flash, 0.35 * k);
    pulse.squeeze = Math.max(pulse.squeeze, 0.6 * k);
    pulse.flashColor.set(color);
  } else if (kind === 'flash') {
    pulse.flash = Math.max(pulse.flash, 0.6 * k);
    pulse.flashColor.set(color);
  } else if (kind === 'vignette') pulse.squeeze = Math.max(pulse.squeeze, 0.8 * k);
  else pulse.drama = Math.max(pulse.drama, k);
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1 },
    uSat: { value: 1 },
    uExposure: { value: 1 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVig: { value: 0.3 },
    uVigColor: { value: new THREE.Color('#000000') },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
    uDrama: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.025 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSat, uExposure, uVig, uFlash, uDrama, uTime, uGrain, uAspect;
    uniform vec3 uLift, uGain, uVigColor, uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * uExposure;
      // lift / gain (display space)
      c = c * uGain + uLift * (1.0 - c);
      // S-curve contrast around mid grey
      c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), (uContrast - 1.0) * 0.6);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // vignette (rounder on wide screens)
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) / uAspect * 1.9;
      float r = dot(q, q);
      float v = smoothstep(0.35, 1.35, r) * (uVig + uDrama * 0.45);
      c = mix(c, uVigColor * l * 0.6, clamp(v, 0.0, 0.85));
      // dramatic beats drain the colour from the edges
      c = mix(c, vec3(l), uDrama * smoothstep(0.2, 1.1, r) * 0.6);
      // flashes
      c = mix(c, uFlashColor, uFlash * (1.0 - r * 0.35));
      // fine film grain, more in the shadows
      c += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain * (1.0 - l);
      gl_FragColor = vec4(c, src.a);
    }`,
};

const TiltShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uAmount: { value: 0 },
    uFocus: { value: 0.52 },
    uBand: { value: 0.26 },
  },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform float uAmount, uFocus, uBand;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - uFocus) - uBand * 0.5);
      float k = clamp(d * 3.2, 0.0, 1.0) * uAmount;
      if (k < 0.002) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      for (int i = -4; i <= 4; i++) {
        float w = exp(-float(i * i) / 8.0);
        sum += texture2D(tDiffuse, vUv + uDir * float(i) * k) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum;
    }`,
};

export class Post {
  composer: EffectComposer | null = null;
  private render: RenderPass | null = null;
  private ao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private fxaa: ShaderPass | null = null;
  private tiltH: ShaderPass | null = null;
  private tiltV: ShaderPass | null = null;
  private look: Grade = { ...DEFAULT_GRADE };
  private size = new THREE.Vector2(1280, 720);
  private pr = 1;
  private aoKey: { scene: THREE.Scene; cam: THREE.Camera } | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.rebuild(gfx());
  }

  rebuild(g: Gfx): void {
    this.composer?.dispose();
    this.composer = null;
    this.ao?.dispose();
    this.ao = null;
    this.aoKey = null;
    if (!g.post) return;
    const rt = new THREE.WebGLRenderTarget(this.size.x * this.pr, this.size.y * this.pr, { type: THREE.HalfFloatType, samples: g.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(this.size.x, this.size.y);
    this.render = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.render);
    // the AO pass needs the real scene and camera; it's added on the first frame (see frame())
    if (g.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.size.x, this.size.y), 0.3, 0.45, 1.45);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    if (!g.msaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    } else this.fxaa = null;
    if (g.tiltShift) {
      this.tiltH = new ShaderPass(TiltShader);
      this.tiltV = new ShaderPass(TiltShader);
      this.composer.addPass(this.tiltH);
      this.composer.addPass(this.tiltV);
    } else this.tiltH = this.tiltV = null;
    this.applySize();
  }

  setSize(w: number, h: number, pr: number): void {
    this.size.set(w, h);
    this.pr = pr;
    if (!this.composer) return;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.applySize();
  }

  private applySize(): void {
    const w = this.size.x * this.pr;
    const h = this.size.y * this.pr;
    if (this.fxaa) (this.fxaa.material.uniforms.resolution.value as THREE.Vector2).set(1 / w, 1 / h);
    if (this.grade) this.grade.material.uniforms.uAspect.value = this.size.x / this.size.y;
    if (this.tiltH) (this.tiltH.material.uniforms.uDir.value as THREE.Vector2).set(1.6 / w, 0);
    if (this.tiltV) (this.tiltV.material.uniforms.uDir.value as THREE.Vector2).set(0, 1.6 / h);
    this.ao?.setSize(w, h);
  }

  /** Per-view look (from the dress table). */
  setLook(l: Partial<Grade>): void {
    this.look = { ...DEFAULT_GRADE, ...l };
  }

  /** Draw one frame. Returns false when post is off (caller renders directly). */
  frame(scene: THREE.Scene, cam: THREE.Camera, dt: number, t: number): boolean {
    if (!this.composer || !this.render || !this.grade) return false;
    const g = gfx();
    if (g.ao && (!this.aoKey || this.aoKey.scene !== scene || this.aoKey.cam !== cam)) this.attachAO(scene, cam);
    this.render.scene = scene;
    this.render.camera = cam;
    const L = this.look;
    if (this.bloom) {
      this.bloom.strength = L.bloom;
      this.bloom.threshold = L.bloomThreshold;
      this.bloom.radius = L.bloomRadius;
    }
    if (this.ao) this.ao.blendIntensity = L.ao;
    // pulses decay
    const decay = (v: number, rate: number) => Math.max(0, v - dt * rate);
    pulse.flash = decay(pulse.flash, 2.6);
    pulse.squeeze = decay(pulse.squeeze, 2.2);
    pulse.drama = decay(pulse.drama, 0.7);
    const u = this.grade.material.uniforms;
    u.uContrast.value = L.contrast;
    u.uSat.value = L.saturation;
    u.uExposure.value = L.exposure;
    (u.uLift.value as THREE.Vector3).set(...L.lift);
    (u.uGain.value as THREE.Vector3).set(...L.gain);
    u.uVig.value = L.vignette + pulse.squeeze * 0.5;
    (u.uVigColor.value as THREE.Color).set(L.vignetteColor);
    u.uFlash.value = pulse.flash;
    (u.uFlashColor.value as THREE.Color).copy(pulse.flashColor);
    u.uDrama.value = Math.min(1, pulse.drama);
    u.uTime.value = t % 100;
    if (this.tiltH && this.tiltV) {
      this.tiltH.enabled = this.tiltV.enabled = L.tilt > 0;
      this.tiltH.material.uniforms.uAmount.value = L.tilt;
      this.tiltV.material.uniforms.uAmount.value = L.tilt;
    }
    this.composer.render(dt);
    return true;
  }

  private attachAO(scene: THREE.Scene, cam: THREE.Camera): void {
    if (!this.composer) return;
    if (this.ao) {
      this.composer.removePass(this.ao);
      this.ao.dispose();
    }
    const w = this.size.x * this.pr;
    const h = this.size.y * this.pr;
    try {
      this.ao = new GTAOPass(scene, cam, w, h);
      this.ao.output = GTAOPass.OUTPUT.Default;
      // outline shells (see choppy.ts) only make sense with their own shader: keep them out of the AO's normal pass
      const ao = this.ao as unknown as { overrideVisibility: () => void };
      const hide = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => {
        hide();
        scene.traverse((o) => {
          if (o.userData.outline) o.visible = false;
        });
      };
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.insertPass(this.ao, 1);
      this.aoKey = { scene, cam };
    } catch (e) {
      console.warn('No AO', e);
      this.ao = null;
      this.aoKey = { scene, cam };
    }
  }

  dispose(): void {
    this.composer?.dispose();
    this.ao?.dispose();
  }
}
