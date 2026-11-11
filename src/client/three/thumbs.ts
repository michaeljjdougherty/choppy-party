import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyLook, buildPiece, DEFAULT_LOOK, type Category } from './cosmetics';
import { FolkModel, type FolkSpec } from './folks';
import { disposeTree } from './kit';

/**
 * Little 3D icons for the Customize grid. Uses its own small offscreen renderer and copies each
 * picture into a 2D canvas, a few per frame so opening the screen never hitches.
 */
const SIZE = 160;

export class Thumbs {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  private cache = new Map<string, HTMLCanvasElement>();
  private queue: { key: string; cat: Category; id: string; color: string; spec: FolkSpec }[] = [];
  private queued = new Set<string>();
  private body: { model: FolkModel; key: string } | null = null;

  private setup(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = SIZE;
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.localClippingEnabled = true;
      r.setSize(SIZE, SIZE, false);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.0;
      r.outputColorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(r);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.55;
      pm.dispose();
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a6a50', 1.1));
      const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
      sun.position.set(3, 6, 5);
      this.scene.add(sun);
      this.renderer = r;
    } catch (e) {
      console.warn('No thumbnail renderer', e);
    }
    return this.renderer;
  }

  /** The icon if it's ready; otherwise queues it and returns null. */
  get(cat: Category, id: string, color: string, spec: FolkSpec): HTMLCanvasElement | null {
    const key = `${cat}:${id}:${cat === 'shirt' ? `${color}:${spec.id}` : color}`;
    const c = this.cache.get(key);
    if (c) return c;
    if (!this.queued.has(key)) {
      this.queued.add(key);
      this.queue.push({ key, cat, id, color, spec });
    }
    return null;
  }

  /** Draw a few queued icons. Call once a frame. */
  pump(max = 3): void {
    for (let i = 0; i < max && this.queue.length; i++) {
      const job = this.queue.shift()!;
      this.queued.delete(job.key);
      const img = this.draw(job);
      if (img) this.cache.set(job.key, img);
    }
  }

  private draw(job: { cat: Category; id: string; color: string; spec: FolkSpec }): HTMLCanvasElement | null {
    const r = this.setup();
    if (!r) return null;
    let subject: THREE.Object3D;
    let temp = false;
    if (job.cat === 'shirt') {
      // dress a body and frame the torso
      const k = `${job.spec.id}:${job.color}`;
      if (!this.body || this.body.key !== k) {
        if (this.body) disposeTree(this.body.model.group);
        const model = new FolkModel(job.spec, job.color, 1);
        model.slots.hat.parent!.visible = false;
        this.body = { model, key: k };
      }
      applyLook(this.body.model, { ...DEFAULT_LOOK, shirt: job.id });
      subject = this.body.model.group;
    } else {
      subject = buildPiece(job.cat, job.id, job.color);
      temp = true;
    }
    if (job.id === 'bare' || (job.cat === 'acc' && !job.id)) return blank(job.cat);
    this.scene.add(subject);
    subject.rotation.y = job.cat === 'acc' && /cape|backpack|jetpack|angel|bat|guitar|shell/.test(job.id) ? Math.PI - 0.5 : 0.5;
    subject.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(subject);
    if (job.cat === 'shirt') {
      // just the shirt: from the hips to the shoulders
      box.min.y = 0.36;
      box.max.y = 1.16;
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2))) * (job.cat === 'shirt' ? 0.72 : 0.92);
    const dir = new THREE.Vector3(0, 0.32, 1).normalize();
    this.cam.position.copy(sphere.center).addScaledVector(dir, dist);
    this.cam.lookAt(sphere.center);
    r.setClearColor(0x000000, 0);
    r.render(this.scene, this.cam);
    this.scene.remove(subject);
    if (temp) disposeTree(subject);
    const out = document.createElement('canvas');
    out.width = out.height = SIZE;
    out.getContext('2d')!.drawImage(r.domElement, 0, 0);
    return out;
  }
}

/** "None" tile: a crossed-out circle. */
function blank(_cat: Category): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  const ctx = out.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE * 0.28, 0, Math.PI * 2);
  ctx.moveTo(SIZE * 0.3, SIZE * 0.7);
  ctx.lineTo(SIZE * 0.7, SIZE * 0.3);
  ctx.stroke();
  return out;
}
