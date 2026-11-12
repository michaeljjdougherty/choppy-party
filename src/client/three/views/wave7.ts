import * as THREE from 'three';
import { flame, onTop } from '../look/fxKit';
import type { PlayerInfo } from '../../../shared/types';
import { GAP_LEN, TRACK, TURN, segAt, type CartState } from '../../../shared/games/mineCart';
import { ROW, ROWS, P_H, type TideState } from '../../../shared/games/risingTide';
import { COURSE, GATE_HALF, sledTime, type SledState } from '../../../shared/games/sledSlalom';
import { CX, CY, type SaucerState } from '../../../shared/games/bumperSaucers';
import { CHESTS, type MimicState } from '../../../shared/games/mimicChest';
import { BANDS, PACE_COLOR, bandPos, type BandState } from '../../../shared/games/barrelBands';
import { place, texture } from '../assets';
import { ChoppyModel, LOCAL } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, frameRect, makeScene, mesh, toonWater, toy, wx, wz } from '../kit';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { fitProp } from './crew';

const who = (players: PlayerInfo[], id: string) => players.find((p) => p.id === id);
const colorOf = (players: PlayerInfo[], id: string) => who(players, id)?.color ?? '#ffffff';

/** Turn a fitted prop so its long side runs along z (the way it travels), centred on the origin. */
function alongZ(o: THREE.Object3D, len: number): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Box3().setFromObject(o);
  const d = b.getSize(new THREE.Vector3());
  if (d.x > d.z) o.rotation.y = Math.PI / 2;
  const b2 = new THREE.Box3().setFromObject(o);
  const d2 = b2.getSize(new THREE.Vector3());
  o.scale.multiplyScalar(len / Math.max(1e-3, d2.z));
  const b3 = new THREE.Box3().setFromObject(o);
  const c = b3.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -b3.min.y, -c.z);
  g.add(o);
  return g;
}

function ground(scene: THREE.Scene, size: number, x: number, z: number, mat: THREE.Material): THREE.Mesh {
  const f = mesh(new THREE.PlaneGeometry(size, size), mat, { cast: false, receive: true });
  f.rotation.x = -Math.PI / 2;
  f.position.set(x, 0, z);
  scene.add(f);
  return f;
}

/* ---------------------------------------------------------------- Mine Cart Mayhem */

const LANE_W = 1.7;
const STEP = 25; // px between track samples

export function mineCartView(env: THREE.Texture, state: CartState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#ff9e5e', skyBottom: '#ffe3b8', fog: ['#f3c99a', 30, 120], sunColor: '#ffe2bd', shadowSize: 26 });
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 260);
  const n = state.lanes;
  const half = (n * LANE_W) / 2;
  // the track's centre line, walked out from the bends
  const end = TRACK + 1600;
  const pts: THREE.Vector3[] = [];
  const head: number[] = [];
  const PRE = 1200;
  let x = 0, z = PRE * PX, th = 0;
  for (let d = -PRE; d <= end; d += STEP) {
    pts.push(new THREE.Vector3(x, 0, z));
    head.push(th);
    th += segAt(state, d).c * TURN * STEP;
    x += Math.sin(th) * STEP * PX;
    z -= Math.cos(th) * STEP * PX;
  }
  const at = (d: number) => {
    const f = Math.max(0, Math.min(pts.length - 1.001, (d + PRE) / STEP));
    const i = Math.floor(f), u = f - i;
    const p = pts[i].clone().lerp(pts[i + 1], u);
    const h = head[i] + (head[i + 1] - head[i]) * u;
    return { p, h, right: new THREE.Vector3(Math.cos(h), 0, Math.sin(h)) };
  };
  // one long ribbon between two side offsets, skipping the gaps
  const ribbon = (a: number, b: number, y: number, mat: THREE.Material, uvLen = 1) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let run = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = i * STEP - PRE;
      const gap = segAt(state, d).gap || segAt(state, d - STEP * 0.5).gap;
      if (gap) {
        run = -1;
        continue;
      }
      const r = new THREE.Vector3(Math.cos(head[i]), 0, Math.sin(head[i]));
      const pa = pts[i].clone().addScaledVector(r, a), pb = pts[i].clone().addScaledVector(r, b);
      const k = pos.length / 3;
      pos.push(pa.x, y, pa.z, pb.x, y, pb.z);
      uv.push(0, (d * PX) / uvLen, 1, (d * PX) / uvLen);
      if (run >= 0) idx.push(run, run + 1, k, run + 1, k + 1, k);
      run = k;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = mesh(g, mat, { cast: false, receive: true });
    scene.add(m);
    return m;
  };
  const mid = pts[Math.floor(pts.length / 2)];
  ground(scene, 900, mid.x, mid.z, new THREE.MeshStandardMaterial({ map: texture('floor_ground_sand', 160, 160), color: '#d9a46a', roughness: 1 }));
  // gravel bed, wooden sleepers, then two steel rails per lane
  ribbon(-half - 0.5, half + 0.5, 0.02, new THREE.MeshStandardMaterial({ map: texture('floor_ground_dirt', 3, 1), color: '#8a6a4e', roughness: 1 }), 8);
  const sleeper = texture('floor_wood_planks', 1, 1);
  if (sleeper) sleeper.rotation = Math.PI / 2;
  const railMat = toy('#9aa3ad', 0.3);
  railMat.metalness = 0.6;
  for (let l = 0; l < n; l++) {
    const c = -half + (l + 0.5) * LANE_W;
    ribbon(c - 0.6, c + 0.6, 0.05, new THREE.MeshStandardMaterial({ map: sleeper, color: '#9c6b3e', roughness: 0.9 }), 1.2);
    for (const s of [-0.42, 0.42]) ribbon(c + s - 0.05, c + s + 0.05, 0.12, railMat);
  }
  // canyon walls, warning signs before every gap, and a pit under it
  const rocks = ['pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c', 'forest/rocks-high', 'pirate/rocks-sand-b'];
  for (let d = -PRE, i = 0; d < end; d += 300, i++) {
    const { p, right } = at(d);
    for (const side of [-1, 1]) {
      const off = half + 3.5 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 1.2;
      const q = p.clone().addScaledVector(right, side * off);
      place(scene, rocks[(i + (side > 0 ? 2 : 0)) % rocks.length], q.x, -0.2, q.z, { s: 1.1 + ((i * 13) % 7) * 0.18, ry: i * 1.7 });
      // tall canyon walls further out
      if (i % 2 === 0) {
        const w = p.clone().addScaledVector(right, side * (half + 12 + (i % 3) * 2));
        place(scene, 'forest/rocks-high', w.x, -0.5, w.z, { s: 4 + (i % 3), ry: i });
      }
    }
  }
  const pitMat = new THREE.MeshBasicMaterial({ color: '#1a0f0a' });
  for (const g of state.segs) {
    if (!g.gap) continue;
    const a = at(g.start + g.len / 2);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(n * LANE_W + 1.4, GAP_LEN * PX), pitMat);
    pit.rotation.set(-Math.PI / 2, 0, -a.h);
    pit.position.set(a.p.x, 0.03, a.p.z);
    scene.add(pit);
    for (const side of [-1, 1]) {
      const s = at(g.start - 260);
      const q = s.p.clone().addScaledVector(s.right, side * (half + 1));
      place(scene, 'platformer/sign', q.x, 0, q.z, { s: 1.6, ry: -s.h });
      // broken trestle posts on both lips
      for (const lip of [g.start, g.start + g.len]) {
        const e = at(lip);
        const post = mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), toy('#6b4a2b', 0.8));
        post.position.copy(e.p.clone().addScaledVector(e.right, side * (half + 0.2))).setY(-0.6);
        scene.add(post);
      }
    }
  }
  // the station at the end
  const fin = at(TRACK);
  const banner = mesh(new THREE.BoxGeometry(n * LANE_W + 2, 0.5, 0.15), toy('#ffd23f', 0.4));
  banner.position.copy(fin.p).setY(3.6);
  banner.rotation.y = -fin.h;
  scene.add(banner);
  for (const side of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8), toy('#6b4a2b', 0.8));
    post.position.copy(fin.p.clone().addScaledVector(fin.right, side * (half + 1))).setY(1.9);
    scene.add(post);
  }
  const fl = at(TRACK + 700);
  place(scene, 'train/train-locomotive-a', fl.p.x + fl.right.x * (half + 3), 0, fl.p.z + fl.right.z * (half + 3), { s: 2.2, ry: -fl.h });
  place(scene, 'pirate/structure-roof', fl.p.x - fl.right.x * (half + 3.5), 0, fl.p.z - fl.right.z * (half + 3.5), { s: 2.4, ry: -fl.h });
  const fx = new Fx(scene);
  const carts = state.carts.map((c) => {
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(alongZ(fitProp('train/train-carriage-coal', 1.6, 'max'), 1.5));
    const m = new ChoppyModel(colorOf(players, c.id), 0.55);
    m.group.position.set(0, 0.55, 0.1);
    m.group.rotation.y = Math.PI;
    body.add(m.group);
    g.add(body);
    scene.add(g);
    return { g, body, m };
  });
  const laneOff = (lane: number) => -half + (lane + 0.5) * LANE_W;
  const cartPos = (c: CartState['carts'][number]) => {
    const a = at(c.d);
    return { a, p: a.p.clone().addScaledVector(a.right, laneOff(c.lane)).setY(0.14 + c.z * PX) };
  };
  let camD = 0;
  let last = state;
  return {
    scene,
    camera,
    update(s: CartState, _p, t, dt) {
      last = s;
      s.carts.forEach((c, i) => {
        const v = carts[i];
        const { a, p } = cartPos(c);
        v.g.position.copy(p);
        v.g.rotation.y = -a.h;
        const g = segAt(s, c.d);
        const roll = c.derail > 0 ? 1.5 * (i % 2 ? 1 : -1) : Math.sign(g.c || 1) * c.tip * 0.55;
        v.body.rotation.z += (roll - v.body.rotation.z) * Math.min(1, dt * 10);
        v.body.position.y = c.derail > 0 ? 0.3 : 0;
        v.m.group.rotation.z = -c.lean * 0.35;
        v.m.update(dt, { speed: 0, stunned: c.derail > 0, happy: c.finish >= 0 });
        if (c.v > 300 && c.z <= 0 && c.derail <= 0 && Math.random() < dt * 6) fx.emit(p.clone().setY(0.2), { n: 2, color: '#ffcf6b', speed: [1, 3], size: [0.15, 0], life: [0.15, 0.3], additive: true });
      });
      for (const id of s.derails) {
        const c = s.carts.find((q) => q.id === id);
        if (!c) continue;
        const p = cartPos(c).p;
        fx.bonk(p.clone().setY(1));
        fx.dust(p, 1.4);
        sfx.bump();
        shake(0.1);
      }
      for (const id of s.hops) {
        void id;
        sfx.boing();
      }
      const ds = s.carts.map((c) => c.d).sort((a, b) => b - a);
      const target = ds[0] * 0.65 + ds[ds.length - 1] * 0.35;
      camD += (target - camD) * Math.min(1, dt * 2.5);
      const dist = 1 + n * 0.07;
      const back = at(camD - 330 * dist), ahead = at(camD + 300);
      camera.position.copy(back.p).setY(4.6 * dist);
      camera.lookAt(ahead.p.x, 0, ahead.p.z);
      fx.update(dt);
      void t;
    },
    tags(): Tag[] {
      return last.carts.map((c) => {
        const p = who(players, c.id);
        return { id: c.id, pos: cartPos(c).p.setY(2.1 + c.z * PX), text: p?.name ?? '', color: p?.color, sub: c.finish >= 0 ? `${c.finish.toFixed(1)}s` : c.derail > 0 ? 'DERAILED!' : undefined, subColor: c.derail > 0 ? '#ff5a5f' : undefined };
      });
    },
  };
}

/* ---------------------------------------------------------------- Rising Tide Tower */

export function risingTideView(env: THREE.Texture, state: TideState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#62b9ff', skyBottom: '#fff1d6', fog: ['#cde7ff', 70, 200], shadowSize: 22, sunDir: [6, 18, 14] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  const W = state.w * PX;
  const H = (ROWS + 4) * ROW * PX;
  // the tower: a stone wall behind, with brick pillars at both sides
  const wall = mesh(new THREE.PlaneGeometry(W + 2, H), new THREE.MeshStandardMaterial({ map: texture('wall_brick_stone_center', (W + 2) / 3, H / 3), color: '#c9c2b5', roughness: 1 }), { cast: false, receive: true });
  wall.position.set(0, H / 2 - 4, -1.4);
  scene.add(wall);
  for (const side of [-1, 1]) {
    const col = mesh(new THREE.BoxGeometry(1.2, H, 2.6), new THREE.MeshStandardMaterial({ map: texture('wall_brick_stone_center', 0.5, H / 3), color: '#b3aa9a', roughness: 1 }), { cast: true, receive: true });
    col.position.set(side * (W / 2 + 0.6), H / 2 - 4, -0.2);
    scene.add(col);
  }
  // islands and palms off in the distance
  for (let i = 0; i < 6; i++) {
    const sx = (i - 2.5) * 14;
    place(scene, i % 2 ? 'pirate/palm-detailed-bend' : 'pirate/palm-detailed-straight', sx, -0.5, -30 - (i % 3) * 8, { s: 4 });
    place(scene, 'pirate/rocks-sand-a', sx + 3, -1, -28 - (i % 3) * 8, { s: 3 });
  }
  place(scene, 'pirate/ship-pirate-large', 26, -1, -40, { s: 4, ry: 0.6 });
  // platforms: grass on dirt; crumbly ones are cracked sandstone, sliders are blue steel
  const ledgeMat = {
    top: toy('#5ec24a', 0.7),
    side: new THREE.MeshStandardMaterial({ map: texture('floor_ground_dirt', 1, 0.3), color: '#9a7350', roughness: 1 }),
    crumble: toy('#e0b57a', 0.9),
    move: toy('#4a8cff', 0.35),
    moveSide: toy('#2f5fb8', 0.4),
  };
  const ledges = state.ledges.map((l) => {
    const g = new THREE.Group();
    const thick = P_H * PX * 2.2;
    const side = mesh(new THREE.BoxGeometry(l.w * PX, thick, 2), l.move ? ledgeMat.moveSide : l.crumbly ? ledgeMat.crumble : ledgeMat.side, { cast: true, receive: true });
    side.position.y = -thick / 2 - 0.06;
    const top = mesh(new THREE.BoxGeometry(l.w * PX + 0.06, 0.14, 2.06), l.move ? ledgeMat.move : l.crumbly ? ledgeMat.crumble : ledgeMat.top, { cast: false, receive: true });
    top.position.y = -0.07;
    g.add(side, top);
    if (l.crumbly) {
      // cracks
      for (let k = 0; k < 3; k++) {
        const c = mesh(new THREE.BoxGeometry(0.05, thick * 0.9, 0.02), toy('#7a5530', 0.9), { cast: false });
        c.position.set(((k - 1) * l.w * PX) / 3.2, -thick / 2, 1.02);
        c.rotation.z = (k - 1) * 0.4;
        g.add(c);
      }
    }
    if (l.move) for (const sx of [-1, 1]) {
      const arrow = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), toy('#ffffff', 0.4), { cast: false });
      arrow.rotation.z = -sx * Math.PI / 2;
      arrow.position.set(sx * (l.w * PX / 2 - 0.25), -thick / 2, 1.03);
      g.add(arrow);
    }
    g.position.set(wx(l.x), l.row * ROW * PX, 0);
    scene.add(g);
    return g;
  });
  // a dock at the bottom where everyone starts
  const base = mesh(new THREE.BoxGeometry(W, 0.4, 2.4), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', W / 2, 1), color: '#b08050', roughness: 0.9 }), { receive: true });
  base.position.set(0, -0.2, 0);
  scene.add(base);
  // the sea: a block of water whose top is the tide line
  const water = toonWater('#1784d6', 20);
  const deep = new THREE.MeshStandardMaterial({ color: '#1268b8', transparent: true, opacity: 0.78, roughness: 0.2 });
  const sea = new THREE.Mesh(new THREE.BoxGeometry(200, 80, 90), [deep, deep, water.material, deep, deep, deep]);
  sea.position.set(0, -40, -30);
  scene.add(sea);
  const fx = new Fx(scene);
  const models = new Map<string, ChoppyModel>();
  for (const c of state.climbers) {
    const m = new ChoppyModel(colorOf(players, c.id), 0.75);
    models.set(c.id, m);
    scene.add(m.group);
  }
  let camY = 2;
  let camDist = 20;
  let last = state;
  return {
    scene,
    camera,
    update(s: TideState, _p, t, dt) {
      last = s;
      water.update(t);
      const wy = s.water * PX;
      sea.position.y = wy - 40;
      s.ledges.forEach((l, i) => {
        const g = ledges[i];
        g.visible = l.drop < 900;
        g.position.set(wx(l.x), l.row * ROW * PX - l.drop * PX, 0);
        // crumbly ones shake while someone stands on them
        g.rotation.z = l.crumbly && l.stood > 0 && !l.gone ? Math.sin(t * 50) * 0.03 : l.gone ? l.drop * 0.0015 : 0;
      });
      for (const c of s.climbers) {
        const m = models.get(c.id)!;
        m.group.visible = !c.out;
        m.group.position.set(wx(c.x), c.h * PX, 0.2);
        const want = c.face === 0 ? 1.15 : -1.15;
        m.group.rotation.y += (want - m.group.rotation.y) * Math.min(1, dt * 12);
        m.update(dt, { speed: c.on !== -1 ? Math.min(1, Math.abs(c.vx) / 300) : 0, jump: c.on === -1 ? 0.6 : 0, stunned: c.stun > 0, happy: s.endAt !== undefined && !c.out });
      }
      for (const id of s.splashes) {
        const c = s.climbers.find((q) => q.id === id);
        if (!c) continue;
        fx.splash(new THREE.Vector3(wx(c.x), wy, 0.4));
        sfx.lose();
        shake(0.08);
      }
      for (const id of s.shoves) {
        const c = s.climbers.find((q) => q.id === id);
        if (!c) continue;
        fx.emit(new THREE.Vector3(wx(c.x) + (c.face === 0 ? 0.8 : -0.8), c.h * PX + 0.8, 0.4), { n: 8, color: '#ffffff', speed: [2, 4], size: [0.3, 0], life: [0.2, 0.4], tex: 'puff' });
        sfx.bump();
      }
      // frame the climbers that are still dry (and the water line under them)
      const live = s.climbers.filter((c) => !c.out);
      const hs = (live.length ? live : s.climbers).map((c) => c.h * PX);
      const top = Math.max(...hs) + 2.2;
      // keep the leaders in shot; anyone far below is about to get wet anyway
      const bottom = Math.max(Math.min(...hs) - 0.6, wy - 1.2, -1.5, top - 17);
      const span = Math.max(top - bottom, 7);
      const wantY = (top + bottom) / 2;
      const wantDist = Math.max(span * 1.55, (W + 3) * 0.9);
      camY += (wantY - camY) * Math.min(1, dt * 2.5);
      camDist += (wantDist - camDist) * Math.min(1, dt * 2);
      camera.position.set(0, camY + 2, camDist);
      camera.lookAt(0, camY, 0);
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.climbers
        .filter((c) => !c.out)
        .map((c) => {
          const p = who(players, c.id);
          return { id: c.id, pos: new THREE.Vector3(wx(c.x), c.h * PX + 2.1, 0.2), text: p?.name ?? '', color: p?.color };
        });
    },
  };
}

/* ---------------------------------------------------------------- Sled Slalom */

const SZ = (y: number) => -(y - 200) * PX;

export function sledView(env: THREE.Texture, state: SledState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'morning', skyTop: '#9fc8ff', skyBottom: '#f4f8ff', fog: ['#e6eefb', 30, 95], sunColor: '#fff4e6', shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 240);
  const W = state.w * PX;
  const L = (COURSE + 1600) * PX;
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.85 });
  const slope = mesh(new THREE.PlaneGeometry(W + 60, L + 60), snow, { cast: false, receive: true });
  slope.rotation.x = -Math.PI / 2;
  slope.position.set(0, 0, -L / 2 + 10);
  scene.add(slope);
  // the run: groomed snow with blue edge lines
  const run = mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), { cast: false, receive: true });
  run.rotation.x = -Math.PI / 2;
  run.position.set(0, 0.01, -L / 2 + 10);
  scene.add(run);
  for (const side of [-1, 1]) {
    const line = mesh(new THREE.PlaneGeometry(0.15, L), toy('#4aa3ff', 0.6), { cast: false });
    line.rotation.x = -Math.PI / 2;
    line.position.set((side * W) / 2, 0.02, -L / 2 + 10);
    scene.add(line);
  }
  // the village either side: trees, cabins, lanterns and snowmen
  const trees = ['holiday/tree-snow-a', 'holiday/tree-snow-b', 'holiday/tree-decorated'];
  for (let y = 0, i = 0; y < COURSE + 1600; y += 420, i++) {
    for (const side of [-1, 1]) {
      const x = side * (W / 2 + 1.6 + ((i * 3 + (side > 0 ? 1 : 0)) % 4) * 1.1);
      const z = SZ(200 + y) - ((i * 5) % 3);
      if (i % 5 === 2) place(scene, 'holiday/present-a-cube', side * (W / 2 + 1.2), 0, z, { s: 1.4, ry: i });
      place(scene, trees[(i + (side > 0 ? 1 : 0)) % (i % 7 === 3 ? 3 : 2)], x, 0, z, { s: 2.4 + (i % 3) * 0.5 });
      if (i % 4 === 1) place(scene, 'holiday/snowman-hat', side * (W / 2 + 0.9), 0, z - 2, { s: 1.4, ry: side * 0.6 });
      if (i % 3 === 0) place(scene, 'holiday/lantern', side * (W / 2 + 0.7), 0, z + 1, { s: 1.4 });
    }
  }
  // gates: a red and a blue pole with flags
  for (const [i, g] of state.gates.entries()) {
    const color = i % 2 ? '#ff4d4d' : '#3d7bff';
    for (const s of [-1, 1]) {
      const x = wx(g.x + s * GATE_HALF);
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8), toy(color, 0.4));
      pole.position.set(x, 0.9, SZ(g.y));
      const flag = mesh(new THREE.BoxGeometry(0.7, 0.5, 0.03), toy(color, 0.5));
      flag.position.set(x - s * 0.38, 1.5, SZ(g.y));
      scene.add(pole, flag);
    }
  }
  // patches: glassy ice and lumpy drifts
  const iceMat = new THREE.MeshStandardMaterial({ color: '#a8e4ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
  for (const p of state.patches) {
    if (p.ice) {
      const m = mesh(new THREE.CircleGeometry(p.r * PX, 28), iceMat, { cast: false, receive: true });
      m.rotation.x = -Math.PI / 2;
      m.scale.set(1, 1.25, 1);
      m.position.set(wx(p.x), 0.03, SZ(p.y));
      scene.add(m);
    } else {
      for (let k = 0; k < 3; k++) {
        const o = fitProp('holiday/snow-pile', ((p.r * 2) / 3) * PX * 1.3, 'xz');
        o.position.set(wx(p.x) + (k - 1) * p.r * PX * 0.55, 0, SZ(p.y) + ((k % 2) - 0.5) * p.r * PX * 0.6);
        scene.add(o);
      }
    }
  }
  // the finish arch
  const fz = SZ(200 + COURSE);
  const arch = mesh(new THREE.BoxGeometry(W + 1, 0.6, 0.2), toy('#ff4d4d', 0.5));
  arch.position.set(0, 3.2, fz);
  scene.add(arch);
  for (const s of [-1, 1]) place(scene, 'holiday/candy-cane-red', (s * (W + 1)) / 2, 0, fz, { s: 3.4 });
  const finish = mesh(new THREE.PlaneGeometry(W, 0.5), toy('#ff4d4d', 0.6), { cast: false });
  finish.rotation.x = -Math.PI / 2;
  finish.position.set(0, 0.03, fz);
  scene.add(finish);
  const fx = new Fx(scene);
  const sleds = state.sleds.map((u) => {
    const g = new THREE.Group();
    const sled = alongZ(fitProp('holiday/sled', 1.5, 'max'), 1.5);
    g.add(sled);
    const m = new ChoppyModel(colorOf(players, u.id), 0.6);
    m.group.position.set(0, 0.35, 0.15);
    m.group.rotation.y = Math.PI;
    g.add(m.group);
    scene.add(g);
    return { g, m };
  });
  let camZ = 6;
  let camSpread = 0;
  let last = state;
  return {
    scene,
    camera,
    update(s: SledState, _p, _t, dt) {
      last = s;
      s.sleds.forEach((u, i) => {
        const v = sleds[i];
        v.g.position.set(wx(u.x), 0.02, SZ(u.y));
        const f = u.finish >= 0 || (Math.abs(u.vx) < 1 && Math.abs(u.vy) < 1) ? Math.PI / 2 : u.face;
        v.g.rotation.y = Math.atan2(-Math.cos(f), Math.sin(f));
        v.m.group.scale.y = u.tuck ? 0.82 : 1;
        v.m.group.rotation.x = u.tuck ? -0.35 : 0;
        v.m.update(dt, { speed: 0, happy: u.finish >= 0 && s.endAt !== undefined, stunned: u.missFlash > 0.8 });
        if (u.vy > 250 && Math.random() < dt * 10) fx.emit(v.g.position.clone().setY(0.1), { n: 2, color: '#ffffff', speed: [0.5, 2], size: [0.3, 0], life: [0.3, 0.6], tex: 'puff' });
      });
      for (const b of s.bonks) {
        fx.bonk(new THREE.Vector3(wx(b.x), 0.8, SZ(b.y)));
        sfx.bump();
      }
      for (const id of s.misses) {
        const u = s.sleds.find((q) => q.id === id);
        if (u) fx.emit(new THREE.Vector3(wx(u.x), 1, SZ(u.y)), { n: 10, color: '#ff5a5f', speed: [1, 3], size: [0.3, 0], life: [0.3, 0.6] });
        sfx.lose();
      }
      for (const id of s.passes) {
        const u = s.sleds.find((q) => q.id === id);
        if (u) fx.sparkle(new THREE.Vector3(wx(u.x), 1, SZ(u.y)), '#7cf3ff', 6);
      }
      const ys = s.sleds.map((u) => u.y).sort((a, b) => b - a);
      // keep the last sled in shot: anchor on them and rise up as the field spreads out
      const spread = Math.min(30, (ys[0] - ys[ys.length - 1]) * PX);
      const target = SZ(ys[ys.length - 1]);
      camZ += (target - camZ) * Math.min(1, dt * 3);
      camSpread += (spread - camSpread) * Math.min(1, dt * 2);
      const h = 7 + W * 0.18 + camSpread * 0.45;
      camera.position.set(0, h, camZ + 3 + h * 0.6);
      camera.lookAt(0, 0, camZ - 5 - camSpread * 0.55);
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.sleds.map((u) => {
        const p = who(players, u.id);
        const sub = u.finish >= 0 ? `${sledTime(u).toFixed(1)}s` : u.missFlash > 0 ? 'MISSED +2s' : undefined;
        return { id: u.id, pos: new THREE.Vector3(wx(u.x), 1.8, SZ(u.y)), text: p?.name ?? '', color: p?.color, sub, subColor: u.missFlash > 0 ? '#ff5a5f' : undefined };
      });
    },
  };
}

/* ---------------------------------------------------------------- Bumper Saucers */

export function saucerView(env: THREE.Texture, state: SaucerState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'space-nebula', skyTop: '#0b0630', skyBottom: '#2a1050', sunColor: '#e6f0ff', shadowSize: 16 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  const R0 = state.r0 * PX;
  frameRect(camera, CX - state.r0 - 40, CX + state.r0 + 40, CY - state.r0 - 30, CY + state.r0 + 30, 0.95, 0.85);
  const pivot = new THREE.Group();
  pivot.position.set(wx(CX), 0, wz(CY));
  scene.add(pivot);
  // the platform: a dark deck with a glowing rim of lights, and an engine glow underneath
  const disc = new THREE.Group();
  const deck = mesh(new THREE.CylinderGeometry(R0, R0 * 0.94, 0.5, 64), new THREE.MeshStandardMaterial({ map: texture('proto-purple', R0 / 2, R0 / 2), color: '#9aa0c8', roughness: 0.55, metalness: 0.2 }), { cast: true, receive: true });
  deck.position.y = -0.25;
  const rim = mesh(new THREE.TorusGeometry(R0, 0.12, 8, 80), new THREE.MeshStandardMaterial({ color: '#7cf3ff', emissive: '#3fd8ff', emissiveIntensity: 1.6 }), { cast: false });
  rim.rotation.x = Math.PI / 2;
  const belly = mesh(new THREE.ConeGeometry(R0 * 0.9, R0 * 0.8, 48), toy('#4b4f6b', 0.4), { cast: false });
  belly.rotation.x = Math.PI;
  belly.position.y = -0.5 - R0 * 0.4;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(R0 * 0.35, 32), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = -0.52 - R0 * 0.8;
  disc.add(deck, rim, belly, glow);
  const ring = mesh(new THREE.RingGeometry(R0 * 0.48, R0 * 0.5, 64), new THREE.MeshBasicMaterial({ color: '#b06cff', transparent: true, opacity: 0.6 }), { cast: false });
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  disc.add(ring);
  pivot.add(disc);
  // scenery: a planet, drifting rocks, a far-off station
  const planet = mesh(new THREE.SphereGeometry(14, 40, 30), new THREE.MeshStandardMaterial({ color: '#ff9a5c', roughness: 0.9 }), { cast: false });
  planet.position.set(-34, -22, -46);
  scene.add(planet);
  const rocks: THREE.Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const o = place(scene, 'space/meteor', Math.cos(a) * (R0 + 8 + (i % 3) * 3), -3 - (i % 4) * 1.5, wz(CY) + Math.sin(a) * (R0 + 6), { s: 1 + (i % 3) * 0.6 });
    rocks.push(o);
  }
  place(scene, 'space/satelliteDish_large', R0 + 9, -2, wz(CY) - R0 - 6, { s: 3 });
  const fx = new Fx(scene);
  const ufos = state.saucers.map((u) => {
    const color = colorOf(players, u.id);
    const g = new THREE.Group();
    const hull = mesh(new THREE.SphereGeometry(0.72, 28, 14), new THREE.MeshStandardMaterial({ color: '#d7dde6', metalness: 0.6, roughness: 0.25 }));
    hull.scale.y = 0.32;
    hull.position.y = 0.32;
    const bumper = mesh(new THREE.TorusGeometry(0.72, 0.13, 10, 32), toy(color, 0.45));
    bumper.rotation.x = Math.PI / 2;
    bumper.position.y = 0.3;
    const lightMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    const lights = mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), lightMat, { cast: false });
    lights.rotation.x = Math.PI / 2;
    lights.position.y = 0.2;
    const dome = mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bff3ff', transparent: true, opacity: 0.35, roughness: 0.05 }), { cast: false });
    dome.position.y = 0.4;
    const m = new ChoppyModel(color, 0.42);
    m.group.position.y = 0.38;
    g.add(hull, bumper, lights, dome, m.group);
    pivot.add(g);
    return { g, m, lightMat };
  });
  let last = state;
  return {
    scene,
    camera,
    update(s: SaucerState, _p, t, dt) {
      last = s;
      pivot.rotation.z = -s.tiltX * 0.12;
      pivot.rotation.x = s.tiltY * 0.12;
      const k = s.r / s.r0;
      disc.scale.set(k, 1, k);
      (rim.material as THREE.MeshStandardMaterial).emissiveIntensity = s.r < s.r0 ? 1.2 + Math.sin(t * 10) * 0.6 : 1.6;
      glow.scale.setScalar(1 + Math.sin(t * 8) * 0.06);
      rocks.forEach((r, i) => {
        r.rotation.x += dt * 0.2 * ((i % 3) + 1);
        r.position.y += Math.sin(t + i) * dt * 0.2;
      });
      s.saucers.forEach((u, i) => {
        const v = ufos[i];
        const lx = (u.x - CX) * PX, lz = (u.y - CY) * PX;
        const drop = u.out ? u.fall * u.fall * 9 : 0;
        v.g.position.set(lx, 0.08 + Math.sin(t * 3 + i) * 0.04 - drop, lz);
        v.g.visible = drop < 40;
        v.g.rotation.y = u.out ? u.fall * 6 : Math.atan2(Math.cos(u.face), Math.sin(u.face));
        v.g.rotation.z = u.out ? u.fall * 1.5 : u.charge * Math.sin(t * 40) * 0.05;
        v.lightMat.emissiveIntensity = 0.6 + u.charge * 2.5 + (u.dash > 0 ? 2 : 0);
        v.m.update(dt, { speed: 0, stunned: u.out, happy: s.endAt !== undefined && !u.out });
        if (u.dash > 0) {
          const p = new THREE.Vector3();
          v.g.getWorldPosition(p);
          fx.emit(p.setY(p.y + 0.3), { n: 2, color: colorOf(players, u.id), speed: [0.2, 1], size: [0.4, 0], life: [0.2, 0.35], additive: true });
        }
      });
      for (const b of s.bonks) {
        const p = new THREE.Vector3((b.x - CX) * PX, 0.5, (b.y - CY) * PX);
        pivot.localToWorld(p);
        fx.bonk(p);
        if (b.hard) {
          fx.emit(p, { n: 10, color: ['#ffe066', '#7cf3ff'], speed: [3, 6], size: [0.3, 0], life: [0.2, 0.4], additive: true });
          shake(0.1);
        }
        sfx.bump();
      }
      for (const id of s.falls) {
        void id;
        sfx.lose();
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.saucers
        .filter((u) => !u.out)
        .map((u) => {
          const p = who(players, u.id);
          const pos = new THREE.Vector3((u.x - CX) * PX, 1.6, (u.y - CY) * PX);
          pivot.localToWorld(pos);
          return { id: u.id, pos, text: p?.name ?? '', color: p?.color, bar: u.charge > 0 ? u.charge : undefined };
        });
    },
  };
}

/* ---------------------------------------------------------------- Mimic Chest */

export function mimicView(env: THREE.Texture, state: MimicState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#0d0b14', skyBottom: '#2a1e16', fog: ['#1a120c', 22, 60], sunColor: '#ffc78a', sunIntensity: 1.1, shadowSize: 18 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const gap = 2.7;
  const chestX = (i: number) => (i - (CHESTS - 1) / 2) * gap;
  const CZ = -1;
  frameRect(camera, 640 - 360, 640 + 360, 360 - 190, 360 + 170, 0.8, 0.9);
  ground(scene, 80, 0, 0, new THREE.MeshStandardMaterial({ map: texture('floor_ground_sand', 26, 26), color: '#a98a62', roughness: 1 }));
  // cave walls: big rocks in a ring behind, torches, and loot piled up
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13) * Math.PI;
    place(scene, ['pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c'][i % 3], Math.cos(a) * 17, -0.3, -4 + Math.sin(a) * 10, { s: 3 + (i % 3) * 0.6, ry: i });
  }
  const torches: THREE.PointLight[] = [];
  for (const x of [-9, -3.5, 3.5, 9]) {
    onTop(place(scene, 'graveyard/fire-basket', x, 0, -5, { s: 1.6 }), flame(0.9), 0.85);
    const l = new THREE.PointLight('#ff9a3c', 22, 14);
    l.position.set(x, 1.6, -4.6);
    scene.add(l);
    torches.push(l);
  }
  place(scene, 'pirate/barrel', -10, 0, -2, { s: 1.6 });
  place(scene, 'pirate/crate-bottles', 10.5, 0, -1.5, { s: 1.6, ry: 0.4 });
  place(scene, 'pirate/flag-pirate', 12, 0, -5, { s: 2.2 });
  place(scene, 'pirate/ship-wreck', -14, -0.5, -9, { s: 3, ry: 0.5 });
  const fx = new Fx(scene);
  const coin = () => fitProp('platformer/coin-gold', 0.42, 'max');
  const chests = Array.from({ length: CHESTS }, (_, i) => {
    const g = new THREE.Group();
    const c = fitProp('pirate/chest', 1.5, 'x');
    g.add(c);
    // a little pile of coins in front, sized by the gold inside
    const coins = new THREE.Group();
    for (let k = 0; k < 12; k++) {
      const o = coin();
      o.position.set(((k % 4) - 1.5) * 0.28, 0.06 + Math.floor(k / 4) * 0.12, 0.95 + (k % 2) * 0.12);
      o.rotation.x = -Math.PI / 2;
      coins.add(o);
    }
    g.add(coins);
    // the mimic face: eyes and teeth, hidden until it bites (or for the Keeper)
    const face = new THREE.Group();
    for (const s of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffef5a', emissive: '#ffb800', emissiveIntensity: 1.5 }), { cast: false });
      eye.position.set(s * 0.33, 0.95, 0.5);
      face.add(eye);
    }
    for (let k = 0; k < 6; k++) {
      const tooth = mesh(new THREE.ConeGeometry(0.06, 0.2, 5), toy('#ffffff', 0.3), { cast: false });
      tooth.position.set((k - 2.5) * 0.18, 0.6, 0.55);
      tooth.rotation.x = Math.PI;
      face.add(tooth);
    }
    const tongue = mesh(new THREE.BoxGeometry(0.4, 0.06, 0.5), toy('#ff4d6d', 0.5), { cast: false });
    tongue.position.set(0, 0.45, 0.75);
    face.add(tongue);
    face.visible = false;
    g.add(face);
    const mark = mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: '#ff4d4d' }), { cast: false });
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.05;
    mark.visible = false;
    g.add(mark);
    g.position.set(chestX(i), 0, CZ);
    scene.add(g);
    return { g, coins, face, mark };
  });
  // the Keeper's rock behind the chests, and a pointer for their cursor
  place(scene, 'pirate/rocks-sand-a', 0, -0.3, -4.2, { s: 0.9 });
  const keeper = new ChoppyModel(colorOf(players, state.keeper), 0.85);
  keeper.group.position.set(0, 0.9, -4);
  scene.add(keeper.group);
  const pointer = mesh(new THREE.ConeGeometry(0.25, 0.5, 4), new THREE.MeshStandardMaterial({ color: '#ff5a5f', emissive: '#ff2a2a', emissiveIntensity: 0.8 }), { cast: false });
  pointer.rotation.x = Math.PI;
  scene.add(pointer);
  const looters = new Map<string, ChoppyModel>();
  for (const l of state.looters) {
    const m = new ChoppyModel(colorOf(players, l.id), 0.75);
    m.group.position.set(0, 0, 3.5);
    m.group.rotation.y = Math.PI;
    looters.set(l.id, m);
    scene.add(m.group);
  }
  const homeX = (i: number, n: number) => (i - (n - 1) / 2) * Math.min(1.5, 15 / Math.max(1, n));
  const spot = (s: MimicState, id: string) => {
    const l = s.looters.find((q) => q.id === id)!;
    const live = s.looters.filter((q) => !q.out || q.outRound === s.round);
    if (s.phase === 'mark' || l.out && l.outRound !== s.round) {
      const i = s.looters.indexOf(l);
      return new THREE.Vector3(homeX(i, s.looters.length), 0, l.out ? 6.5 : 4.2);
    }
    // stand in front of the chest you're on, sharing the spot with anyone else there
    const same = live.filter((q) => q.sel === l.sel);
    const k = same.indexOf(l);
    return new THREE.Vector3(chestX(l.sel) + (k - (same.length - 1) / 2) * 0.55, 0, CZ + 2.1 + (l.locked ? -0.3 : 0.3) + (k % 2) * 0.35);
  };
  let last = state;
  let shownRound = -1;
  return {
    scene,
    camera,
    update(s: MimicState, _p, t, dt) {
      last = s;
      torches.forEach((l, i) => (l.intensity = 20 + Math.sin(t * 9 + i * 2) * 3));
      const secret = LOCAL.has(s.keeper);
      if (shownRound !== s.round) {
        shownRound = s.round;
        chests.forEach((c, i) => {
          const pile = Math.max(1, Math.min(12, Math.round(s.gold[i] / 2)));
          c.coins.children.forEach((o, k) => (o.visible = k < pile));
        });
      }
      chests.forEach((c, i) => {
        const isMimic = s.mimics.includes(i);
        const reveal = s.phase === 'reveal';
        c.face.visible = isMimic && (reveal || (secret && s.phase !== 'mark'));
        c.mark.visible = isMimic && secret && s.phase !== 'reveal';
        const bite = reveal && isMimic ? Math.abs(Math.sin(t * 12)) * 0.25 : 0;
        c.g.position.y = bite;
        c.g.rotation.x = -bite * 0.6;
        c.g.scale.setScalar(1 + bite * 0.3);
      });
      pointer.visible = s.phase === 'mark' && secret;
      pointer.position.set(chestX(s.keeperSel), 2.2 + Math.sin(t * 6) * 0.12, CZ);
      pointer.rotation.y = t * 2;
      keeper.group.rotation.y = Math.atan2(chestX(s.keeperSel) * 0.1, 1);
      keeper.update(dt, { speed: 0, happy: s.phase === 'reveal' && s.looters.some((l) => l.out && l.outRound === s.round) });
      for (const l of s.looters) {
        const m = looters.get(l.id)!;
        const want = spot(s, l.id);
        const before = m.group.position.clone();
        m.group.position.lerp(want, Math.min(1, dt * 6));
        const moved = before.distanceTo(m.group.position) / Math.max(1e-3, dt);
        m.group.rotation.y = Math.PI;
        const bitten = l.out && l.outRound === s.round && s.phase === 'reveal';
        if (bitten) m.group.position.y = Math.max(0, Math.sin(Math.min(1, s.phaseT) * Math.PI) * 1.2);
        m.update(dt, { speed: Math.min(1, moved / 6), stunned: l.out, happy: s.phase === 'reveal' && !l.out && l.took >= 0 });
      }
      if (s.revealed) {
        sfx.boom();
        shake(0.12);
        for (const i of s.mimics) {
          const p = chests[i].g.position.clone().setY(1);
          fx.emit(p, { n: 16, color: ['#ff4d6d', '#ffffff'], speed: [2, 5], size: [0.35, 0], life: [0.3, 0.7] });
        }
        for (let i = 0; i < CHESTS; i++) if (!s.mimics.includes(i) && s.lastPicks.includes(i)) fx.sparkle(chests[i].g.position.clone().setY(1.2), '#ffd23f', 14);
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      const s = last;
      const out: Tag[] = [];
      chests.forEach((c, i) => out.push({ pos: c.g.position.clone().setY(1.9), text: `${s.gold[i]} gold`, color: '#ffd23f', sub: s.phase === 'reveal' && s.mimics.includes(i) ? 'MIMIC!' : undefined, subColor: '#ff5a5f' }));
      const kp = who(players, s.keeper);
      out.push({ id: s.keeper, pos: keeper.group.position.clone().setY(3), text: kp?.name ?? '', color: kp?.color, sub: 'Mimic Keeper', subColor: '#ff7b6b' });
      for (const l of s.looters) {
        const m = looters.get(l.id)!;
        const p = who(players, l.id);
        out.push({ id: l.id, pos: m.group.position.clone().setY(m.group.position.y + 2), text: p?.name ?? '', color: p?.color, sub: !l.out && s.phase === 'pick' && l.locked ? 'locked in' : undefined, subColor: '#4cd97b' });
      }
      return out;
    },
  };
}

/* ---------------------------------------------------------------- Barrel Bands */

const scoreColor = (sc: number) => (sc >= 10 ? '#ffd23f' : sc >= 6 ? '#4cd97b' : sc >= 3 ? '#7cc3ff' : sc >= 1 ? '#c9c9c9' : '#ff5a5f');

export function barrelView(env: THREE.Texture, state: BandState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#62b9ff', skyBottom: '#fff1d6', fog: ['#e8dcc6', 30, 90], shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const n = state.coopers.length;
  const gap = Math.min(3.2, 26 / n);
  const bx = (i: number) => (i - (n - 1) / 2) * gap;
  const span = (n - 1) * gap + 3;
  frameRect(camera, 640 - (span / 2) * 40, 640 + (span / 2) * 40, 360 - 60, 360 + 60, 0.42, 0.95);
  camera.lookAt(0, 0.9, wz(360));
  // the cooperage yard: wood plank floor, a workshop behind, barrels and crates stacked up
  ground(scene, 90, 0, 0, new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks_wide', 22, 22), color: '#c99a68', roughness: 0.9 }));
  for (let i = 0; i < 8; i++) place(scene, i % 3 ? 'pirate/barrel' : 'pirate/crate', -14 + i * 4, 0, -5.5 - (i % 2), { s: 1.6 + (i % 2) * 0.4, ry: i });
  const fx = new Fx(scene);
  const BH = 1.8;
  const rows = state.coopers.map((c, i) => {
    const g = new THREE.Group();
    const barrel = fitProp('pirate/barrel', BH, 'y');
    const bb = new THREE.Box3().setFromObject(barrel);
    const r = Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    const bc = bb.getCenter(new THREE.Vector3());
    barrel.position.set(-bc.x, -bb.min.y, -bc.z);
    g.add(barrel);
    // the bullseye stripe round the middle
    const target = mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, BH * 0.06, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb800', emissiveIntensity: 0.4, side: THREE.DoubleSide }), { cast: false });
    target.position.y = BH / 2;
    g.add(target);
    const band = mesh(new THREE.TorusGeometry(r * 0.98, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.7, roughness: 0.3, emissive: '#000' }), { cast: false });
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const done = new THREE.Group();
    g.add(done);
    const m = new ChoppyModel(colorOf(players, c.id), 0.7);
    m.group.position.set(-r - 0.55, 0, 0.3);
    m.group.rotation.y = 0.9;
    g.add(m.group);
    // a mallet in the cooper's hand
    const mallet = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9), toy('#7a5530', 0.8));
    handle.position.y = 0.45;
    const headM = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.38, 12), toy('#9c6b3e', 0.7));
    headM.rotation.z = Math.PI / 2;
    headM.position.y = 0.92;
    mallet.add(handle, headM);
    mallet.position.set(-r - 0.25, 0.9, 0.4);
    g.add(mallet);
    g.position.set(bx(i), 0, wz(360));
    scene.add(g);
    return { g, r, band, bandMat: band.material as THREE.MeshStandardMaterial, done, m, mallet, swing: 0, lastBand: -1 };
  });
  const y = (off: number) => BH / 2 - off * (BH / 2) * 0.92;
  let last = state;
  return {
    scene,
    camera,
    update(s: BandState, _p, t, dt) {
      last = s;
      s.coopers.forEach((c, i) => {
        const v = rows[i];
        const live = c.band < BANDS;
        v.band.visible = live;
        if (live) {
          const off = c.stopped ?? bandPos(c);
          v.band.position.y = y(off);
          v.bandMat.color.set(PACE_COLOR[c.pace]);
          v.bandMat.emissive.set(c.stopped === null ? PACE_COLOR[c.pace] : '#000');
          v.bandMat.emissiveIntensity = c.stopped === null ? 0.35 : 0;
          v.band.scale.setScalar(c.stopped !== null ? 1 - Math.min(1, (1.1 - c.settle) * 3) * 0.04 : 1);
        }
        v.swing = Math.max(0, v.swing - dt * 3.5);
        v.mallet.rotation.z = -Math.sin(v.swing * Math.PI) * 1.6;
        v.m.update(dt, { speed: 0, happy: s.endAt !== undefined && c.total >= Math.max(...s.coopers.map((q) => q.total)) });
        void t;
      });
      for (const h of s.hits) {
        const i = s.coopers.findIndex((c) => c.id === h.id);
        const v = rows[i];
        const c = s.coopers[i];
        if (!v || !c) continue;
        v.swing = 1;
        // leave a ring where it landed, coloured by how close it was
        const ring = mesh(new THREE.TorusGeometry(v.r * 0.96, 0.06, 8, 32), toy(scoreColor(h.score), 0.35), { cast: false });
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y(c.stopped ?? 1);
        v.done.add(ring);
        const at = v.g.position.clone().setY(y(c.stopped ?? 1));
        if (h.score >= 10) {
          fx.sparkle(at, '#ffd23f', 18);
          sfx.bell();
        } else if (h.score > 0) {
          fx.emit(at, { n: 8, color: scoreColor(h.score), speed: [1, 3], size: [0.25, 0], life: [0.2, 0.5] });
          sfx.land();
        } else {
          fx.dust(at, 0.8);
          sfx.lose();
        }
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.coopers.map((c, i) => {
        const p = who(players, c.id);
        const lastScore = c.scores[c.scores.length - 1];
        const fresh = c.stopped !== null && lastScore !== undefined;
        return {
          id: c.id,
          pos: rows[i].g.position.clone().setY(BH + 0.8),
          text: p?.name ?? '',
          color: p?.color,
          sub: fresh ? (lastScore > 0 ? `+${lastScore}` : 'MISS') : `${c.total} pts`,
          subColor: fresh ? scoreColor(lastScore) : undefined,
        };
      });
    },
  };
}
