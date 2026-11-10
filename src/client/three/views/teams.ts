import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { LINE, type RopeState } from '../../../shared/games/ropePull';
import { BASE_W, CX0, CX1, CY0, CY1, type CrateGrabState } from '../../../shared/games/crateGrab';
import { ChoppyModel } from '../choppy';
import { place, texture } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz } from '../kit';
import type { Tag, View } from '../stage';
import { crew, fitProp, pool } from './crew';

export const TEAM_COLORS = ['#ff5a5f', '#3fa9f5'];

/** Rope Pull: two teams heave on a rope over a muddy pit in a forest clearing. */
export function ropeView(env: THREE.Texture, state: RopeState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#e6f7ff', fog: ['#d6f0ff', 30, 90], shadowSize: 16 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  camera.position.set(0, 9, 14);
  camera.lookAt(0, 0.6, 0);
  const grass = mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', 40, 40), color: '#cfe8b8', roughness: 0.95 }), { cast: false, receive: true });
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);
  const mud = mesh(new THREE.CircleGeometry(2.4, 32), toy('#5b3a22', 0.95), { cast: false, receive: true });
  mud.rotation.x = -Math.PI / 2;
  mud.scale.set(1, 1.6, 1);
  mud.position.y = 0.02;
  scene.add(mud);
  // team lines
  for (const side of [-1, 1]) {
    const line = mesh(new THREE.BoxGeometry(0.2, 0.03, 4), toy(TEAM_COLORS[side < 0 ? 0 : 1], 0.5), { cast: false });
    line.position.set(side * LINE * PX, 0.02, 0);
    scene.add(line);
  }
  for (let i = 0; i < 10; i++) place(scene, i % 2 ? 'forest/tree' : 'forest/tree-high', -16 + i * 3.6, 0, -8 - (i % 3) * 2, { s: 2.6, ry: i });
  place(scene, 'forest/tent', -11, 0, -3.5, { s: 2.2, ry: 0.6 });
  place(scene, 'forest/flag', 11, 0, -3.5, { s: 2.2 });
  const rope = mesh(new THREE.CylinderGeometry(0.07, 0.07, 26, 8), toy('#d8b67a', 0.8));
  rope.rotation.z = Math.PI / 2;
  rope.position.y = 0.9;
  scene.add(rope);
  const flag = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), toy('#ffffff', 0.4));
  pole.position.y = 0.5;
  const cloth = mesh(new THREE.BoxGeometry(0.5, 0.32, 0.03), toy('#ffd23f', 0.4));
  cloth.position.set(0.25, 0.85, 0);
  flag.add(pole, cloth);
  scene.add(flag);
  const fx = new Fx(scene);
  // line each team up along the rope, closest first
  const slots: Record<string, number> = {};
  const count = [0, 0];
  for (const id of state.ids) slots[id] = count[state.teams[id]]++;
  const models = state.ids.map((id) => {
    const p = players.find((q) => q.id === id);
    const m = new ChoppyModel(p?.color ?? '#fff', 0.7);
    scene.add(m.group);
    return m;
  });
  const prevTaps: Record<string, number> = { ...state.taps };
  let last = state;
  let flagX = 0;
  let last2 = false;
  const xOf = (s: RopeState, id: string) => {
    const team = s.teams[id];
    const dir = team === 0 ? -1 : 1;
    return flagX + dir * (2.8 + slots[id] * 1.1);
  };
  return {
    scene,
    camera,
    update(s: RopeState, _p, t, dt) {
      last = s;
      flagX += (s.flag * PX - flagX) * Math.min(1, dt * 12);
      rope.position.x = flagX;
      flag.position.set(flagX, 0.9, 0);
      cloth.rotation.y = Math.sin(t * 6) * 0.3;
      s.ids.forEach((id, i) => {
        const team = s.teams[id];
        const m = models[i];
        const tapped = s.taps[id] > (prevTaps[id] ?? 0);
        prevTaps[id] = s.taps[id];
        if (tapped) m.squash(2);
        if (tapped && Math.random() < 0.25) fx.dust(new THREE.Vector3(xOf(s, id), 0.1, 0.3), 0.3);
        m.group.position.set(xOf(s, id), 0, 0.35);
        m.group.rotation.y = team === 0 ? Math.PI / 2 : -Math.PI / 2;
        // lean back to pull
        m.group.rotation.z = (team === 0 ? 1 : -1) * 0.18;
        const won = s.winner === team;
        const lost = s.winner >= 0 && s.winner < 2 && !won;
        m.update(dt, { speed: tapped ? 0.5 : 0, happy: won, stunned: lost, t });
      });
      if (s.winner >= 0 && s.winner < 2 && !last2) {
        fx.splash(new THREE.Vector3(0, 0.1, 0));
        shake(0.3);
        last2 = true;
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.ids.map((id) => {
        const p = players.find((q) => q.id === id);
        return { pos: new THREE.Vector3(xOf(last, id), 2, 0.35), text: p?.name ?? '', color: TEAM_COLORS[last.teams[id]] };
      });
    },
  };
}
/** Crate Grab: a dockside yard with a base for each team; crates parachute into the middle. */
export function crateView(env: THREE.Texture, state: CrateGrabState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#ffe9c4', fog: ['#f2dcb4', 40, 100], shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 16, 14);
  camera.lookAt(0, 0, 1.4);
  const fw = (CX1 - CX0) * PX;
  const fd = (CY1 - CY0) * PX;
  const cz = wz((CY0 + CY1) / 2);
  const outer = mesh(new THREE.CircleGeometry(80, 48), toy('#d9b27a', 0.95), { cast: false, receive: true });
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  const yard = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks_wide', fw / 2, fd / 2), color: '#ffe6c8', roughness: 0.85 }), { cast: false, receive: true });
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0, cz);
  scene.add(yard);
  for (const team of [0, 1]) {
    const bx = team === 0 ? wx(CX0 + BASE_W / 2) : wx(CX1 - BASE_W / 2);
    const pad = mesh(new THREE.PlaneGeometry(BASE_W * PX, fd), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], transparent: true, opacity: 0.35, depthWrite: false }), { cast: false });
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(bx, 0.02, cz);
    scene.add(pad);
    place(scene, 'pirate/structure', bx, 0, wz(CY0) - 1.5, { s: 1.4 });
    place(scene, 'pirate/structure-roof', bx, 0, wz(CY0) - 1.5, { s: 1.4 });
    place(scene, 'pirate/flag-pennant', bx + (team ? -1.6 : 1.6), 0, wz(CY0) - 0.6, { s: 1.6 });
  }
  place(scene, 'pirate/ship-pirate-large', 0, 0, wz(CY0) - 9, { s: 2.2 });
  for (let i = 0; i < 6; i++) place(scene, i % 2 ? 'pirate/barrel' : 'pirate/crate-bottles', -8 + i * 3.2, 0, wz(CY0) - 1.2, { s: 1, ry: i });
  const fx = new Fx(scene);
  const team = crew(scene, players, state.grabbers, fx);
  const crates = pool(scene, () => fitProp('pirate/crate', 1));
  const carried = pool(scene, () => fitProp('pirate/crate', 0.8));
  const shadows = pool(scene, () => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  });
  let score = [...state.score];
  let last = state;
  return {
    scene,
    camera,
    update(s: CrateGrabState, _p, t, dt) {
      last = s;
      crates.begin();
      shadows.begin();
      carried.begin();
      for (const c of s.crates) {
        const o = crates.take();
        o.position.set(wx(c.x), c.fall * 10, wz(c.y));
        o.rotation.y = c.x;
        if (c.fall > 0) {
          const sh = shadows.take();
          sh.position.set(wx(c.x), 0.02, wz(c.y));
        }
      }
      for (const g of s.grabbers) {
        if (!g.carrying) continue;
        const o = carried.take();
        o.position.set(wx(g.x), 1.9 + g.z * PX, wz(g.y));
        o.rotation.y = g.face;
      }
      for (const k of [0, 1]) {
        if (s.score[k] > score[k]) {
          const bx = k === 0 ? wx(CX0 + BASE_W / 2) : wx(CX1 - BASE_W / 2);
          fx.sparkle(new THREE.Vector3(bx, 1.4, cz), TEAM_COLORS[k], 16);
        }
      }
      score = [...s.score];
      fx.update(dt);
      team.update(s.grabbers, dt, (r) => ({ stunned: (r as CrateGrabState['grabbers'][number]).stun > 0 }));
      void t;
    },
    tags(): Tag[] {
      return team.tags(last.grabbers).map((tg, i) => ({ ...tg, color: TEAM_COLORS[last.grabbers[i].team] }));
    },
  };
}
