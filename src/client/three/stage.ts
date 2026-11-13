import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlayerInfo } from '../../shared/types';
import { VIEW_H, VIEW_W } from '../../shared/types';
import { disposeTree } from './kit';
import { finishSurfaces, photoSurfaces } from './assets';
import { shakeOffset } from './fx';
import { tickSceneFx } from './anim/sceneFx';
import type { SquareBrian } from './brian';
import { Ambience } from './ambience';
import { Post } from './look/post';
import { brightness, gfx, onGfx, toneDown } from './look/quality';
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
  /** Split screen: several cameras, each drawn into its own window of the screen (HUD coordinates). */
  split?: { camera: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[];
  /** First person: no drifting camera sway or ambient motes in front of your eyes. */
  fps?: boolean;
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
    // hats trim the hair under them with a clipping plane (FolkModel.clipHair)
    this.renderer.localClippingEnabled = true;
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
      photoSurfaces.on = gfx().surface >= 1;
      this.view = make();
      finishSurfaces(this.view.scene);
      if (key.startsWith('game:') && !this.view.fps) {
        try {
          this.ambience = new Ambience(this.view.scene);
        } catch (e) {
          console.warn('No ambience for', key, e);
        }
      }
      this.view.camera.aspect = VIEW_W / VIEW_H;
      // a near plane of 0.1 wastes most of the depth buffer on the first metre; minigame cameras sit
      // 15+ units away, so 0.5 gives 5x the depth precision and stops floor decals flickering
      if (key.startsWith('game:') && !this.view.fps && this.view.camera.near < 0.5) this.view.camera.near = 0.5;
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
      keepInView(this.view.scene);
    } else if (++this.frames % 45 === 0) {
      detailTree(this.view.scene); // things spawned mid-game
      keepInView(this.view.scene);
    }
    tickDetail(t);
    tickScenery(t);
    tickSceneFx(this.view.scene, dt);
    if (this.dressed) for (const l of this.dressed.lives) l.update(t, dt);
    const off = shakeOffset(dt, t);
    cam.position.add(off);
    if (this.ambience) {
      this.ambience.update(dt, t);
      this.ambience.swayCamera(cam, t);
    }
    const undo = applyLightLook(this.view.scene);
    this.renderer.toneMappingExposure = 0.92 * brightness();
    const sc = this.view.scene;
    const envI = sc.environmentIntensity;
    sc.environmentIntensity = envI * toneDown().env;
    if (this.view.split?.length) this.renderSplit(sc, this.view.split);
    else if (!this.post.frame(sc, cam, dt, t)) this.renderer.render(sc, cam);
    sc.environmentIntensity = envI;
    undo();
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
      keepInView(view.scene);
    }
    tickSceneFx(view.scene);
    r.setScissorTest(true);
    r.setScissor(vx, vy, vw, vh);
    r.setViewport(vx, vy, vw, vh);
    r.render(view.scene, view.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
  }

  /** Split screen: each camera into its own window (no post chain, which works on the whole screen). */
  private renderSplit(sc: THREE.Scene, split: NonNullable<View['split']>): void {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const k = size.x / VIEW_W;
    r.setScissorTest(true);
    for (const v of split) {
      const vx = v.x * k, vy = (VIEW_H - v.y - v.h) * k, vw = v.w * k, vh = v.h * k;
      if (Math.abs(v.camera.aspect - v.w / v.h) > 1e-3) {
        v.camera.aspect = v.w / v.h;
        v.camera.updateProjectionMatrix();
      }
      r.setScissor(vx, vy, vw, vh);
      r.setViewport(vx, vy, vw, vh);
      r.render(sc, v.camera);
    }
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

/**
 * three.js works out an object's bounds once and culls it when those bounds leave the camera. Instanced
 * meshes, point clouds and skinned characters change shape after that (a pancake stack grows, an asteroid
 * belt orbits, an animation stretches a rig), so their stale bounds made them vanish mid-game. These are
 * few and cheap, so they're simply always drawn.
 */
function keepInView(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh & THREE.Points & THREE.SkinnedMesh;
    if (m.frustumCulled && (m.isInstancedMesh || m.isPoints || m.isSkinnedMesh)) m.frustumCulled = false;
  });
}

/** Developer mode: a lighting look laid over whatever the scene does itself (auto = leave it alone). */
export type LightLook = 'auto' | 'day' | 'dusk' | 'night';
export const lightLook = { mode: 'auto' as LightLook, active: true };
const LOOKS: Record<Exclude<LightLook, 'auto'>, { k: number; tint: string; mix: number; bg: number }> = {
  day: { k: 1.25, tint: '#fff4dc', mix: 0.35, bg: 1.15 },
  dusk: { k: 0.7, tint: '#ff9a5c', mix: 0.55, bg: 0.6 },
  night: { k: 0.32, tint: '#7d8cff', mix: 0.7, bg: 0.28 },
};
const tmpColor = new THREE.Color();
/** Dim and tint every light for one frame; returns a function that puts them back. */
function applyLightLook(scene: THREE.Scene): () => void {
  if (lightLook.mode === 'auto' || !lightLook.active) return () => {};
  const L = LOOKS[lightLook.mode];
  const saved: [THREE.Light, number, number][] = [];
  scene.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight) return;
    saved.push([l, l.intensity, l.color.getHex()]);
    l.intensity *= L.k;
    l.color.lerp(tmpColor.set(L.tint), L.mix);
  });
  const bgI = scene.backgroundIntensity;
  const envI = scene.environmentIntensity;
  const fog = scene.fog as THREE.Fog | null;
  const fogHex = fog?.color.getHex();
  scene.backgroundIntensity = bgI * L.bg;
  scene.environmentIntensity = envI * L.k;
  if (fog) fog.color.multiplyScalar(Math.min(1, L.bg)).lerp(tmpColor.set(L.tint), L.mix * 0.3);
  const bgCol = scene.background instanceof THREE.Color ? scene.background.getHex() : null;
  if (scene.background instanceof THREE.Color) scene.background.multiplyScalar(Math.min(1, L.bg));
  return () => {
    for (const [l, i, c] of saved) {
      l.intensity = i;
      l.color.setHex(c);
    }
    scene.backgroundIntensity = bgI;
    scene.environmentIntensity = envI;
    if (fog && fogHex !== undefined) fog.color.setHex(fogHex);
    if (bgCol !== null && scene.background instanceof THREE.Color) scene.background.setHex(bgCol);
  };
}
