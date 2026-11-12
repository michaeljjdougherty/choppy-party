import * as THREE from 'three';
import type { BoardDef, BoardState } from '../../../shared/board/types';
import { character } from '../assets';
import { softShadowMat } from '../look/fxKit';

/**
 * The people who live on the board, so it feels lived in: they amble about off the path, stop to
 * watch whoever's turn it is, cheer when someone buys a Chobglob, and scatter when a hazard hits
 * near them. View-only, with its own randomness (never the board's).
 */
type Gy = (x: number, z: number) => number;

const CAST: Record<BoardDef['theme'], string[]> = {
  hollow: ['chars/character-male-b', 'chars/character-female-a', 'chars/character-female-c', 'chars/character-male-e', 'chars/character-knight', 'chars/character-female-a'],
  cosmo: ['chars/character-robot', 'chars/character-alien', 'chars/character-robot', 'chars/character-male-e', 'chars/character-female-c'],
  gulch: ['chars/character-male-e', 'chars/character-male-b', 'chars/character-female-c', 'chars/character-female-a', 'chars/character-male-b'],
  court: [],
};
/** Night-only extras (Lantern Hollow's zombies come out after dark). */
const NIGHT: Partial<Record<BoardDef['theme'], string[]>> = { hollow: ['chars/character-zombie', 'chars/character-zombie'] };

const HEIGHT = 1.25;
const SCARY = new Set(['hit', 'ko', 'boom', 'bomb', 'cannon', 'laser', 'spikes', 'meteor', 'pine', 'boulder', 'flare', 'flood', 'sandstorm', 'snare', 'chunk', 'boss']);

interface Resident {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  acts: Record<string, THREE.AnimationAction>;
  cur: string;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  goal: THREE.Vector3 | null;
  yaw: number;
  wait: number;
  mood: 'idle' | 'walk' | 'watch' | 'cheer' | 'flee';
  moodT: number;
  away: THREE.Vector3;
  night: boolean;
}

export function buildResidents(scene: THREE.Scene, def: BoardDef, gy: Gy) {
  const root = new THREE.Group();
  scene.add(root);
  const cast = CAST[def.theme] ?? [];
  const nightCast = NIGHT[def.theme] ?? [];
  if (!cast.length) return { update() {} };
  const nodes = Object.values(def.nodes);
  // points along the path (spaces and the walkway between them) that residents keep clear of
  const lane: THREE.Vector2[] = [];
  for (const n of nodes) {
    lane.push(new THREE.Vector2(n.x, n.z));
    for (const id of n.next) {
      const m = def.nodes[id];
      if (m) lane.push(new THREE.Vector2((n.x + m.x) / 2, (n.z + m.z) / 2));
    }
  }
  const clearOf = (x: number, z: number, need: number) => lane.every((p) => Math.hypot(p.x - x, p.y - z) >= need);
  // homes: just off the path beside a space, spread out over the board
  const cands: THREE.Vector3[] = [];
  for (const n of nodes) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + n.x;
      const d = 2.6 + (k % 2) * 1.2;
      const x = n.x + Math.cos(a) * d, z = n.z + Math.sin(a) * d;
      if (clearOf(x, z, 2.2)) cands.push(new THREE.Vector3(x, gy(x, z), z));
    }
  }
  const homes: THREE.Vector3[] = [];
  const want = cast.length + nightCast.length;
  while (homes.length < want && cands.length) {
    // farthest-point picking so they don't bunch up
    let best = 0, bestD = -1;
    for (let i = 0; i < cands.length; i++) {
      const d = homes.length ? Math.min(...homes.map((h) => h.distanceTo(cands[i]))) : Math.random();
      if (d > bestD) (bestD = d), (best = i);
    }
    homes.push(cands.splice(best, 1)[0]);
  }
  const shadowMat = softShadowMat(0.35);
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const people: Resident[] = [];
  [...cast.map((c) => [c, false] as const), ...nightCast.map((c) => [c, true] as const)].forEach(([path, night], i) => {
    const home = homes[i];
    if (!home) return;
    const { scene: model, animations } = character(path);
    if (!animations.length) return;
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    model.scale.setScalar(HEIGHT / h);
    model.position.y = -box.min.y * (HEIGHT / h);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    const g = new THREE.Group();
    g.add(model);
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.scale.setScalar(0.9);
    sh.position.y = 0.03;
    g.add(sh);
    root.add(g);
    const mixer = new THREE.AnimationMixer(model);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const name of ['idle', 'walk', 'sprint', 'emote-yes', 'interact-right']) {
      const clip = animations.find((a) => a.name === name);
      if (clip) acts[name] = mixer.clipAction(clip);
    }
    acts.idle?.play();
    mixer.update(Math.random() * 2);
    people.push({ root: g, mixer, acts, cur: 'idle', home, pos: home.clone(), goal: null, yaw: Math.random() * 6, wait: Math.random() * 3, mood: 'idle', moodT: 0, away: new THREE.Vector3(), night });
  });

  const play = (r: Resident, name: string, fade = 0.25) => {
    if (r.cur === name || !r.acts[name]) return;
    const next = r.acts[name];
    next.reset().play();
    if (name === 'emote-yes') {
      next.setLoop(THREE.LoopRepeat, 2);
    }
    r.acts[r.cur]?.crossFadeTo(next, fade, false);
    r.cur = name;
  };
  const seen = new Set<number>();
  const tmp = new THREE.Vector3();
  let wasNight: boolean | null = null;

  return {
    update(b: BoardState, t: number, dt: number) {
      void t;
      // react to what just happened on the board
      for (const e of b.fx) {
        if (seen.has(e.n)) continue;
        seen.add(e.n);
        const n = def.nodes[e.node];
        if (!n) continue;
        tmp.set(n.x, n.y, n.z);
        for (const r of people) {
          const d = r.pos.distanceTo(tmp);
          if (e.kind === 'crown' && d < 30) {
            r.mood = 'cheer';
            r.moodT = 2.2 + Math.random() * 0.6;
            r.away.copy(tmp);
          } else if (SCARY.has(e.kind) && d < 9) {
            r.mood = 'flee';
            r.moodT = 1.4;
            r.away.copy(r.pos).sub(tmp).setY(0).normalize();
            if (r.away.lengthSq() < 0.01) r.away.set(1, 0, 0);
          }
        }
      }
      if (seen.size > 400) seen.clear();
      // night folk come out after dark and go home at dawn
      if (wasNight !== b.night) {
        wasNight = b.night;
        for (const r of people) r.root.visible = !r.night || b.night;
      }
      const curId = b.order?.[b.cur];
      const curNode = curId ? def.nodes[b.players[curId]?.node] : undefined;
      for (const r of people) {
        if (!r.root.visible) continue;
        r.moodT -= dt;
        let speed = 0;
        let face: number | null = null;
        if (r.mood === 'flee' && r.moodT > 0) {
          speed = 4.2;
          face = Math.atan2(r.away.x, r.away.z);
          play(r, 'sprint', 0.1);
        } else if (r.mood === 'cheer' && r.moodT > 0) {
          face = Math.atan2(r.away.x - r.pos.x, r.away.z - r.pos.z);
          play(r, 'emote-yes', 0.15);
        } else {
          if (r.mood === 'flee' || r.mood === 'cheer') {
            r.mood = 'idle';
            r.goal = null;
            r.wait = 0.6;
          }
          // wander near home; when the current player is close, stop and watch them
          const near = curNode && Math.hypot(curNode.x - r.pos.x, curNode.z - r.pos.z) < 11;
          if (r.goal) {
            const dx = r.goal.x - r.pos.x, dz = r.goal.z - r.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15) {
              r.goal = null;
              r.wait = 2 + Math.random() * 4;
            } else {
              speed = 1.1;
              face = Math.atan2(dx, dz);
              play(r, 'walk');
            }
          } else {
            r.wait -= dt;
            if (near) face = Math.atan2(curNode!.x - r.pos.x, curNode!.z - r.pos.z);
            play(r, 'idle', 0.35);
            if (r.wait <= 0) {
              for (let k = 0; k < 6; k++) {
                const a = Math.random() * Math.PI * 2, d = 0.8 + Math.random() * 2.2;
                const x = r.home.x + Math.cos(a) * d, z = r.home.z + Math.sin(a) * d;
                if (clearOf(x, z, 1.9)) {
                  r.goal = new THREE.Vector3(x, 0, z);
                  break;
                }
              }
              r.wait = 1.5 + Math.random() * 3;
            }
          }
        }
        if (speed > 0) {
          const step = speed * dt;
          const nx = r.pos.x + Math.sin(face ?? r.yaw) * step, nz = r.pos.z + Math.cos(face ?? r.yaw) * step;
          // never run onto the path, and don't wander off too far
          if (clearOf(nx, nz, 1.6) && Math.hypot(nx - r.home.x, nz - r.home.z) < 6) {
            r.pos.x = nx;
            r.pos.z = nz;
          } else if (r.mood !== 'flee') r.goal = null;
        }
        if (face !== null) {
          let dy = face - r.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          r.yaw += dy * Math.min(1, dt * 7);
        }
        r.pos.y = gy(r.pos.x, r.pos.z);
        r.root.position.copy(r.pos);
        r.root.rotation.y = r.yaw;
        r.mixer.update(dt);
      }
    },
  };
}
