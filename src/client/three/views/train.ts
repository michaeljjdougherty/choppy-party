import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { CAR_LEN, TRACKS, TRACK_HALF, TX0, TX1, TY0, TY1, type TrainState } from '../../../shared/games/trainHop';
import { place, prop } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz } from '../kit';
import type { View } from '../stage';
import { crew, pool } from './crew';
import { sandMaterial } from '../nature';

const CARS = ['train/train-carriage-coal', 'train/train-carriage-box', 'train/train-carriage-lumber', 'train/train-carriage-wood'];

/** A Train Kit car turned to run along +x, scaled to one CAR_LEN, its back end at x = 0. */
function car(name: string): THREE.Object3D {
  const o = prop(name, 1);
  o.rotation.y = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(o);
  const b = new THREE.Box3().setFromObject(holder);
  const d = b.getSize(new THREE.Vector3());
  const s = (CAR_LEN * PX * 0.96) / Math.max(d.x, 1e-3);
  o.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(holder);
  o.position.x = -b2.min.x;
  o.position.y = -b2.min.y;
  const g = new THREE.Group();
  g.add(holder);
  return g;
}

/** Train Hop: a dusty rail yard with five tracks, signal posts at the ends and Kenney trains. */
export function trainView(env: THREE.Texture, state: TrainState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#ffe9c4', fog: ['#f2dcb4', 40, 100], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 17, 14.5);
  camera.lookAt(0, 0, 1.6);

  const fw = (TX1 - TX0) * PX;
  const fd = (TY1 - TY0) * PX;
  const cx = wx((TX0 + TX1) / 2);
  const cz = wz((TY0 + TY1) / 2);
  const outer = mesh(new THREE.CircleGeometry(90, 48), sandMaterial('#d9b27a', 20), { cast: false, receive: true });
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  const yard = mesh(
    new THREE.PlaneGeometry(fw + 8, fd),
    sandMaterial('#f2d2a8', fw / 5),
    { cast: false, receive: true },
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(cx, 0, cz);
  scene.add(yard);

  // tracks: gravel bed, wooden ties and two steel rails, running off both sides of the yard
  const gravel = toy('#9c8f80', 0.95);
  const tieMat = toy('#6b4a2b', 0.9);
  const railMat = new THREE.MeshStandardMaterial({ color: '#c9ccd4', metalness: 0.7, roughness: 0.3 });
  const span = fw + 30;
  const tieGeo = new THREE.BoxGeometry(0.28, 0.12, TRACK_HALF * PX * 2);
  for (const ty of TRACKS) {
    const z = wz(ty);
    const bed = mesh(new THREE.BoxGeometry(span, 0.06, TRACK_HALF * PX * 2.6), gravel, { cast: false, receive: true });
    bed.position.set(cx, 0.03, z);
    scene.add(bed);
    const ties = new THREE.InstancedMesh(tieGeo, tieMat, Math.floor(span / 0.8));
    for (let i = 0; i < ties.count; i++) {
      ties.setMatrixAt(i, new THREE.Matrix4().makeTranslation(cx - span / 2 + i * 0.8, 0.1, z));
    }
    ties.receiveShadow = true;
    scene.add(ties);
    for (const side of [-1, 1]) {
      const rail = mesh(new THREE.BoxGeometry(span, 0.12, 0.09), railMat, { cast: false, receive: true });
      rail.position.set(cx, 0.2, z + side * TRACK_HALF * PX * 0.55);
      scene.add(rail);
    }
  }
  // a signal post at each end of every track
  const signals = TRACKS.map((ty) => {
    const lamps: THREE.MeshStandardMaterial[] = [];
    for (const side of [-1, 1]) {
      const x = side < 0 ? wx(TX0) - 1 : wx(TX1) + 1;
      const z = wz(ty) - TRACK_HALF * PX - 0.4;
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), toy('#3a3a44', 0.5));
      post.position.set(x, 1.1, z);
      scene.add(post);
      const head = mesh(new THREE.BoxGeometry(0.5, 0.8, 0.35), toy('#22222a', 0.5));
      head.position.set(x, 2.3, z);
      scene.add(head);
      const lamp = new THREE.MeshStandardMaterial({ color: '#552222', emissive: '#ff2a2a', emissiveIntensity: 0 });
      for (const dy of [0.16, -0.16]) {
        const l = mesh(new THREE.SphereGeometry(0.12, 12, 8), lamp, { cast: false });
        l.position.set(x, 2.3 + dy, z + 0.19);
        scene.add(l);
      }
      lamps.push(lamp);
    }
    return lamps;
  });
  // frontier dressing behind the yard
  for (let i = 0; i < 7; i++) {
    place(scene, i % 2 ? 'pirate/crate' : 'pirate/barrel', cx - fw / 2 + 1 + i * (fw / 6.2), 0, wz(TY0) - 1.6 - (i % 2) * 0.6, { s: 1.2, ry: i });
  }
  place(scene, 'pirate/structure', cx - fw / 2 + 4, 0, wz(TY0) - 4.5, { s: 1.6 });
  place(scene, 'pirate/structure-roof', cx - fw / 2 + 4, 0, wz(TY0) - 4.5, { s: 1.6 });
  place(scene, 'forest/tent', cx + fw / 2 - 4, 0, wz(TY0) - 4.5, { s: 2.6, ry: -0.4 });
  for (const [x, z, n] of [[-20, -8, 'pirate/rocks-sand-a'], [19, -9, 'pirate/rocks-sand-b'], [-21, 6, 'pirate/rocks-sand-b'], [20, 7, 'pirate/rocks-sand-a']] as [number, number, string][])
    place(scene, n, x, 0, z, { s: 2, ry: x });
  // a parked train at the back, for scale and flavour
  ['train/train-locomotive-a', ...CARS].forEach((n, i) => {
    const c = car(n);
    c.rotation.y = Math.PI;
    c.position.set(cx - 6 + i * CAR_LEN * PX, 0, wz(TY0) - 7.5);
    scene.add(c);
  });

  const fx = new Fx(scene);
  const team = crew(scene, players, state.hoppers, fx);
  // trains: a pool of locomotives and cars, reused as trains come and go
  const locos = pool(scene, () => car('train/train-locomotive-a'));
  const carPools = CARS.map((n) => pool(scene, () => car(n)));
  const coins = pool(scene, () => prop('platformer/coin-gold', 1.2));
  const seenOut = new Set<string>();
  const coinCount = new Map(state.hoppers.map((h) => [h.id, h.coins]));
  let moving = new Set<string>();
  let last = state;

  return {
    scene,
    camera,
    update(s: TrainState, _p, t, dt) {
      last = s;
      for (const l of signals) for (const m of l) m.emissiveIntensity = 0;
      locos.begin();
      for (const p of carPools) p.begin();
      const nowMoving = new Set<string>();
      for (const tr of s.trains) {
        const z = wz(TRACKS[tr.track]);
        if (tr.warn > 0) {
          // flash the signal on the end the train is coming from
          const on = Math.floor(t * 8) % 2 === 0 ? 2.5 : 0.2;
          signals[tr.track][tr.dir > 0 ? 0 : 1].emissiveIntensity = on;
          continue;
        }
        const key = `${tr.track}:${tr.dir}`;
        nowMoving.add(key);
        if (!moving.has(key)) shake(0.12);
        // nose at tr.x, cars trail behind; facing the direction of travel
        const len = CAR_LEN * PX;
        for (let i = 0; i <= tr.cars - 1; i++) {
          const o = i === 0 ? locos.take() : carPools[(tr.track + i) % CARS.length].take();
          // each car's back end sits len*(i+1) behind the nose; turned around for trains going left
          o.position.set(wx(tr.x) - tr.dir * len * (i + 1), 0.15, z);
          o.rotation.y = tr.dir > 0 ? 0 : Math.PI;
          o.position.y = 0.15 + Math.abs(Math.sin(t * 22 + i)) * 0.03;
        }
        if (Math.floor(t * 20) % 3 === 0) fx.emit(new THREE.Vector3(wx(tr.x) - tr.dir * 0.8, 2.6, z), { tex: 'puff', n: 1, color: '#f4f4f4', speed: [0.2, 0.6], up: 1.5, life: [0.8, 1.2], size: [0.6, 1.6] });
      }
      moving = nowMoving;
      coins.begin();
      for (const c of s.coins) {
        const o = coins.take();
        o.position.set(wx(c.x), 0.55 + Math.sin(t * 4 + c.x) * 0.08, wz(c.y));
        o.rotation.y = t * 4 + c.x;
      }
      for (const h of s.hoppers) {
        const at = new THREE.Vector3(wx(h.x), 1.5, wz(h.y));
        if (h.coins > (coinCount.get(h.id) ?? 0)) fx.sparkle(at, '#ffd23f', 8);
        coinCount.set(h.id, h.coins);
        if (h.outAt >= 0 && !seenOut.has(h.id)) {
          seenOut.add(h.id);
          fx.bonk(at);
          fx.emit(at, { tex: 'star', n: 14, color: ['#ffd23f', '#ffffff'], speed: [3, 6], life: [0.4, 0.8], size: [0.4, 0] });
          shake(0.4);
        }
      }
      fx.update(dt);
      team.update(s.hoppers, dt, (r) => {
        const h = r as TrainState['hoppers'][number];
        return { stunned: h.outAt >= 0, hidden: h.outAt >= 0 && s.t - h.outAt > 1.4 };
      });
    },
    tags() {
      return team.tags(last.hoppers, 2.35, undefined, (r) => (r as TrainState['hoppers'][number]).outAt >= 0);
    },
  };
}
