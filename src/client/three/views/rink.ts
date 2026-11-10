import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { RinkState } from '../../../shared/games/shrinkingRink';
import { ChoppyModel } from '../choppy';
import { PX, makeScene, mesh, toy, wx, wz, yaw } from '../kit';
import type { Tag, View } from '../stage';

const SCALE = 0.82; // drawn a little larger than the collision radius, cartoon style

export function rinkView(env: THREE.Texture, state: RinkState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#5ec8ff', skyBottom: '#d8f3ff', fog: ['#bfe8ff', 30, 70] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 12.5, 14.5);
  camera.lookAt(0, 0, 0.9);

  const sea = mesh(new THREE.CircleGeometry(80, 64), toy('#1273d6', 0.12), { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.5;
  scene.add(sea);
  // drifting ice floes around the edge for depth
  const floes: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.3;
    const r = 11 + (i % 4) * 2.2;
    const f = mesh(new THREE.CylinderGeometry(0.6 + (i % 3) * 0.35, 0.8 + (i % 3) * 0.35, 0.4, 7), toy('#f4fbff', 0.2), {
      receive: true,
    });
    f.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r + 0.9);
    f.rotation.y = i;
    scene.add(f);
    floes.push(f);
  }

  const cz = wz(390);
  const rim = mesh(new THREE.CylinderGeometry(1, 1, 0.7, 72), toy('#ff5466', 0.35), { receive: true });
  rim.position.set(0, -0.36, cz);
  scene.add(rim);
  const ice = mesh(new THREE.CylinderGeometry(1, 1, 0.7, 72), toy('#cdeeff', 0.1), { receive: true });
  ice.position.set(0, -0.33, cz);
  scene.add(ice);
  const ring = mesh(new THREE.RingGeometry(0.33, 0.36, 64), toy('#7fc4ef', 0.3), { cast: false, receive: true });
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, cz);
  scene.add(ring);

  const models = new Map<string, ChoppyModel>();
  for (const k of state.skaters) {
    const p = players.find((q) => q.id === k.id);
    const m = new ChoppyModel(p?.color ?? '#fff', SCALE);
    models.set(k.id, m);
    scene.add(m.group);
  }
  let last: RinkState = state;

  return {
    scene,
    camera,
    update(s: RinkState, _players, t, dt) {
      last = s;
      const r = s.rink * PX;
      ice.scale.set(r, 1, r);
      rim.scale.set(r + 0.18, 1, r + 0.18);
      ring.scale.setScalar(r);
      floes.forEach((f, i) => (f.position.y = -0.42 + Math.sin(t * 1.3 + i) * 0.06));
      for (const k of s.skaters) {
        const m = models.get(k.id);
        if (!m) continue;
        m.group.position.set(wx(k.x), 0, wz(k.y));
        m.group.rotation.y = yaw(k.face);
        if (!k.alive) {
          m.group.visible = k.fall < 1;
          m.group.position.y = -k.fall * 2.2;
          m.group.rotation.x = k.fall * 1.2;
          m.update(dt, { stunned: true });
          continue;
        }
        m.group.rotation.x = 0;
        m.update(dt, { speed: Math.hypot(k.vx, k.vy) / 360, jump: k.dashing > 0 ? 0.15 : 0 });
      }
    },
    tags(): Tag[] {
      return last.skaters
        .filter((k) => k.alive)
        .map((k) => {
          const p = players.find((q) => q.id === k.id);
          return { pos: new THREE.Vector3(wx(k.x), 2.4, wz(k.y)), text: p?.name ?? '', color: p?.color };
        });
    },
  };
}
