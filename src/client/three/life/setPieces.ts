import * as THREE from 'three';
import type { BoardDef, BoardState, RecapBeat } from '../../../shared/board/types';
import type { Fx } from '../fx';
import { shake } from '../fx';
import { prop } from '../assets';
import { mesh, toy } from '../kit';
import { postPulse } from '../look/post';
import { sfx } from '../../sfx';
import { rumbleEveryone } from '../../rumble';

/**
 * Round-end hazards as real set pieces you can see coming, instead of a puff of dust:
 * a giant pine creaks and crashes down across its spaces, meteors streak in with fire trails and
 * leave glowing craters, a boulder rolls and bounces down its canyon. View-only: the sim has already
 * decided who got hit; this just times the show (and asks the board view to hold the victims'
 * reactions until the moment of impact).
 */
type Gy = (x: number, z: number) => number;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (k: number) => k * k;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** Seconds after a beat starts that its hit lands (meteors stagger a little per rock). */
export const IMPACT = { pine: 1.3, meteor: 0.95, boulder: 0 } as const;

interface Meteor {
  rock: THREE.Object3D;
  glow: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  delay: number;
  hit: boolean;
}
interface Crater {
  o: THREE.Object3D;
  glow: THREE.Mesh;
  age: number;
}

export function buildSetPieces(scene: THREE.Scene, def: BoardDef, fx: Fx, gy: Gy) {
  const root = new THREE.Group();
  scene.add(root);
  const node = (id: string) => def.nodes[id];
  const at = (id: string) => {
    const n = node(id);
    return n ? V(n.x, n.y, n.z) : V();
  };

  // ---------------------------------------------------------------- Lantern Hollow: the timber pine
  const pine = new THREE.Group();
  const pineTilt = new THREE.Group(); // rotates about the base to fall
  pine.add(pineTilt);
  root.add(pine);
  pine.visible = false;
  let pineFor = '';
  let pineDir = V(0, 0, 1);
  let pineLen = 6;
  let pineFall = -1; // beat clock when it started to fall, or -1 standing
  let pineGone = 0; // 0..1 sinking away after the crash
  let pineGrow = 1;
  let pineModel: THREE.Object3D | null = null;
  function setPine(nodes: string[]) {
    const key = nodes.join(',');
    if (key === pineFor) return;
    pineFor = key;
    if (!nodes.length) return;
    const pts = nodes.map(at).filter((p) => p.lengthSq() > 0);
    if (!pts.length) return;
    // stand it just past the last marked space; it falls back along the run of spaces
    const first = pts[0], last = pts[pts.length - 1];
    const d = pts.length > 1 ? last.clone().sub(first).setY(0).normalize() : V(0, 0, -1);
    pineDir = d.clone().negate();
    const side = V(-d.z, 0, d.x).multiplyScalar(0.7);
    const base = last.clone().addScaledVector(d, 1.7).add(side);
    base.y = gy(base.x, base.z);
    pineLen = Math.max(5.5, first.distanceTo(last) + 3.2);
    pine.position.copy(base);
    pine.rotation.set(0, 0, 0);
    // the tree's own up axis tips toward pineDir
    pine.rotation.y = Math.atan2(pineDir.x, pineDir.z);
    pineTilt.rotation.set(0, 0, 0);
    if (pineModel) pineTilt.remove(pineModel);
    pineModel = prop('platformer/tree-pine');
    const box = new THREE.Box3().setFromObject(pineModel);
    const h = Math.max(0.01, box.max.y - box.min.y);
    pineModel.scale.setScalar(pineLen / h);
    pineModel.position.y = -box.min.y * (pineLen / h);
    pineModel.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    pineTilt.add(pineModel);
    pineFall = -1;
    pineGone = 0;
    pineGrow = 0;
  }

  // ---------------------------------------------------------------- Cosmo Junction: meteors
  const meteors: Meteor[] = [];
  const craters: Crater[] = [];
  const glowMat = () => new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  function launchMeteors(nodes: string[]) {
    nodes.forEach((id, i) => {
      const to = at(id);
      const rock = prop('space/meteor', 1.4);
      rock.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = (m.material as THREE.MeshStandardMaterial).clone();
          const mm = m.material as THREE.MeshStandardMaterial;
          mm.emissive = new THREE.Color('#ff5a1a');
          mm.emissiveIntensity = 0.9;
        }
      });
      const glow = mesh(new THREE.SphereGeometry(1.1, 12, 8), glowMat(), { cast: false });
      rock.add(glow);
      const from = to.clone().add(V(-16 + i * 3, 30, -22));
      rock.position.copy(from);
      root.add(rock);
      meteors.push({ rock, glow, from, to, delay: i * 0.12, hit: false });
    });
  }

  // ---------------------------------------------------------------- Gold Rush Gulch: the boulder
  const boulder = mesh(new THREE.IcosahedronGeometry(1.15, 0), toy('#9a7458', 0.95), { cast: true });
  (boulder.material as THREE.MeshStandardMaterial).flatShading = true;
  boulder.visible = false;
  root.add(boulder);
  let roll: { path: THREE.Vector3[]; ids: string[]; len: number[]; total: number; start: number } | null = null;
  const passed = new Set<string>();
  function startRoll(lane: string[], t0: number) {
    const pts = lane.map((id) => ({ id, p: at(id) }));
    if (!pts.length) return;
    // roll downhill: highest end first (or from the outer end when the canyon is flat)
    const ys = pts.map((q) => q.p.y);
    const flat = Math.max(...ys) - Math.min(...ys) < 0.5;
    // order along the lane: by projection on the line between the two farthest-apart spaces
    let a = pts[0], b = pts[0], best = -1;
    for (const x of pts) for (const y of pts) {
      const d = x.p.distanceToSquared(y.p);
      if (d > best) [best, a, b] = [d, x, y];
    }
    const axis = b.p.clone().sub(a.p).normalize();
    pts.sort((x, y) => x.p.clone().sub(a.p).dot(axis) - y.p.clone().sub(a.p).dot(axis));
    const startHigh = flat ? pts[0].p.length() > pts[pts.length - 1].p.length() : pts[0].p.y >= pts[pts.length - 1].p.y;
    if (!startHigh) pts.reverse();
    const dir = pts.length > 1 ? pts[1].p.clone().sub(pts[0].p).setY(0).normalize() : V(0, 0, 1);
    const pre = pts[0].p.clone().addScaledVector(dir, -6);
    pre.y = gy(pre.x, pre.z);
    const post = pts[pts.length - 1].p.clone().addScaledVector(dir, 7);
    post.y = gy(post.x, post.z);
    const path = [pre, ...pts.map((q) => q.p), post];
    const len = [0];
    for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
    roll = { path, ids: ['', ...pts.map((q) => q.id), ''], len, total: len[len.length - 1], start: t0 };
    passed.clear();
    boulder.visible = true;
    boulder.scale.setScalar(0.01);
  }
  const ROLL_SPEED = 10;

  let beatAt = -1;
  let rumbleT = 0;
  return {
    /** Board view asks: should a hit on this space wait (the hazard hasn't reached it yet)? */
    holds(b: BoardState, nodeId: string): boolean {
      const beat = b.sub === 'roundEnd' ? b.recap?.cur : null;
      if (!beat) return false;
      const age = b.t - beat.at;
      if (beat.kind === 'pine') return age < IMPACT.pine;
      if (beat.kind === 'meteor') {
        const i = beat.focus.indexOf(nodeId);
        return age < IMPACT.meteor + Math.max(0, i) * 0.12;
      }
      if (beat.kind === 'boulder') return !!roll && !passed.has(nodeId) && beat.focus.includes(nodeId);
      return false;
    },

    update(b: BoardState, t: number, dt: number): void {
      const beat: RecapBeat | null = b.sub === 'roundEnd' ? (b.recap?.cur ?? null) : null;
      // a new beat starts its show
      if (beat && beat.at !== beatAt) {
        beatAt = beat.at;
        if (beat.kind === 'pine') {
          setPine(beat.focus);
          pineFall = beat.at;
          sfx.step();
        } else if (beat.kind === 'meteor') {
          launchMeteors(beat.focus);
          sfx.whoosh();
        } else if (beat.kind === 'boulder') {
          startRoll(beat.focus, beat.at);
          sfx.bump();
        }
      }
      if (!beat) beatAt = -1;

      // --- the pine: stands (and creaks) wherever the next one will fall, at night
      if (def.theme === 'hollow') {
        if (pineFall < 0 && b.hazards.pine.length) setPine(b.hazards.pine);
        const show = (b.night || pineFall >= 0) && pineFor !== '';
        pine.visible = show;
        if (show) {
          pineGrow = Math.min(1, pineGrow + dt * 1.5);
          if (pineFall < 0) {
            // standing: a slow ominous lean and a shiver now and then
            const shiver = Math.max(0, Math.sin(t * 0.9) - 0.85) * 6;
            pineTilt.rotation.x = 0.06 + Math.sin(t * 1.3) * 0.015 + Math.sin(t * 23) * 0.012 * shiver;
            const g = 1 - Math.pow(1 - pineGrow, 3);
            pineTilt.scale.set(g, g, g);
            pine.position.y = gy(pine.position.x, pine.position.z) - pineGone * pineLen;
          } else {
            const age = b.t - pineFall;
            if (age < 0.75) {
              // the creak: it shakes, sheds leaves and starts to go
              pineTilt.rotation.x = 0.06 + Math.sin(age * 40) * 0.035 * (age / 0.75) + age * 0.08;
              if (Math.random() < dt * 14) fx.emit(pine.position.clone().add(V(0, pineLen * 0.75, 0)), { tex: 'puff', color: ['#3f8f4a', '#2f6e3a'], n: 1, speed: [0.5, 1.5], up: 0.5, gravity: 4, life: [0.6, 1], size: [0.3, 0.2] });
            } else {
              const k = clamp01((age - 0.75) / (IMPACT.pine - 0.75));
              pineTilt.rotation.x = 0.12 + ease(k) * (Math.PI / 2 - 0.12);
              if (k >= 1 && pineTilt.userData.landed !== beatAt) {
                pineTilt.userData.landed = beatAt;
                // the crash: dust all along the trunk, a burst of needles, the ground shakes
                for (let i = 1; i <= 5; i++) fx.dust(pine.position.clone().addScaledVector(pineDir, (pineLen * i) / 5).setY(pine.position.y + 0.3), 1.8);
                fx.emit(pine.position.clone().addScaledVector(pineDir, pineLen * 0.8).setY(pine.position.y + 1), { tex: 'puff', color: ['#3f8f4a', '#5aa24f', '#2f6e3a'], n: 26, speed: [2, 6], spread: 0.8, up: 3, gravity: 9, life: [0.6, 1.1], size: [0.35, 0.2] });
                shake(0.7);
                postPulse('impact', 0.8);
                sfx.boom();
                rumbleEveryone(0.8, 0.6, 300);
              }
              // after the crash it bounces a little, then sinks away
              if (k >= 1) {
                const after = age - IMPACT.pine;
                pineTilt.rotation.x = Math.PI / 2 - Math.abs(Math.sin(after * 14)) * 0.06 * Math.exp(-after * 5);
                if (after > 1.6) pineGone = Math.min(1, pineGone + dt * 0.8);
                pine.position.y = gy(pine.position.x, pine.position.z) - pineGone * 2;
                if (pineGone >= 1) {
                  pineFall = -1;
                  pineFor = '';
                  pineGone = 0;
                  pineTilt.rotation.x = 0;
                }
              }
            }
          }
        }
      }

      // --- meteors streak in, glowing, with a fire trail
      for (const m of meteors) {
        const age = beat ? b.t - beat.at - m.delay : 9;
        const k = clamp01(age / IMPACT.meteor);
        if (!m.hit) {
          m.rock.position.lerpVectors(m.from, m.to, ease(k));
          m.rock.rotation.x += dt * 6;
          m.rock.rotation.z += dt * 4;
          (m.glow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 30) * 0.15;
          if (k > 0 && k < 1) {
            fx.emit(m.rock.position, { tex: 'soft', color: ['#ffd23f', '#ff8a1f', '#ff4d1a'], n: 2, speed: [0.2, 0.8], life: [0.25, 0.5], size: [1.1, 0.2], additive: true, jitter: 0.6 });
            if (Math.random() < 0.4) fx.emit(m.rock.position, { tex: 'puff', color: ['#5c5664', '#7a7482'], n: 1, speed: [0.1, 0.4], life: [0.6, 1.0], size: [0.6, 1.4], gravity: -0.5 });
          }
          if (k >= 1) {
            m.hit = true;
            root.remove(m.rock);
            fx.blast(m.to.clone().setY(m.to.y + 0.6), 1.8);
            fx.emit(m.to.clone().setY(m.to.y + 0.5), { tex: 'puff', color: ['#ffb020', '#ffd23f'], n: 10, speed: [3, 7], spread: 0.5, up: 5, gravity: 14, life: [0.5, 0.9], size: [0.35, 0.15] });
            shake(0.5);
            postPulse('impact', 0.7);
            sfx.boom();
            if (t - rumbleT > 0.15) {
              rumbleT = t;
              rumbleEveryone(0.7, 0.5, 200);
            }
            const c = prop('space/crater', 1.3);
            c.position.set(m.to.x, m.to.y + 0.02, m.to.z);
            const glow = mesh(new THREE.CircleGeometry(1.2, 20), glowMat(), { cast: false });
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = 0.08;
            c.add(glow);
            root.add(c);
            craters.push({ o: c, glow, age: 0 });
          }
        }
      }
      for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].hit) meteors.splice(i, 1);
      // craters glow, cool, then sink away
      for (const c of craters) {
        c.age += dt;
        (c.glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - c.age * 0.25) * (0.85 + Math.sin(t * 8 + c.age) * 0.15);
        if (c.age < 3 && Math.random() < dt * 3) fx.emit(c.o.position.clone().setY(c.o.position.y + 0.3), { tex: 'puff', color: '#6a6470', n: 1, speed: [0.1, 0.3], up: 1, life: [1, 1.6], size: [0.4, 1.2], gravity: -0.4 });
        if (c.age > 6) c.o.position.y -= dt * 0.5;
      }
      for (let i = craters.length - 1; i >= 0; i--) if (craters[i].age > 8) root.remove(craters.splice(i, 1)[0].o);

      // --- the boulder rolls down the canyon, bouncing
      if (roll) {
        const age = b.t - roll.start;
        const d = age * ROLL_SPEED;
        let i = 1;
        while (i < roll.len.length - 1 && roll.len[i] < d) i++;
        const seg = Math.max(1e-3, roll.len[i] - roll.len[i - 1]);
        const k = clamp01((d - roll.len[i - 1]) / seg);
        const p = roll.path[i - 1].clone().lerp(roll.path[i], k);
        const hop = Math.abs(Math.sin(age * 7)) * 0.6;
        boulder.position.set(p.x, p.y + 1.15 + hop, p.z);
        const dir = roll.path[i].clone().sub(roll.path[i - 1]).setY(0).normalize();
        boulder.rotateOnWorldAxis(V(dir.z, 0, -dir.x), (ROLL_SPEED / 1.15) * dt);
        boulder.scale.setScalar(Math.min(1, age * 4) * (d > roll.total - 2 ? Math.max(0.01, (roll.total - d) / 2) : 1));
        if (Math.random() < dt * 20) fx.emit(boulder.position.clone().setY(p.y + 0.2), { tex: 'puff', color: ['#d8b98a', '#c9a678'], n: 1, speed: [0.5, 1.5], up: 0.6, life: [0.5, 0.9], size: [0.5, 1.3], drag: 3 });
        if (hop < 0.05 && Math.random() < 0.3) shake(0.12);
        for (let j = 1; j < roll.ids.length - 1; j++)
          if (roll.ids[j] && d >= roll.len[j] && !passed.has(roll.ids[j])) {
            passed.add(roll.ids[j]);
            fx.dust(roll.path[j].clone().setY(roll.path[j].y + 0.3), 1.4);
            sfx.bump();
          }
        if (d >= roll.total) {
          roll = null;
          boulder.visible = false;
        }
      }
    },
  };
}
