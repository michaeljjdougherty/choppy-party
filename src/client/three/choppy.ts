import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../shared/players';
import { character } from './assets';
import { recolor } from './recolor';
import { mesh, toy } from './kit';
import { FolkModel, folk } from './folks';
import { applyLook } from './cosmetics';
import { lookFor } from '../looks';
import type { Fx } from './fx';
import { fxFor } from './anim/sceneFx';

/**
 * Which character each colour is wearing right now. Players pick their character and colour
 * separately, and every view builds models from a colour, so the client keeps this up to date.
 */
export const COLOR_CHAR = new Map<string, number>();
export function setCharacters(players: { color: string; char?: number; slot: number }[]): void {
  for (const p of players) COLOR_CHAR.set(p.color, p.char ?? p.slot);
}

/** Colours of the players this screen controls; their models get a thin outline so you never lose yourself. */
export const OUTLINED = new Set<string>();
/** Ids of the human players on this screen (for games with secrets, like Mimic Chest). */
export const LOCAL = new Set<string>();
export function setOutlined(players: { id: string; color: string; bot?: unknown }[], local: Set<string>): void {
  OUTLINED.clear();
  LOCAL.clear();
  const mine = players.filter((p) => !p.bot && local.has(p.id));
  for (const p of mine) LOCAL.add(p.id);
  // if everyone in the game is on this screen, outlining all of them would mark nobody
  if (mine.length < players.length) for (const p of mine) OUTLINED.add(p.color);
}

/** One shared outline look: an inverted shell pushed out a couple of pixels along each normal, on screen. */
let outlineMat: THREE.MeshBasicMaterial | null = null;
function outlineMaterial(): THREE.MeshBasicMaterial {
  if (outlineMat) return outlineMat;
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        // push the shell away from the camera so only the outer silhouette shows,
        // not an edge round every lock of hair or button
        mvPosition.xyz += normalize(mvPosition.xyz) * 0.45;
        gl_Position = projectionMatrix * mvPosition;`,
      )
      .replace(
        '#include <fog_vertex>',
        `{
          vec4 nClip = projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0);
          float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
          vec2 d = nClip.xy * vec2(aspect, 1.0);
          if (dot(d, d) > 1e-8) gl_Position.xy += normalize(d) / vec2(aspect, 1.0) * 0.0075 * gl_Position.w;
        }
        #include <fog_vertex>`,
      );
  };
  m.customProgramCacheKey = () => 'choppy-outline';
  outlineMat = m;
  return m;
}

/** World height of a character at scale 1 (matches the old blob mascots, so gameplay scales still fit). */
const BASE = 2.3;

/** Crew models are built at their own size; scale them so they stand as tall as the aliens. */
let folkK = 0;
function folkScale(): number {
  if (folkK) return folkK;
  const alien = CHARACTERS.find((c) => c.model);
  let target = 2.0;
  if (alien?.model) {
    const g = character(alien.model).scene.clone();
    g.scale.setScalar(BASE);
    const h = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).y;
    if (h > 0.2) target = h;
  }
  const probe = new FolkModel(folk('rik'), '#ffffff', 1);
  const fh = new THREE.Box3().setFromObject(probe.group).getSize(new THREE.Vector3()).y;
  folkK = fh > 0.2 ? (target * 1.2) / fh : 1;
  return folkK;
}

/** Wrap an angle to -PI..PI. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/**
 * A playable character: an animated Kenney model plus a coloured ring at its feet so
 * every player can spot themselves. The constructor takes the player's colour (which maps to
 * their roster slot) and a scale, and `update` picks the right animation each frame.
 *
 * The animation layer (2026-11-12 overhaul) watches where the view actually puts the model, so every
 * minigame gets it for free: the turn to a new facing is sprung instead of snapped, the body leans into
 * speed and banks into turns, feet kick up dust, a hit knocks the body back with stars, a cheer is a hop
 * and a spin with sparkles, and a knocked-out player sways dizzily. All of it is view-only (no game state).
 */
export class ChoppyModel {
  readonly group = new THREE.Group();
  /** Turn spring and lean live here (between the group the view moves and the squashing body). */
  private lean = new THREE.Group();
  private body = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  /** Our crew characters are built in code rather than loaded. */
  readonly folk: FolkModel | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private dizzy = new THREE.Group();
  private ring: THREE.Mesh;
  private color: string;
  private outline: [THREE.Mesh, THREE.Mesh][] | null = null;
  // squash & stretch spring (0 = rest, + = tall and thin, - = short and wide)
  private sq = 0;
  private sqv = 0;
  private lastJump = 0;
  private riseV = 0;
  private walkPhase = 0;
  // characters drop in from above and bounce when they first appear
  private spawn = { y: 3.2, vy: 0, done: false };
  // ---- the animation layer: what the view did to us since last frame
  private seen = false;
  private lastPos = new THREE.Vector3();
  private vel = new THREE.Vector3(); // world units/s, smoothed, divided by our scale
  private acc = new THREE.Vector3();
  private yawShown = 0;
  private yawV = 0;
  private pitch = 0;
  private pitchV = 0;
  private roll = 0;
  private rollV = 0;
  private wasStunned = false;
  private wasHappy = false;
  private cheerAt = -9;
  private spin = 1; // 0..1 progress of a celebration spin (1 = not spinning)
  private spinDir = 1;
  private hop = 0; // own celebration hop for the Kenney models (folk hop themselves)
  private hopV = 0;
  private ringPop = 0;
  private skidAt = -9;
  private clock = 0;
  private seed = Math.random() * 100;

  constructor(color: string, scale = 1) {
    // players keep their clean look (no surface texture from look/detail.ts)
    this.group.userData.noDetail = true;
    this.color = color;
    const slot = COLOR_CHAR.get(color) ?? Math.max(0, PLAYER_COLORS.indexOf(color));
    const c = CHARACTERS[slot] ?? CHARACTERS[0];
    if (c.folk) {
      // one of our people: shirt in the player's colour, sized to stand as tall as the aliens
      this.folk = new FolkModel(folk(c.folk), color, folkScale());
      // their saved outfit from the Customize screen (or the one the room sent, online)
      applyLook(this.folk, lookFor(color, c.folk));
      this.body.add(this.folk.group);
    } else if (c.model) {
      const { scene, animations } = character(c.model);
      // a colour that isn't the character's own: palette-swap its signature colour
      if (color.toLowerCase() !== c.color.toLowerCase()) recolor(scene, color, c.model);
      scene.scale.setScalar(BASE);
      this.body.add(scene);
      this.mixer = new THREE.AnimationMixer(scene);
      for (const clip of animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.play('idle');
    }
    this.lean.rotation.order = 'YXZ';
    this.lean.add(this.body);
    this.group.add(this.lean);

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

  /** Particle layer of the scene we're in, unless we're hidden (an FPS player's own body, a hidden stand-in). */
  private fx(): Fx | null {
    if (this.group.layers.mask !== 1) return null;
    for (let o: THREE.Object3D | null = this.group; o; o = o.parent) if (!o.visible) return null;
    return fxFor(this.group);
  }

  private worldAt(y: number): THREE.Vector3 {
    return this.group.localToWorld(tmpV.set(0, y, 0)).clone();
  }

  /** Knocked back: squash, a recoil tilt and twist, and stars over the head. Views can call it on any hit. */
  flinch(power = 1): void {
    this.sqv -= 7 * power;
    this.pitchV -= 7 * power;
    this.yawV += (Math.random() < 0.5 ? -1 : 1) * 9 * power;
    this.folk?.react('hurt', 0.7);
    const fx = this.fx();
    if (fx) {
      const s = this.group.getWorldScale(tmpS).x;
      const at = this.worldAt(2.0);
      fx.bonk(at);
      fx.emit(at, { tex: 'soft', color: '#ffffff', n: 1, speed: [0, 0], life: [0.12, 0.12], size: [1.2 * s, 2.4 * s], additive: true });
    }
  }

  /** A cheer: hop, spin and sparkles in the player's colour. Views can call it whenever someone scores. */
  celebrate(): void {
    if (this.clock - this.cheerAt < 0.9) return;
    this.cheerAt = this.clock;
    this.spin = 0;
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.ringPop = 1;
    if (this.folk) this.folk.jump();
    else if (this.hop <= 0.01) this.hopV = 5.2;
    this.sqv += 3; // stretch up out of the crouch
    const fx = this.fx();
    if (fx) {
      const at = this.worldAt(1.6);
      fx.sparkle(at, this.color, 10);
      fx.emit(at, { tex: 'star', color: ['#ffffff', '#ffd23f', this.color], n: 8, speed: [2, 4], spread: 0.8, up: 3, life: [0.5, 0.8], size: [0.35, 0.1], gravity: 5, drag: 1.5, additive: true });
    }
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
    if (prev) a.crossFadeFrom(prev, 0.22, true);
    this.current = name;
  }

  /** speed: 0..1 how fast it is moving (left out = worked out from how the view moves us). jump: extra height in body units. */
  update(dt: number, o: { speed?: number; stunned?: boolean; jump?: number; happy?: boolean; t?: number } = {}): void {
    this.clock += dt;
    const jump = o.jump ?? 0;
    const t = o.t ?? performance.now() / 1000;
    const fx = this.fx();

    // ---- where the view put us: velocity, acceleration and facing in world space
    this.group.updateWorldMatrix(true, false);
    const s = Math.max(1e-3, this.group.getWorldScale(tmpS).x);
    const p = tmpV.setFromMatrixPosition(this.group.matrixWorld);
    const e = this.group.matrixWorld.elements;
    const yaw = Math.atan2(e[8], e[10]);
    const moved = p.distanceTo(this.lastPos);
    if (!this.seen || dt <= 0 || dt > 0.25 || moved > 4 * s + 2.5) {
      // first frame or a teleport (respawn, new round): snap, don't streak
      this.seen = true;
      this.vel.set(0, 0, 0);
      this.acc.set(0, 0, 0);
      this.yawShown = yaw;
      this.yawV = 0;
    } else {
      const k = 1 - Math.exp(-dt * 12);
      const rx = (p.x - this.lastPos.x) / dt / s, rz = (p.z - this.lastPos.z) / dt / s;
      const ax = (rx - this.vel.x) / Math.max(dt, 1 / 120), az = (rz - this.vel.z) / Math.max(dt, 1 / 120);
      this.vel.x += (rx - this.vel.x) * k;
      this.vel.z += (rz - this.vel.z) * k;
      const ka = 1 - Math.exp(-dt * 8);
      this.acc.x += (THREE.MathUtils.clamp(ax, -80, 80) - this.acc.x) * ka;
      this.acc.z += (THREE.MathUtils.clamp(az, -80, 80) - this.acc.z) * ka;
    }
    this.lastPos.copy(p);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const speed = o.speed ?? (jump > 0.05 ? 0 : THREE.MathUtils.clamp(hs / 7, 0, 1));

    // ---- reactions to the view's flags turning on
    const stunned = !!o.stunned;
    if (stunned && !this.wasStunned) this.flinch(1);
    if (o.happy && !this.wasHappy) this.celebrate();
    this.wasStunned = stunned;
    this.wasHappy = !!o.happy;

    if (this.folk) {
      const f = this.folk;
      const want = stunned ? 'hurt' : o.happy ? 'happy' : null;
      if (want) f.react(want, 0.4);
      f.update(dt, t, { speed: speed * 6, cheer: !!o.happy, down: stunned, air: jump > 0.08 });
    } else if (stunned) this.play('emote-no');
    else if (o.happy) this.play('emote-yes');
    else if (jump > 0.05 || this.hop > 0.05) this.play('jump');
    else if (speed > 0.65) this.play('sprint', 0.8 + speed * 0.4);
    else if (speed > 0.05) this.play('walk', 0.6 + speed * 1.2);
    else this.play('idle');
    // vertical speed of the hop, from the height the sim gives us
    const vy = dt > 0 ? (jump - this.lastJump) / dt : 0;
    if (this.lastJump > 0.04 && jump <= 0.02 && this.riseV < -1) {
      // landing: squash hard, then the spring wobbles it back, and a puff of dust
      const hit = Math.min(9, -this.riseV * 1.1);
      this.sqv -= hit;
      this.ringPop = Math.max(this.ringPop, 0.6);
      fx?.dust(this.worldAt(0.15), Math.min(1.2, 0.35 + hit / 10) * s);
    }
    this.riseV = vy;
    this.lastJump = jump;
    // stretch while flying up, a little thinner while falling
    const target = jump > 0.02 ? THREE.MathUtils.clamp(vy * 0.035, -0.12, 0.22) : 0;

    // ---- springs (fixed substeps keep them stable on slow frames)
    const cy = Math.cos(this.yawShown), sy = Math.sin(this.yawShown);
    // velocity and acceleration in the body's own frame (z = forward, x = its left/right)
    const fwd = this.vel.x * sy + this.vel.z * cy;
    const side = this.vel.x * cy - this.vel.z * sy;
    const fAcc = this.acc.x * sy + this.acc.z * cy;
    const sAcc = this.acc.x * cy - this.acc.z * sy;
    const grounded = jump <= 0.02 && this.hop <= 0.02;
    const movingK = Math.min(1, hs / 2);
    let pitchT = THREE.MathUtils.clamp(fwd * 0.032 + fAcc * 0.005 * movingK, -0.28, 0.32);
    let rollT = THREE.MathUtils.clamp(-side * 0.025 - sAcc * 0.006 * movingK, -0.3, 0.3);
    if (stunned) {
      // dazed: a slow drunken circle
      pitchT += Math.sin(t * 4.2 + this.seed) * 0.09;
      rollT += Math.cos(t * 4.2 + this.seed) * 0.12;
    }
    const yawT = yaw;
    for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.sqv += ((target - this.sq) * 220 - this.sqv * 11) * h;
      this.sq += this.sqv * h;
      this.pitchV += ((pitchT - this.pitch) * 110 - this.pitchV * 13) * h;
      this.pitch += this.pitchV * h;
      this.rollV += ((rollT - this.roll) * 110 - this.rollV * 13) * h;
      this.roll += this.rollV * h;
      // turn: a quick spring with a hint of overshoot, so turning round reads as a turn and not a snap
      const d = wrap(yawT - this.yawShown);
      this.yawV += (d * 420 - this.yawV * 34) * h;
      this.yawShown = wrap(this.yawShown + this.yawV * h);
      this.hopV -= 16 * h;
      this.hop = Math.max(0, this.hop + this.hopV * h);
      if (this.hop === 0 && this.hopV < -2) {
        this.sqv -= Math.min(6, -this.hopV);
        this.hopV = 0;
      }
    }
    // never trail the real facing by more than about 100 degrees (aiming games need to read)
    let off = wrap(this.yawShown - yaw);
    if (Math.abs(off) > 1.8) {
      off = Math.sign(off) * 1.8;
      this.yawShown = wrap(yaw + off);
    }
    if (this.spin < 1) this.spin = Math.min(1, this.spin + dt / 0.55);
    const spinA = this.spin < 1 ? (1 - Math.pow(1 - this.spin, 3)) * Math.PI * 2 * this.spinDir : 0;
    this.lean.rotation.set(this.pitch, off + spinA, this.roll);

    // bouncy walk: a tiny hop on every step, and a puff of dust off the heel when running
    let bob = 0;
    if (grounded && !stunned && speed > 0.05) {
      const before = Math.floor(this.walkPhase / Math.PI);
      this.walkPhase += dt * (7 + speed * 7);
      if (!this.folk) bob = Math.abs(Math.sin(this.walkPhase)) * 0.12 * Math.min(1, speed * 1.5);
      if (fx && speed > 0.45 && hs > 2.5 && Math.floor(this.walkPhase / Math.PI) !== before) {
        const foot = (Math.floor(this.walkPhase / Math.PI) % 2 ? 0.22 : -0.22) * s;
        const at = this.worldAt(0.08);
        at.x += cy * foot - (this.vel.x / Math.max(hs, 1e-3)) * 0.3 * s;
        at.z -= sy * foot + (this.vel.z / Math.max(hs, 1e-3)) * 0.3 * s;
        fx.emit(at, { tex: 'puff', color: ['#ffffff', '#efe9df'], n: 1, speed: [0.3, 0.8], spread: 0.05, up: 0.5, life: [0.3, 0.45], size: [0.25 * s, 0.6 * s], drag: 4, jitter: 0.1 });
      }
    }
    // a hard stop or a sharp cut: skid dust
    if (fx && grounded && hs > 3 && fAcc < -30 && this.clock - this.skidAt > 0.35) {
      this.skidAt = this.clock;
      fx.dust(this.worldAt(0.1), 0.5 * s);
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
            if (sp.vy < -9) fx?.dust(this.worldAt(0.1), 0.6 * s);
            this.sqv -= Math.min(8, -sp.vy * 0.5);
            sp.vy = -sp.vy * 0.42;
          } else sp.done = true;
        }
      }
      drop = sp.y;
    }

    const sq = THREE.MathUtils.clamp(this.sq, -0.4, 0.4);
    this.body.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
    this.body.position.y = jump + bob + drop + this.hop;
    this.mixer?.update(dt);
    this.dizzy.visible = stunned;
    if (stunned) {
      this.dizzy.rotation.y += dt * 6;
      this.dizzy.position.y = 2.3 + Math.sin(t * 5) * 0.06 + jump;
    }
    this.ringPop = Math.max(0, this.ringPop - dt * 2.5);
    this.ring.scale.setScalar(1 + Math.sin(this.ringPop * Math.PI) * 0.35);
    (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin(t * 4) * 0.1 + this.ringPop * 1.2;
    this.setOutline(OUTLINED.has(this.color));
  }

  /** Thin outline round the whole character (built the first time it's needed). */
  setOutline(on: boolean): void {
    if (!on && !this.outline) return;
    if (on && !this.outline) {
      const mat = outlineMaterial();
      const shells: [THREE.Mesh, THREE.Mesh][] = [];
      const src: THREE.Mesh[] = [];
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || o.userData.outline) return;
        const mm = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
        if (mm.transparent && mm.opacity < 0.95) return; // glass, decals, glows
        const g = m.geometry;
        if (!g.attributes.normal) return;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const k = m.getWorldScale(new THREE.Vector3()).x / Math.max(1e-6, this.group.getWorldScale(new THREE.Vector3()).x);
        if (g.boundingSphere!.radius * k < 0.08) return; // eyes, buttons and other specks
        src.push(m);
      });
      for (const m of src) {
        let shell: THREE.Mesh;
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
          const sm = m as THREE.SkinnedMesh;
          const s = new THREE.SkinnedMesh(sm.geometry, mat);
          s.bind(sm.skeleton, sm.bindMatrix);
          shell = s;
          // a skinned shell must sit beside its source (bones already place it)
          shell.position.copy(m.position);
          shell.quaternion.copy(m.quaternion);
          shell.scale.copy(m.scale);
          m.parent!.add(shell);
        } else {
          const im = m as THREE.InstancedMesh;
          if (im.isInstancedMesh) {
            const s = new THREE.InstancedMesh(im.geometry, mat, im.count);
            s.instanceMatrix = im.instanceMatrix;
            shell = s;
          } else shell = new THREE.Mesh(m.geometry, mat);
          // a child with no transform of its own lines up exactly, however the part is placed or animated
          m.add(shell);
        }
        shell.userData.outline = true;
        shell.castShadow = shell.receiveShadow = false;
        shell.frustumCulled = false;
        shell.renderOrder = -1;
        shells.push([m, shell]);
      }
      this.outline = shells;
    }
    for (const [m, sh] of this.outline!) {
      sh.visible = on && m.visible;
      if (!on) continue;
      // hair trimmed under a hat: trim its outline the same way
      const planes = ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material).clippingPlanes;
      if (planes?.length) {
        if (sh.material === outlineMat) {
          const own = outlineMat.clone();
          own.onBeforeCompile = outlineMat.onBeforeCompile;
          own.customProgramCacheKey = outlineMat.customProgramCacheKey;
          sh.material = own;
        }
        (sh.material as THREE.Material).clippingPlanes = planes;
      }
    }
  }
}
