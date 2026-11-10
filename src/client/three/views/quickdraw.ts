import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { QuickDrawState } from '../../../shared/games/quickDrawCactus';
import { ChoppyModel } from '../choppy';
import { place } from '../assets';
import { makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';

export function quickDrawView(env: THREE.Texture, state: QuickDrawState, players: PlayerInfo[]): View {
  const scene = makeScene(env, {
    skyTop: '#ff8a4c',
    skyBottom: '#ffe0a3',
    fog: ['#ffd29a', 30, 90],
    sunDir: [-10, 14, 12],
    sunColor: '#ffe2b0',
  });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);
  camera.position.set(0, 3.6, 15);
  camera.lookAt(0, 3.3, 0);

  const sand = mesh(new THREE.CircleGeometry(120, 48), toy('#f2c27c', 0.85), { cast: false, receive: true });
  sand.rotation.x = -Math.PI / 2;
  scene.add(sand);
  // dunes and mesas in the distance
  const mesaMat = toy('#d9784a', 0.8);
  for (let i = 0; i < 6; i++) {
    const w = 3 + (i % 3) * 2;
    const m = mesh(new THREE.CylinderGeometry(w, w * 1.15, 4 + (i % 2) * 3, 9), mesaMat, { receive: true });
    m.position.set(-34 + i * 13, 2.5, -40 - (i % 2) * 10);
    scene.add(m);
  }
  const dune = toy('#eab06a', 0.9);
  for (let i = 0; i < 5; i++) {
    const d = mesh(new THREE.SphereGeometry(6, 24, 12), dune, { cast: false, receive: true });
    d.scale.set(1.6, 0.25, 1);
    d.position.set(-24 + i * 12, 0, -14 - (i % 2) * 6);
    scene.add(d);
  }
  // frontier town dressing
  place(scene, 'forest/tent', -9, 0, -7, { s: 2.4, ry: 0.5 });
  place(scene, 'pirate/structure', 9.5, 0, -8, { s: 1.4, ry: -0.4 });
  place(scene, 'pirate/structure-roof', 9.5, 0, -8, { s: 1.4, ry: -0.4 });
  place(scene, 'platformer/sign', -3.2, 0, -2.2, { s: 1.8, ry: 0.3 });
  place(scene, 'pirate/barrel', 5.6, 0, -3.5, { s: 1.1 });
  place(scene, 'pirate/barrel', 6.5, 0, -3.0, { s: 1.0, ry: 1 });
  place(scene, 'pirate/crate', 7.2, 0, -4.2, { s: 1.1, ry: 0.4 });
  place(scene, 'pirate/rocks-sand-a', -6, 0, -3, { s: 1.2 });
  place(scene, 'pirate/rocks-sand-b', 3, 0, -9, { s: 1.4, ry: 2 });
  place(scene, 'forest/fence', -13, 0, -4, { s: 2.2, ry: 0.2 });
  place(scene, 'forest/fence', 13, 0, -3.5, { s: 2.2, ry: -0.2 });
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff1c4', fog: false }));
  sunBall.position.set(22, 18, -70);
  scene.add(sunBall);

  // the cactus
  const green = toy('#3fae55', 0.45);
  const cactus = new THREE.Group();
  const cap = (r: number, len: number, x: number, y: number, rotZ = 0) => {
    const c = mesh(new THREE.CapsuleGeometry(r, len, 8, 20), green, { receive: true });
    c.position.set(x, y, 0);
    c.rotation.z = rotZ;
    cactus.add(c);
  };
  cap(0.75, 5.2, 0, 3.4);
  cap(0.45, 1.4, -1.25, 3.2, Math.PI / 2);
  cap(0.45, 1.6, -1.95, 4.2);
  cap(0.45, 1.2, 1.2, 4.0, Math.PI / 2);
  cap(0.45, 1.5, 1.85, 4.9);
  // little spines
  const spineMat = toy('#fff6d8', 0.5);
  for (let i = 0; i < 26; i++) {
    const s = mesh(new THREE.ConeGeometry(0.04, 0.22, 5), spineMat, { cast: false });
    const a = i * 2.4;
    s.position.set(Math.cos(a) * 0.77, 1.6 + (i / 26) * 4.6, Math.sin(a) * 0.77);
    s.lookAt(s.position.x * 3, s.position.y, s.position.z * 3);
    s.rotateX(Math.PI / 2);
    cactus.add(s);
  }
  cactus.position.z = -3;
  scene.add(cactus);

  const flower = new THREE.Group();
  const petal = toy('#ff4fa3', 0.35);
  for (let i = 0; i < 7; i++) {
    const p = mesh(new THREE.SphereGeometry(0.42, 16, 12), petal);
    const a = (i / 7) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
    p.scale.set(1, 0.6, 0.35);
    p.rotation.z = a;
    flower.add(p);
  }
  const center = mesh(new THREE.SphereGeometry(0.32, 16, 12), toy('#ffd23f', 0.3));
  center.scale.z = 0.6;
  center.position.z = 0.1;
  flower.add(center);
  flower.position.set(0, 6.6, -2.4);
  flower.scale.setScalar(0.001);
  scene.add(flower);

  const n = state.ids.length;
  const gap = Math.min(2.2, 18 / Math.max(1, n));
  const models = new Map<string, ChoppyModel>();
  state.ids.forEach((id, i) => {
    const p = players.find((q) => q.id === id);
    const m = new ChoppyModel(p?.color ?? '#fff', 0.7);
    m.group.position.set((i - (n - 1) / 2) * gap, 0, 3.5);
    m.group.rotation.y = Math.PI; // facing the cactus
    models.set(id, m);
    scene.add(m.group);
  });
  let last = state;
  let bloomScale = 0;

  return {
    scene,
    camera,
    update(s: QuickDrawState, _p, t, dt) {
      last = s;
      const bloom = s.phase === 'bloom' || (s.phase === 'reveal' && s.ids.some((id) => (s.reaction[id] ?? 0) > 0));
      bloomScale += ((bloom ? 1 : 0) - bloomScale) * Math.min(1, dt * 14);
      flower.scale.setScalar(Math.max(0.001, bloomScale * (1 + Math.sin(t * 12) * 0.05)));
      flower.rotation.z = t * 0.8;
      for (const id of s.ids) {
        const m = models.get(id)!;
        const r = s.reaction[id];
        const drew = r !== null && r > 0 && s.phase !== 'wait';
        // turn toward the camera to celebrate once you've drawn
        m.group.rotation.y += ((drew ? 0 : Math.PI) - m.group.rotation.y) * Math.min(1, dt * 10);
        m.update(dt, { stunned: r === -1, happy: drew && r! < 1500, t });
      }
    },
    tags(): Tag[] {
      return last.ids.map((id) => {
        const p = players.find((q) => q.id === id);
        const m = models.get(id)!;
        const r = last.reaction[id];
        let sub: string | undefined;
        let subColor = '#ffffff';
        if (r === -1) {
          sub = 'Too early!';
          subColor = '#ff5a5f';
        } else if (r !== null && last.phase !== 'wait') {
          sub = r >= 1500 ? 'Asleep…' : `${r} ms`;
          subColor = '#ffd23f';
        }
        return {
          pos: new THREE.Vector3(m.group.position.x, -0.25, m.group.position.z),
          text: `${p?.name ?? ''} · ${(last.totals[id] / 1000).toFixed(2)}s`,
          color: p?.color,
          sub,
          subColor,
        };
      });
    },
  };
}
