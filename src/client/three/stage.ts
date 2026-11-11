import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlayerInfo } from '../../shared/types';
import { VIEW_H, VIEW_W } from '../../shared/types';
import { disposeTree } from './kit';
import { shakeOffset } from './fx';
import type { SquareBrian } from './brian';
import { Ambience } from './ambience';
import { Post } from './look/post';
import { gfx, onGfx } from './look/quality';
import { detailTree, loadDetail, tickDetail } from './look/detail';
import { loadHdris } from './look/lighting';
import { dressView, type Dressed } from './look/dress';
import { tickScenery } from './look/scenery';

export interface Tag {
  /** Player id, when the tag belongs to a player. */
  id?: string;
  pos: THREE.Vector3;
  text: string;
  color?: string;
  sub?: string;
  subColor?: string;
  badge?: string;
  /** 0..1 progress bar under the name (holding A to ready up). */
  bar?: number;
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
  /** Post-processing chain (look/post.ts); its settings follow the graphics preset. */
  readonly post: Post;
  /** The view still needs its scenery, lighting and grade (done on its first frame, once the camera is placed). */
  private needsDress = false;
  private dressed: Dressed | null = null;
  private frames = 0;
  private insets = new WeakSet<THREE.Scene>();
  private css = { w: VIEW_W, h: VIEW_H, dpr: 1 };
  /** Minigame arenas get drifting dust, swaying plants and a slow camera sway. */
  private ambience: Ambience | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = gfx().shadowMap > 0;
    this.renderer.shadowMap.type = gfx().softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // the look: graded post chain, surface textures, HDRI lighting (all scaled by the quality preset)
    this.post = new Post(this.renderer);
    void Promise.all([loadDetail(), loadHdris()]).then(() => (this.needsDress = !!this.view));
    onGfx((g) => {
      this.renderer.shadowMap.enabled = g.shadowMap > 0;
      this.renderer.shadowMap.type = g.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.post.rebuild(g);
      this.resize(this.css.w, this.css.h, this.css.dpr);
      void Promise.all([loadDetail(), loadHdris()]);
      // rebuild the current view so every material and light picks the new settings up
      this.key = '';
    });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.css = { w: cssW, h: cssH, dpr };
    const pr = Math.min(dpr, gfx().maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(cssW, cssH, false);
    this.post.setSize(cssW, cssH, pr);
  }

  /** Switch to the view for `key`, building it with `make` only when the key changes. */
  show(key: string, make: () => View): View {
    if (key !== this.key || !this.view) {
      this.ambience?.dispose();
      this.ambience = null;
      if (this.view) disposeTree(this.view.scene);
      this.view = make();
      if (key.startsWith('game:')) {
        try {
          this.ambience = new Ambience(this.view.scene);
        } catch (e) {
          console.warn('No ambience for', key, e);
        }
      }
      this.view.camera.aspect = VIEW_W / VIEW_H;
      this.view.camera.updateProjectionMatrix();
      this.needsDress = true;
      this.dressed = null;
      this.key = key;
      this.switches++;
    }
    return this.view;
  }

  render(dt = 1 / 60, t = 0): void {
    if (!this.view) return;
    const cam = this.view.camera;
    if (this.needsDress) {
      this.needsDress = false;
      try {
        this.dressed = dressView(this.key, this.view.scene, cam, this.renderer);
        this.post.setLook(this.dressed.grade);
      } catch (e) {
        console.warn('Could not dress', this.key, e);
      }
      detailTree(this.view.scene);
    } else if (++this.frames % 45 === 0) detailTree(this.view.scene); // things spawned mid-game
    tickDetail(t);
    tickScenery(t);
    if (this.dressed) for (const l of this.dressed.lives) l.update(t, dt);
    const off = shakeOffset(dt, t);
    cam.position.add(off);
    if (this.ambience) {
      this.ambience.update(dt, t);
      this.ambience.swayCamera(cam, t);
    }
    if (!this.post.frame(this.view.scene, cam, dt, t)) this.renderer.render(this.view.scene, cam);
    if (this.ambience) this.ambience.unswayCamera(cam);
    cam.position.sub(off);
  }

  /**
   * Draw another view into a window of the screen (HUD coordinates), on top of the main render.
   * Used for the lobby's board flyover.
   */
  renderInset(view: View, x: number, y: number, w: number, h: number): void {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const k = size.x / VIEW_W;
    const vx = x * k, vy = (VIEW_H - y - h) * k, vw = w * k, vh = h * k;
    view.camera.aspect = w / h;
    view.camera.updateProjectionMatrix();
    // previews get the surface detail too (no scenery: they are small and change often)
    if (!this.insets.has(view.scene)) {
      this.insets.add(view.scene);
      detailTree(view.scene);
    }
    r.setScissorTest(true);
    r.setScissor(vx, vy, vw, vh);
    r.setViewport(vx, vy, vw, vh);
    r.render(view.scene, view.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
  }

  /** World position to HUD coordinates (1280x720 space). */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    if (!this.view) return { x: 0, y: 0, visible: false };
    const p = v.clone().project(this.view.camera);
    return { x: (p.x + 1) * 0.5 * VIEW_W, y: (1 - p.y) * 0.5 * VIEW_H, visible: p.z < 1 };
  }
}
