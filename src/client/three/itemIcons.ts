import * as THREE from 'three';
import { ITEMS } from '../../shared/board/items';
import type { ItemId } from '../../shared/board/types';
import { prop } from './assets';

/**
 * Little pictures of each board item for the HUD's item grid, rendered once from the same
 * Kenney models the items use on the board.
 */
const icons = new Map<ItemId, HTMLCanvasElement>();
let baked = false;

export function itemIcon(id: ItemId): HTMLCanvasElement | null {
  return icons.get(id) ?? null;
}

export function bakeItemIcons(renderer: THREE.WebGLRenderer): void {
  if (baked) return;
  baked = true;
  for (const [id, cv] of bake(renderer, (Object.keys(ITEMS) as ItemId[]).map((id) => [id, ITEMS[id].model]))) icons.set(id as ItemId, cv);
}

/** Pictures of any Kenney model by path (e.g. the Sushi Belt dishes), baked the first time they're asked for. */
const modelIcons = new Map<string, HTMLCanvasElement>();
export function modelIcon(model: string): HTMLCanvasElement | null {
  return modelIcons.get(model) ?? null;
}
export function bakeModelIcons(renderer: THREE.WebGLRenderer, models: string[]): void {
  const todo = models.filter((m) => !modelIcons.has(m));
  if (!todo.length) return;
  for (const [m, cv] of bake(renderer, todo.map((m) => [m, m]))) modelIcons.set(m, cv);
  // a model that failed to load still counts as tried
  for (const m of todo) if (!modelIcons.has(m)) modelIcons.set(m, document.createElement('canvas'));
}

function bake(renderer: THREE.WebGLRenderer, list: [string, string][]): [string, HTMLCanvasElement][] {
  const out: [string, HTMLCanvasElement][] = [];
  const S = 128;
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9b0dd', 2.8));
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const buf = new Uint8Array(S * S * 4);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor('#000000', 0);
  for (const [id, model] of list) {
    let o: THREE.Object3D;
    try {
      o = prop(model, 1);
    } catch {
      continue;
    }
    // fit the model in frame, turned three-quarters to the camera
    o.rotation.set(0.25, -0.7, 0);
    scene.add(o);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) {
      scene.remove(o);
      continue;
    }
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    const d = r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.82;
    cam.position.set(c.x, c.y + d * 0.25, c.z + d * 0.97);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
    scene.remove(o);
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(S, S);
    // the render target is upside down compared with a canvas
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    out.push([id, cv]);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  rt.dispose();
  return out;
}
