import * as THREE from 'three';
import { trail, trailMaterial } from '../look/fxKit';
import { makeBeam } from '../look/lightBeam';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PlayerInfo } from '../../../shared/types';
import { DX0, DX1, DY0, DY1, type DigState } from '../../../shared/games/treasureDig';
import { KX0, KX1, KY0, KY1, LANES, laneY, type CannonState } from '../../../shared/games/cannonKing';
import { COURSE, type RaftState } from '../../../shared/games/raftRowing';
import { ING_COLOR, type BurgerState, type Ingredient } from '../../../shared/games/burgerBuilder';
import { COLS, FX0, FY0, PALETTE, ROWS, TILE, type CrazeState } from '../../../shared/games/colorCraze';
import { MID, SX0, SX1, SY0, SY1, type RepairState } from '../../../shared/games/stationRepair';
import { place, texture } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toonWater, toy, wx, wz, frameRect } from '../kit';
import { sandMaterial } from '../nature';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { crew, fitProp, pool } from './crew';
import { TEAM_COLORS } from './teams';

const name = (players: PlayerInfo[], id: string) => players.find((p) => p.id === id);

/* ------------------------------------------------------------------ Treasure Dig */

export function digView(env: THREE.Texture, state: DigState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#6cc4ff', skyBottom: '#fff0c8', fog: ['#cfeaff', 45, 120], shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 16, 14.5);
  camera.lookAt(0, 0, 1.5);
  const water = toonWater('#1a8fd6', 18);
  const sea = mesh(new THREE.CircleGeometry(120, 64), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.5;
  scene.add(sea);
  const beach = mesh(new THREE.CircleGeometry(19, 48), sandMaterial('#f2d49a', 10), { cast: false, receive: true });
  beach.rotation.x = -Math.PI / 2;
  beach.scale.set(1.4, 1, 0.9);
  beach.position.set(0, 0, 1);
  scene.add(beach);
  for (const [n, x, z, s, r] of [
    ['pirate/palm-detailed-bend', -15, -6, 3.2, 0.4], ['pirate/palm-detailed-straight', 15, -5, 3.4, 2], ['pirate/palm-bend', -16, 6, 2.8, 1.2],
    ['pirate/palm-detailed-straight', 16, 7, 3, 4], ['pirate/rocks-sand-a', -14, -10, 0.9, 0], ['pirate/rocks-sand-b', 14, -10, 0.9, 1],
    ['pirate/chest', 0, -9.5, 2, 0], ['pirate/flag-pirate', 3, -9.8, 2.2, 0], ['pirate/ship-wreck', -6, -13, 2, 0.6], ['pirate/tool-shovel', -3, -9.5, 1.6, 0.3],
  ] as [string, number, number, number, number][])
    place(scene, n, x, 0, z, { s, ry: r });
  void DX0, DX1, DY0, DY1;
  const fx = new Fx(scene);
  const team = crew(scene, players, state.diggers, fx);
  const moundMat = sandMaterial('#e8c37e', 2);
  const moundGeo = new THREE.SphereGeometry(0.85, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = pool(scene, () => {
    const g = new THREE.Group();
    const m = mesh(moundGeo, moundMat, { receive: true });
    m.scale.set(1, 0.45, 1);
    g.add(m);
    const x = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.14), toy('#c0392b', 0.6), { cast: false });
    x.rotation.y = Math.PI / 4;
    x.position.y = 0.4;
    const x2 = x.clone();
    x2.rotation.y = -Math.PI / 4;
    g.add(x, x2);
    return g;
  });
  const shovels = pool(scene, () => fitProp('pirate/tool-shovel', 0.9, 'max'));
  const gems = pool(scene, () => fitProp('platformer/jewel', 0.6, 'max'));
  const flying: { kind: string; x: number; y: number; t: number }[] = [];
  let last = state;
  return {
    scene,
    camera,
    update(s: DigState, _p, t, dt) {
      last = s;
      water.update(t);
      mounds.begin();
      for (const m of s.mounds) {
        if (m.back > 0) continue;
        const o = mounds.take();
        const k = 1 - Math.min(0.75, m.dug / 12);
        o.position.set(wx(m.x), 0, wz(m.y));
        o.scale.set(1, k, 1);
      }
      for (const f of s.finds) {
        flying.push({ kind: f.kind, x: f.x, y: f.y, t: 0 });
        fx.emit(new THREE.Vector3(wx(f.x), 0.4, wz(f.y)), { tex: 'puff', color: ['#f2d49a', '#e0b870'], n: 14, speed: [1.5, 4], up: 3, life: [0.3, 0.7], size: [0.6, 0.2], gravity: 8 });
        if (f.kind === 'crab') {
          sfx.bump();
          shake(0.1);
        } else {
          sfx.gem();
          fx.sparkle(new THREE.Vector3(wx(f.x), 1.2, wz(f.y)), f.kind === 'gold' ? '#ffd23f' : '#7df3ff', 14);
        }
      }
      gems.begin();
      for (const f of flying) {
        f.t += dt;
        if (f.kind === 'crab' || f.t > 0.9) continue;
        const o = gems.take();
        o.position.set(wx(f.x), 0.5 + Math.sin(f.t * 3.4) * 2.4, wz(f.y));
        o.rotation.y = f.t * 9;
        o.scale.setScalar(f.kind === 'gold' ? 1.5 : 1);
      }
      while (flying.length && flying[0].t > 1) flying.shift();
      shovels.begin();
      for (const d of s.diggers) {
        if (d.digT <= 0) continue;
        const o = shovels.take();
        o.position.set(wx(d.x) + Math.cos(d.face) * 0.5, 0.6, wz(d.y) + Math.sin(d.face) * 0.5);
        o.rotation.set(0.6 + Math.sin(t * 40) * 0.5, -d.face, 0);
      }
      fx.update(dt);
      team.update(s.diggers, dt, (r) => ({ stunned: (r as DigState['diggers'][number]).stun > 0 }));
    },
    tags() {
      return team.tags(last.diggers);
    },
  };
}

/* ------------------------------------------------------------------ Cannon King */

export function cannonView(env: THREE.Texture, state: CannonState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#73c3ff', skyBottom: '#ffeccf', fog: ['#cfe8ff', 40, 120], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  // framed to take in the captain at the cannon on the left as well as the whole deck
  frameRect(camera, KX0 - 190, KX1 + 20, KY0 - 30, KY1 + 30, 0.86);
  const water = toonWater('#1574c9', 20);
  const sea = mesh(new THREE.CircleGeometry(120, 64), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.6;
  scene.add(sea);
  const dw = (KX1 - KX0 + 260) * PX;
  const dd = (KY1 - KY0 + 60) * PX;
  const deck = mesh(new THREE.BoxGeometry(dw, 1.2, dd), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks_wide', dw / 2, dd / 2), color: '#d9a46a', roughness: 0.85 }), {
    receive: true,
  });
  deck.position.set(wx((KX0 + KX1) / 2 - 100), -0.6, wz((KY0 + KY1) / 2));
  scene.add(deck);
  // lane stripes painted on the deck
  const laneMats: THREE.MeshBasicMaterial[] = [];
  for (let l = 0; l < LANES; l++) {
    const m = new THREE.MeshBasicMaterial({ color: '#ff4030', transparent: true, opacity: 0, depthWrite: false });
    laneMats.push(m);
    const strip = mesh(new THREE.PlaneGeometry((KX1 - KX0 + 40) * PX, ((KY1 - KY0) / LANES - 8) * PX), m, { cast: false });
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(wx((KX0 + KX1) / 2), 0.02, wz(laneY(l)));
    scene.add(strip);
    if (l > 0) {
      const line = mesh(new THREE.BoxGeometry((KX1 - KX0) * PX, 0.04, 0.06), toy('#7a4a26', 0.8), { cast: false });
      line.position.set(wx((KX0 + KX1) / 2), 0.02, wz(KY0 + ((KY1 - KY0) / LANES) * l));
      scene.add(line);
    }
  }
  // rails along both long sides
  for (const y of [KY0 - 24, KY1 + 24]) {
    const rail = mesh(new THREE.BoxGeometry(dw, 0.12, 0.12), toy('#8a5530', 0.7));
    rail.position.set(deck.position.x, 0.75, wz(y));
    scene.add(rail);
    for (let x = KX0 - 240; x <= KX1 + 60; x += 70) {
      const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), toy('#8a5530', 0.7));
      post.position.set(wx(x), 0.37, wz(y));
      scene.add(post);
    }
  }
  place(scene, 'pirate/mast-ropes', wx(KX1 + 60), 0, wz(KY0 - 10), { s: 2.4 });
  place(scene, 'pirate/flag-pirate', wx(KX0 - 160), 0, wz(KY0), { s: 2.6 });
  place(scene, 'pirate/ship-pirate-large', 10, -1.6, -20, { s: 2.6, ry: 1.2 });
  place(scene, 'pirate/tower-complete-small', -18, -1.6, -12, { s: 2.2 });
  const cannon = fitProp('pirate/cannon', 2, 'max');
  cannon.rotation.y = Math.PI / 2;
  scene.add(cannon);
  const fx = new Fx(scene);
  const capModel = new ChoppyModel(name(players, state.captain)?.color ?? '#fff', 0.95);
  scene.add(capModel.group);
  const team = crew(scene, players, state.runners, fx);
  // cannonballs tear down the lane with a smoky streak behind them
  const streakMat = trailMaterial('#fff0d0', '#806a5a');
  const balls = pool(scene, () => {
    const g = new THREE.Group();
    const b = fitProp('pirate/cannon-ball', 0.95, 'max');
    b.name = 'ball';
    g.add(b);
    const tr = trail(streakMat, 0.38, 3.2);
    tr.rotation.z = Math.PI / 2; // +y of the trail points back up the lane (-x)
    tr.position.y = 0.45;
    g.add(tr);
    return g;
  });
  let aimY = laneY(state.aim);
  let last = state;
  return {
    scene,
    camera,
    update(s: CannonState, _p, t, dt) {
      last = s;
      water.update(t);
      aimY += (laneY(s.aim) - aimY) * Math.min(1, dt * 14);
      cannon.position.set(wx(KX0 - 70), 0, wz(aimY));
      capModel.group.position.set(wx(KX0 - 150), 0, wz(aimY));
      capModel.group.rotation.y = Math.PI / 2;
      capModel.update(dt, { speed: 0, happy: s.hits > 0 && Math.floor(t * 2) % 4 === 0 });
      laneMats.forEach((m, l) => {
        const warn = s.balls.find((b) => b.lane === l && b.warn > 0);
        m.opacity = warn ? 0.25 + (Math.sin(t * 22) * 0.5 + 0.5) * 0.35 : 0;
      });
      balls.begin();
      streakMat.userData.time.value = t;
      for (const b of s.balls) {
        if (b.warn > 0) continue;
        const o = balls.take();
        o.position.set(wx(b.x), 0.03, wz(laneY(b.lane)));
        o.getObjectByName('ball')!.rotation.z = -b.x * 0.05;
        o.getObjectByName('ball')!.position.y = 0.45;
        if (Math.random() < dt * 20) fx.emit(o.position.clone().setY(0.6), { tex: 'puff', color: ['#d8d0c8', '#b8b0a8'], n: 1, speed: [0.1, 0.4], up: 0.6, life: [0.4, 0.8], size: [0.25, 0.7], drag: 2 });
      }
      for (const l of s.booms) {
        sfx.boom();
        shake(0.1);
        const muzzle = new THREE.Vector3(wx(KX0 - 20), 0.9, wz(laneY(l)));
        // a real muzzle blast: white-hot flash lighting the deck, a fireball, then rolling smoke
        fx.flash(muzzle, '#ffc070', 60, 9);
        fx.emit(muzzle, { tex: 'soft', color: ['#fff6d0', '#ffd27a'], to: '#ff5a10', n: 6, speed: [2, 5], spread: 0.4, life: [0.12, 0.25], size: [1.2, 2.2], additive: true, drag: 6 });
        fx.emit(muzzle, { tex: 'puff', color: ['#ffffff', '#e0dcd6'], to: '#9a948e', n: 18, speed: [2, 6], up: 1, life: [0.5, 1.1], size: [0.9, 1.8], drag: 3.5, gravity: -0.8 });
      }
      for (const sp of s.splats) {
        sfx.bump();
        fx.bonk(new THREE.Vector3(wx(sp.x), 1.2, wz(sp.y)));
      }
      fx.update(dt);
      team.update(s.runners, dt, (r) => {
        const rr = r as CannonState['runners'][number];
        const out = rr.outAt >= 0;
        return { stunned: out || rr.safe > 0.6, hidden: (out && s.t - rr.outAt > 1) || (rr.safe > 0 && Math.floor(t * 14) % 2 === 0) };
      });
    },
    tags(): Tag[] {
      const p = name(players, last.captain);
      return [
        { pos: new THREE.Vector3(wx(KX0 - 150), 2.8, wz(aimY)), text: p?.name ?? '', color: p?.color, sub: 'CAPTAIN', subColor: '#ffd23f' },
        ...team.tags(last.runners, 2.35, (r) => '♥'.repeat((r as CannonState['runners'][number]).hp), (r) => (r as CannonState['runners'][number]).outAt >= 0),
      ];
    },
  };
}

/* ------------------------------------------------------------------ Raft Rowing */

const LANE_X = [-3.6, 3.6];
const D = (d: number) => -d * PX * 1.4; // course distance to world z

export function raftView(env: THREE.Texture, state: RaftState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#62b9ff', skyBottom: '#fff1d6', fog: ['#cde7ff', 30, 95], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 300);
  const water = toonWater('#1784d6', 30);
  const sea = mesh(new THREE.PlaneGeometry(60, 140), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.1, D(COURSE / 2));
  scene.add(sea);
  // harbour walls down both sides, a buoy line between the lanes, and the lighthouse at the finish
  for (let d = -200; d < COURSE + 400; d += 160) {
    place(scene, 'pirate/rocks-sand-a', -9.5, -0.3, D(d), { s: 1.1, ry: d });
    place(scene, 'pirate/rocks-sand-b', 9.5, -0.3, D(d + 80), { s: 1.1, ry: -d });
    const buoy = mesh(new THREE.SphereGeometry(0.22, 10, 8), toy((d / 160) % 2 ? '#ff5a5f' : '#ffffff', 0.4));
    buoy.position.set(0, 0.05, D(d));
    scene.add(buoy);
  }
  for (const side of [-1, 1]) {
    place(scene, 'pirate/palm-detailed-bend', side * 13, 0, D(300), { s: 3 });
    place(scene, 'pirate/structure-platform-dock', side * 11, -0.2, D(1200), { s: 2 });
    place(scene, 'pirate/palm-detailed-straight', side * 13, 0, D(2000), { s: 3.2 });
  }
  place(scene, 'pirate/tower-watch', 0, 0, D(COURSE + 180), { s: 3.6 });
  const finish = mesh(new THREE.BoxGeometry(16, 0.06, 0.4), toy('#ffd23f', 0.4), { cast: false });
  finish.position.set(0, 0.05, D(COURSE));
  scene.add(finish);
  for (const rk of state.rocks)
    for (const lx of LANE_X) place(scene, 'pirate/rocks-c', lx + rk.off * PX * 1.4, -0.25, D(rk.d), { s: (rk.r / 26) * 2.6, ry: rk.d });
  const fx = new Fx(scene);
  const boats = state.boats.map((b) => {
    const g = new THREE.Group();
    const hull = fitProp('pirate/boat-row-large', 3.4, 'max');
    hull.rotation.y = Math.PI / 2;
    g.add(hull);
    const flag = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.7), toy(TEAM_COLORS[b.team], 0.5));
    flag.position.set(0, 1.4, 1.4);
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4), toy('#6b4a2b', 0.8));
    pole.position.set(0, 0.8, 1.6);
    g.add(flag, pole);
    scene.add(g);
    return g;
  });
  const seats = new Map<string, { m: ChoppyModel; oars: THREE.Object3D[] }>();
  const perTeam = [0, 0];
  for (const r of state.rowers) {
    const k = perTeam[r.team]++;
    const m = new ChoppyModel(name(players, r.id)?.color ?? '#fff', 0.6);
    const g = boats[r.team];
    m.group.position.set(0, 0.25, 0.9 - k * 0.65);
    m.group.rotation.y = Math.PI;
    g.add(m.group);
    const oars = [-1, 1].map((side) => {
      const o = fitProp('pirate/tool-paddle', 1.6, 'max');
      o.position.set(side * 0.7, 0.5, 0.9 - k * 0.65);
      g.add(o);
      return o;
    });
    seats.set(r.id, { m, oars });
  }
  let camZ = 4;
  let last = state;
  return {
    scene,
    camera,
    update(s: RaftState, _p, t, dt) {
      last = s;
      water.update(t);
      s.boats.forEach((b, i) => {
        const g = boats[i];
        g.position.set(LANE_X[i] + b.off * PX * 1.4, Math.sin(t * 2 + i) * 0.05, D(b.d));
        g.rotation.y = -b.head;
        g.rotation.z = Math.sin(t * 1.6 + i) * 0.03;
        if (b.v > 60 && Math.random() < dt * 8) fx.splash(new THREE.Vector3(g.position.x, 0.1, g.position.z + 1.6));
      });
      for (const team of s.bonks) {
        sfx.bump();
        shake(0.08);
        fx.bonk(boats[team].position.clone().add(new THREE.Vector3(0, 1, -1.5)));
      }
      for (const r of s.rowers) {
        const st = seats.get(r.id);
        if (!st) continue;
        const k = r.pull > 0 ? Math.sin((1 - r.pull / 0.28) * Math.PI) : 0;
        st.oars.forEach((o, i) => {
          const side = i === 0 ? -1 : 1;
          const active = r.side === side ? k : 0;
          o.rotation.set(-0.9 + active * 1.2, 0, side * (1.2 - active * 0.3));
        });
        st.m.update(dt, { speed: r.pull > 0 ? 0.5 : 0 });
      }
      const lead = Math.max(s.boats[0].d, s.boats[1].d);
      const back = Math.min(s.boats[0].d, s.boats[1].d);
      const target = D((lead * 0.6 + back * 0.4)) + 9;
      camZ += (target - camZ) * Math.min(1, dt * 3);
      camera.position.set(0, 8.5, camZ - 1);
      camera.lookAt(0, 0, camZ - 9);
      fx.update(dt);
    },
    tags(): Tag[] {
      const out: Tag[] = [];
      const perTeam = [0, 0];
      for (const r of last.rowers) {
        const k = perTeam[r.team]++;
        const b = last.boats[r.team];
        const p = name(players, r.id);
        out.push({ id: r.id, pos: new THREE.Vector3(LANE_X[r.team] + b.off * PX * 1.4 + (k % 2 ? 0.6 : -0.6), 1.6 + (k >> 1) * 0.35, D(b.d) + 0.9 - k * 0.65), text: p?.name ?? '', color: TEAM_COLORS[r.team] });
      }
      return out;
    },
  };
}

/* ------------------------------------------------------------------ Burger Builder */

const ING_MODEL: Partial<Record<Ingredient, string>> = { patty: 'food/meat-patty', cheese: 'food/cheese-cut', tomato: 'food/tomato-slice', bacon: 'food/bacon', onion: 'food/onion-half', lettuce: 'food/cabbage' };

function layer(ing: Ingredient, top: boolean): THREE.Object3D {
  const g = new THREE.Group();
  if (ing === 'bun') {
    const bun = mesh(new THREE.SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toy('#e8a24a', 0.5));
    bun.scale.set(1, top ? 0.55 : 0.25, 1);
    if (!top) bun.rotation.x = Math.PI;
    bun.position.y = top ? 0 : 0.18;
    g.add(bun);
    return g;
  }
  const disc = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.14, 20), toy(ING_COLOR[ing], 0.55));
  disc.position.y = 0.07;
  if (ing === 'lettuce') disc.scale.set(1.12, 0.7, 1.12);
  g.add(disc);
  return g;
}

export function burgerView(env: THREE.Texture, state: BurgerState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#ffd9a8', skyBottom: '#fff6e8', fog: ['#ffe9cf', 30, 80], sunDir: [4, 16, 10], shadowSize: 16 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 9.5, 13);
  camera.lookAt(0, 2, 0);
  const floor = mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: texture('floor_tiles_tan_small', 12, 8), roughness: 0.8 }), { cast: false, receive: true });
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const counterMat = toy('#f4f1ea', 0.4);
  for (const side of [0, 1]) {
    const x = side === 0 ? -4.5 : 4.5;
    const c = mesh(new THREE.BoxGeometry(5.5, 1.6, 2.6), counterMat, { receive: true });
    c.position.set(x, 0.8, 0);
    scene.add(c);
    const trim = mesh(new THREE.BoxGeometry(5.6, 0.18, 2.7), toy(TEAM_COLORS[side], 0.4));
    trim.position.set(x, 1.62, 0);
    scene.add(trim);
    place(scene, 'food/plate-dinner', x, 1.62, 0, { s: 2.2 });
  }
  place(scene, 'furniture/kitchenStove', -9, 0, -4, { s: 2.6 });
  place(scene, 'furniture/kitchenFridgeLarge', 9, 0, -4, { s: 2.6 });
  for (let i = 0; i < 4; i++) place(scene, 'furniture/kitchenCabinetUpper', -6 + i * 4, 3.6, -5.5, { s: 2.6 });
  place(scene, 'food/burger', 0, 1.0, -3, { s: 3 });
  const fx = new Fx(scene);
  const stacks = [new THREE.Group(), new THREE.Group()];
  stacks.forEach((g, i) => {
    g.position.set(i === 0 ? -4.5 : 4.5, 1.75, 0);
    scene.add(g);
  });
  const shown = ['', ''];
  // cooks stand in a row behind their counter, holding up their chosen ingredient
  const cooks = new Map<string, { m: ChoppyModel; held: THREE.Group; x: number }>();
  for (const team of [0, 1]) {
    const list = state.cooks.filter((c) => c.team === team);
    list.forEach((c, k) => {
      const m = new ChoppyModel(name(players, c.id)?.color ?? '#fff', 0.75);
      const x = (team === 0 ? -4.5 : 4.5) + (k - (list.length - 1) / 2) * 1.1;
      m.group.position.set(x, 0, 2.6);
      m.group.rotation.y = Math.PI;
      scene.add(m.group);
      const held = new THREE.Group();
      held.position.set(x, 2.3, 2.7);
      scene.add(held);
      cooks.set(c.id, { m, held, x });
    });
  }
  const heldKey = new Map<string, string>();
  let last = state;
  return {
    scene,
    camera,
    update(s: BurgerState, _p, t, dt) {
      last = s;
      s.kitchens.forEach((k, i) => {
        const key = k.stack.join(',') + (k.done > 0 ? '!' : '');
        if (key !== shown[i]) {
          shown[i] = key;
          stacks[i].clear();
          let y = 0;
          k.stack.forEach((ing, j) => {
            const o = layer(ing, ing === 'bun' && j > 0);
            o.position.y = y;
            stacks[i].add(o);
            y += ing === 'bun' ? (j > 0 ? 0.4 : 0.22) : 0.16;
          });
        }
        stacks[i].rotation.z = k.wrong > 0 ? Math.sin(t * 40) * 0.08 : 0;
        stacks[i].position.y = 1.75 + (k.done > 0 ? Math.sin((1.1 - k.done) * Math.PI) * 0.6 : 0);
      });
      for (const e of s.events) {
        const x = e.team === 0 ? -4.5 : 4.5;
        if (e.kind === 'good') sfx.plate();
        if (e.kind === 'bad') {
          sfx.bump();
          fx.bonk(new THREE.Vector3(x, 2.6, 0));
        }
        if (e.kind === 'done') {
          sfx.coin();
          fx.party(new THREE.Vector3(x, 3, 0));
        }
      }
      for (const c of s.cooks) {
        const st = cooks.get(c.id);
        if (!st) continue;
        const ing = c.hand[c.sel];
        if (ing && heldKey.get(c.id) !== ing) {
          heldKey.set(c.id, ing);
          st.held.clear();
          const path = ING_MODEL[ing];
          const o = path ? fitProp(path, 0.55, 'max') : layer(ing, true);
          if (!path) o.scale.setScalar(0.5);
          st.held.add(o);
        }
        st.held.rotation.y = t * 1.5;
        st.held.position.y = 2.3 + Math.sin(t * 3 + st.x) * 0.06;
        st.m.update(dt, { stunned: c.stun > 0, happy: s.kitchens[c.team].done > 0 });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.cooks.map((c) => {
        const st = cooks.get(c.id)!;
        const p = name(players, c.id);
        const ing = c.hand[c.sel];
        return { id: c.id, pos: new THREE.Vector3(st.x, 3.05, 2.7), text: p?.name ?? '', color: TEAM_COLORS[c.team], sub: ing ? ing.toUpperCase() : '' };
      });
    },
  };
}

/* ------------------------------------------------------------------ Color Craze */

export function crazeView(env: THREE.Texture, state: CrazeState, players: PlayerInfo[]): View {
  // a game-show dance floor at night: light-up glass tiles and sweeping stage lights
  const scene = makeScene(env, { sky: 'night', skyTop: '#140a2e', skyBottom: '#3a1d5c', fog: ['#1c1036', 40, 110], sunColor: '#d8c8ff', sunIntensity: 1.1, shadowSize: 18 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 16, 13.5);
  camera.lookAt(0, 0, 1.6);
  const pit = mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: texture('proto-dark', 20, 20), roughness: 0.9 }), { cast: false, receive: true });
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = -6;
  scene.add(pit);
  // light rigs on tall trusses either side, each throwing a coloured beam that sweeps the floor
  const truss = new THREE.MeshStandardMaterial({ color: '#3a3a48', metalness: 0.7, roughness: 0.35 });
  const beams = [[-15, -8, '#ff5ad1'], [15, -8, '#45e3ff'], [-15, 6, '#ffd23f'], [15, 6, '#7cff6a']].map(([x, z, c], i) => {
    const post = mesh(new THREE.CylinderGeometry(0.22, 0.28, 12, 10), truss);
    post.position.set(x as number, 0, z as number);
    scene.add(post);
    const head = mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.8, 16), truss);
    head.position.set(x as number, 6.2, z as number);
    scene.add(head);
    const b = makeBeam(c as string, 15, 0.12, { strength: 0.32 });
    scene.add(b.group);
    return { b, at: new THREE.Vector3(x as number, 6.2, z as number), ph: i * 1.7 };
  });
  const mats = PALETTE.map((c) => toy(c, 0.35));
  const geo = new RoundedBoxGeometry(TILE * PX - 0.1, 0.4, TILE * PX - 0.1, 2, 0.06);
  const tiles: THREE.Mesh[] = [];
  // each tile is its own frosted glass panel lit from below in its colour
  const tileMats = Array.from({ length: COLS * ROWS }, () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
  void mats;
  for (let i = 0; i < COLS * ROWS; i++) {
    const m = mesh(geo, tileMats[i], { cast: false, receive: true });
    m.position.set(wx(FX0 + ((i % COLS) + 0.5) * TILE), -0.2, wz(FY0 + (Math.floor(i / COLS) + 0.5) * TILE));
    scene.add(m);
    tiles.push(m);
  }
  const fx = new Fx(scene);
  const team = crew(scene, players, state.hoppers, fx);
  let lastPhase = state.phase;
  let last = state;
  return {
    scene,
    camera,
    update(s: CrazeState, _p, t, dt) {
      last = s;
      beams.forEach((L, k) => {
        const tx = Math.sin(t * 0.7 + L.ph) * 7, tz = Math.cos(t * 0.53 + L.ph * 1.3) * 4;
        L.b.aim(L.at, new THREE.Vector3(tx - L.at.x, -L.at.y, tz - L.at.z), 1);
        L.b.update(t + k, dt);
      });
      tiles.forEach((m, i) => {
        const wrong = s.call >= 0 && s.tiles[i] !== s.call;
        const mat = tileMats[i];
        const col = PALETTE[s.tiles[i]];
        mat.color.set(col);
        mat.emissive.set(col);
        // idle: a slow chase ripples across the floor; called: the right colour blazes, the rest go dim
        const col_i = i % COLS, row_i = Math.floor(i / COLS);
        const chase = 0.45 + 0.25 * Math.sin(t * 3 - (col_i + row_i) * 0.6);
        mat.emissiveIntensity = s.call < 0 ? chase : wrong ? 0.08 + (s.phase === 'call' && s.callTime - s.phaseT < 0.7 ? 0.25 * Math.max(0, Math.sin(t * 30)) : 0) : 1.1 + 0.3 * Math.sin(t * 8);
        let y = -0.2;
        if (s.phase === 'drop' && wrong) y = -0.2 - Math.min(8, s.phaseT * s.phaseT * 30);
        else if (s.phase === 'call' && wrong && s.callTime - s.phaseT < 0.7) y = -0.2 + Math.sin(t * 50 + i) * 0.04;
        else if (s.phase === 'rest' && lastPhase === 'drop') y = -6;
        m.position.y = s.phase === 'rest' ? -0.2 - Math.max(0, 1 - s.phaseT * 2) * 6 : y;
        m.visible = m.position.y > -7;
      });
      if (s.phase !== lastPhase) {
        if (s.phase === 'call') sfx.bell();
        if (s.phase === 'drop') {
          sfx.boom();
          shake(0.08);
        }
        lastPhase = s.phase;
      }
      fx.update(dt);
      team.update(s.hoppers, dt, (r) => ({ stunned: (r as CrazeState['hoppers'][number]).fallAt >= 0 }));
      for (const h of s.hoppers) {
        const m = team.models.get(h.id);
        if (m && h.fallAt >= 0) m.group.position.y = -h.fz;
      }
    },
    tags() {
      return team.tags(last.hoppers, 2.35, undefined, (r) => (r as CrazeState['hoppers'][number]).fallAt >= 0);
    },
  };
}

/* ------------------------------------------------------------------ Station Repair */

export function repairView(env: THREE.Texture, state: RepairState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'space-nebula', skyTop: '#0b0e2a', skyBottom: '#2b2060', fog: ['#151838', 40, 110], sunColor: '#cfd8ff', sunIntensity: 1.8, shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 17, 14.5);
  camera.lookAt(0, 0, 1.6);
  const fw = (SX1 - SX0) * PX;
  const fd = (SY1 - SY0) * PX;
  const floor = mesh(new THREE.BoxGeometry(fw + 1, 0.4, fd + 1), new THREE.MeshStandardMaterial({ map: texture('floor_tiles_blue_small', fw / 2, fd / 2), color: '#c8d4ff', roughness: 0.6 }), { receive: true });
  floor.position.set(wx((SX0 + SX1) / 2), -0.2, wz((SY0 + SY1) / 2));
  scene.add(floor);
  const wall = mesh(new THREE.BoxGeometry(0.3, 1.4, fd), toy('#9aa6d6', 0.4));
  wall.position.set(wx(MID), 0.7, wz((SY0 + SY1) / 2));
  scene.add(wall);
  for (let x = SX0; x <= SX1; x += 140) place(scene, 'station/wall-window', wx(x), 0, wz(SY0) - 0.6, { s: 2.2 });
  for (const side of [0, 1]) {
    const tint = mesh(new THREE.PlaneGeometry(fw / 2 - 0.4, fd), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[side], transparent: true, opacity: 0.12, depthWrite: false }), { cast: false });
    tint.rotation.x = -Math.PI / 2;
    tint.position.set(side === 0 ? wx((SX0 + MID) / 2) : wx((MID + SX1) / 2), 0.02, wz((SY0 + SY1) / 2));
    scene.add(tint);
    place(scene, 'station/container-tall', side === 0 ? wx(SX0) - 1 : wx(SX1) + 1, 0, wz(SY1) - 1, { s: 2 });
    place(scene, 'station/pipe', side === 0 ? wx(SX0) - 1 : wx(SX1) + 1, 0, wz(SY0) + 2, { s: 2 });
  }
  place(scene, 'station/table-display-planet', 0, 0, wz(SY1) + 1.2, { s: 2.2 });
  const fx = new Fx(scene);
  const consoles = state.consoles.map((c) => {
    const g = new THREE.Group();
    const o = fitProp('station/computer-wide', 1.6);
    g.add(o);
    const light = mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#33ff77', emissive: '#33ff77', emissiveIntensity: 1.2 }));
    light.position.y = 1.7;
    g.add(light);
    g.position.set(wx(c.x), 0, wz(c.y) - 0.5);
    scene.add(g);
    return { g, light };
  });
  const team = crew(scene, players, state.techs, fx);
  let last = state;
  return {
    scene,
    camera,
    update(s: RepairState, _p, t, dt) {
      last = s;
      s.consoles.forEach((c, i) => {
        const broken = c.code.length > 0;
        const m = consoles[i].light.material as THREE.MeshStandardMaterial;
        m.color.set(broken ? '#ff3b30' : '#33ff77');
        m.emissive.set(broken ? '#ff3b30' : '#33ff77');
        m.emissiveIntensity = broken ? 1 + Math.sin(t * 14) * 0.8 : 1;
        consoles[i].g.rotation.z = broken ? Math.sin(t * 30 + i) * 0.02 : 0;
        if (broken && Math.random() < dt * 4) fx.sparkle(new THREE.Vector3(wx(c.x), 1.2, wz(c.y) - 0.4), '#ffd23f', 4);
      });
      for (const i of s.sparks) {
        sfx.bump();
        fx.emit(new THREE.Vector3(wx(s.consoles[i].x), 1.2, wz(s.consoles[i].y)), { tex: 'star', color: ['#ffd23f', '#ff9f1c'], n: 14, speed: [2, 5], up: 2, life: [0.2, 0.5], size: [0.35, 0.05], gravity: 10 });
      }
      for (const i of s.wins) {
        sfx.gem();
        fx.sparkle(new THREE.Vector3(wx(s.consoles[i].x), 1.6, wz(s.consoles[i].y)), '#33ff77', 16);
      }
      fx.update(dt);
      team.update(s.techs, dt, (r) => ({ stunned: (r as RepairState['techs'][number]).oops > 0 }));
    },
    tags(): Tag[] {
      const out: Tag[] = team.tags(last.techs).map((tg, i) => ({ ...tg, color: TEAM_COLORS[last.techs[i].team] }));
      // the code over each broken console, with the buttons already done ticked off
      last.consoles.forEach((c) => {
        if (!c.code.length) return;
        const code = c.code.map((b, i) => (i < c.at ? '✓' : b === 0 ? 'A' : 'B')).join(' ');
        out.push({ pos: new THREE.Vector3(wx(c.x), 2.6, wz(c.y) - 0.5), text: code, color: '#ff3b30', sub: 'FIX ME' });
      });
      return out;
    },
  };
}
