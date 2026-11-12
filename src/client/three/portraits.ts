import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChoppyModel, COLOR_CHAR } from './choppy';

/**
 * Head-and-shoulders pictures of each player's character, for the 2D HUD (standings, score chips).
 * Rendered once per colour + character on a small offscreen renderer, one per frame, then cached.
 */
const SIZE = 128;
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
const cache = new Map<string, HTMLCanvasElement>();
const queue: { key: string; color: string }[] = [];
const queued = new Set<string>();
let idle = 0;

function setup(): THREE.WebGLRenderer | null {
  if (renderer || failed) return renderer;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(SIZE, SIZE, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    pm.dispose();
    if (!scene.children.length) {
      scene.add(new THREE.HemisphereLight('#fff4e8', '#6a4a70', 1.2));
      const key = new THREE.DirectionalLight('#fff2dc', 2.4);
      key.position.set(2, 4, 5);
      scene.add(key);
      // a coloured rim from behind so heads pop off the dark HUD
      const rim = new THREE.DirectionalLight('#b9a2ff', 1.6);
      rim.position.set(-3, 2, -4);
      scene.add(rim);
    }
    renderer = r;
  } catch (e) {
    console.warn('No portrait renderer', e);
    failed = true;
  }
  return renderer;
}

const keyOf = (color: string) => `${color}:${COLOR_CHAR.get(color) ?? -1}`;

/** The portrait if it's ready; otherwise queues it and returns null. */
export function portrait(color: string): HTMLCanvasElement | null {
  const key = keyOf(color);
  const c = cache.get(key);
  if (c) return c;
  if (!queued.has(key)) {
    queued.add(key);
    queue.push({ key, color });
  }
  return null;
}

/** Draw one queued portrait. Call once a frame; frees the renderer after a while with nothing to do. */
export function pumpPortraits(dt: number): void {
  const job = queue.shift();
  if (!job) {
    idle += dt;
    if (renderer && idle > 8) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    }
    return;
  }
  idle = 0;
  queued.delete(job.key);
  const r = setup();
  if (!r) return;
  let model: ChoppyModel;
  try {
    model = new ChoppyModel(job.color);
  } catch {
    return;
  }
  const g = model.group;
  // the ring and dizzy stars belong to the floor and the stunned state, not the portrait
  g.traverse((o) => {
    if ((o as THREE.Mesh).geometry instanceof THREE.TorusGeometry) o.visible = false;
  });
  g.rotation.y = 0.35;
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  g.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !(m.geometry instanceof THREE.OctahedronGeometry)) box.expandByObject(m);
  });
  if (box.isEmpty()) box.setFromObject(g);
  const h = box.max.y - box.min.y;
  // frame the top of the character: the head and a bit of shoulder
  const top = box.max.y;
  const focus = new THREE.Vector3((box.min.x + box.max.x) / 2, top - h * 0.34, (box.min.z + box.max.z) / 2);
  const reach = h * 0.4;
  const dist = reach / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.copy(focus).add(new THREE.Vector3(0, 0.18, 1).normalize().multiplyScalar(dist));
  cam.lookAt(focus);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  // not disposed: the model shares geometry and textures with the game's own models
  // (this renderer's copies go when it is freed)
  scene.remove(g);
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  out.getContext('2d')!.drawImage(r.domElement, 0, 0);
  cache.set(job.key, out);
}

/** A round portrait badge: coloured ring, dark backing, the head inside. Falls back to a colour dot. */
export function drawPortrait(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, ring = 3): void {
  const img = portrait(color);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r + ring, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#5a3d9a');
  g.addColorStop(1, '#22123f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, x - r * 1.15, y - r * 1.1, r * 2.3, r * 2.3);
  }
  ctx.restore();
}
