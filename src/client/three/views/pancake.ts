import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PlayerInfo } from '../../../shared/types';
import type { PancakeState } from '../../../shared/games/pancakePanic';
import { ChoppyModel } from '../choppy';
import { place, prop, texture } from '../assets';
import { checkerTexture, makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';

const MAX_CAKES = 400;

export function pancakeView(env: THREE.Texture, state: PancakeState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#ffd7a8', skyBottom: '#fff3e2', sunDir: [6, 16, 12], shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);

  const cloth = checkerTexture('#e53b46', '#fff6ec', 2, 64);
  cloth.repeat.set(30, 20);
  const table = mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.8 }), {
    cast: false,
    receive: true,
  });
  table.rotation.x = -Math.PI / 2;
  scene.add(table);
  // tiled kitchen wall (Kenney retro fantasy tiles)
  const tiles = texture('floor_tiles_tan_small', 40, 15);
  const wall = mesh(new THREE.PlaneGeometry(80, 30), tiles ? new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.5 }) : toy('#ffe2b8', 0.9), {
    cast: false,
    receive: true,
  });
  wall.position.set(0, 15, -12);
  scene.add(wall);

  // a full kitchen along the back wall (Kenney Furniture Kit, scaled up to toy size)
  const K = 5;
  const row = ['kitchenFridge', 'kitchenCabinet', 'kitchenStove', 'kitchenCabinet', 'kitchenSink', 'kitchenCabinet', 'kitchenStove', 'kitchenCabinet', 'kitchenCabinet', 'kitchenFridge'];
  row.forEach((name, i) => {
    const x = (i - (row.length - 1) / 2) * 0.43 * K;
    place(scene, `furniture/${name}`, x, 0, -11.9, { s: K });
    if (name === 'kitchenCabinet' && i % 2 === 1) place(scene, 'furniture/kitchenCabinetUpper', x, 3.8, -11.9, { s: K });
  });
  place(scene, 'furniture/kitchenCoffeeMachine', -6.5, 2.25, -11.6, { s: K * 0.8 });
  place(scene, 'furniture/kitchenMicrowave', 4.3, 2.25, -11.6, { s: K * 0.8 });
  place(scene, 'furniture/toaster', 8.6, 2.25, -11.4, { s: K * 0.9 });
  place(scene, 'furniture/kitchenBlender', -2.2, 2.25, -11.4, { s: K * 0.9 });
  place(scene, 'furniture/pottedPlant', 12.8, 0, -10.5, { s: K * 0.8 });
  place(scene, 'furniture/pottedPlant', -12.8, 0, -10.5, { s: K * 0.8, ry: 1 });
  // breakfast spread on the table (Kenney Food Kit)
  const F = 3.2;
  for (const [name, x, z, ry] of [
    ['food/bottle-ketchup', -9.6, -3.2, 0.3], ['food/honey', -7.8, -4.4, 0], ['food/whipped-cream', -6.2, -3.5, 1],
    ['food/mug', 6.4, -3.4, 2], ['food/cup-coffee', 8.2, -4.2, 0.5], ['food/frying-pan', 10.2, -3, 1.2],
    ['food/strawberry', -4.6, -4.6, 0], ['food/strawberry', -4.1, -4.1, 1], ['food/waffle', 4.4, -4.6, 0.3],
    ['food/croissant', 2.4, -4.8, 1.4], ['food/apple', -2.6, -4.9, 0], ['food/banana', 0.2, -5, 0.6],
    ['food/cupcake', -11.5, -4.2, 0], ['food/donut-sprinkles', 12, -4.5, 0],
  ] as [string, number, number, number][]) {
    place(scene, name, x, 0, z, { s: name === 'food/bottle-ketchup' ? 1.3 : F, ry });
  }
  const n = state.ids.length;
  const gap = Math.min(2.3, 17 / Math.max(1, n));
  const plateMat = toy('#ffffff', 0.15);
  // a pillowy pancake: rounded edge, golden-brown griddle-spotted faces and a pale crumb rim
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, -0.08)];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    prof.push(new THREE.Vector2(0.68 + Math.cos(a) * 0.08, Math.sin(a) * 0.08));
  }
  prof.push(new THREE.Vector2(0, 0.085));
  const cakeGeo = new THREE.LatheGeometry(prof, 40);
  const cakeTex = (() => {
    const W = 256, H = 128;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    // v runs bottom face -> rim -> top face
    const grd = g.createLinearGradient(0, H, 0, 0);
    grd.addColorStop(0, '#9a5418');
    grd.addColorStop(0.12, '#c27a2c');
    grd.addColorStop(0.32, '#e8b866');
    grd.addColorStop(0.5, '#f4d79a');
    grd.addColorStop(0.68, '#e8b866');
    grd.addColorStop(0.88, '#c27a2c');
    grd.addColorStop(1, '#9a5418');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // griddle mottling on both faces
    for (let i = 0; i < 260; i++) {
      const top = i % 2 === 0;
      const y = top ? Math.random() * H * 0.22 : H - Math.random() * H * 0.22;
      const x = Math.random() * W, r = 2 + Math.random() * 7;
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,15' : '235,190,110'},${0.15 + Math.random() * 0.3})`;
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const cakeMat = new THREE.MeshStandardMaterial({ map: cakeTex, roughness: 0.7 });
  cakeMat.userData.noDetail = true;
  const butterMat = new THREE.MeshPhysicalMaterial({ color: '#ffe48a', roughness: 0.25, clearcoat: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#fff4c0') });
  // glossy amber syrup pooled on top, running down the sides in drips
  const syrupMat = new THREE.MeshPhysicalMaterial({ color: '#8a3a0a', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, transmission: 0.25, thickness: 0.2 });
  const syrupGeo = (() => {
    const g = new THREE.CylinderGeometry(0.6, 0.62, 0.03, 40, 1);
    return g;
  })();
  const dripGeo = new THREE.CapsuleGeometry(0.045, 0.12, 4, 8);
  interface Col {
    x: number;
    model: ChoppyModel;
    stack: THREE.InstancedMesh;
    butter: THREE.Object3D;
    flyer: THREE.Mesh;
  }
  const cols = new Map<string, Col>();
  const tmp = new THREE.Object3D();
  state.ids.forEach((id, i) => {
    const p = players.find((q) => q.id === id);
    const x = (i - (n - 1) / 2) * gap;
    // a real dinner plate from the Food Kit (falls back to a plain disc)
    const plate = prop('food/plate', 2.2);
    if (plate.children.length) {
      plate.position.set(x, 0, 0);
      scene.add(plate);
    } else {
      const disc = mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.1, 40), plateMat, { receive: true });
      disc.position.set(x, 0.05, 0);
      scene.add(disc);
    }
    const stack = new THREE.InstancedMesh(cakeGeo, cakeMat, MAX_CAKES);
    // the stack grows every frame, so its cached bounds go stale and three.js would cull it once the
    // camera rises past the plate: draw it always
    stack.frustumCulled = false;
    stack.castShadow = true;
    stack.receiveShadow = true;
    stack.count = 0;
    scene.add(stack);
    const butter = new THREE.Group();
    const pat = mesh(new RoundedBoxGeometry(0.34, 0.13, 0.3, 3, 0.04), butterMat);
    pat.position.set(0.05, 0.08, -0.03);
    pat.rotation.y = 0.5;
    const syrup = mesh(syrupGeo, syrupMat, { cast: false });
    butter.add(syrup, pat);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const d = mesh(dripGeo, syrupMat, { cast: false });
      d.position.set(Math.cos(a) * 0.7, -0.08 - (k % 2) * 0.04, Math.sin(a) * 0.7);
      d.scale.y = 1 + (k % 3) * 0.4;
      butter.add(d);
    }
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
      const dist = Math.max(9, n * gap * 0.62 + 6.5);
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
        c.butter.position.set(c.x, 0.18 + (h - 1) * unitSmooth + 0.09 * Math.max(0.35, unitSmooth / 0.16), 0);
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
