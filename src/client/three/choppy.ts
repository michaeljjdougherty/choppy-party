import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../shared/players';
import { character } from './assets';
import { recolor } from './recolor';
import { mesh, toy } from './kit';

/**
 * Which character each colour is wearing right now. Players pick their character and colour
 * separately, and every view builds models from a colour, so the client keeps this up to date.
 */
export const COLOR_CHAR = new Map<string, number>();
export function setCharacters(players: { color: string; char?: number; slot: number }[]): void {
  for (const p of players) COLOR_CHAR.set(p.color, p.char ?? p.slot);
}

/** World height of a character at scale 1 (matches the old blob mascots, so gameplay scales still fit). */
const BASE = 2.3;

/**
 * A playable character: an animated Kenney model plus a coloured ring at its feet so
 * every player can spot themselves. The constructor takes the player's colour (which maps to
 * their roster slot) and a scale, and `update` picks the right animation each frame.
 */
export class ChoppyModel {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private dizzy = new THREE.Group();
  private ring: THREE.Mesh;
  // squash & stretch spring (0 = rest, + = tall and thin, - = short and wide)
  private sq = 0;
  private sqv = 0;
  private lastJump = 0;
  private riseV = 0;
  private walkPhase = 0;
  // characters drop in from above and bounce when they first appear
  private spawn = { y: 3.2, vy: 0, done: false };

  constructor(color: string, scale = 1) {
    const slot = COLOR_CHAR.get(color) ?? Math.max(0, PLAYER_COLORS.indexOf(color));
    const c = CHARACTERS[slot];
    const { scene, animations } = character(c.model);
    // a colour that isn't the character's own: palette-swap its signature colour
    if (color.toLowerCase() !== c.color.toLowerCase()) recolor(scene, color, c.model);
    scene.scale.setScalar(BASE);
    this.body.add(scene);
    this.group.add(this.body);
    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');

    const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4 });
    this.ring = mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 32), ringMat, { cast: false });
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);

    const starMat = toy('#ffd23f', 0.3);
    starMat.emissive = new THREE.Color('#7a5a00');
    for (let i = 0; i < 3; i++) {
      const st = mesh(new THREE.OctahedronGeometry(0.15), starMat, { cast: false });
      const a = (i / 3) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      this.dizzy.add(st);
    }
    this.dizzy.position.y = 2.3;
    this.dizzy.visible = false;
    this.group.add(this.dizzy);
    this.group.scale.setScalar(scale);
  }

  /** Give the squash spring a kick (e.g. on landing): bigger = squishier. */
  squash(amount = 5): void {
    this.sqv -= amount;
  }

  private play(name: string, timeScale = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (name === this.current) return;
    const prev = this.actions.get(this.current);
    a.reset().setEffectiveWeight(1).play();
    if (name === 'jump' || name === 'die') {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    if (prev) a.crossFadeFrom(prev, 0.18, false);
    this.current = name;
  }

  /** speed: 0..1 how fast it is moving. jump: extra height in body units. */
  update(dt: number, o: { speed?: number; stunned?: boolean; jump?: number; happy?: boolean; t?: number } = {}): void {
    const speed = o.speed ?? 0;
    const jump = o.jump ?? 0;
    if (o.stunned) this.play('emote-no');
    else if (o.happy) this.play('emote-yes');
    else if (jump > 0.05) this.play('jump');
    else if (speed > 0.65) this.play('sprint', 0.8 + speed * 0.4);
    else if (speed > 0.05) this.play('walk', 0.6 + speed * 1.2);
    else this.play('idle');
    // vertical speed of the hop, from the height the sim gives us
    const vy = dt > 0 ? (jump - this.lastJump) / dt : 0;
    if (this.lastJump > 0.04 && jump <= 0.02 && this.riseV < -1) {
      // landing: squash hard, then the spring wobbles it back
      this.sqv -= Math.min(9, -this.riseV * 1.1);
    }
    this.riseV = vy;
    this.lastJump = jump;
    // stretch while flying up, a little thinner while falling
    const target = jump > 0.02 ? THREE.MathUtils.clamp(vy * 0.035, -0.12, 0.22) : 0;
    // under-damped spring so it overshoots: that's the bouncy look (fixed substeps keep it stable on slow frames)
    for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.sqv += ((target - this.sq) * 220 - this.sqv * 11) * h;
      this.sq += this.sqv * h;
    }

    // bouncy walk: a tiny hop on every step
    let bob = 0;
    if (jump <= 0.02 && !o.stunned && speed > 0.05) {
      this.walkPhase += dt * (7 + speed * 7);
      bob = Math.abs(Math.sin(this.walkPhase)) * 0.12 * Math.min(1, speed * 1.5);
    }

    // spawn drop with two bounces
    let drop = 0;
    if (!this.spawn.done) {
      const sp = this.spawn;
      for (let left = Math.min(dt, 0.1); left > 1e-6 && !sp.done; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        sp.vy -= 38 * h;
        sp.y += sp.vy * h;
        if (sp.y <= 0) {
          sp.y = 0;
          if (sp.vy < -3) {
            this.sqv -= Math.min(8, -sp.vy * 0.5);
            sp.vy = -sp.vy * 0.42;
          } else sp.done = true;
        }
      }
      drop = sp.y;
    }

    const sq = THREE.MathUtils.clamp(this.sq, -0.4, 0.4);
    this.body.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
    this.body.position.y = jump + bob + drop;
    this.mixer.update(dt);
    this.dizzy.visible = !!o.stunned;
    if (o.stunned) this.dizzy.rotation.y += dt * 6;
    (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin((o.t ?? 0) * 4) * 0.1;
  }
}
