import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { PancakeState } from '../../../shared/games/pancakePanic';
import { ChoppyModel } from '../choppy';
import { checkerTexture, makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';

const MAX_CAKES = 400;

export function pancakeView(env: THREE.Texture, state: PancakeState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#ffd7a8', skyBottom: '#fff3e2', sunDir: [6, 16, 12] });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);

  const cloth = checkerTexture('#e53b46', '#fff6ec', 2, 64);
  cloth.repeat.set(30, 20);
  const table = mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.8 }), {
    cast: false,
    receive: true,
  });
  table.rotation.x = -Math.PI / 2;
  scene.add(table);
  // kitchen wall
  const wall = mesh(new THREE.PlaneGeometry(80, 30), toy('#ffe2b8', 0.9), { cast: false, receive: true });
  wall.position.set(0, 15, -12);
  scene.add(wall);

  const n = state.ids.length;
  const gap = 2.3;
  const plateMat = toy('#ffffff', 0.15);
  const cakeGeo = new THREE.CylinderGeometry(0.72, 0.76, 0.16, 36);
  const cakeMat = toy('#e9a24a', 0.55);
  const butterMat = toy('#ffe680', 0.3);
  interface Col {
    x: number;
    model: ChoppyModel;
    stack: THREE.InstancedMesh;
    butter: THREE.Mesh;
    flyer: THREE.Mesh;
  }
  const cols = new Map<string, Col>();
  const tmp = new THREE.Object3D();
  state.ids.forEach((id, i) => {
    const p = players.find((q) => q.id === id);
    const x = (i - (n - 1) / 2) * gap;
    const plate = mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.1, 40), plateMat, { receive: true });
    plate.position.set(x, 0.05, 0);
    scene.add(plate);
    const stack = new THREE.InstancedMesh(cakeGeo, cakeMat, MAX_CAKES);
    stack.castShadow = true;
    stack.receiveShadow = true;
    stack.count = 0;
    scene.add(stack);
    const butter = mesh(new THREE.BoxGeometry(0.32, 0.12, 0.32), butterMat);
    scene.add(butter);
    const flyer = mesh(cakeGeo, cakeMat);
    flyer.visible = false;
    scene.add(flyer);
    const model = new ChoppyModel(p?.color ?? '#fff', 0.65);
    model.group.position.set(x, 0, 1.9);
    scene.add(model.group);
    cols.set(id, { x, model, stack, butter, flyer });
  });
  let last = state;
  let unitSmooth = 0.16;

  return {
    scene,
    camera,
    update(s: PancakeState, _p, t, dt) {
      last = s;
      const best = Math.max(1, ...s.ids.map((id) => s.stacks[id]));
      // stacks share one scale so the leader is obvious; squeeze it as stacks get tall
      const unit = Math.min(0.16, 5.5 / Math.max(30, best));
      unitSmooth += (unit - unitSmooth) * Math.min(1, dt * 4);
      const top = Math.min(best, MAX_CAKES) * unitSmooth;
      const dist = Math.max(9, n * 1.25 + 5);
      camera.position.set(0, 3.2 + top * 0.45, dist);
      camera.lookAt(0, 1.2 + top * 0.45, 0);
      for (const id of s.ids) {
        const c = cols.get(id)!;
        const h = Math.min(s.stacks[id], MAX_CAKES);
        c.stack.count = h;
        for (let k = 0; k < h; k++) {
          tmp.position.set(c.x + Math.sin(k * 1.7) * 0.05, 0.18 + k * unitSmooth, Math.cos(k * 2.3) * 0.05);
          tmp.rotation.set(0, k, 0);
          tmp.scale.set(1, Math.max(0.35, unitSmooth / 0.16), 1);
          tmp.updateMatrix();
          c.stack.setMatrixAt(k, tmp.matrix);
        }
        c.stack.instanceMatrix.needsUpdate = true;
        c.butter.position.set(c.x, 0.2 + h * unitSmooth + 0.04, 0);
        c.butter.visible = h > 0;
        const f = s.flip[id] / 0.18;
        c.flyer.visible = f > 0;
        if (f > 0) {
          c.flyer.position.set(c.x, 0.3 + h * unitSmooth + Math.sin(f * Math.PI) * 1.4, 0.6 * f);
          c.flyer.rotation.x = f * Math.PI * 2;
        }
        c.model.update(dt, { jump: f > 0 ? 0.25 * f : 0, happy: s.t > 14 && s.stacks[id] === best && best > 0, t });
      }
    },
    tags(): Tag[] {
      return last.ids.map((id) => {
        const p = players.find((q) => q.id === id);
        const c = cols.get(id)!;
        return {
          pos: new THREE.Vector3(c.x, -0.35, 1.9),
          text: p?.name ?? '',
          color: p?.color,
          sub: String(last.stacks[id]),
          subColor: '#ffffff',
        };
      });
    },
  };
}
