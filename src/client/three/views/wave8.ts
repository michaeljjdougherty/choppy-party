import * as THREE from 'three';
import { flame } from '../look/fxKit';
import type { PlayerInfo } from '../../../shared/types';
import { CELL as HCELL, COLS, FX0, FY0, ROWS as HROWS, laneKind, type HopState } from '../../../shared/games/roadHopper';
import { CH, CW, craneX, sway, type StackState } from '../../../shared/games/crateStacker';
import { FORT_H, FORT_HP, FORT_W, FORT_X, gauge, type FortState } from '../../../shared/games/cannonFort';
import { BARREL_R, KINDS, LANE_H, LANE_Y, POT_X, needs, potAt, stallAt, type Kind, type RelayState } from '../../../shared/games/stewRelay';
import { JUNK, WELL_H, WELL_W, cellsOf, ghostY, type CascadeState } from '../../../shared/games/crateCascade';
import { CELL as SCELL, type SparkState } from '../../../shared/games/sparkTrails';
import { TEAM_HEX } from '../../../shared/games/hud';
import { place, texture } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, frameRect, makeScene, mesh, toonWater, toy, wx, wz, yaw } from '../kit';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { fitProp } from './crew';

const who = (players: PlayerInfo[], id: string) => players.find((p) => p.id === id);
const colorOf = (players: PlayerInfo[], id: string) => who(players, id)?.color ?? '#ffffff';

function ground(scene: THREE.Scene, w: number, d: number, x: number, z: number, mat: THREE.Material, y = 0): THREE.Mesh {
  const f = mesh(new THREE.PlaneGeometry(w, d), mat, { cast: false, receive: true });
  f.rotation.x = -Math.PI / 2;
  f.position.set(x, y, z);
  scene.add(f);
  return f;
}

/** Fit a prop into a box (each axis scaled on its own) sitting on y=0, centred. */
function boxed(name: string, w: number, h: number, d: number): THREE.Group {
  const o = fitProp(name, 1, 'max');
  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3());
  o.scale.multiply(new THREE.Vector3(w / Math.max(1e-3, s.x), h / Math.max(1e-3, s.y), d / Math.max(1e-3, s.z)));
  const b2 = new THREE.Box3().setFromObject(o);
  const c = b2.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -b2.min.y, -c.z);
  const g = new THREE.Group();
  g.add(o);
  return g;
}

/* ---------------------------------------------------------------- Road Hopper */

export function roadHopperView(env: THREE.Texture, state: HopState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#62b9ff', skyBottom: '#fff1d6', fog: ['#e9dcc0', 40, 110], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const W = COLS * HCELL;
  const ax = (x: number) => wx(FX0 + x);
  const az = (row: number) => wz(FY0 - (row + 0.5) * HCELL);
  frameRect(camera, FX0, FX0 + W, FY0 - HROWS * HCELL, FY0, 1.0, 0.94);
  const C = HCELL * PX;
  const fieldW = W * PX;
  // the rows: grass banks, dirt tracks with rails, and the river
  const grass = new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', 8, 1), color: '#8fd16a', roughness: 1 });
  const dirt = new THREE.MeshStandardMaterial({ map: texture('floor_ground_dirt', 8, 1), color: '#b48a62', roughness: 1 });
  const rail = toy('#8d939c', 0.3);
  rail.metalness = 0.6;
  const sleeper = toy('#6b4a2e', 0.9);
  const water = toonWater('#2c9be6', 6);
  for (let row = 0; row < HROWS; row++) {
    const k = laneKind(row);
    const z = az(row);
    if (k === 'river') continue;
    const slab = mesh(new THREE.BoxGeometry(fieldW + 30, 0.4, C), k === 'bank' ? grass : dirt, { cast: false, receive: true });
    slab.position.set(ax(W / 2), -0.2, z);
    scene.add(slab);
    if (k === 'track') {
      for (const s of [-1, 1]) {
        const r = mesh(new THREE.BoxGeometry(fieldW + 30, 0.08, 0.08), rail, { cast: false });
        r.position.set(ax(W / 2), 0.05, z + s * C * 0.28);
        scene.add(r);
      }
      for (let i = -8; i < COLS + 8; i++) {
        const sl = mesh(new THREE.BoxGeometry(0.22, 0.05, C * 0.8), sleeper, { cast: false, receive: true });
        sl.position.set(ax((i + 0.5) * HCELL), 0.01, z);
        scene.add(sl);
      }
    }
  }
  const riverRows = [6, 7, 8, 9];
  const riverZ = (az(6) + az(9)) / 2;
  const river = mesh(new THREE.PlaneGeometry(fieldW + 30, C * 4), water.material, { cast: false, receive: true });
  river.rotation.x = -Math.PI / 2;
  river.position.set(ax(W / 2), -0.25, riverZ);
  scene.add(river);
  // the far bank: a flag to reach
  place(scene, 'pirate/flag-high', ax(W / 2), 0, az(HROWS - 1) - C * 0.3, { s: 2.2 });
  // trees and rocks down both sides, hiding where carts and logs wrap round
  for (let row = -1; row <= HROWS; row++) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? ax(-HCELL * 1.4) : ax(W + HCELL * 1.4);
      const z = row < 0 ? az(0) + C : row >= HROWS ? az(HROWS - 1) - C : az(row);
      if (laneKind(Math.max(0, Math.min(HROWS - 1, row))) === 'river') place(scene, 'pirate/rocks-c', x, -0.3, z, { s: 1.3, ry: row });
      else place(scene, row % 2 ? 'forest/tree' : 'forest/tree-high', x, 0, z, { s: 2.6, ry: row });
      place(scene, 'pirate/rocks-a', x + side * 2.6, -0.2, z, { s: 1.4, ry: row * 2 });
    }
  }
  // carts and logs
  const logMat = new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 1, 3), color: '#a0703f', roughness: 0.9 });
  const things = state.lanes.map((l) => {
    return l.things.map((th) => {
      const g = new THREE.Group();
      const len = th.len * HCELL * PX;
      if (l.kind === 'track') {
        const cart = boxed('train/train-carriage-coal', len * 0.92, C * 0.75, C * 0.72);
        g.add(cart);
      } else {
        const log = mesh(new THREE.CylinderGeometry(C * 0.36, C * 0.36, len * 0.96, 12), logMat, { cast: true, receive: true });
        log.rotation.z = Math.PI / 2;
        log.position.y = -0.05;
        g.add(log);
      }
      scene.add(g);
      return { g, len };
    });
  });
  const fx = new Fx(scene);
  const models = new Map<string, ChoppyModel>();
  for (const h of state.hoppers) {
    const m = new ChoppyModel(colorOf(players, h.id), 0.62);
    models.set(h.id, m);
    scene.add(m.group);
  }
  const FACE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
  let last = state;
  const pos = (h: HopState['hoppers'][number]) => {
    const u = h.hop > 0 ? 1 - h.hop / 0.14 : 1;
    const x = h.fromX + (h.x - h.fromX) * (h.hop > 0 ? u : 1);
    const row = h.hop > 0 ? h.fromRow + (h.row - h.fromRow) * u : h.row;
    const lift = h.hop > 0 ? Math.sin(u * Math.PI) * 0.55 : 0;
    const onLog = laneKind(h.row) === 'river' && h.hop <= 0 ? 0.25 : 0;
    return new THREE.Vector3(ax(x), lift + onLog, wz(FY0 - (row + 0.5) * HCELL));
  };
  return {
    scene,
    camera,
    update(s: HopState, _p, t, dt) {
      last = s;
      water.update(t);
      s.lanes.forEach((l, r) => {
        l.things.forEach((th, i) => {
          const v = things[r][i];
          v.g.position.set(ax(th.x) + v.len / 2, l.kind === 'river' ? Math.sin(t * 2 + i + r) * 0.04 : 0, az(r));
          v.g.rotation.y = l.kind === 'track' && l.dir < 0 ? Math.PI : 0;
          v.g.visible = th.x + th.len * HCELL > -HCELL * 1.2 && th.x < W + HCELL * 0.2;
        });
      });
      for (const h of s.hoppers) {
        const m = models.get(h.id)!;
        const p = pos(h);
        // fallen in: sink; hit by a cart: squash flat
        const gone = h.reset > 0 && h.row !== 0;
        m.group.position.copy(p);
        m.group.visible = !(gone && h.reset < 0.5);
        m.group.scale.set(1, gone && laneKind(h.row) === 'track' ? 0.25 : 1, 1);
        if (gone && laneKind(h.row) === 'river') m.group.position.y -= (0.9 - h.reset) * 1.5;
        const want = FACE[h.face];
        let d = want - m.group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.group.rotation.y += d * Math.min(1, dt * 18);
        m.update(dt, { speed: h.hop > 0 ? 0.6 : 0, jump: h.hop > 0 ? 0.5 : 0, stunned: gone, happy: s.winner === h.id });
      }
      for (const sp of s.splats) {
        const h = s.hoppers.find((q) => q.id === sp.id);
        if (!h) continue;
        const at = pos(h);
        if (sp.water) {
          fx.splash(at);
          sfx.miss();
        } else {
          fx.bonk(at.clone().setY(0.8));
          sfx.bump();
          shake(0.1);
        }
      }
      for (const id of s.scores) {
        const h = s.hoppers.find((q) => q.id === id);
        if (!h) continue;
        fx.party(pos(h).setY(1));
        sfx.bell();
      }
      fx.update(dt);
      void riverRows;
    },
    tags(): Tag[] {
      return last.hoppers.map((h) => {
        const p = who(players, h.id);
        return { id: h.id, pos: pos(h).setY(1.9), text: p?.name ?? '', color: p?.color, sub: `${h.score}`, subColor: '#ffd23f' };
      });
    },
  };
}

/* ---------------------------------------------------------------- Crate Stacker */

export function crateStackerView(env: THREE.Texture, state: StackState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#4fa8ff', skyBottom: '#ffeccc', fog: ['#d8e6f0', 60, 160], shadowSize: 26, sunDir: [6, 20, 14] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  const cw = CW * PX, ch = CH * PX;
  const TX = [-6.5, 6.5];
  // the dock: planks over the water, with the harbour behind
  const water = toonWater('#1f8fe0', 18);
  const sea = mesh(new THREE.PlaneGeometry(240, 160), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.6, -30);
  scene.add(sea);
  const dock = mesh(new THREE.BoxGeometry(34, 0.5, 10), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 10, 3), color: '#b08050', roughness: 0.9 }), { receive: true });
  dock.position.set(0, -0.25, 0);
  scene.add(dock);
  place(scene, 'pirate/ship-pirate-large', -30, -0.6, -48, { s: 4, ry: 0.4 });
  place(scene, 'pirate/ship-medium', 22, -0.6, -32, { s: 4, ry: -0.6 });
  place(scene, 'pirate/tower-complete-large', 0, -0.6, -48, { s: 5 });
  for (let i = 0; i < 6; i++) place(scene, i % 2 ? 'pirate/barrel' : 'pirate/crate-bottles', -15 + i * 6 + (i > 2 ? 0 : 0), 0, -3.8, { s: 1.4, ry: i });
  const crateMat = new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 1, 1), color: '#d09a5a', roughness: 0.85 });
  const edgeMat = toy('#7a4e26', 0.8);
  const makeCrate = (tint?: string) => {
    const g = new THREE.Group();
    const b = mesh(new THREE.BoxGeometry(cw, ch, cw * 0.8), tint ? new THREE.MeshStandardMaterial({ map: crateMat.map, color: new THREE.Color(tint).lerp(new THREE.Color('#ffe2b8'), 0.55), roughness: 0.85 }) : crateMat);
    b.position.y = ch / 2;
    g.add(b);
    for (const sx of [-1, 1]) {
      const e = mesh(new THREE.BoxGeometry(0.1, ch, cw * 0.82), edgeMat, { cast: false });
      e.position.set(sx * (cw / 2 - 0.04), ch / 2, 0);
      g.add(e);
    }
    const x = mesh(new THREE.BoxGeometry(cw * 1.02, 0.1, cw * 0.82), edgeMat, { cast: false });
    x.position.y = ch - 0.05;
    g.add(x);
    return g;
  };
  const fx = new Fx(scene);
  const towers = state.stacks.map((k, i) => {
    const root = new THREE.Group();
    root.position.x = TX[i];
    scene.add(root);
    const pallet = mesh(new THREE.BoxGeometry(cw * 2.2, 0.2, cw), toy('#9c6b3e', 0.9), { receive: true });
    pallet.position.y = 0.1;
    root.add(pallet);
    const stack = new THREE.Group();
    stack.position.y = 0.2;
    root.add(stack);
    // the crane: a mast beside the tower, an arm above, a hook on a rope
    const crane = new THREE.Group();
    const mast = mesh(new THREE.BoxGeometry(0.4, 1, 0.4), toy('#ffb020', 0.5));
    const arm = mesh(new THREE.BoxGeometry(10, 0.35, 0.35), toy('#ffb020', 0.5));
    const ropeM = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), toy('#3a3a3a', 0.8), { cast: false });
    const hookCrate = makeCrate(colorOf(players, k.id));
    crane.add(mast, arm, ropeM, hookCrate);
    root.add(crane);
    const m = new ChoppyModel(colorOf(players, k.id), 0.7);
    m.group.position.set(i === 0 ? -3.4 : 3.4, 0, 1.6);
    m.group.rotation.y = i === 0 ? 0.6 : -0.6;
    root.add(m.group);
    const falling = makeCrate(colorOf(players, k.id));
    falling.visible = false;
    root.add(falling);
    return { root, stack, crane, mast, arm, ropeM, hookCrate, falling, m, crates: [] as THREE.Group[], tumble: [] as { o: THREE.Group; v: THREE.Vector3; w: number }[], tumbled: false };
  });
  let camY = 4, camD = 22;
  let last = state;
  return {
    scene,
    camera,
    update(s: StackState, _p, t, dt) {
      last = s;
      water.update(t);
      let tall = 0;
      s.stacks.forEach((k, i) => {
        const v = towers[i];
        // new crates on the tower
        while (v.crates.length < k.crates.length) {
          const c = makeCrate(colorOf(players, k.id));
          const j = v.crates.length;
          c.position.set(k.crates[j] * PX, j * ch, 0);
          v.stack.add(c);
          v.crates.push(c);
        }
        const n = k.crates.length;
        tall = Math.max(tall, n);
        // the whole tower rocks about its base
        const top = Math.max(1, n) * ch;
        v.stack.rotation.z = k.over ? v.stack.rotation.z : -Math.atan2(sway(k, t) * PX, top) * 0.8;
        const hookY = (n + 3.2) * ch + 0.4;
        const hx = k.drop ? k.drop.x * PX : craneX(k) * PX;
        v.mast.scale.y = hookY + 1.2;
        v.mast.position.set(i === 0 ? -5.6 : 5.6, (hookY + 1.2) / 2, -0.9);
        v.arm.position.set(0, hookY + 1.2, -0.9);
        const showHook = !k.over && !k.drop && k.next <= 0;
        v.hookCrate.visible = showHook;
        v.hookCrate.position.set(hx, hookY - ch, 0);
        v.ropeM.position.set(hx, hookY + 0.6 - ch * 0, -0.1);
        v.ropeM.scale.y = 1.2;
        v.ropeM.position.y = hookY + 0.6;
        // a dropped crate falling onto the pile
        v.falling.visible = !!k.drop;
        if (k.drop) {
          const u = Math.min(1, k.drop.t / 0.45);
          v.falling.position.set(k.drop.x * PX, hookY - ch + (n * ch + 0.2 - (hookY - ch)) * u * u, 0);
        }
        // toppled: the tower tips over and the crates go flying
        if (k.over && !v.tumbled) {
          v.tumbled = true;
          const side = k.crates.length && k.crates[k.crates.length - 1] < 0 ? -1 : 1;
          for (const c of v.crates) {
            const wp = c.getWorldPosition(new THREE.Vector3());
            v.stack.remove(c);
            v.root.worldToLocal(wp);
            c.position.copy(wp);
            v.root.add(c);
            v.tumble.push({ o: c, v: new THREE.Vector3(side * (1.5 + Math.random() * 2.5), 2 + Math.random() * 3, (Math.random() - 0.5) * 2), w: (Math.random() - 0.5) * 6 });
          }
          sfx.lose();
          shake(0.2);
          fx.dust(new THREE.Vector3(TX[i], 0.4, 0), 1.6);
        }
        for (const b of v.tumble) {
          if (b.o.position.y <= 0.2 && b.v.y < 0) {
            b.o.position.y = 0.2;
            b.v.multiplyScalar(0.9);
            b.v.y = 0;
            b.w *= 0.9;
          } else b.v.y -= 14 * dt;
          b.o.position.addScaledVector(b.v, dt);
          b.o.rotation.z += b.w * dt;
        }
        v.m.update(dt, { speed: 0, happy: s.endAt !== undefined && !k.over && k.crates.length >= Math.max(...s.stacks.map((q) => q.crates.length)), stunned: k.over });
      });
      for (const l of s.lands) {
        const i = s.stacks.findIndex((q) => q.id === l.id);
        const k = s.stacks[i];
        if (!k) continue;
        const at = new THREE.Vector3(TX[i] + k.crates[k.crates.length - 1] * PX, k.crates.length * ch + 0.2, 0.6);
        if (l.perfect) {
          fx.sparkle(at, '#ffd23f', 14);
          sfx.bell();
        } else {
          fx.dust(at, 0.6);
          sfx.land();
        }
      }
      // the camera rises with the taller tower
      const top = (tall + 4.5) * ch;
      const wantY = Math.max(3.5, top * 0.55);
      const wantD = Math.max(22, top * 1.45);
      camY += (wantY - camY) * Math.min(1, dt * 2);
      camD += (wantD - camD) * Math.min(1, dt * 2);
      camera.position.set(0, camY + 1.5, camD);
      camera.lookAt(0, camY, 0);
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.stacks.map((k, i) => {
        const p = who(players, k.id);
        return { id: k.id, pos: new THREE.Vector3(TX[i] + (i === 0 ? -3.4 : 3.4), 2, 1.6), text: p?.name ?? '', color: p?.color, sub: k.over ? 'TOPPLED' : `${k.crates.length} high`, subColor: k.over ? '#ff5a5f' : '#ffd23f' };
      });
    },
  };
}

/* ---------------------------------------------------------------- Cannon Fort */

const FCOLS = 5, FROWS = 6;

export function cannonFortView(env: THREE.Texture, state: FortState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#3d9bff', skyBottom: '#ffe8c4', fog: ['#cfe2f0', 60, 180], shadowSize: 30, sunDir: [4, 20, 16] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  const sx = (x: number) => wx(x);
  const hy = (h: number) => h * PX;
  camera.position.set(0, 7.2, 29);
  camera.lookAt(0, 5.2, 0);
  const water = toonWater('#1f8fe0', 18);
  const sea = mesh(new THREE.PlaneGeometry(260, 160), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, -20);
  scene.add(sea);
  place(scene, 'pirate/ship-pirate-large', -4, 0, -38, { s: 5, ry: 1.2 });
  for (let i = 0; i < 5; i++) place(scene, i % 2 ? 'pirate/palm-detailed-bend' : 'pirate/palm-straight', -30 + i * 15, 0, -55, { s: 5 });
  const stone = new THREE.MeshStandardMaterial({ map: texture('wall_brick_stone_center', 1, 1), color: '#cfc6b4', roughness: 1 });
  const fw = FORT_W * PX, fh = FORT_H * PX;
  const bw = fw / FCOLS, bh = fh / FROWS;
  const fx = new Fx(scene);
  const forts = [0, 1].map((team) => {
    const g = new THREE.Group();
    g.position.set(sx(FORT_X[team] + FORT_W / 2), 0, 0);
    scene.add(g);
    // a rocky island under it
    place(g, 'pirate/rocks-sand-a', 0, -0.6, 0, { s: 4.2 });
    const blocks: THREE.Mesh[] = [];
    for (let r = 0; r < FROWS; r++)
      for (let c = 0; c < FCOLS; c++) {
        const b = mesh(new THREE.BoxGeometry(bw * 0.98, bh * 0.98, 3), stone, { cast: true, receive: true });
        b.position.set(-fw / 2 + (c + 0.5) * bw, (r + 0.5) * bh, -0.4);
        g.add(b);
        blocks.push(b);
      }
    // knock blocks out from the top down, in a shuffled order, as the fort takes damage
    const order = blocks.map((_, i) => i).sort((a, b) => Math.floor(b / FCOLS) - Math.floor(a / FCOLS) || ((a * 7919) % 11) - ((b * 7919) % 11));
    // flags in the team colour
    for (const fxp of [-fw / 2 + 0.3, fw / 2 - 0.3]) {
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4), toy('#6b4a2e', 0.8));
      pole.position.set(fxp, fh + 1.2, -0.4);
      const flag = mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ color: TEAM_HEX[team], side: THREE.DoubleSide }), { cast: false });
      flag.position.set(fxp + 0.55, fh + 2.0, -0.4);
      g.add(pole, flag);
    }
    return { g, blocks, order, gone: 0, flying: [] as { o: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[] };
  });
  const guns = state.gunners.map((gn) => {
    const g = new THREE.Group();
    g.position.set(sx(gn.x), hy(gn.h - 14), 1.3);
    const ledge = mesh(new THREE.BoxGeometry(1.6, 0.18, 1.6), toy('#8a6a48', 0.9), { receive: true });
    ledge.position.y = -0.09;
    g.add(ledge);
    const barrel = new THREE.Group();
    const tube = mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 12), toy('#3b3b44', 0.35));
    tube.rotation.z = -Math.PI / 2;
    tube.position.x = 0.45;
    const rim = mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), toy(colorOf(players, gn.id), 0.4), { cast: false });
    rim.rotation.y = Math.PI / 2;
    rim.position.x = 1.08;
    barrel.add(tube, rim);
    barrel.position.y = 0.35;
    const flip = new THREE.Group();
    flip.scale.x = gn.team === 0 ? 1 : -1;
    flip.add(barrel);
    const wheelL = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), toy('#6b4a2e', 0.8));
    wheelL.rotation.x = Math.PI / 2;
    wheelL.position.set(0, 0.22, 0.3);
    flip.add(wheelL);
    g.add(flip);
    const m = new ChoppyModel(colorOf(players, gn.id), 0.5);
    m.group.position.set(gn.team === 0 ? -0.6 : 0.6, 0, -0.2);
    m.group.rotation.y = gn.team === 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(m.group);
    // the power gauge: a little bar that fills as A is held
    const gaugeBg = mesh(new THREE.PlaneGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45 }), { cast: false });
    gaugeBg.position.set(gn.team === 0 ? -1.1 : 1.1, 1.2, 0.3);
    const fill = mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: '#ffd23f' }), { cast: false });
    fill.position.copy(gaugeBg.position).setZ(0.31);
    g.add(gaugeBg, fill);
    scene.add(g);
    return { g, barrel, m, gaugeBg, fill, kick: 0 };
  });
  const shellGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const shellMat = toy('#1e1e24', 0.3);
  const shells: THREE.Mesh[] = [];
  let last = state;
  return {
    scene,
    camera,
    update(s: FortState, _p, t, dt) {
      last = s;
      water.update(t);
      // forts crumble with their hp
      s.hp.forEach((hp, team) => {
        const f = forts[team];
        const want = Math.min(f.blocks.length, Math.floor((1 - hp / FORT_HP) * f.blocks.length * 0.85));
        while (f.gone < want) {
          const b = f.blocks[f.order[f.gone++]];
          const dir = team === 0 ? -1 : 1;
          f.flying.push({ o: b, v: new THREE.Vector3(dir * (2 + Math.random() * 3), 3 + Math.random() * 3, 2 + Math.random() * 2), w: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4) });
        }
        for (const fl of f.flying) {
          if (!fl.o.visible) continue;
          fl.v.y -= 16 * dt;
          fl.o.position.addScaledVector(fl.v, dt);
          fl.o.rotation.x += fl.w.x * dt;
          fl.o.rotation.y += fl.w.y * dt;
          if (fl.o.position.y < -2) {
            fl.o.visible = false;
            fx.splash(f.g.position.clone().add(fl.o.position).setY(0));
          }
        }
        if (s.winner >= 0 && s.winner !== 2 && team !== s.winner) f.g.position.y = Math.max(-fh, f.g.position.y - dt * 1.2);
      });
      s.gunners.forEach((gn, i) => {
        const v = guns[i];
        v.kick = Math.max(0, v.kick - dt * 4);
        v.barrel.rotation.z = gn.ang;
        v.barrel.position.x = -v.kick * 0.25;
        const p = gauge(gn.charge);
        v.fill.visible = v.gaugeBg.visible = gn.charge >= 0;
        v.fill.scale.y = Math.max(0.01, p);
        v.fill.position.y = 1.2 - 0.5 + p / 2;
        (v.fill.material as THREE.MeshBasicMaterial).color.set(p > 0.8 ? '#ff5a5f' : p > 0.45 ? '#ffd23f' : '#4cd97b');
        v.g.visible = s.winner < 0 || s.winner === 2 || gn.team === s.winner || forts[gn.team].g.position.y > -1;
        v.m.update(dt, { speed: 0, happy: s.winner === gn.team });
      });
      for (const id of s.fires) {
        const i = s.gunners.findIndex((g) => g.id === id);
        const gn = s.gunners[i];
        if (!gn) continue;
        guns[i].kick = 1;
        fx.emit(new THREE.Vector3(sx(gn.x) + (gn.team === 0 ? 1.2 : -1.2), hy(gn.h), 1.4), { tex: 'puff', color: ['#ffffff', '#d8d8d8'], n: 8, speed: [1, 3], life: [0.3, 0.6], size: [0.5, 1.2], drag: 3 });
        sfx.boom();
      }
      while (shells.length < s.shells.length) {
        const m = mesh(shellGeo, shellMat);
        scene.add(m);
        shells.push(m);
      }
      shells.forEach((m, i) => {
        const sh = s.shells[i];
        m.visible = !!sh;
        if (sh) m.position.set(sx(sh.x), hy(sh.h), 1.3);
      });
      for (const b of s.booms) {
        const at = new THREE.Vector3(sx(b.x), hy(b.h), 1.3);
        if (b.hit >= 0) {
          fx.blast(at, 1.1);
          sfx.bump();
          shake(0.12);
        } else fx.splash(at.setY(0));
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.gunners.map((gn, i) => {
        const p = who(players, gn.id);
        return { id: gn.id, pos: guns[i].g.position.clone().add(new THREE.Vector3(0, 1.5, 0)), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}

/* ---------------------------------------------------------------- Stew Relay */

const FOOD: Record<Kind, string> = { onion: 'food/onion-half', pepper: 'food/pepper', cheese: 'food/cheese-cut', cabbage: 'food/cabbage', tomato: 'food/tomato-slice', meat: 'food/meat-patty' };

export function stewRelayView(env: THREE.Texture, state: RelayState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#ff9e5e', skyBottom: '#ffe3b8', fog: ['#f3d6b0', 40, 120], sunColor: '#ffe2bd', shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  frameRect(camera, 70, 1220, LANE_Y[0] - 10, LANE_Y[1] + LANE_H + 10, 0.95, 0.96);
  const lw = 1180 * PX;
  ground(scene, 90, 70, 0, 0, new THREE.MeshStandardMaterial({ map: texture('floor_ground_sand', 24, 18), color: '#d8b98a', roughness: 1 }), -0.02);
  for (const team of [0, 1]) {
    const lane = ground(scene, lw, LANE_H * PX, wx(645), wz(LANE_Y[team] + LANE_H / 2), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', 18, 4), color: team ? '#c8d8f0' : '#f0d0c8', roughness: 1 }));
    lane.position.y = 0.005;
    // a team-coloured strip along the edge
    const strip = mesh(new THREE.BoxGeometry(lw, 0.06, 0.25), toy(TEAM_HEX[team], 0.5), { cast: false });
    strip.position.set(wx(645), 0.03, wz(team === 0 ? LANE_Y[0] + 4 : LANE_Y[1] + LANE_H - 4));
    scene.add(strip);
  }
  // the fence down the middle
  const midZ = wz((LANE_Y[0] + LANE_H + LANE_Y[1]) / 2);
  for (let i = 0; i < 14; i++) place(scene, 'pirate/structure-fence', wx(80 + i * 85), 0, midZ, { s: 1.6 });
  // market dressing around the outside
  for (let i = 0; i < 7; i++) {
    place(scene, i % 2 ? 'pirate/barrel' : 'pirate/crate', wx(120 + i * 170), 0, wz(LANE_Y[0] - 40), { s: 1.5, ry: i });
    place(scene, i % 2 ? 'pirate/crate' : 'pirate/barrel', wx(200 + i * 170), 0, wz(LANE_Y[1] + LANE_H + 40), { s: 1.5, ry: i + 1 });
  }
  const fx = new Fx(scene);
  // the pots: a big iron pot on a fire, the stew rising as it fills
  const pots = [0, 1].map((team) => {
    const p = potAt(team);
    const g = new THREE.Group();
    g.position.set(wx(p.x), 0, wz(p.y));
    const pot = mesh(new THREE.CylinderGeometry(1.2, 0.95, 1.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#2d2d34', roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
    pot.position.y = 0.95;
    const bottom = mesh(new THREE.CircleGeometry(0.95, 20), toy('#2d2d34', 0.4));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.31;
    const rim = mesh(new THREE.TorusGeometry(1.2, 0.09, 8, 24), toy('#4a4a52', 0.3), { cast: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.6;
    const stew = mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ color: '#d86a2a', emissive: '#8a3a10', emissiveIntensity: 0.4, roughness: 0.5 }), { cast: false });
    stew.rotation.x = -Math.PI / 2;
    place(g, 'graveyard/fire-basket', 0, -0.1, 0, { s: 1.3, shadow: false });
    // flames licking up round the pot
    for (const a of [0, 2.1, 4.2]) {
      const f = flame(0.7);
      f.position.set(Math.cos(a) * 0.55, 0.15, Math.sin(a) * 0.55);
      g.add(f);
    }
    const light = new THREE.PointLight('#ff9a3c', 10, 6);
    light.position.y = 0.4;
    g.add(pot, bottom, rim, stew, light);
    scene.add(g);
    return { g, stew, bob: 0 };
  });
  // the stalls: a counter with a stack of the ingredient and a striped awning
  const stalls = [0, 1].map((team) =>
    KINDS.map((k) => {
      const at = stallAt(state, k, team);
      const g = new THREE.Group();
      g.position.set(wx(at.x), 0, wz(at.y));
      const counter = mesh(new THREE.BoxGeometry(1.7, 0.7, 1.2), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 1, 1), color: '#b98a58', roughness: 0.9 }), { receive: true });
      counter.position.y = 0.35;
      g.add(counter);
      for (let j = 0; j < 3; j++) {
        const f = fitProp(FOOD[k], 0.55, 'max');
        f.position.set((j - 1) * 0.5, 0.72, 0);
        g.add(f);
      }
      const ring = mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f' }), { cast: false });
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.visible = false;
      g.add(ring);
      scene.add(g);
      return { g, ring };
    }),
  );
  const runners = state.runners.map((r) => {
    const m = new ChoppyModel(colorOf(players, r.id), 0.6);
    scene.add(m.group);
    const held = new THREE.Group();
    held.position.y = 1.75;
    m.group.add(held);
    return { m, held, kind: null as Kind | null };
  });
  const barrels: THREE.Group[] = [];
  const makeBarrel = () => {
    const b = fitProp('pirate/barrel', BARREL_R * 2 * PX * 1.15, 'y');
    const bb = new THREE.Box3().setFromObject(b);
    const c = bb.getCenter(new THREE.Vector3());
    b.position.sub(c);
    const spin = new THREE.Group();
    spin.add(b);
    spin.rotation.z = Math.PI / 2; // lying on its side, rolling along z
    const g = new THREE.Group();
    g.add(spin);
    scene.add(g);
    return g;
  };
  let last = state;
  return {
    scene,
    camera,
    update(s: RelayState, _p, t, dt) {
      last = s;
      for (const team of [0, 1]) {
        const need = needs(s, team);
        stalls[team].forEach((st, i) => {
          st.ring.visible = KINDS[i] === need;
          if (st.ring.visible) st.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.06);
        });
        const p = pots[team];
        const level = Math.min(1, (s.step[team] + s.got[team] / Math.max(1, s.size[team])) / 6);
        p.stew.position.y = 0.45 + level * 1.05;
        p.bob = Math.max(0, p.bob - dt * 3);
        p.stew.scale.setScalar(0.9 + level * 0.1 + p.bob * 0.08);
        if (level > 0 && Math.random() < dt * 8) fx.emit(p.g.position.clone().setY(p.stew.position.y + 0.1), { tex: 'puff', color: '#ffffff', n: 1, speed: [0.3, 0.8], up: 1.5, life: [0.6, 1.1], size: [0.4, 0.9], gravity: -1 });
      }
      s.runners.forEach((r, i) => {
        const v = runners[i];
        v.m.group.position.set(wx(r.x), 0, wz(r.y));
        if (r.moving) v.m.group.rotation.y = yaw(r.face);
        if (v.kind !== r.carry) {
          v.held.clear();
          v.kind = r.carry;
          if (r.carry) v.held.add(fitProp(FOOD[r.carry], 0.7, 'max'));
        }
        v.held.position.y = 1.75 + Math.sin(t * 9) * 0.04;
        v.m.update(dt, { speed: r.moving ? 1 : 0, stunned: r.stun > 0, happy: s.winner === r.team });
      });
      while (barrels.length < s.barrels.length) barrels.push(makeBarrel());
      barrels.forEach((g, i) => {
        const b = s.barrels[i];
        g.visible = !!b;
        if (!b) return;
        // same barrel rolls down both lanes
        g.position.set(wx(b.x), BARREL_R * PX, wz(LANE_Y[0] + b.y));
        (g.children[0] as THREE.Object3D).rotation.x = b.spin;
      });
      // a second copy for the bottom lane
      while (scene.userData.lower === undefined || (scene.userData.lower as THREE.Group[]).length < s.barrels.length) {
        scene.userData.lower = [...((scene.userData.lower as THREE.Group[]) ?? []), makeBarrel()];
      }
      (scene.userData.lower as THREE.Group[]).forEach((g, i) => {
        const b = s.barrels[i];
        g.visible = !!b;
        if (!b) return;
        g.position.set(wx(b.x), BARREL_R * PX, wz(LANE_Y[1] + b.y));
        (g.children[0] as THREE.Object3D).rotation.x = b.spin;
      });
      for (const pl of s.plops) {
        const p = pots[pl.team];
        p.bob = 1;
        fx.emit(p.g.position.clone().setY(1.6), { color: ['#ff9a3c', '#ffd23f'], n: 10, speed: [1, 3], up: 3, life: [0.3, 0.6], size: [0.3, 0.1] });
        if (pl.done) {
          fx.sparkle(p.g.position.clone().setY(2), TEAM_HEX[pl.team], 18);
          sfx.bell();
        } else sfx.plate();
      }
      for (const id of s.grabs) {
        const r = s.runners.find((q) => q.id === id);
        if (r) {
          fx.sparkle(new THREE.Vector3(wx(r.x), 1.6, wz(r.y)), '#ffffff', 6);
          sfx.coin();
        }
      }
      for (const id of s.bonked) {
        const r = s.runners.find((q) => q.id === id);
        if (r) {
          fx.bonk(new THREE.Vector3(wx(r.x), 1.2, wz(r.y)));
          sfx.bump();
        }
      }
      fx.update(dt);
      void POT_X;
    },
    tags(): Tag[] {
      return last.runners.map((r) => {
        const p = who(players, r.id);
        return { id: r.id, pos: new THREE.Vector3(wx(r.x), 2.6, wz(r.y)), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}

/* ---------------------------------------------------------------- Crate Cascade */

const CLUMP_COLORS = ['#ff6b5a', '#ffb020', '#ffd23f', '#4cd97b', '#2ec5e6', '#7c8cff', '#c56cff'];

export function crateCascadeView(env: THREE.Texture, state: CascadeState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#4fa8ff', skyBottom: '#ffeccc', fog: ['#dce8f2', 60, 200], shadowSize: 30, sunDir: [4, 18, 20] });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);
  const n = state.wells.length;
  const perRow = n <= 5 ? n : Math.ceil(n / 2);
  const rowsOfWells = n <= 5 ? 1 : 2;
  const C = 0.5; // world size of one crate
  const wellW = WELL_W * C, wellH = WELL_H * C;
  const gapX = 1.6, gapY = 2.6;
  const totalW = perRow * wellW + (perRow - 1) * gapX;
  const totalH = rowsOfWells * wellH + (rowsOfWells - 1) * gapY;
  const origin = state.wells.map((_, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = row === rowsOfWells - 1 ? n - row * perRow : perRow;
    const rowW = inRow * wellW + (inRow - 1) * gapX;
    return new THREE.Vector3(-rowW / 2 + col * (wellW + gapX), (rowsOfWells - 1 - row) * (wellH + gapY) + 1.2, 0);
  });
  // fit the camera to the wells
  const fov = (40 * Math.PI) / 180;
  const dist = Math.max((totalH + 3.5) / 2 / Math.tan(fov / 2), (totalW + 2) / 2 / Math.tan(fov / 2) / (16 / 9));
  const cy = (totalH + 1.2) / 2 + 0.3;
  camera.position.set(0, cy + 1, dist);
  camera.lookAt(0, cy, 0);
  // the dock behind: harbour water, a warehouse wall
  const water = toonWater('#1f8fe0', 18);
  const sea = mesh(new THREE.PlaneGeometry(260, 160), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.8, -40);
  scene.add(sea);
  const dock = mesh(new THREE.BoxGeometry(totalW + 30, 0.5, 14), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 12, 4), color: '#b08050', roughness: 0.9 }), { receive: true });
  dock.position.set(0, -0.25, -2);
  scene.add(dock);
  const wall = mesh(new THREE.PlaneGeometry(totalW + 30, totalH + 14), new THREE.MeshStandardMaterial({ map: texture('wall_timber', (totalW + 30) / 4, (totalH + 14) / 4), color: '#c8a27a', roughness: 1 }), { cast: false, receive: true });
  wall.position.set(0, (totalH + 14) / 2 - 1, -1.6);
  scene.add(wall);
  // each well: a frame of posts with a back board
  const frameMat = toy('#6b4a2e', 0.8);
  const backMat = new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 1, transparent: true, opacity: 0.85 });
  const backs = origin.map((o) => {
    const g = new THREE.Group();
    g.position.copy(o);
    const back = mesh(new THREE.PlaneGeometry(wellW, wellH), backMat.clone(), { cast: false });
    back.position.set(wellW / 2, wellH / 2, -0.3);
    g.add(back);
    for (const x of [-0.08, wellW + 0.08]) {
      const post = mesh(new THREE.BoxGeometry(0.16, wellH + 0.3, 0.6), frameMat);
      post.position.set(x, (wellH + 0.3) / 2 - 0.15, 0);
      g.add(post);
    }
    const base = mesh(new THREE.BoxGeometry(wellW + 0.32, 0.18, 0.6), frameMat);
    base.position.set(wellW / 2, -0.09, 0);
    g.add(base);
    // the danger line near the top
    const line = mesh(new THREE.BoxGeometry(wellW, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: '#ff5a5f', transparent: true, opacity: 0.6 }), { cast: false });
    line.position.set(wellW / 2, (WELL_H - 2) * C, 0.3);
    g.add(line);
    scene.add(g);
    return back;
  });
  // all the crates in one instanced mesh
  const per = WELL_W * WELL_H + 8;
  const crateTex = texture('floor_wood_planks', 1, 1);
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(C * 0.94, C * 0.94, C * 0.94), new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 }), n * per);
  crates.castShadow = true;
  crates.receiveShadow = true;
  scene.add(crates);
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false });
  const ghosts = new THREE.InstancedMesh(new THREE.BoxGeometry(C * 0.9, C * 0.9, C * 0.2), ghostMat, n * 4);
  scene.add(ghosts);
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();
  const models = state.wells.map((w, i) => {
    const m = new ChoppyModel(colorOf(players, w.id), 0.5);
    m.group.position.copy(origin[i]).add(new THREE.Vector3(-0.55, -1.2, 0.6));
    if (Math.floor(i / perRow) < rowsOfWells - 1) m.group.position.y = origin[i].y - 0.05;
    m.group.position.set(origin[i].x - 0.6, origin[i].y - 0.2, 0.6);
    m.group.rotation.y = 0.5;
    scene.add(m.group);
    return m;
  });
  const fx = new Fx(scene);
  let last = state;
  const cellPos = (i: number, x: number, y: number) => new THREE.Vector3(origin[i].x + (x + 0.5) * C, origin[i].y + (y + 0.5) * C, 0);
  return {
    scene,
    camera,
    update(s: CascadeState, _p, t, dt) {
      last = s;
      water.update(t);
      s.wells.forEach((w, i) => {
        let k = i * per;
        const grey = w.out;
        for (let y = 0; y < WELL_H; y++)
          for (let x = 0; x < WELL_W; x++) {
            const c = w.cells[y * WELL_W + x];
            if (!c) crates.setMatrixAt(k, zero);
            else {
              m4.makeTranslation(cellPos(i, x, y));
              crates.setMatrixAt(k, m4);
              col.set(c === JUNK ? '#8a8a92' : CLUMP_COLORS[(c - 1) % CLUMP_COLORS.length]);
              if (grey) col.lerp(new THREE.Color('#555560'), 0.7);
              crates.setColorAt(k, col);
            }
            k++;
          }
        const p = w.piece;
        const cells = p ? cellsOf(p) : [];
        const gy = p ? ghostY(w.cells, p) - p.y : 0;
        for (let j = 0; j < 8; j++) {
          const kk = i * per + WELL_W * WELL_H + j;
          if (j < cells.length && !w.out && cells[j][1] < WELL_H) {
            m4.makeTranslation(cellPos(i, cells[j][0], cells[j][1]).setZ(0.05));
            crates.setMatrixAt(kk, m4);
            col.set(CLUMP_COLORS[p!.shape % CLUMP_COLORS.length]).lerp(new THREE.Color('#ffffff'), 0.15);
            crates.setColorAt(kk, col);
          } else crates.setMatrixAt(kk, zero);
        }
        for (let j = 0; j < 4; j++) {
          const kk = i * 4 + j;
          if (j < cells.length && !w.out && gy < 0) {
            m4.makeTranslation(cellPos(i, cells[j][0], cells[j][1] + gy).setZ(0.4));
            ghosts.setMatrixAt(kk, m4);
          } else ghosts.setMatrixAt(kk, zero);
        }
        (backs[i].material as THREE.MeshStandardMaterial).color.set(w.pending > 0 ? (Math.sin(t * 10) > 0 ? '#5a2030' : '#2a2230') : w.out ? '#18141c' : '#2a2230');
        models[i].update(dt, { speed: 0, stunned: w.out, happy: s.endAt !== undefined && !w.out });
      });
      crates.instanceMatrix.needsUpdate = true;
      if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
      ghosts.instanceMatrix.needsUpdate = true;
      for (const c of s.clears) {
        const i = s.wells.findIndex((w) => w.id === c.id);
        for (const y of c.rows) fx.sparkle(cellPos(i, WELL_W / 2 - 0.5, y).setZ(0.6), c.rows.length > 1 ? '#ffd23f' : '#ffffff', 8 + c.rows.length * 4);
        if (c.rows.length > 1) sfx.bell();
        else sfx.coin();
      }
      for (const j of s.junked) {
        const i = s.wells.findIndex((w) => w.id === j.to);
        if (i >= 0) fx.dust(cellPos(i, WELL_W / 2, 0).setZ(0.6), 1.2);
        sfx.bump();
      }
      for (const id of s.locks) void id;
      for (const id of s.outs) {
        const i = s.wells.findIndex((w) => w.id === id);
        if (i >= 0) fx.blast(cellPos(i, WELL_W / 2, WELL_H - 2).setZ(0.6), 1.4);
        sfx.lose();
        shake(0.12);
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.wells.map((w, i) => {
        const p = who(players, w.id);
        return {
          id: w.id,
          pos: origin[i].clone().add(new THREE.Vector3(wellW / 2, wellH + 0.5, 0)),
          text: p?.name ?? '',
          color: p?.color,
          sub: w.out ? 'OUT' : w.pending ? `${w.lines} rows · +${w.pending} junk!` : `${w.lines} rows`,
          subColor: w.out ? '#ff5a5f' : w.pending ? '#ff9f1c' : '#ffd23f',
        };
      });
    },
  };
}

/* ---------------------------------------------------------------- Spark Trails */

export function sparkTrailsView(env: THREE.Texture, state: SparkState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#06051a', skyBottom: '#1a1040', fog: ['#0d0a24', 40, 120], sunColor: '#a8b8ff', sunIntensity: 0.7, shadowSize: 30 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  const C = SCELL * PX;
  const gw = state.gw, gh = state.gh;
  const W = gw * C, H = gh * C;
  const x0 = -W / 2, z0 = -H / 2;
  frameRect(camera, 640 - (gw * SCELL) / 2, 640 + (gw * SCELL) / 2, 360 - (gh * SCELL) / 2, 360 + (gh * SCELL) / 2, 1.05, 0.95);
  // a dark floor with a faint glowing grid
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g2 = cv.getContext('2d')!;
  g2.fillStyle = '#120e2a';
  g2.fillRect(0, 0, 64, 64);
  g2.strokeStyle = '#3a2f7a';
  g2.lineWidth = 2;
  g2.strokeRect(0, 0, 64, 64);
  const gridTex = new THREE.CanvasTexture(cv);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(gw / 4, gh / 4);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  ground(scene, W, H, 0, 0, new THREE.MeshStandardMaterial({ map: gridTex, emissiveMap: gridTex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.6 }), 0.01);
  ground(scene, 200, 200, 0, 0, toy('#07061a', 1), -0.02);
  // glowing walls round the edge
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ff3fa4', emissive: '#ff3fa4', emissiveIntensity: 1.2 });
  for (const [w, d, x, z] of [[W + 0.4, 0.2, 0, z0 - 0.1], [W + 0.4, 0.2, 0, -z0 + 0.1], [0.2, H, x0 - 0.1, 0], [0.2, H, -x0 + 0.1, 0]] as const) {
    const m = mesh(new THREE.BoxGeometry(w, 0.5, d), wallMat, { cast: false });
    m.position.set(x, 0.25, z);
    scene.add(m);
  }
  for (let i = 0; i < 8; i++) place(scene, ['space/crater', 'space/rock_crystals', 'space/meteor'][i % 3], (i - 3.5) * 8, 0, z0 - 6 - (i % 2) * 3, { s: 3 });
  // trails: one instanced mesh of glowing wall blocks, coloured by rider
  const trails = new THREE.InstancedMesh(new THREE.BoxGeometry(C * 1.02, 0.42, C * 1.02), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.4 }), gw * gh);
  trails.count = 0;
  scene.add(trails);
  const colors = state.riders.map((r) => new THREE.Color(colorOf(players, r.id)));
  const drawn = state.riders.map(() => 0);
  const m4 = new THREE.Matrix4();
  const cellAt = (i: number) => new THREE.Vector3(x0 + ((i % gw) + 0.5) * C, 0.21, z0 + (Math.floor(i / gw) + 0.5) * C);
  const riders = state.riders.map((r) => {
    const g = new THREE.Group();
    const m = new ChoppyModel(colorOf(players, r.id), 0.42);
    m.group.position.y = 0.18;
    const board = mesh(new THREE.BoxGeometry(0.42, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: colorOf(players, r.id), emissive: colorOf(players, r.id), emissiveIntensity: 0.9 }));
    board.position.y = 0.1;
    const light = new THREE.PointLight(colorOf(players, r.id), 6, 3.5);
    light.position.y = 0.6;
    g.add(m.group, board, light);
    scene.add(g);
    return { g, m };
  });
  const fx = new Fx(scene);
  let last = state;
  const DIR_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
  const headPos = (r: SparkState['riders'][number]) => {
    const p = cellAt(r.y * gw + r.x);
    if (r.out) return p;
    const d = Math.min(1, r.prog);
    p.x += [1, 0, -1, 0][r.want !== (r.dir + 2) % 4 ? r.dir : r.dir] * d * C;
    p.z += [0, 1, 0, -1][r.dir] * d * C;
    return p;
  };
  return {
    scene,
    camera,
    update(s: SparkState, _p, t, dt) {
      last = s;
      s.riders.forEach((r, i) => {
        while (drawn[i] < r.trail.length) {
          m4.makeTranslation(cellAt(r.trail[drawn[i]]));
          const k = trails.count++;
          trails.setMatrixAt(k, m4);
          trails.setColorAt(k, colors[i]);
          drawn[i]++;
          trails.instanceMatrix.needsUpdate = true;
          if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
        }
        const v = riders[i];
        v.g.visible = !r.out;
        const p = headPos(r);
        v.g.position.set(p.x, 0, p.z);
        v.g.rotation.y = DIR_YAW[r.dir];
        if (r.boost > 0 && Math.random() < dt * 30) fx.emit(p.clone().setY(0.3), { color: [colors[i].getStyle(), '#ffffff'], n: 1, speed: [0.2, 0.6], life: [0.2, 0.35], size: [0.35, 0], additive: true });
        v.m.update(dt, { speed: 0.4, happy: s.endAt !== undefined && !r.out });
      });
      for (const c of s.crashes) {
        const i = s.riders.findIndex((r) => r.id === c.id);
        const r = s.riders[i];
        const at = cellAt(r.y * gw + r.x).setY(0.5);
        fx.blast(at, 0.9);
        fx.sparkle(at, colors[i], 12);
        sfx.boom();
        shake(0.1);
      }
      void t;
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.riders
        .filter((r) => !r.out)
        .map((r) => {
          const p = who(players, r.id);
          return { id: r.id, pos: headPos(r).setY(1.4), text: p?.name ?? '', color: p?.color };
        });
    },
  };
}
