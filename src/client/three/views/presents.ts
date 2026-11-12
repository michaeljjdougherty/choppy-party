import * as THREE from 'three';
import { snowMaterial } from '../look/snow';
import type { PlayerInfo } from '../../../shared/types';
import { DROP_TIME, GIFT_H, GIFT_W, swingX, type PileState } from '../../../shared/games/presentPileUp';
import { ChoppyModel } from '../choppy';
import { place, prop } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, yaw } from '../kit';
import type { Tag, View } from '../stage';

const W = GIFT_W * PX;
const H = GIFT_H * PX;
const GIFTS = ['holiday/present-a-cube', 'holiday/present-b-cube', 'holiday/present-a-rectangle', 'holiday/present-b-round'];

/** A holiday present squeezed into one stacking slot (W wide, H tall), sitting on y = 0. */
function gift(i: number): THREE.Object3D {
  const o = prop(GIFTS[i % GIFTS.length], 1);
  const b = new THREE.Box3().setFromObject(o);
  const d = b.getSize(new THREE.Vector3());
  const s = W / Math.max(d.x, d.z, 1e-3);
  o.scale.set(s, H / Math.max(d.y, 1e-3), s);
  o.position.y = -b.min.y * o.scale.y;
  o.rotation.y = (i * 0.7) % 0.5 - 0.25;
  const g = new THREE.Group();
  g.add(o);
  return g;
}

interface Debris {
  o: THREE.Object3D;
  v: THREE.Vector3;
  spin: number;
  life: number;
}

/** Present Pile-Up: piles of Holiday Kit presents in a snowy yard, each with its own swinging gift. */
export function presentView(env: THREE.Texture, state: PileState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'morning', skyTop: '#ffb7a0', skyBottom: '#fff0e0', fog: ['#f4ecf4', 40, 110], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);

  const snow = mesh(new THREE.CircleGeometry(90, 48), snowMaterial(30), { cast: false, receive: true });
  snow.rotation.x = -Math.PI / 2;
  scene.add(snow);
  for (let i = 0; i < 9; i++) place(scene, 'holiday/tree-decorated', -24 + i * 6 + (i % 2), 0, -13 - (i % 3) * 3, { s: 3.4 + (i % 3) * 0.6, ry: i });
  place(scene, 'holiday/snowman-hat', -18, 0, 2, { s: 2.6, ry: 0.6 });
  place(scene, 'holiday/snowman-hat', 18, 0, 1, { s: 2.4, ry: -0.7 });
  for (let i = 0; i < 12; i++) place(scene, i % 2 ? 'holiday/candy-cane-red' : 'holiday/candy-cane-green', -19 + i * 3.45, 0, -4.5, { s: 1.6, ry: i * 0.5, shadow: false });
  for (let i = 0; i < 6; i++) place(scene, 'holiday/lights-colored', -15 + i * 6, 0, -5.2, { s: 2.2 });
  for (const [x, z, n] of [[-16, 4, 0], [-15, 5.2, 1], [16, 4.5, 2], [14.8, 5.5, 3], [-21, -2, 1], [21, -1, 0]] as [number, number, number][])
    place(scene, GIFTS[n], x, 0, z, { s: 1.6, ry: x });

  // falling snow
  const FLAKES = 500;
  const flakePos = new Float32Array(FLAKES * 3);
  for (let i = 0; i < FLAKES; i++) {
    flakePos[i * 3] = (Math.random() - 0.5) * 60;
    flakePos[i * 3 + 1] = Math.random() * 30;
    flakePos[i * 3 + 2] = -14 + Math.random() * 26;
  }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(flakes);

  const fx = new Fx(scene);
  const n = state.piles.length;
  const spacing = Math.min(5, 30 / n);
  const baseX = (i: number) => (i - (n - 1) / 2) * spacing;
  const piles = state.piles.map((p, i) => {
    const pl = players.find((q) => q.id === p.id);
    const g = new THREE.Group();
    g.position.x = baseX(i);
    scene.add(g);
    // wooden sled for the pile to stand on
    const base = mesh(new THREE.BoxGeometry(W * 1.4, 0.25, W * 1.1), toy('#b5562f', 0.6), { receive: true });
    base.position.y = 0.125;
    scene.add(base);
    base.position.x = baseX(i);
    const stack = new THREE.Group();
    stack.position.y = 0.25;
    g.add(stack);
    const held = gift(i * 3 + 1);
    scene.add(held);
    const rope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), toy('#e8e0d0', 0.8), { cast: false });
    scene.add(rope);
    const choppy = new ChoppyModel(pl?.color ?? '#fff', 0.75);
    choppy.group.position.set(baseX(i), 0, 2.2);
    choppy.group.rotation.y = yaw(-Math.PI / 2) + Math.PI;
    scene.add(choppy.group);
    return { id: p.id, g, stack, held, rope, choppy, color: pl?.color, name: pl?.name ?? '', meshes: [] as THREE.Object3D[], wob: 0, wobV: 0, count: 0, tumbles: 0, happy: 0, sad: 0 };
  });
  const debris: Debris[] = [];
  let camY = 3;
  let last = state;

  return {
    scene,
    camera,
    update(s: PileState, _p, t, dt) {
      last = s;
      let tallest = 0;
      s.piles.forEach((p, i) => {
        const v = piles[i];
        // grow or shrink the stack to match the sim
        while (v.meshes.length < p.gifts.length) {
          const o = gift(v.meshes.length + i);
          v.stack.add(o);
          v.meshes.push(o);
        }
        while (v.meshes.length > p.gifts.length) v.stack.remove(v.meshes.pop()!);
        v.meshes.forEach((o, k) => o.position.set(p.gifts[k] * PX, k * H, 0));
        const top = p.gifts.length ? p.gifts[p.gifts.length - 1] * PX : 0;
        if (p.gifts.length > v.count) {
          // landed: the pile squashes and wobbles by how far off-centre it hit
          const off = p.gifts.length > 1 ? p.gifts[p.gifts.length - 1] - p.gifts[p.gifts.length - 2] : 0;
          v.wobV += off * 0.012 + (off === 0 ? 0 : Math.sign(off) * 0.3);
          v.happy = 0.5;
          fx.emit(new THREE.Vector3(baseX(i) + top, 0.25 + p.gifts.length * H, 0), { n: 8, tex: 'star', color: '#fff6c8', speed: [1.5, 3], size: [0.3, 0], life: [0.3, 0.6], up: 1 });
        }
        if (p.tumbles > v.tumbles) {
          // missed: the dropped gift and the old top one bounce away
          const dir = Math.sign(p.dropX * PX - top) || 1;
          for (let k = 0; k < 2; k++) {
            const o = gift(i + k + p.tumbles);
            o.position.set(baseX(i) + top + dir * 0.4 * k, 0.25 + (p.gifts.length + k) * H, 0);
            scene.add(o);
            debris.push({ o, v: new THREE.Vector3(dir * (3 + k * 1.5), 4 + k, (Math.random() - 0.5) * 3), spin: dir * (5 + k * 3), life: 2.2 });
          }
          v.wobV += dir * 1.2;
          v.sad = 0.8;
          shake(0.15);
        }
        v.count = p.gifts.length;
        v.tumbles = p.tumbles;
        // wobble spring
        v.wobV += -v.wob * 60 * dt - v.wobV * 5 * dt;
        v.wob += v.wobV * dt;
        v.g.rotation.z = -v.wob * 0.03;
        // the swinging gift hangs a little above the pile; when dropped it falls straight down
        const topY = 0.25 + p.gifts.length * H;
        const hang = topY + 2.4;
        let gx = swingX(p) * PX;
        let gy = hang;
        if (p.dropT >= 0) {
          gx = p.dropX * PX;
          const k = Math.min(1, p.dropT / DROP_TIME);
          gy = hang - (hang - topY) * k * k;
        }
        v.held.visible = s.t >= 2 && (p.dropT >= 0 || p.cool <= 0.05);
        v.held.position.set(baseX(i) + gx, gy, 0);
        v.held.rotation.z = p.dropT >= 0 ? 0 : -Math.cos(p.phase) * 0.25;
        v.rope.visible = p.dropT < 0 && v.held.visible;
        const ropeLen = Math.hypot(gx, 4);
        v.rope.scale.y = ropeLen;
        v.rope.rotation.z = Math.atan2(gx, 4);
        v.rope.position.set(baseX(i) + gx / 2, hang + H + 2, 0);
        tallest = Math.max(tallest, topY);
        v.happy = Math.max(0, v.happy - dt);
        v.sad = Math.max(0, v.sad - dt);
        v.choppy.update(dt, { happy: v.happy > 0, stunned: v.sad > 0 });
      });
      for (const d of debris) {
        d.v.y -= 14 * dt;
        d.o.position.addScaledVector(d.v, dt);
        if (d.o.position.y < 0) {
          d.o.position.y = 0;
          d.v.y = Math.abs(d.v.y) * 0.45;
          d.v.x *= 0.7;
        }
        d.o.rotation.z += d.spin * dt;
        d.life -= dt;
        if (d.life < 0.4) d.o.scale.setScalar(Math.max(0.01, d.life / 0.4));
      }
      for (let k = debris.length - 1; k >= 0; k--)
        if (debris[k].life <= 0) {
          scene.remove(debris[k].o);
          debris.splice(k, 1);
        }
      // snow drifts down
      const pos = flakeGeo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < FLAKES; k++) {
        let y = pos.getY(k) - dt * (1.2 + (k % 5) * 0.25);
        if (y < 0) y += 30;
        pos.setY(k, y);
        pos.setX(k, pos.getX(k) + Math.sin(t + k) * dt * 0.3);
      }
      pos.needsUpdate = true;
      fx.update(dt);
      // camera rises with the tallest pile
      camY += (Math.max(3.4, tallest - 1) - camY) * Math.min(1, dt * 2.5);
      const dist = 10 + spacing * n * 0.6 + Math.max(0, tallest - 6) * 0.8;
      camera.position.set(0, camY + 4.5, dist);
      camera.lookAt(0, camY, 0);
    },
    tags(): Tag[] {
      return last.piles.map((p, i) => ({ pos: new THREE.Vector3(baseX(i), 2.1, 2.2), text: piles[i].name, color: piles[i].color }));
    },
  };
}
