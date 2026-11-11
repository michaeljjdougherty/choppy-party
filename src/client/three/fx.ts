import * as THREE from 'three';

/**
 * Cartoon particle effects (dust puffs, sparkles, stars, blasts, splashes) and screen shake.
 * Particles are pooled camera-facing sprites with textures drawn once on a canvas, so every
 * view can fire off lots of them without allocating.
 */

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let textures: Record<'soft' | 'puff' | 'star' | 'ring', THREE.Texture> | null = null;
function tex() {
  if (textures) return textures;
  textures = {
    soft: canvasTex(64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }),
    // a chunky cartoon cloud puff with a darker underside
    puff: canvasTex(64, (c, s) => {
      c.fillStyle = '#ffffff';
      for (const [x, y, r] of [
        [0.5, 0.52, 0.3],
        [0.32, 0.58, 0.2],
        [0.68, 0.58, 0.2],
        [0.42, 0.38, 0.2],
        [0.6, 0.4, 0.18],
      ]) {
        c.beginPath();
        c.arc(x * s, y * s, r * s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalCompositeOperation = 'source-atop';
      const g = c.createLinearGradient(0, s * 0.3, 0, s * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }),
    // four-point twinkle
    star: canvasTex(64, (c, s) => {
      const m = s / 2;
      c.fillStyle = '#ffffff';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? s * 0.11 : s * 0.48;
        c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      const g = c.createRadialGradient(m, m, 0, m, m, s * 0.25);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }),
    ring: canvasTex(64, (c, s) => {
      c.strokeStyle = '#ffffff';
      c.lineWidth = s * 0.08;
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
      c.stroke();
    }),
  };
  return textures;
}

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size0: number;
  size1: number;
  gravity: number;
  drag: number;
  spin: number;
  fade: number; // fraction of life spent fading out at the end
}

export interface Burst {
  tex?: 'soft' | 'puff' | 'star' | 'ring';
  color?: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  n?: number;
  speed?: [number, number];
  up?: number; // extra upward speed
  spread?: number; // 0 = flat ring along the ground, 1 = full sphere
  life?: [number, number];
  size?: [number, number]; // start size, end size
  gravity?: number;
  drag?: number;
  additive?: boolean;
  jitter?: number; // spawn position randomness
  /** Extra velocity every particle starts with (wind, rain). */
  vel?: [number, number, number];
}

export class Fx {
  readonly group = new THREE.Group();
  private live: Particle[] = [];
  private pool: Particle[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.renderOrder = 10;
    parent.add(this.group);
  }

  emit(at: THREE.Vector3, o: Burst = {}): void {
    const t = tex();
    const n = o.n ?? 8;
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    for (let i = 0; i < n && this.live.length < 600; i++) {
      const p = this.pool.pop() ?? this.make();
      const m = p.sprite.material;
      m.map = t[o.tex ?? 'soft'];
      m.color.set(colors[i % colors.length]);
      m.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.opacity = 1;
      m.rotation = Math.random() * Math.PI * 2;
      m.needsUpdate = true;
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() * 2 - 1) * (o.spread ?? 0.3) * (Math.PI / 2);
      const sp = (o.speed?.[0] ?? 1) + Math.random() * ((o.speed?.[1] ?? 3) - (o.speed?.[0] ?? 1));
      p.vel.set(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + (o.up ?? 0) * (0.6 + Math.random() * 0.6), Math.sin(a) * Math.cos(el) * sp);
      if (o.vel) p.vel.add(new THREE.Vector3(o.vel[0], o.vel[1], o.vel[2]));
      const j = o.jitter ?? 0.1;
      p.sprite.position.set(at.x + (Math.random() - 0.5) * j, at.y + Math.random() * j * 0.5, at.z + (Math.random() - 0.5) * j);
      p.max = p.life = (o.life?.[0] ?? 0.4) + Math.random() * ((o.life?.[1] ?? 0.8) - (o.life?.[0] ?? 0.4));
      p.size0 = (o.size?.[0] ?? 0.4) * (0.7 + Math.random() * 0.6);
      p.size1 = (o.size?.[1] ?? 0.8) * (0.7 + Math.random() * 0.6);
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 2.5;
      p.spin = (Math.random() - 0.5) * 4;
      p.fade = 0.5;
      p.sprite.visible = true;
      this.live.push(p);
    }
  }

  private make(): Particle {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    this.group.add(sprite);
    return { sprite, vel: new THREE.Vector3(), life: 0, max: 1, size0: 1, size1: 1, gravity: 0, drag: 0, spin: 0, fade: 0.5 };
  }

  // ---- presets -------------------------------------------------------------------------------

  /** Little cloud puffs kicked out sideways along the ground, for landings and skids. */
  dust(at: THREE.Vector3, power = 1): void {
    this.emit(at, {
      tex: 'puff',
      color: ['#ffffff', '#f3eee6'],
      n: Math.round(6 * power + 2),
      speed: [1.5 * power, 3.2 * power],
      spread: 0.05,
      up: 0.6,
      life: [0.3, 0.55],
      size: [0.35, 0.9 * Math.max(0.7, power)],
      drag: 4,
      jitter: 0.4,
    });
  }

  /** Twinkly stars for pickups. */
  sparkle(at: THREE.Vector3, color: THREE.ColorRepresentation = '#ffe066', n = 10): void {
    this.emit(at, { tex: 'star', color: [color, '#ffffff'], n, speed: [1.5, 3.5], spread: 1, up: 2, life: [0.35, 0.7], size: [0.5, 0.1], gravity: -4, drag: 2, additive: true });
    this.emit(at, { tex: 'ring', color, n: 1, speed: [0, 0], life: [0.3, 0.3], size: [0.3, 1.6] });
  }

  /** Cartoon impact stars for bumps. */
  bonk(at: THREE.Vector3): void {
    this.emit(at, { tex: 'star', color: ['#ffd23f', '#ffffff', '#ff9f1c'], n: 7, speed: [3, 5], spread: 0.6, up: 1.5, life: [0.3, 0.5], size: [0.55, 0.2], drag: 3, additive: true });
  }

  /** Big explosion: flash, fireball puffs, smoke and a shockwave ring. */
  blast(at: THREE.Vector3, radius = 1.5): void {
    this.emit(at, { tex: 'soft', color: '#fff6c8', n: 1, speed: [0, 0], life: [0.18, 0.18], size: [radius * 2.2, radius * 3.5], additive: true });
    this.emit(at, { tex: 'puff', color: ['#ffb020', '#ff6a1a', '#ffd23f'], n: 12, speed: [2 * radius, 4 * radius], spread: 0.7, up: 2, life: [0.25, 0.45], size: [radius * 0.6, radius * 1.1], drag: 5 });
    this.emit(at, { tex: 'puff', color: ['#5c5664', '#7a7482'], n: 8, speed: [1, 2.5 * radius], spread: 0.6, up: 2.5, life: [0.6, 1.0], size: [radius * 0.5, radius * 1.3], drag: 3, gravity: -1.5 });
    this.emit(at, { tex: 'ring', color: '#ffe0a0', n: 1, speed: [0, 0], life: [0.35, 0.35], size: [0.5, radius * 3.2] });
  }

  /** Water splash for falling into the sea. */
  splash(at: THREE.Vector3): void {
    this.emit(at, { tex: 'soft', color: ['#ffffff', '#bfe9ff', '#7fd0ff'], n: 18, speed: [1.5, 3.5], spread: 0.15, up: 6, life: [0.5, 0.9], size: [0.4, 0.2], gravity: 16, drag: 0.6 });
    this.emit(at, { tex: 'ring', color: '#e8f8ff', n: 2, speed: [0, 0], life: [0.5, 0.7], size: [0.6, 3] });
  }

  /** Confetti-ish celebration pop. */
  party(at: THREE.Vector3): void {
    this.emit(at, { tex: 'star', color: ['#ff5a5f', '#ffd23f', '#2ee6d6', '#b06cff', '#4cd97b'], n: 22, speed: [3, 6], spread: 0.9, up: 4, life: [0.6, 1.1], size: [0.45, 0.2], gravity: 6, drag: 1.2 });
  }

  update(dt: number): void {
    const d = Math.min(dt, 0.1);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= d;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.live.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      const k = 1 - p.life / p.max; // 0 -> 1 over the particle's life
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * d));
      p.vel.y -= p.gravity * d;
      p.sprite.position.addScaledVector(p.vel, d);
      const ease = 1 - (1 - k) * (1 - k);
      const s = p.size0 + (p.size1 - p.size0) * ease;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.rotation += p.spin * d;
      p.sprite.material.opacity = k > 1 - p.fade ? (1 - k) / p.fade : 1;
    }
  }
}

// ---- screen shake --------------------------------------------------------------------------

let trauma = 0;
const SHAKE_KEY = 'choppy.shake';
let shakeAllowed = true;
try {
  shakeAllowed = localStorage.getItem(SHAKE_KEY) !== 'off';
} catch {
  /* private mode */
}
/** Screen shake on or off (a setting, remembered between visits). */
export function shakeEnabled(): boolean {
  return shakeAllowed;
}
export function setShakeEnabled(on: boolean): void {
  shakeAllowed = on;
  if (!on) trauma = 0;
  try {
    localStorage.setItem(SHAKE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}
/** Add screen shake (0..1). Shake strength is trauma squared, so small hits stay subtle. */
export function shake(amount: number): void {
  if (!shakeAllowed) return;
  trauma = Math.min(1, trauma + amount);
}
/** Called by the stage each frame: returns a camera offset and decays the shake. */
export function shakeOffset(dt: number, t: number): THREE.Vector3 {
  if (trauma <= 0) return new THREE.Vector3();
  const a = trauma * trauma * 0.45;
  trauma = Math.max(0, trauma - dt * 1.6);
  return new THREE.Vector3(Math.sin(t * 61) * a, Math.sin(t * 53 + 1) * a * 0.8, Math.sin(t * 47 + 2) * a * 0.5);
}
