import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlayerInfo } from '../../shared/types';
import { VIEW_H, VIEW_W } from '../../shared/types';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { disposeTree } from './kit';
import { shakeOffset } from './fx';
import type { SquareBrian } from './brian';

export interface Tag {
  pos: THREE.Vector3;
  text: string;
  color?: string;
  sub?: string;
  subColor?: string;
  badge?: string;
}

/** A 3D scene for one screen: a minigame, or the menus. */
export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(state: any, players: PlayerInfo[], t: number, dt: number): void;
  /** Labels to draw over the 3D view (names, scores), anchored to world positions. */
  tags(): Tag[];
  /** Square Brian, when he is in this scene, and where his head is (for the speech bubble). */
  host?: { brian: SquareBrian; head(): THREE.Vector3 };
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly env: THREE.Texture;
  private view: View | null = null;
  private key = '';
  /** Counts view switches, so the HUD can play a transition wipe. */
  switches = 0;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // soft glow on bright things (coins, lanterns, highlights). Add ?lowfx to the URL to turn it off.
    if (!new URLSearchParams(location.search).has('lowfx')) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.bloom = new UnrealBloomPass(new THREE.Vector2(VIEW_W, VIEW_H), 0.3, 0.4, 1.5);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(cssW, cssH, false);
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(dpr, 2));
      this.composer.setSize(cssW, cssH);
    }
  }

  /** Switch to the view for `key`, building it with `make` only when the key changes. */
  show(key: string, make: () => View): View {
    if (key !== this.key || !this.view) {
      if (this.view) disposeTree(this.view.scene);
      this.view = make();
      this.view.camera.aspect = VIEW_W / VIEW_H;
      this.view.camera.updateProjectionMatrix();
      this.key = key;
      this.switches++;
    }
    return this.view;
  }

  render(dt = 1 / 60, t = 0): void {
    if (!this.view) return;
    const cam = this.view.camera;
    const off = shakeOffset(dt, t);
    cam.position.add(off);
    if (this.composer && this.renderPass) {
      this.renderPass.scene = this.view.scene;
      this.renderPass.camera = cam;
      this.composer.render(dt);
    } else this.renderer.render(this.view.scene, cam);
    cam.position.sub(off);
  }

  /** World position to HUD coordinates (1280x720 space). */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    if (!this.view) return { x: 0, y: 0, visible: false };
    const p = v.clone().project(this.view.camera);
    return { x: (p.x + 1) * 0.5 * VIEW_W, y: (1 - p.y) * 0.5 * VIEW_H, visible: p.z < 1 };
  }
}
