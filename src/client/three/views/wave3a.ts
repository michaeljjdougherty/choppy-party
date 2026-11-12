import * as THREE from 'three';
import { glowSprite } from '../look/fxKit';
import { marbleMaterial, rugTexture } from '../look/marble';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sfx } from '../../sfx';
import type { PlayerInfo } from '../../../shared/types';
import { HX0, HX1, HY0, HY1, type PotatoState } from '../../../shared/games/hotPotato';
import { ISLAND, KX0, KX1, KY0, KY1, SNACKS, type KitchenState } from '../../../shared/games/kitchenRaid';
import { place, texture } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toonWater, toy, wx, wz } from '../kit';
import type { View } from '../stage';
import { crew, fitProp, pool } from './crew';

/** Hot Potato Bomb: a pirate ship's deck on open water, with the bomb fizzing over the holder's head. */
export function hotPotatoView(env: THREE.Texture, state: PotatoState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#3ba7ff', skyBottom: '#c9f0ff', fog: ['#c9f0ff', 40, 110], shadowSize: 18 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  camera.position.set(0, 16, 15.5);
  camera.lookAt(0, 0, 1.6);
  const water = toonWater('#1e9be8', 50);
  const sea = mesh(new THREE.CircleGeometry(160, 48), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.6;
  scene.add(sea);

  const w = (HX1 - HX0) * PX;
  const d = (HY1 - HY0) * PX;
  const cx = wx((HX0 + HX1) / 2);
  const cz = wz((HY0 + HY1) / 2);
  // the hull: a long rounded box with a plank deck on top
  const hull = mesh(new THREE.CylinderGeometry(1, 1, 1, 48), toy('#7a4a2a', 0.7), { receive: true });
  hull.scale.set(w * 0.62, 1.6, d * 0.66);
  hull.position.set(cx, -0.85, cz);
  scene.add(hull);
  const deck = mesh(new THREE.BoxGeometry(w + 0.6, 0.2, d + 0.6), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', w / 2, d / 2), color: '#e9c79a', roughness: 0.8 }), {
    cast: false,
    receive: true,
  });
  deck.position.set(cx, -0.1, cz);
  scene.add(deck);
  const rail = toy('#5a3218', 0.6);
  for (const [x, z, sx, sz] of [[cx, cz - d / 2 - 0.3, w + 0.8, 0.2], [cx, cz + d / 2 + 0.3, w + 0.8, 0.2], [cx - w / 2 - 0.3, cz, 0.2, d + 0.8], [cx + w / 2 + 0.3, cz, 0.2, d + 0.8]] as number[][]) {
    const r = mesh(new THREE.BoxGeometry(sx, 0.6, sz), rail);
    r.position.set(x, 0.3, z);
    scene.add(r);
  }
  // masts and dressing beyond the rails
  for (const x of [-8, 8]) {
    const mast = mesh(new THREE.CylinderGeometry(0.25, 0.3, 12, 12), toy('#6b3f20', 0.6));
    mast.position.set(cx + x * 0.9, 6, cz - d / 2 - 1.2);
    scene.add(mast);
    const sail = mesh(new THREE.PlaneGeometry(5, 4.5, 8, 4), new THREE.MeshStandardMaterial({ color: '#fff6e0', side: THREE.DoubleSide, roughness: 0.9 }));
    sail.position.set(cx + x * 0.9, 7.5, cz - d / 2 - 1.1);
    scene.add(sail);
  }
  place(scene, 'pirate/flag-pirate', cx, 0, cz - d / 2 - 1.4, { s: 2 });
  for (const [x, z, n] of [[-1, -1, 'pirate/cannon'], [1, -1, 'pirate/cannon'], [-1, 1, 'pirate/barrel'], [1, 1, 'pirate/crate']] as [number, number, string][]) {
    place(scene, n, cx + x * (w / 2 + 1.2), 0, cz + z * (d / 2 + 0.2), { s: 2, ry: x > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  place(scene, 'pirate/ship-pirate-medium', -26, -1.6, -24, { s: 1.4, ry: 0.8 });
  place(scene, 'pirate/rocks-a', 22, -1.6, -14, { s: 1.6 });

  const fx = new Fx(scene);
  const team = crew(scene, players, state.sailors, fx);
  const bomb = fitProp('platformer/bomb', 1.55, 'y');
  scene.add(bomb);
  const glow = new THREE.PointLight('#ff7a2a', 0, 6, 2);
  scene.add(glow);
  // the lit fuse: a hot spitting glow at its tip, and a red heat that creeps over the bomb
  const fuseGlow = glowSprite('#ffb040', 1, 1);
  scene.add(fuseGlow);
  const heat = glowSprite('#ff2a10', 2.6, 0);
  scene.add(heat);
  let last = state;
  let sparkT = 0;
  let tickT = 0;
  return {
    scene,
    camera,
    update(s: PotatoState, _p, t, dt) {
      if (!s.holder) tickT = 0;
      last = s;
      water.update(t);
      const h = s.sailors.find((a) => a.id === s.holder);
      bomb.visible = !!h;
      if (h) {
        // the closer to boom, the faster it throbs and sparks
        const urgency = 1 - Math.max(0, s.fuse) / s.fuseMax;
        const throb = 1 + Math.sin(t * (6 + urgency * 30)) * 0.12 * (0.4 + urgency);
        bomb.position.set(wx(h.x), 2.6 + h.z * PX + Math.sin(t * 8) * 0.08, wz(h.y));
        bomb.scale.setScalar((bomb.userData.s ??= bomb.scale.x) * throb);
        bomb.rotation.z = Math.sin(t * 12) * 0.2 * urgency;
        glow.position.copy(bomb.position);
        glow.intensity = 4 + urgency * 14;
        fuseGlow.visible = heat.visible = true;
        fuseGlow.position.copy(bomb.position).add(new THREE.Vector3(0, 0.75, 0));
        fuseGlow.scale.setScalar(0.8 + Math.random() * 0.5 + urgency * 0.4);
        heat.position.copy(bomb.position);
        heat.material.opacity = urgency * urgency * (0.55 + Math.sin(t * (6 + urgency * 30)) * 0.3);
        // tick... tick... ticktickticktick: the gap shrinks from a second to a blur as the fuse runs out
        tickT -= dt;
        if (tickT <= 0) {
          tickT = Math.max(0.07, 0.9 * Math.pow(1 - urgency, 1.6));
          sfx.tick(urgency);
        }
        sparkT -= dt;
        if (sparkT <= 0) {
          sparkT = 0.12 - urgency * 0.08;
          fx.emit(bomb.position.clone().add(new THREE.Vector3(0, 0.7, 0)), { tex: 'star', color: ['#ffd23f', '#ff7a2a', '#ffffff'], n: 3, speed: [1, 3], up: 2, life: [0.2, 0.4], size: [0.35, 0.05], additive: true });
        }
      } else {
        glow.intensity = 0;
        fuseGlow.visible = heat.visible = false;
      }
      for (const p of s.passes) {
        const to = s.sailors.find((a) => a.id === p.to);
        if (to) fx.sparkle(new THREE.Vector3(wx(to.x), 2.4, wz(to.y)), '#ffd23f', 12);
      }
      for (const b of s.booms) {
        fx.blast(new THREE.Vector3(wx(b.x), 0.8, wz(b.y)), 3);
        shake(0.5);
      }
      fx.update(dt);
      team.update(s.sailors, dt, (r) => {
        const a = r as PotatoState['sailors'][number];
        const out = a.outAt >= 0;
        return { stunned: out || (a.daze ?? 0) > 0, hidden: out && s.t - a.outAt > 1.3, happy: a.id !== s.holder && !!s.holder };
      });
    },
    tags() {
      return team.tags(last.sailors, 2.35, (r) => (r.id === last.holder ? 'BOMB!' : undefined), (r) => (r as PotatoState['sailors'][number]).outAt >= 0);
    },
  };
}

/** Kitchen Raid: a cosy kitchen with the snack-laden island in the middle and a plate per raider. */
export function kitchenView(env: THREE.Texture, state: KitchenState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#ffe2b8', skyBottom: '#ffd0a0', sunDir: [6, 18, 10], sunIntensity: 1.8, shadowSize: 18 });
  scene.background = new THREE.Color('#5a3a2a');
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 17, 14.5);
  camera.lookAt(0, 0, 1.4);
  const w = (KX1 - KX0) * PX;
  const d = (KY1 - KY0) * PX;
  const cx = wx((KX0 + KX1) / 2);
  const cz = wz((KY0 + KY1) / 2);
  const floor = mesh(new THREE.PlaneGeometry(w + 2, d + 2), new THREE.MeshStandardMaterial({ map: texture('floor_tiles_tan_small', w / 2, d / 2), color: '#fff2dc', roughness: 0.6 }), {
    cast: false,
    receive: true,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
  const wallMat = toy('#f4c88a', 0.9);
  const back = mesh(new THREE.BoxGeometry(w + 2, 5, 0.4), wallMat);
  back.position.set(cx, 2.5, cz - d / 2 - 1.2);
  scene.add(back);
  // counters along the back wall
  const row = ['furniture/kitchenFridgeLarge', 'furniture/kitchenCabinet', 'furniture/kitchenStove', 'furniture/kitchenSink', 'furniture/kitchenCabinet', 'furniture/kitchenCoffeeMachine', 'furniture/kitchenCabinet', 'furniture/kitchenFridge'];
  row.forEach((n, i) => place(scene, n, cx - w / 2 + 1 + (i * (w - 2)) / (row.length - 1), 0, cz - d / 2 - 0.6, { s: 2.6 }));
  // the island
  const iw = ISLAND.w * PX;
  const ih = ISLAND.h * PX;
  const island = mesh(new RoundedBoxGeometry(iw, 1.1, ih, 2, 0.06), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', iw / 2, 1), color: '#9a6a44', roughness: 0.7 }), { receive: true });
  island.position.set(wx(ISLAND.x), 0.55, wz(ISLAND.y));
  scene.add(island);
  const top = mesh(new RoundedBoxGeometry(iw + 0.3, 0.14, ih + 0.3, 2, 0.05), marbleMaterial(), { receive: true });
  top.position.set(wx(ISLAND.x), 1.17, wz(ISLAND.y));
  scene.add(top);
  const plateMat = toy('#ffffff', 0.3);
  const fx = new Fx(scene);
  const team = crew(scene, players, state.cooks, fx);
  // a plate and a little rug for every raider, in their colour
  for (const c of state.cooks) {
    if (c.chef) continue;
    const col = players.find((p) => p.id === c.id)?.color ?? '#fff';
    const rug = mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshStandardMaterial({ map: rugTexture(col), roughness: 0.95 }), { cast: false, receive: true });
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(wx(c.plateX), 0.02, wz(c.plateY));
    scene.add(rug);
    const plate = mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.1, 24), plateMat);
    plate.position.set(wx(c.plateX), 0.08, wz(c.plateY));
    scene.add(plate);
  }
  // chef's hat
  const hat = new THREE.Group();
  const band = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), toy('#ffffff', 0.4));
  const puff = mesh(new THREE.SphereGeometry(0.55, 20, 14), toy('#ffffff', 0.4));
  puff.position.y = 0.4;
  puff.scale.y = 0.8;
  hat.add(band, puff);
  scene.add(hat);
  const snackPools = SNACKS.map((n) => pool(scene, () => fitProp(n, 0.7)));
  const carryPools = SNACKS.map((n) => pool(scene, () => fitProp(n, 0.7)));
  const scores = new Map(state.cooks.map((c) => [c.id, c.score]));
  let last = state;
  return {
    scene,
    camera,
    update(s: KitchenState, _p, t, dt) {
      last = s;
      snackPools.forEach((p) => p.begin());
      carryPools.forEach((p) => p.begin());
      s.snacks.forEach((sn, i) => {
        const o = snackPools[sn.kind].take();
        o.position.set(wx(sn.x), 1.25 + Math.abs(Math.sin(t * 3 + i)) * 0.12, wz(sn.y));
        o.rotation.y = t + i;
      });
      for (const c of s.cooks) {
        if (c.carry >= 0) {
          const o = carryPools[c.carry].take();
          o.position.set(wx(c.x), 2.5 + c.z * PX, wz(c.y));
          o.rotation.y = t * 2;
        }
        if ((scores.get(c.id) ?? 0) < c.score && !c.chef) fx.sparkle(new THREE.Vector3(wx(c.plateX), 1, wz(c.plateY)), '#ffd23f', 14);
        scores.set(c.id, c.score);
        if (c.chef) {
          hat.position.set(wx(c.x), 2.05 + c.z * PX, wz(c.y));
        }
      }
      for (const p of s.pounces) {
        fx.bonk(new THREE.Vector3(wx(p.x), 1.8, wz(p.y)));
        shake(0.2);
      }
      fx.update(dt);
      team.update(s.cooks, dt, (r) => {
        const c = r as KitchenState['cooks'][number];
        return { stunned: c.stun > 0, happy: c.carry >= 0 };
      });
    },
    tags() {
      return team.tags(last.cooks, 2.35, (r) => ((r as KitchenState['cooks'][number]).chef ? 'CHEF' : undefined));
    },
  };
}
