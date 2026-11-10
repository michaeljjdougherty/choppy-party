import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { RinkState } from '../../../shared/games/shrinkingRink';
import { ChoppyModel } from '../choppy';
import { place } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz, yaw, toonWater } from '../kit';
import type { Tag, View } from '../stage';
import { sandMaterial } from '../nature';

const SCALE = 0.82; // drawn a little larger than the collision radius, cartoon style

export function rinkView(env: THREE.Texture, state: RinkState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#5ec8ff', skyBottom: '#d8f3ff', fog: ['#bfe8ff', 30, 70] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 12.5, 14.5);
  camera.lookAt(0, 0, 0.9);

  const water = toonWater('#1273d6', 22);
  const sea = mesh(new THREE.CircleGeometry(80, 64), water.material, { cast: false, receive: true });
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
  // pirate harbour around the ice floe
  const ships: THREE.Object3D[] = [];
  ships.push(place(scene, 'pirate/ship-pirate-large', -17, -1.2, -14, { s: 1.2, ry: 0.7 }));
  ships.push(place(scene, 'pirate/ship-pirate-medium', 18, -1.0, -12, { s: 1.1, ry: -0.8 }));
  ships.push(place(scene, 'pirate/ship-wreck', 15, -0.9, 9, { s: 1.0, ry: 2.2 }));
  place(scene, 'pirate/rocks-a', -14, -0.6, 4, { s: 1.3 });
  place(scene, 'pirate/rocks-b', 12.5, -0.6, -4, { s: 1.2, ry: 1 });
  place(scene, 'pirate/rocks-sand-b', -11, -0.7, -8, { s: 1.1 });
  // little sandbars poking out of the sea
  for (const [x, z, r] of [[-12.5, -6.5, 2.2], [14, 3.5, 1.8], [-16, 7, 1.5]] as [number, number, number][]) {
    const bar = mesh(new THREE.CylinderGeometry(r, r * 1.35, 0.5, 28), sandMaterial('#f1cf9c', r), { cast: false, receive: true });
    bar.position.set(x, -0.42, z);
    bar.scale.z = 0.7;
    scene.add(bar);
  }
  const floaters: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    floaters.push(place(scene, i % 2 ? 'pirate/barrel' : 'pirate/crate', Math.cos(a) * 10.5, -0.25, Math.sin(a) * 8.5, { s: 0.9, ry: i }));
  }
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
  const fx = new Fx(scene);
  const prev = new Map<string, { z: number; vz: number; alive: boolean; dashing: boolean; vx: number; vy: number }>();

  return {
    scene,
    camera,
    update(s: RinkState, _players, t, dt) {
      water.update(t);
      ships.forEach((o, i) => {
        o.position.y = -1.1 + Math.sin(t * 0.9 + i * 2) * 0.15;
        o.rotation.z = Math.sin(t * 0.7 + i) * 0.04;
      });
      floaters.forEach((o, i) => {
        o.position.y = -0.3 + Math.sin(t * 1.6 + i * 1.3) * 0.12;
        o.rotation.x = Math.sin(t * 1.1 + i) * 0.15;
      });
      last = s;
      const r = s.rink * PX;
      ice.scale.set(r, 1, r);
      rim.scale.set(r + 0.18, 1, r + 0.18);
      ring.scale.setScalar(r);
      floes.forEach((f, i) => (f.position.y = -0.42 + Math.sin(t * 1.3 + i) * 0.06));
      for (const k of s.skaters) {
        const pk = prev.get(k.id);
        const at = new THREE.Vector3(wx(k.x), 0.4, wz(k.y));
        if (pk) {
          // knocked up into the air by a bump: impact stars and a little shake
          if (k.alive && k.vz > 150 && pk.vz <= 150 && !(k.dashing > 0 && !pk.dashing)) {
            fx.bonk(at.clone().setY(1.4));
            shake(Math.min(0.4, k.vz / 1400));
          }
          if (pk.z > 4 && k.z <= 0.01 && k.alive) fx.dust(at, 0.9);
          if (k.dashing > 0 && !pk.dashing) fx.dust(at, 0.6);
          if (pk.alive && !k.alive) {
            fx.splash(at.clone().setY(-0.2));
            shake(0.25);
          }
        }
        prev.set(k.id, { z: k.z, vz: k.vz, alive: k.alive, dashing: k.dashing > 0, vx: k.vx, vy: k.vy });
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
        m.update(dt, { speed: Math.hypot(k.vx, k.vy) / 360, jump: (k.z * PX) / SCALE });
      }
      fx.update(dt);
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
