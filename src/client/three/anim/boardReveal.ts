import * as THREE from 'three';
import type { SpaceType } from '../../../shared/board/types';
import type { Fx } from '../fx';
import type { ChoppyModel } from '../choppy';

/**
 * Board animations (2026-11-12 overhaul): every space type gets its own little show when someone lands on it
 * (hearts spiral in, spikes snap up, a crate drops and bursts, a lucky star spins up...), Pit Coin you win
 * rains into you and coin you lose spills out and bounces on the board, and players flinch or cheer at what
 * happens to them. View-only: it reads the board state the view already has and changes none of it.
 */

interface Actor {
  obj: THREE.Object3D;
  age: number;
  life: number;
  tick: (a: Actor, dt: number) => void;
  done?: () => void;
}

const easeOutBack = (p: number) => {
  const c = 1.9;
  const x = Math.min(1, Math.max(0, p)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

let shared: {
  coin: THREE.BufferGeometry;
  coinMat: THREE.MeshStandardMaterial;
  heart: THREE.BufferGeometry;
  heartMat: THREE.MeshStandardMaterial;
  spike: THREE.BufferGeometry;
  spikeMat: THREE.MeshStandardMaterial;
  crate: THREE.BufferGeometry;
  crateMat: THREE.MeshStandardMaterial;
  star: THREE.BufferGeometry;
  starMat: THREE.MeshStandardMaterial;
  vine: THREE.BufferGeometry;
  vineMat: THREE.MeshStandardMaterial;
  coil: THREE.BufferGeometry;
  coilMat: THREE.MeshStandardMaterial;
  pillar: THREE.BufferGeometry;
  orb: THREE.BufferGeometry;
} | null = null;

function parts() {
  if (shared) return shared;
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5);
  heartShape.bezierCurveTo(-0.15, -0.3, -0.55, -0.05, -0.5, 0.22);
  heartShape.bezierCurveTo(-0.45, 0.5, -0.08, 0.52, 0, 0.25);
  heartShape.bezierCurveTo(0.08, 0.52, 0.45, 0.5, 0.5, 0.22);
  heartShape.bezierCurveTo(0.55, -0.05, 0.15, -0.3, 0, -0.5);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.22 : 0.5;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const ex = { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 };
  const heart = new THREE.ExtrudeGeometry(heartShape, ex);
  heart.center();
  const star = new THREE.ExtrudeGeometry(starShape, ex);
  star.center();
  const glow = (c: string, e: string, ei = 0.5) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: 0.35, metalness: 0.2 });
  shared = {
    coin: new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18).rotateX(Math.PI / 2),
    coinMat: glow('#ffc21a', '#a86b00', 0.55),
    heart,
    heartMat: glow('#ff4d6d', '#9b1030', 0.6),
    spike: new THREE.ConeGeometry(0.11, 0.55, 6).translate(0, 0.27, 0),
    spikeMat: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.3, metalness: 0.7 }),
    crate: new THREE.BoxGeometry(0.7, 0.7, 0.7),
    crateMat: glow('#ff9f1c', '#7a3d00', 0.25),
    star,
    starMat: glow('#ffd23f', '#c98a00', 0.8),
    vine: new THREE.ConeGeometry(0.07, 0.9, 5).translate(0, 0.45, 0),
    vineMat: new THREE.MeshStandardMaterial({ color: '#4d9b1f', roughness: 0.6 }),
    coil: new THREE.TorusGeometry(0.32, 0.06, 8, 20).rotateX(Math.PI / 2),
    coilMat: glow('#7ddc3c', '#2f6b00', 0.4),
    pillar: new THREE.CylinderGeometry(0.55, 0.7, 1, 24, 1, true).translate(0, 0.5, 0),
    orb: new THREE.SphereGeometry(0.16, 12, 10),
  };
  return shared;
}

/** What a space does to the one who lands on it, for their reaction. */
const GOOD: SpaceType[] = ['heart', 'fountain', 'lucky', 'crate', 'spring'];
const BAD: SpaceType[] = ['thorn', 'vent', 'snare', 'dynamite'];

export class BoardAnims {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];

  constructor(scene: THREE.Scene, private fx: Fx) {
    this.group.name = 'board-anims';
    this.group.userData.noDetail = true;
    scene.add(this.group);
  }

  private add(obj: THREE.Object3D, life: number, tick: Actor['tick'], done?: () => void): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    this.group.add(obj);
    this.actors.push({ obj, age: 0, life, tick, done });
  }

  private glowMat(color: string, opacity = 0.6): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  }

  /** A column of light in the space's colour that shoots up and fades: every landing gets one. */
  private pillar(at: THREE.Vector3, color: string, height = 4): void {
    const mat = this.glowMat(color, 0.55);
    const m = new THREE.Mesh(parts().pillar, mat);
    m.castShadow = false;
    m.position.copy(at);
    m.renderOrder = 5;
    this.group.add(m);
    this.actors.push({
      obj: m,
      age: 0,
      life: 0.9,
      tick: (a) => {
        const p = a.age / a.life;
        m.scale.set(1 - p * 0.5, height * easeOutBack(Math.min(1, p * 3)), 1 - p * 0.5);
        mat.opacity = 0.55 * (1 - p) * (1 - p);
      },
      done: () => mat.dispose(),
    });
  }

  /**
   * The landing show for a space. `at` is the top of the tile; `model` (the one who landed) cheers or
   * flinches to match.
   */
  land(type: SpaceType, at: THREE.Vector3, color: string, model?: ChoppyModel, playerAt?: THREE.Vector3): void {
    const P = parts();
    const head = (playerAt ?? at).clone().add(new THREE.Vector3(0, 1.2, 0));
    this.pillar(at, color, type === 'key' ? 2.5 : 4.5);
    if (GOOD.includes(type)) setTimeout(() => model?.celebrate(), 250);
    if (BAD.includes(type)) setTimeout(() => model?.flinch(1), type === 'thorn' ? 120 : 300);
    switch (type) {
      case 'heart':
      case 'fountain': {
        // hearts spiral up out of the tile and sink into the player
        const n = type === 'fountain' ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const h = new THREE.Mesh(P.heart, P.heartMat);
          const a0 = (i / n) * Math.PI * 2;
          const delay = i * 0.06;
          this.add(h, 1.5 + delay, (a) => {
            const p = clamp01((a.age - delay) / 1.5);
            const r = 0.9 * (1 - Math.pow(p, 2));
            const ang = a0 + p * Math.PI * 2.2;
            h.position.set(head.x + Math.cos(ang) * r, at.y + 0.3 + Math.sin(p * Math.PI) * 1.6 + p * 0.5, head.z + Math.sin(ang) * r);
            h.rotation.y = ang * 2;
            const s = p <= 0 ? 0 : 0.5 * easeOutBack(Math.min(1, p * 4)) * (p > 0.85 ? (1 - p) / 0.15 : 1);
            h.scale.setScalar(s);
          }, () => this.fx.sparkle(head, '#4cd97b', 3));
        }
        if (type === 'fountain')
          for (let k = 0; k < 4; k++)
            setTimeout(() => this.fx.emit(at.clone().setY(at.y + 0.2), { tex: 'soft', color: ['#ffffff', '#ffd6f2', '#ff7bd5'], n: 12, speed: [0.5, 1.5], spread: 0.1, up: 7, life: [0.5, 0.9], size: [0.35, 0.15], gravity: 14, drag: 0.4 }), k * 180);
        break;
      }
      case 'thorn': {
        // a ring of spikes snaps up, holds, and sinks back
        const n = 8;
        for (let i = 0; i < n; i++) {
          const sp = new THREE.Mesh(P.spike, P.spikeMat);
          const ang = (i / n) * Math.PI * 2;
          sp.position.set(at.x + Math.cos(ang) * 0.62, at.y - 0.05, at.z + Math.sin(ang) * 0.62);
          sp.rotation.set(Math.sin(ang) * 0.35, 0, -Math.cos(ang) * 0.35);
          this.add(sp, 1.1, (a) => {
            const p = a.age;
            const up = p < 0.12 ? easeOutBack(p / 0.12) : p < 0.8 ? 1 : 1 - (p - 0.8) / 0.3;
            sp.scale.set(1, Math.max(0.001, up), 1);
          });
        }
        this.fx.emit(at.clone().setY(at.y + 0.2), { tex: 'puff', color: ['#ff7a7a', '#ffffff'], n: 8, speed: [1.5, 3], spread: 0.1, up: 1, life: [0.3, 0.5], size: [0.3, 0.7] });
        break;
      }
      case 'crate': {
        // a crate drops out of the sky, lands with a thump, then bursts open
        const c = new THREE.Mesh(P.crate, P.crateMat);
        const top = head.clone().add(new THREE.Vector3(0, 0.7, 0));
        let landed = false;
        this.add(c, 1.25, (a) => {
          const p = a.age;
          if (p < 0.35) {
            const k = p / 0.35;
            c.position.set(top.x, top.y + 6 * (1 - k * k), top.z);
            c.rotation.set(0, p * 6, 0);
            c.scale.set(0.85, 1.2, 0.85);
          } else {
            if (!landed) {
              landed = true;
              this.fx.dust(top.clone().setY(top.y - 0.3), 0.7);
            }
            const k = p - 0.35;
            const wob = Math.exp(-k * 8) * Math.cos(k * 30);
            c.position.copy(top);
            c.scale.set(1 + wob * 0.25, 1 - wob * 0.25, 1 + wob * 0.25);
            if (p > 1.0) c.scale.multiplyScalar(1 + (p - 1.0) * 4);
          }
        }, () => {
          this.fx.party(top);
          this.fx.sparkle(top, '#ff9f1c', 14);
        });
        break;
      }
      case 'lucky': {
        // a big golden star spins up over their head, with glitter raining down
        const st = new THREE.Mesh(P.star, P.starMat);
        const base = head.clone().add(new THREE.Vector3(0, 0.6, 0));
        this.add(st, 1.6, (a) => {
          const p = a.age / a.life;
          st.position.set(base.x, base.y + easeOutBack(Math.min(1, p * 3)) * 1.2, base.z);
          st.rotation.y = p * Math.PI * 6;
          st.scale.setScalar(1.4 * easeOutBack(Math.min(1, p * 3)) * (p > 0.8 ? (1 - p) / 0.2 : 1));
          if (Math.random() < 0.5) this.fx.emit(st.position, { tex: 'star', color: ['#ffd23f', '#ffffff'], n: 1, speed: [0.5, 2], spread: 1, life: [0.5, 0.9], size: [0.3, 0.05], gravity: 4, additive: true });
        });
        break;
      }
      case 'spring': {
        // a coil squashes under them and boings back
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(P.coil, P.coilMat);
          this.add(c, 0.9, (a) => {
            const p = a.age;
            const sq = p < 0.2 ? 1 - p / 0.2 : 1 + Math.exp(-(p - 0.2) * 6) * Math.sin((p - 0.2) * 22) * 0.8;
            c.position.set(at.x, at.y + 0.05 + i * 0.16 * Math.max(0.15, sq), at.z);
            c.scale.setScalar(p > 0.7 ? Math.max(0.01, 1 - (p - 0.7) / 0.2) : 1);
          });
        }
        this.fx.emit(at.clone().setY(at.y + 0.2), { tex: 'ring', color: '#c7ff9a', n: 2, speed: [0, 0], life: [0.4, 0.6], size: [0.6, 3.2] });
        break;
      }
      case 'snare': {
        // roots curl up round their legs
        for (let i = 0; i < 6; i++) {
          const v = new THREE.Mesh(P.vine, P.vineMat);
          const ang = (i / 6) * Math.PI * 2;
          this.add(v, 1.4, (a) => {
            const p = a.age;
            const g = p < 0.3 ? easeOutBack(p / 0.3) : p < 1.1 ? 1 : 1 - (p - 1.1) / 0.3;
            v.position.set(head.x + Math.cos(ang) * 0.4, at.y, head.z + Math.sin(ang) * 0.4);
            v.rotation.set(-Math.sin(ang) * 0.5, 0, Math.cos(ang) * 0.5);
            v.scale.set(1, Math.max(0.001, g), 1);
          });
        }
        break;
      }
      case 'vent':
        for (let k = 0; k < 5; k++)
          setTimeout(() => this.fx.emit(at.clone().setY(at.y + 0.2), { tex: 'puff', color: ['#e8fbff', '#9ff0ff'], n: 6, speed: [0.3, 1], spread: 0.1, up: 6, life: [0.5, 0.8], size: [0.4, 1.3], drag: 2 }), k * 90);
        break;
      case 'dynamite':
        for (let k = 0; k < 8; k++)
          setTimeout(() => this.fx.emit(head.clone().setY(head.y + 0.3), { tex: 'star', color: ['#ffd23f', '#ff6a1a'], n: 4, speed: [1, 3], spread: 1, up: 2, life: [0.2, 0.4], size: [0.3, 0.05], gravity: 6, additive: true }), k * 60);
        break;
      case 'duel':
      case 'stew':
      case 'oop': {
        // two orbs (red and blue) fly in and clash over their head
        const meet = head.clone().add(new THREE.Vector3(0, 1, 0));
        for (const side of [-1, 1]) {
          const mat = this.glowMat(side < 0 ? '#ff4d4d' : '#3fa9f5', 0.95);
          const o = new THREE.Mesh(P.orb, mat);
          o.castShadow = false;
          this.group.add(o);
          this.actors.push({
            obj: o,
            age: 0,
            life: 0.45,
            tick: (a) => {
              const p = a.age / a.life;
              o.position.set(meet.x + side * 2.2 * (1 - p * p), meet.y + Math.sin(p * Math.PI) * 0.5, meet.z);
              o.scale.setScalar(1 + p);
            },
            done: () => mat.dispose(),
          });
        }
        setTimeout(() => {
          this.fx.bonk(meet);
          this.fx.emit(meet, { tex: 'ring', color: '#ffffff', n: 1, speed: [0, 0], life: [0.35, 0.35], size: [0.5, 3.5] });
          this.fx.emit(meet, { tex: 'soft', color: '#ffffff', n: 1, speed: [0, 0], life: [0.15, 0.15], size: [1.5, 3], additive: true });
        }, 450);
        break;
      }
      case 'event':
      case 'wisp':
      case 'post':
      case 'chunk': {
        // orbs swirl up round them in the space's colour
        const n = 8;
        for (let i = 0; i < n; i++) {
          const mat = this.glowMat(color, 0.9);
          const o = new THREE.Mesh(P.orb, mat);
          o.castShadow = false;
          const a0 = (i / n) * Math.PI * 2;
          this.group.add(o);
          this.actors.push({
            obj: o,
            age: 0,
            life: 1.1,
            tick: (a) => {
              const p = a.age / a.life;
              const ang = a0 + p * Math.PI * 3;
              const r = 0.8 + p * 0.4;
              o.position.set(head.x + Math.cos(ang) * r, at.y + 0.2 + p * 2.4, head.z + Math.sin(ang) * r);
              o.scale.setScalar(0.8 * (1 - p) + 0.2);
              mat.opacity = 0.9 * (1 - p);
            },
            done: () => mat.dispose(),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Coin won rains down into the player; coin lost spills out of them and bounces on the board. */
  coins(at: THREE.Vector3, delta: number, floorY: number): void {
    const P = parts();
    const n = Math.min(12, Math.max(1, Math.abs(delta)));
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(P.coin, P.coinMat);
      const delay = i * 0.07;
      if (delta > 0) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = 0.3 + Math.random() * 0.4;
        this.add(c, 0.75 + delay, (a) => {
          const p = clamp01((a.age - delay) / 0.75);
          c.visible = a.age >= delay;
          c.position.set(at.x + Math.cos(a0) * r0 * (1 - p), at.y + 3.2 * (1 - p * p) + 0.9, at.z + Math.sin(a0) * r0 * (1 - p));
          c.rotation.y = a.age * 14;
          c.scale.setScalar(p > 0.85 ? (1 - p) / 0.15 + 0.01 : 1);
        }, () => this.fx.sparkle(at.clone().setY(at.y + 0.9), '#ffd23f', 2));
      } else {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1.6 + Math.random() * 1.4;
        const v = new THREE.Vector3(Math.cos(ang) * sp, 4 + Math.random() * 2, Math.sin(ang) * sp);
        const p0 = at.clone().setY(at.y + 1);
        let bounced = 0;
        this.add(c, 1.3 + delay, (a, dt) => {
          c.visible = a.age >= delay;
          if (a.age < delay) {
            c.position.copy(p0);
            return;
          }
          v.y -= 18 * dt;
          c.position.addScaledVector(v, dt);
          if (c.position.y < floorY + 0.1 && v.y < 0) {
            c.position.y = floorY + 0.1;
            v.y = -v.y * 0.45;
            v.x *= 0.6;
            v.z *= 0.6;
            if (bounced++ === 0) this.fx.emit(c.position, { tex: 'star', color: '#ffe066', n: 2, speed: [0.5, 1.5], spread: 1, life: [0.2, 0.3], size: [0.25, 0.05], additive: true });
          }
          c.rotation.x += dt * 12;
          c.rotation.y += dt * 7;
          const life = (a.age - delay) / 1.3;
          c.scale.setScalar(life > 0.75 ? Math.max(0.01, (1 - life) / 0.25) : 1);
        });
      }
    }
  }

  update(dt: number): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      a.age += dt;
      if (a.age >= a.life) {
        this.group.remove(a.obj);
        a.done?.();
        this.actors.splice(i, 1);
        continue;
      }
      a.tick(a, dt);
    }
  }
}
