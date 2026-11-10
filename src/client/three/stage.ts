import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlayerInfo } from '../../shared/types';
import { VIEW_H, VIEW_W } from '../../shared/types';
import { disposeTree } from './kit';

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
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly env: THREE.Texture;
  private view: View | null = null;
  private key = '';

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
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(cssW, cssH, false);
  }

  /** Switch to the view for `key`, building it with `make` only when the key changes. */
  show(key: string, make: () => View): View {
    if (key !== this.key || !this.view) {
      if (this.view) disposeTree(this.view.scene);
      this.view = make();
      this.view.camera.aspect = VIEW_W / VIEW_H;
      this.view.camera.updateProjectionMatrix();
      this.key = key;
    }
    return this.view;
  }

  render(): void {
    if (this.view) this.renderer.render(this.view.scene, this.view.camera);
  }

  /** World position to HUD coordinates (1280x720 space). */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    if (!this.view) return { x: 0, y: 0, visible: false };
    const p = v.clone().project(this.view.camera);
    return { x: (p.x + 1) * 0.5 * VIEW_W, y: (1 - p.y) * 0.5 * VIEW_H, visible: p.z < 1 };
  }
}
