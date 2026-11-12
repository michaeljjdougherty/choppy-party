import * as THREE from 'three';
import { glowDisc, groundFog, lampGlow, onTop, softShadowMat } from '../look/fxKit';
import type { PlayerInfo } from '../../../shared/types';
import { yardSize, type ZombieState } from '../../../shared/games/zombieTag';
import { BURST, type ChiliState, type Pepper } from '../../../shared/games/chiliChallenge';
import { BALL_R, type MoonState } from '../../../shared/games/moonball';
import { bpmAt, songT, type ShantyState } from '../../../shared/games/shantyShuffle';
import { beltR, beltXY, DISHES, type Dish, type SushiState } from '../../../shared/games/sushiBelt';
import { COUCH_L, LANE_H, LANE_W, ROUTE, RUG, TABLES, TRUCK, WALLS, type MovingState } from '../../../shared/games/movingDay';
import { place, texture } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, checkerTexture, frameRect, makeScene, mesh, toy, wx, wz, yaw } from '../kit';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { crew, fitProp, pool } from './crew';
import { TEAM_COLORS } from './teams';

const who = (players: PlayerInfo[], id: string) => players.find((p) => p.id === id);

function floor(scene: THREE.Scene, w: number, d: number, cz: number, mat: THREE.Material): THREE.Mesh {
  const f = mesh(new THREE.PlaneGeometry(w, d), mat, { cast: false, receive: true });
  f.rotation.x = -Math.PI / 2;
  f.position.set(0, 0, cz);
  scene.add(f);
  return f;
}

function tint(o: THREE.Object3D, color: THREE.ColorRepresentation): THREE.Object3D {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.color.set(color);
    m.material = mat;
  });
  return o;
}

/* ---------------------------------------------------------------- Zombie Tag */

export function zombieView(env: THREE.Texture, state: ZombieState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#0d1424', skyBottom: '#2b3a4a', fog: ['#22303c', 26, 70], sunColor: '#a8c8ff', sunIntensity: 1.3, shadowSize: 28 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const { w, h } = yardSize(state.walkers.length);
  const x0 = 640 - w / 2, x1 = 640 + w / 2, y0 = 400 - h / 2, y1 = 400 + h / 2;
  frameRect(camera, x0 - 30, x1 + 30, y0 - 20, y1 + 20, 0.92);
  floor(scene, 120, 90, wz(400), new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', 40, 30), color: '#4a6a4a', roughness: 1 }));
  const yard = mesh(new THREE.PlaneGeometry(w * PX, h * PX), new THREE.MeshStandardMaterial({ map: texture('floor_ground_dirt', (w * PX) / 3, (h * PX) / 3), color: '#6a6458', roughness: 1 }), { cast: false, receive: true });
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0.01, wz(400));
  scene.add(yard);
  // an iron fence round the yard, with lamp posts at the corners
  const fenceLen = 1.9;
  for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]]) {
    const len = Math.hypot(bx - ax, by - ay) * PX;
    const n = Math.max(1, Math.round(len / fenceLen));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const f = fitProp('graveyard/iron-fence', len / n, 'x');
      f.position.set(wx(ax + (bx - ax) * u), 0, wz(ay + (by - ay) * u));
      f.rotation.y = ax === bx ? Math.PI / 2 : 0;
      scene.add(f);
    }
  }
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) onTop(place(scene, 'graveyard/lightpost-single', wx(x), 0, wz(y), { s: 2.2 }), lampGlow('#ffb35c', 1.6), 0.88);
  const lights: THREE.PointLight[] = [];
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    const l = new THREE.PointLight('#ffb35c', 30, 20);
    l.position.set(wx(x), 3.4, wz(y));
    scene.add(l);
    lights.push(l);
  }
  // the graves: the same stones the sim blocks with
  const stones = ['graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-bevel', 'graveyard/gravestone-decorative'];
  for (const g of state.graves) {
    const o = fitProp(stones[g.kind % stones.length], 1.2, 'xz');
    o.position.set(wx(g.x), 0, wz(g.y));
    o.rotation.y = (g.kind - 1.5) * 0.15;
    scene.add(o);
  }
  // spooky trees and a crypt behind the yard
  place(scene, 'graveyard/crypt', 0, 0, wz(y0) - 4, { s: 3.2 });
  for (let i = 0; i < 8; i++) place(scene, i % 2 ? 'graveyard/pine-crooked' : 'graveyard/pine-fall', wx(x0) - 3 + (i % 4) * ((wx(x1) - wx(x0) + 6) / 3), 0, wz(y0) - 3 - (i >> 2) * 3, { s: 2.6 });
  scene.add(groundFog([wx(x0) - 6, wz(y0) - 4, wx(x1) + 6, wz(y1) + 4], { count: 20, opacity: 0.45, color: '#c8ffd0' }));
  const fx = new Fx(scene);
  const team = crew(scene, players, state.walkers, fx);
  // a green glow under every zombie
  const auras = pool(scene, () => glowDisc('#6aff5a', 0.95, 0.7));
  let last = state;
  return {
    scene,
    camera,
    update(s: ZombieState, _p, t, dt) {
      last = s;
      lights.forEach((l, i) => (l.intensity = 26 + Math.sin(t * 7 + i * 3) * 4 + (Math.random() < 0.02 ? -15 : 0)));
      for (const turned of s.turned) {
        const at = new THREE.Vector3(wx(turned.x), 1, wz(turned.y));
        fx.emit(at, { n: 18, color: '#6aff5a', speed: [2, 5], size: [0.35, 0], life: [0.4, 0.9], up: 2 });
        fx.bonk(at);
        sfx.lose();
        shake(0.12);
      }
      auras.begin();
      for (const w of s.walkers) {
        if (!w.zombie) continue;
        const a = auras.take();
        a.position.set(wx(w.x), 0.03, wz(w.y));
        a.scale.setScalar(1 + Math.sin(t * 6 + w.x) * 0.08);
      }
      fx.update(dt);
      team.update(s.walkers, dt, (r) => {
        const w = r as ZombieState['walkers'][number];
        return { stunned: w.stun > 0, happy: s.endAt !== undefined && !w.zombie };
      });
      // zombies shamble: a slow sway
      for (const w of s.walkers) {
        const m = team.models.get(w.id);
        if (m && w.zombie) m.group.rotation.z = Math.sin(t * 5 + w.y) * 0.12;
        else if (m) m.group.rotation.z = 0;
      }
    },
    tags(): Tag[] {
      return team.tags(last.walkers, 2.35, (r) => ((r as ZombieState['walkers'][number]).zombie ? '🧟 ZOMBIE' : undefined));
    },
  };
}

/* ---------------------------------------------------------------- Chili Challenge */

const PEPPER_COLOR: Record<Pepper, string> = { green: '#45c23a', red: '#e8322a', gold: '#ffc21a' };

export function chiliView(env: THREE.Texture, state: ChiliState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#ffb36b', skyBottom: '#fff0d6', fog: ['#ffe2bd', 40, 110], sunColor: '#fff2dc', shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  const n = state.eaters.length;
  const gap = Math.min(2.6, 22 / n);
  const span = n * gap;
  camera.position.set(0, 5.8 + span * 0.12, 11 + span * 0.42);
  camera.lookAt(0, 1.4, 0);
  floor(scene, 90, 60, 0, new THREE.MeshStandardMaterial({ map: texture('floor_tiles_tan_small', 30, 20), color: '#e9cfa8', roughness: 0.8 }));
  // a long cook-off table with a red checked cloth, and a banner behind
  const cloth = checkerTexture('#d83a2c', '#fff4e0', 2, 64);
  cloth.repeat.set(span, 2);
  const table = mesh(new THREE.BoxGeometry(span + 1.6, 0.18, 1.8), new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.8 }), { receive: true });
  table.position.set(0, 1.1, 0.6);
  scene.add(table);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), toy('#7a4a26', 0.7));
      leg.position.set(sx * (span / 2 + 0.6), 0.55, 0.6 + sz * 0.7);
      scene.add(leg);
    }
  const banner = mesh(new THREE.BoxGeometry(span + 4, 1.4, 0.1), toy('#ffb000', 0.6));
  banner.position.set(0, 5.6, -4.5);
  scene.add(banner);
  for (const x of [-(span / 2 + 2), span / 2 + 2]) {
    const pole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.2, 8), toy('#8a5a30', 0.6));
    pole.position.set(x, 3.1, -4.5);
    scene.add(pole);
  }
  for (let i = 0; i < 9; i++) {
    const chili = fitProp('food/pepper', 0.9, 'max');
    chili.position.set(-(span / 2) + (i + 0.5) * ((span + 2) / 9), 4.6, -4.4);
    chili.rotation.z = 0.5;
    scene.add(chili);
  }
  const fx = new Fx(scene);
  interface Seat {
    x: number;
    model: ChoppyModel;
    peppers: THREE.Object3D[];
    meter: THREE.Mesh;
    meterMat: THREE.MeshStandardMaterial;
    chew: number;
    shown: number;
  }
  const seats = new Map<string, Seat>();
  state.eaters.forEach((e, i) => {
    const x = (i - (n - 1) / 2) * gap;
    const model = new ChoppyModel(who(players, e.id)?.color ?? '#fff', 0.8);
    model.group.position.set(x, 0, -0.6);
    scene.add(model.group);
    const bowl = fitProp('food/bowl', 1.1, 'xz');
    bowl.position.set(x, 1.19, 0.9);
    scene.add(bowl);
    // the bowl's peppers, all the same dull colour until bitten (no peeking!)
    const peppers: THREE.Object3D[] = [];
    for (let k = 0; k < e.bowl.length; k++) {
      const p = tint(fitProp('food/pepper', 0.36, 'max'), '#b04a3a');
      const a = k * 2.4, r = 0.12 + (k % 3) * 0.1;
      p.position.set(x + Math.cos(a) * r, 1.42 + Math.floor(k / 5) * 0.08, 0.9 + Math.sin(a) * r * 0.8);
      p.rotation.set(Math.random(), Math.random() * 6, Math.random());
      scene.add(p);
      peppers.push(p);
    }
    // a heat thermometer beside each seat
    const tube = mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
    tube.position.set(x + gap * 0.36, 2.1, 0.9);
    scene.add(tube);
    const meterMat = toy('#45c23a', 0.3);
    meterMat.emissive = new THREE.Color('#401000');
    const meter = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 12), meterMat);
    meter.position.set(x + gap * 0.36, 1.3, 0.9);
    scene.add(meter);
    seats.set(e.id, { x, model, peppers, meter, meterMat, chew: 0, shown: e.bowl.length });
  });
  let last = state;
  return {
    scene,
    camera,
    update(s: ChiliState, _p, t, dt) {
      last = s;
      for (const b of s.bites) {
        const st = seats.get(b.id)!;
        st.chew = 0.4;
        fx.emit(new THREE.Vector3(st.x, 2.4, -0.2), { n: b.pepper === 'gold' ? 22 : 10, color: PEPPER_COLOR[b.pepper], speed: [1.5, 4], size: [0.3, 0], life: [0.3, 0.7], up: 2 });
        sfx.plate();
        if (b.pepper === 'gold') shake(0.12);
      }
      for (const id of s.bursts) {
        const st = seats.get(id)!;
        fx.blast(new THREE.Vector3(st.x, 2.2, -0.4), 2);
        fx.emit(new THREE.Vector3(st.x, 2.6, -0.4), { n: 30, color: '#ff6a1a', speed: [3, 7], size: [0.5, 0], life: [0.5, 1.1], up: 3 });
        sfx.boom();
        shake(0.35);
      }
      fx.update(dt);
      for (const e of s.eaters) {
        const st = seats.get(e.id)!;
        st.chew = Math.max(0, st.chew - dt);
        // peppers vanish from the bowl as they're eaten
        while (st.shown > e.bowl.length) st.peppers[--st.shown].visible = false;
        const k = Math.min(1, e.heat / BURST);
        st.meter.scale.y = Math.max(0.02, k * 1.5);
        st.meter.position.y = 1.35 + (k * 1.5) / 2;
        st.meterMat.color.setRGB(0.3 + k * 0.7, 0.8 - k * 0.65, 0.2 - k * 0.15);
        st.meterMat.emissive.setRGB(k * 0.5, k * 0.05, 0);
        // steam off the hot heads
        if (!e.burst && k > 0.55 && Math.random() < dt * 14 * k) fx.emit(new THREE.Vector3(st.x + (Math.random() - 0.5) * 0.4, 2.7, -0.6), { n: 1, color: '#ffffff', speed: [0.5, 1.5], size: [0.35, 0.8], life: [0.6, 1], up: 2 });
        st.model.update(dt, { stunned: e.burst, happy: e.locked && !e.burst, jump: st.chew > 0 ? Math.sin((st.chew / 0.4) * Math.PI) * 0.15 : 0, t });
        st.model.group.rotation.z = !e.burst && k > 0.75 ? Math.sin(t * 30) * 0.05 * k : 0;
      }
    },
    tags(): Tag[] {
      return last.eaters.map((e) => {
        const st = seats.get(e.id)!;
        const p = who(players, e.id);
        return {
          pos: new THREE.Vector3(st.x, 3.3, -0.6),
          text: p?.name ?? '',
          color: p?.color,
          sub: e.burst ? 'BURST!' : `${e.eaten} 🌶  ${Math.round(e.heat)}°${e.locked ? ' ✔' : ''}`,
          subColor: e.burst ? '#ff5a3a' : e.heat > 70 ? '#ffb000' : '#ffffff',
        };
      });
    },
  };
}

/* ---------------------------------------------------------------- Moonball */

export function moonView(env: THREE.Texture, state: MoonState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#05060f', skyBottom: '#1a1d3a', fog: ['#10132a', 50, 120], sunColor: '#ffffff', sunIntensity: 2.2, shadowSize: 28 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 260);
  const x0 = 640 - state.w / 2, x1 = 640 + state.w / 2, y0 = 400 - state.h / 2, y1 = 400 + state.h / 2;
  frameRect(camera, x0 - 70, x1 + 70, y0 - 20, y1 + 10, 0.95);
  floor(scene, 140, 100, wz(400), new THREE.MeshStandardMaterial({ map: texture('floor_ground_sand', 40, 30), color: '#9a9aa8', roughness: 1 }));
  // pitch markings
  const line = toy('#f4f4ff', 0.6);
  const markings: [number, number, number, number][] = [
    [640, y0, state.w, 4], [640, y1, state.w, 4], [x0, 400, 4, state.h], [x1, 400, 4, state.h], [640, 400, 4, state.h],
  ];
  for (const [x, y, ww, hh] of markings) {
    const m = mesh(new THREE.BoxGeometry(ww * PX, 0.03, hh * PX), line, { cast: false });
    m.position.set(wx(x), 0.02, wz(y));
    scene.add(m);
  }
  const ring = mesh(new THREE.RingGeometry(2.1, 2.22, 48), line, { cast: false });
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, wz(400));
  scene.add(ring);
  // crater goals: a glowing arch in each team's colour over a big crater
  for (const side of [-1, 1]) {
    const team = side > 0 ? 1 : 0; // the right-hand goal is Blue's to defend
    const gx = wx(side > 0 ? x1 : x0);
    place(scene, 'space/craterLarge', gx + side * 1.2, -0.05, wz(400), { s: 3.2 });
    const col = TEAM_COLORS[team];
    const arch = mesh(new THREE.TorusGeometry(state.mouth * PX, 0.16, 10, 32, Math.PI), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9 }));
    arch.position.set(gx, 0, wz(400));
    arch.rotation.y = Math.PI / 2;
    scene.add(arch);
    const glow = mesh(new THREE.PlaneGeometry(2.4, state.mouth * 2 * PX), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(gx + side * 1.2, 0.04, wz(400));
    scene.add(glow);
  }
  for (const [nm, x, z, s] of [
    ['space/crater', -9, wz(y0) - 3, 2], ['space/rock_crystalsLargeA', 12, wz(y0) - 4, 2.4], ['space/hangar_roundGlass', -14, wz(y0) - 6, 3.2],
    ['space/satelliteDish_large', 6, wz(y0) - 6, 3], ['space/rover', 15, wz(y1) + 3, 1.8], ['space/rocket_baseA', -17, wz(y0) - 3, 2.4],
  ] as [string, number, number, number][])
    place(scene, nm, x, 0, z, { s });
  // the Earth hanging in the sky
  const earth = mesh(new THREE.SphereGeometry(5, 32, 24), new THREE.MeshStandardMaterial({ color: '#3f8cff', emissive: '#0b2a66', roughness: 0.6 }), { cast: false });
  earth.position.set(-18, 22, -45);
  scene.add(earth);
  // the ball: big, striped and bouncy
  const ballTex = checkerTexture('#ffffff', '#ff4fa3', 4, 128);
  const ball = mesh(new THREE.SphereGeometry(BALL_R * PX, 32, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
  scene.add(ball);
  const shadow = mesh(new THREE.PlaneGeometry((BALL_R * PX) * 2.4, (BALL_R * PX) * 2.4), softShadowMat(0.48), { cast: false });
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const fx = new Fx(scene);
  const team = crew(scene, players, state.astros, fx);
  // team rings under each astronaut
  for (const a of state.astros) {
    const m = team.models.get(a.id);
    if (!m) continue;
    const r = mesh(new THREE.RingGeometry(0.62, 0.78, 24), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[a.team], transparent: true, opacity: 0.8 }), { cast: false });
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.04;
    m.group.add(r);
  }
  let goalSeen = -1;
  let last = state;
  return {
    scene,
    camera,
    update(s: MoonState, _p, _t, dt) {
      last = s;
      const b = s.ball;
      ball.position.set(wx(b.x), BALL_R * PX + b.z * PX, wz(b.y));
      ball.rotation.z -= (b.vx * PX * dt) / (BALL_R * PX);
      ball.rotation.x += (b.vy * PX * dt) / (BALL_R * PX);
      shadow.position.set(wx(b.x), 0.03, wz(b.y));
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 / (1 + b.z / 120);
      for (const k of s.kicks) {
        const a = s.astros.find((q) => q.id === k.id);
        if (a) fx.dust(new THREE.Vector3(wx(a.x), 0.3, wz(a.y)), 1);
        sfx.bump();
      }
      if (s.goalAt >= 0 && s.goalAt !== goalSeen) {
        goalSeen = s.goalAt;
        const at = new THREE.Vector3(wx(b.x), 1.5, wz(b.y));
        fx.party(at);
        fx.emit(at, { n: 40, color: TEAM_COLORS[s.goalBy], speed: [4, 9], size: [0.5, 0], life: [0.6, 1.2], up: 4 });
        sfx.cheer();
        shake(0.3);
      }
      fx.update(dt);
      team.update(s.astros, dt, (r) => {
        const a = r as MoonState['astros'][number];
        return { happy: s.goalAt >= 0 && a.team === s.goalBy };
      });
    },
    tags(): Tag[] {
      return team.tags(last.astros, 2.35);
    },
  };
}

/* ---------------------------------------------------------------- Shanty Shuffle */

export function shantyView(env: THREE.Texture, state: ShantyState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#5fb8ff', skyBottom: '#fff1d8', fog: ['#cfe8ff', 45, 130], shadowSize: 26 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const n = state.sailors.length;
  const gap = Math.min(3, 26 / n);
  const span = n * gap;
  camera.position.set(0, 6.5 + span * 0.12, 13 + span * 0.45);
  camera.lookAt(0, 3, 0);
  const sea = mesh(new THREE.CircleGeometry(140, 64), new THREE.MeshStandardMaterial({ color: '#1b7fd1', roughness: 0.25, metalness: 0.1 }), { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.4;
  scene.add(sea);
  const ship = new THREE.Group();
  scene.add(ship);
  const deck = mesh(new THREE.BoxGeometry(span + 4, 0.5, 6), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks_wide', (span + 4) / 2, 3), color: '#d9a46a', roughness: 0.85 }), { receive: true });
  deck.position.set(0, -0.25, 0);
  ship.add(deck);
  const hull = mesh(new THREE.BoxGeometry(span + 4.4, 1.6, 6.4), toy('#6a3b1c', 0.8));
  hull.position.set(0, -1.1, 0);
  ship.add(hull);
  const rail = mesh(new THREE.BoxGeometry(span + 4, 0.14, 0.14), toy('#8a5530', 0.7));
  rail.position.set(0, 0.85, 2.9);
  ship.add(rail);
  place(scene, 'pirate/ship-pirate-large', 22, -1.4, -30, { s: 3, ry: 0.8 });
  place(scene, 'pirate/tower-complete-small', -26, -1.4, -24, { s: 2.6 });
  interface Station {
    x: number;
    model: ChoppyModel;
    sail: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    hop: number;
    lastFlash: number;
  }
  const stations = new Map<string, Station>();
  state.sailors.forEach((p, i) => {
    const x = (i - (n - 1) / 2) * gap;
    const col = who(players, p.id)?.color ?? '#fff';
    const mast = mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.6, 8), toy('#7a4a26', 0.7));
    mast.position.set(x, 3.3, -1.2);
    ship.add(mast);
    const yard = mesh(new THREE.CylinderGeometry(0.06, 0.06, gap * 0.8, 6), toy('#7a4a26', 0.7));
    yard.rotation.z = Math.PI / 2;
    yard.position.set(x, 6.3, -1.15);
    ship.add(yard);
    // the sail hangs from the yard and grows downward as it's hoisted
    const mat = new THREE.MeshStandardMaterial({ color: '#fff8ea', side: THREE.DoubleSide, roughness: 0.9 });
    const sail = mesh(new THREE.PlaneGeometry(gap * 0.74, 1), mat);
    sail.position.set(x, 6.2, -1.05);
    ship.add(sail);
    const stripe = mesh(new THREE.PlaneGeometry(gap * 0.74, 0.16), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }), { cast: false });
    stripe.position.set(0, 0, 0.01);
    sail.add(stripe);
    const model = new ChoppyModel(col, 0.8);
    model.group.position.set(x, 0, 1.2);
    ship.add(model.group);
    stations.set(p.id, { x, model, sail, mat, hop: 0, lastFlash: -1 });
  });
  const fx = new Fx(scene);
  let nextBeat = 1.0;
  let beatN = 0;
  let last = state;
  return {
    scene,
    camera,
    update(s: ShantyState, _p, t, dt) {
      last = s;
      const now = songT(s);
      // the backing tune keeps the same clock as the notes
      if (now < 0) {
        nextBeat = 1.0;
        beatN = 0;
      }
      while (now >= nextBeat && now < 41) {
        sfx.shantyBeat(beatN++);
        nextBeat += 60 / bpmAt(nextBeat);
      }
      ship.rotation.z = Math.sin(t * 0.9) * 0.025;
      ship.position.y = Math.sin(t * 1.3) * 0.08;
      const top = Math.max(40, ...s.sailors.map((p) => p.sail)) * 1.1;
      for (const p of s.sailors) {
        const st = stations.get(p.id)!;
        const k = Math.max(0.04, Math.min(1, p.sail / top));
        const hgt = 0.2 + k * 4.6;
        st.sail.scale.y += (hgt - st.sail.scale.y) * Math.min(1, dt * 8);
        st.sail.position.y = 6.2 - st.sail.scale.y / 2;
        st.sail.rotation.y = Math.sin(t * 2 + st.x) * 0.06;
        if (p.flash && p.flash.at !== st.lastFlash) {
          st.lastFlash = p.flash.at;
          const good = p.flash.judge === 'perfect' || p.flash.judge === 'good';
          if (good) st.hop = 0.25;
          if (p.flash.judge === 'perfect') fx.sparkle(new THREE.Vector3(st.x, 2.6, 1.2), '#ffe066', 6);
          const human = !who(players, p.id)?.bot;
          if (human) {
            if (good) sfx.hit(p.flash.judge === 'perfect');
            else sfx.miss();
          }
        }
        st.hop = Math.max(0, st.hop - dt);
        st.model.update(dt, { jump: st.hop > 0 ? Math.sin((st.hop / 0.25) * Math.PI) * 0.3 : 0, happy: now > 40 && p.sail === Math.max(...s.sailors.map((q) => q.sail)), t });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.sailors.map((p) => {
        const st = stations.get(p.id)!;
        const pl = who(players, p.id);
        const f = p.flash && songT(last) - p.flash.at < 0.5 ? p.flash.judge : null;
        return {
          pos: new THREE.Vector3(st.x, -0.45, 1.2).applyMatrix4(ship.matrixWorld),
          text: pl?.name ?? '',
          color: pl?.color,
          sub: f === 'perfect' ? 'PERFECT!' : f === 'good' ? 'Good' : f === 'miss' ? 'Miss' : f === 'oops' ? 'Oops' : `${p.sail}`,
          subColor: f === 'perfect' ? '#ffe066' : f === 'miss' || f === 'oops' ? '#ff8a8a' : '#ffffff',
        };
      });
    },
  };
}

/* ---------------------------------------------------------------- Sushi Belt */

const DISH_PROP: Record<Dish, string> = {
  'salmon-roll': 'food/maki-salmon',
  'roe-roll': 'food/maki-roe',
  'veggie-roll': 'food/maki-vegetable',
  'salmon-nigiri': 'food/sushi-salmon',
  'egg-nigiri': 'food/sushi-egg',
};

export function sushiView(env: THREE.Texture, state: SushiState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#3a2a2a', skyBottom: '#8a5a4a', fog: ['#3a2a2a', 40, 100], sunColor: '#fff0dc', sunIntensity: 1.8, shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const { rx, ry } = beltR(state.diners.length);
  frameRect(camera, 640 - rx - 110, 640 + rx + 110, 400 - ry - 110, 400 + ry + 90, 1.0);
  floor(scene, 90, 60, wz(400), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 30, 20), color: '#b98a5e', roughness: 0.8 }));
  // the counter: an oval of pale wood with the belt running round its top
  const oval = (r: number, sx: number, sz: number) => {
    const g = new THREE.CylinderGeometry(r, r, 1, 64);
    g.scale(sx, 1, sz);
    return g;
  };
  const counter = mesh(oval(1, (rx + 46) * PX, (ry + 46) * PX), toy('#e8d2a8', 0.6), { receive: true });
  counter.scale.y = 1.1;
  counter.position.set(0, 0.55, wz(400));
  scene.add(counter);
  const beltTop = mesh(oval(1, (rx + 26) * PX, (ry + 26) * PX), toy('#3a3a44', 0.5), { receive: true });
  beltTop.scale.y = 0.08;
  beltTop.position.set(0, 1.14, wz(400));
  scene.add(beltTop);
  const inner = mesh(oval(1, (rx - 26) * PX, (ry - 26) * PX), toy('#f2e0bc', 0.6), { receive: true });
  inner.scale.y = 0.3;
  inner.position.set(0, 1.22, wz(400));
  scene.add(inner);
  // the chef's hatch at the top of the loop and a few lanterns
  const hatch = mesh(new THREE.BoxGeometry(3, 2.4, 0.4), toy('#7a2a2a', 0.6));
  const [hx, hy] = beltXY(state, 0);
  hatch.position.set(wx(hx), 2.3, wz(hy) - 1.4);
  scene.add(hatch);
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const l = mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff4a3a', emissive: '#ff3a1a', emissiveIntensity: 0.8 }), { cast: false });
    l.position.set(-(rx * PX) + (i * 2 * rx * PX) / 5, 6, wz(400 - ry) - 2);
    scene.add(l);
    lamps.push(l);
  }
  // plates: a little pool of plate + sushi pairs, re-dressed every frame
  const plates = state.plates.map(() => {
    const g = new THREE.Group();
    const plate = fitProp('food/plate', 0.8, 'xz');
    g.add(plate);
    const dishes = new Map<Dish, THREE.Object3D>();
    for (const d of DISHES) {
      const o = fitProp(DISH_PROP[d], 0.5, 'xz');
      o.position.y = 0.06;
      o.visible = false;
      g.add(o);
      dishes.set(d, o);
    }
    scene.add(g);
    return { g, dishes };
  });
  const fx = new Fx(scene);
  interface Seat {
    model: ChoppyModel;
    held: Map<Dish, THREE.Object3D>;
    stool: THREE.Object3D;
  }
  const seats = new Map<string, Seat>();
  for (const d of state.diners) {
    const model = new ChoppyModel(who(players, d.id)?.color ?? '#fff', 0.75);
    scene.add(model.group);
    const held = new Map<Dish, THREE.Object3D>();
    for (const k of DISHES) {
      const o = fitProp(DISH_PROP[k], 0.55, 'xz');
      o.visible = false;
      scene.add(o);
      held.set(k, o);
    }
    const stool = mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 16), toy('#c43a3a', 0.5));
    scene.add(stool);
    seats.set(d.id, { model, held, stool });
  }
  const outward = (u: number, push: number): [number, number] => {
    const [x, y] = beltXY(state, u);
    const a = Math.atan2((y - 400) / ry, (x - 640) / rx);
    return [x + Math.cos(a) * push, y + Math.sin(a) * push];
  };
  let last = state;
  return {
    scene,
    camera,
    update(s: SushiState, _p, t, dt) {
      last = s;
      s.plates.forEach((p, i) => {
        const v = plates[i];
        v.g.visible = p.gone <= 0;
        if (!v.g.visible) return;
        const [x, y] = beltXY(s, p.u);
        v.g.position.set(wx(x), 1.24, wz(y));
        for (const [d, o] of v.dishes) o.visible = d === p.dish;
      });
      for (const g of s.grabs) {
        const d = s.diners.find((q) => q.id === g.id)!;
        const [x, y] = beltXY(s, d.u);
        const at = new THREE.Vector3(wx(x), 1.6, wz(y));
        if (g.ok) {
          fx.sparkle(at, '#ffe066', 8);
          sfx.gem();
        } else {
          fx.bonk(at);
          sfx.miss();
        }
      }
      for (const id of s.done) {
        const d = s.diners.find((q) => q.id === id)!;
        const [x, y] = outward(d.u, 60);
        fx.party(new THREE.Vector3(wx(x), 2.5, wz(y)));
        sfx.bell();
      }
      lamps.forEach((l, i) => (l.position.y = 6 + Math.sin(t * 1.5 + i) * 0.1));
      fx.update(dt);
      for (const d of s.diners) {
        const st = seats.get(d.id)!;
        const [sx, sy] = outward(d.u, 74);
        const face = Math.atan2(400 - sy, 640 - sx);
        st.model.group.position.set(wx(sx), 0.55, wz(sy));
        st.model.group.rotation.y = yaw(face);
        st.stool.position.set(wx(sx), 0.35, wz(sy));
        for (const [k, o] of st.held) {
          o.visible = d.held === k;
          if (o.visible) o.position.set(wx(sx) + Math.sin(t * 30) * 0.05, 2.5, wz(sy));
        }
        st.model.update(dt, { stunned: !!d.held, happy: s.done.includes(d.id), t });
      }
    },
    tags(): Tag[] {
      return last.diners.map((d) => {
        const p = who(players, d.id);
        const [sx, sy] = outward(d.u, 74);
        return { pos: new THREE.Vector3(wx(sx), 3, wz(sy)), text: p?.name ?? '', color: p?.color, sub: `${d.tickets} 🎫`, subColor: '#ffffff' };
      });
    },
  };
}

/* ---------------------------------------------------------------- Moving Day */

export function movingView(env: THREE.Texture, state: MovingState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#eaf6ff', fog: ['#dff1ff', 50, 120], shadowSize: 30 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const [c0, c1] = state.crews;
  frameRect(camera, c0.ox - 10, c1.ox + LANE_W + 10, c0.oy - 10, c0.oy + LANE_H + 10, 1.08);
  floor(scene, 120, 90, wz(400), new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', 40, 30), color: '#8acb6a', roughness: 1 }));
  const wallMat = new THREE.MeshStandardMaterial({ map: texture('wall_timber', 2, 1), color: '#f4e2c6', roughness: 0.9 });
  const P = (c: { ox: number; oy: number }, x: number, y: number) => new THREE.Vector3(wx(c.ox + x), 0, wz(c.oy + y));
  interface Team {
    couch: THREE.Object3D;
    hands: Map<string, ChoppyModel>;
  }
  const teams: Team[] = [];
  for (const c of state.crews) {
    // indoor floor up to the front wall, a path from the truck, and the walls themselves
    const inside = mesh(new THREE.PlaneGeometry(LANE_W * PX, 400 * PX), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 7, 5), color: '#d9b080', roughness: 0.8 }), { cast: false, receive: true });
    inside.rotation.x = -Math.PI / 2;
    inside.position.copy(P(c, LANE_W / 2, 200)).setY(0.01);
    scene.add(inside);
    const path = mesh(new THREE.PlaneGeometry(LANE_W * PX, 140 * PX), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', 7, 2), color: '#cfc8bb', roughness: 0.9 }), { cast: false, receive: true });
    path.rotation.x = -Math.PI / 2;
    path.position.copy(P(c, LANE_W / 2, 470)).setY(0.012);
    scene.add(path);
    for (const w of WALLS) {
      const m = mesh(new THREE.BoxGeometry(w.w * PX, 1.5, w.h * PX), wallMat, { receive: true });
      m.position.copy(P(c, w.x + w.w / 2, w.y + w.h / 2)).setY(0.75);
      scene.add(m);
    }
    // the house's outline: low skirting so you can see where the rooms end
    for (const [x, y, ww, hh] of [[0, 0, LANE_W, 6], [0, 0, 6, 380], [LANE_W - 6, 0, 6, 380]]) {
      const m = mesh(new THREE.BoxGeometry(ww * PX, 0.5, hh * PX), wallMat);
      m.position.copy(P(c, x + ww / 2, y + hh / 2)).setY(0.25);
      scene.add(m);
    }
    const rug = mesh(new THREE.PlaneGeometry(RUG.w * PX, RUG.h * PX), toy(TEAM_COLORS[c.team], 0.95), { cast: false, receive: true });
    rug.rotation.x = -Math.PI / 2;
    rug.position.copy(P(c, RUG.x + RUG.w / 2, RUG.y + RUG.h / 2)).setY(0.03);
    scene.add(rug);
    const star = fitProp('furniture/lampRoundFloor', 1.6, 'y');
    star.position.copy(P(c, RUG.x + RUG.w + 6, RUG.y - 10));
    scene.add(star);
    const shelf = fitProp('furniture/bookcaseOpen', 1.8, 'x');
    shelf.position.copy(P(c, 470, 20));
    scene.add(shelf);
    const [t0, t1] = TABLES;
    const coffee = fitProp('furniture/tableCoffee', t0.w * PX, 'x');
    coffee.position.copy(P(c, t0.x + t0.w / 2, t0.y + t0.h / 2));
    scene.add(coffee);
    for (const [dx, dy, nm] of [[0.25, 0.3, 'furniture/cardboardBoxClosed'], [0.7, 0.35, 'furniture/cardboardBoxOpen'], [0.45, 0.75, 'furniture/cardboardBoxClosed']] as [number, number, string][]) {
      const b = fitProp(nm, 0.75, 'xz');
      b.position.copy(P(c, t1.x + t1.w * dx, t1.y + t1.h * dy));
      scene.add(b);
    }
    // the moving truck the couch starts beside
    const truck = mesh(new THREE.BoxGeometry(TRUCK.w * PX * 0.7, 2.2, TRUCK.h * PX * 0.8), toy('#ffffff', 0.5));
    truck.position.copy(P(c, TRUCK.x + TRUCK.w * 0.6, TRUCK.y + TRUCK.h * 0.75)).setY(1.4);
    scene.add(truck);
    const stripe = mesh(new THREE.BoxGeometry(TRUCK.w * PX * 0.71, 0.3, TRUCK.h * PX * 0.81), toy(TEAM_COLORS[c.team], 0.5));
    stripe.position.copy(truck.position).setY(1.1);
    scene.add(stripe);
    // the route, as faint footprints
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1];
      const steps = Math.floor(Math.hypot(bx - ax, by - ay) / 30);
      for (let k = 0; k < steps; k++) {
        const dot = mesh(new THREE.CircleGeometry(0.1, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }), { cast: false });
        dot.rotation.x = -Math.PI / 2;
        dot.position.copy(P(c, ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps)).setY(0.04);
        scene.add(dot);
      }
    }
    const couch = fitProp('furniture/loungeSofaLong', COUCH_L * PX * 1.02, 'x');
    const holder = new THREE.Group();
    holder.add(couch);
    scene.add(holder);
    const hands = new Map<string, ChoppyModel>();
    for (const q of state.carriers.filter((x) => x.team === c.team)) {
      const m = new ChoppyModel(who(players, q.id)?.color ?? '#fff', 0.7);
      scene.add(m.group);
      hands.set(q.id, m);
    }
    teams.push({ couch: holder, hands });
  }
  const fx = new Fx(scene);
  const prev = new Map<number, [number, number]>();
  let last = state;
  const spotOf = (c: MovingState['crews'][number], at: number, side: number): [number, number] => {
    const ax = c.a[0] + (c.b[0] - c.a[0]) * at, ay = c.a[1] + (c.b[1] - c.a[1]) * at;
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) || 1;
    // ends stand just past the arm, the middle ones beside it
    const nx = -(c.b[1] - c.a[1]) / len, ny = (c.b[0] - c.a[0]) / len;
    const along = at <= 0 ? -16 : at >= 1 ? 16 : 0;
    const off = at <= 0 || at >= 1 ? 0 : 30 * side;
    return [c.ox + ax + ((c.b[0] - c.a[0]) / len) * along + nx * off, c.oy + ay + ((c.b[1] - c.a[1]) / len) * along + ny * off];
  };
  return {
    scene,
    camera,
    update(s: MovingState, _p, t, dt) {
      last = s;
      for (const c of s.crews) {
        const tm = teams[c.team];
        const mx = (c.a[0] + c.b[0]) / 2, my = (c.a[1] + c.b[1]) / 2;
        const ang = Math.atan2(c.b[1] - c.a[1], c.b[0] - c.a[0]);
        tm.couch.position.set(wx(c.ox + mx), c.lifted ? 0.7 : 0.3 + Math.sin(t * 8) * 0.02, wz(c.oy + my));
        tm.couch.rotation.y = -ang;
        if (c.bonk > 0.28) {
          fx.dust(tm.couch.position.clone(), 0.8);
          sfx.bump();
        }
        if (c.doneAt >= 0 && !prev.has(c.team * 10 + 9)) {
          prev.set(c.team * 10 + 9, [0, 0]);
          fx.party(tm.couch.position.clone().setY(2));
          sfx.cheer();
        }
        const crewList = s.carriers.filter((q) => q.team === c.team);
        crewList.forEach((q, i) => {
          const m = tm.hands.get(q.id)!;
          const solo = crewList.length === 1;
          const [x, y] = solo ? spotOf(c, 0.5, 1) : spotOf(c, q.at, i % 2 ? 1 : -1);
          const was = prev.get(c.team * 100 + i) ?? [x, y];
          const spd = Math.hypot(x - was[0], y - was[1]) / Math.max(dt, 1e-3) / 200;
          prev.set(c.team * 100 + i, [x, y]);
          m.group.position.set(wx(x), 0, wz(y));
          m.group.rotation.y = yaw(Math.atan2(my + c.oy - y, mx + c.ox - x));
          m.update(dt, { speed: Math.min(1, spd), happy: c.doneAt >= 0, jump: q.lifting ? 0.12 : 0, t });
        });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      const out: Tag[] = [];
      for (const c of last.crews) {
        const crewList = last.carriers.filter((q) => q.team === c.team);
        crewList.forEach((q, i) => {
          const p = who(players, q.id);
          const [x, y] = crewList.length === 1 ? spotOf(c, 0.5, 1) : spotOf(c, q.at, i % 2 ? 1 : -1);
          out.push({ pos: new THREE.Vector3(wx(x), 2.1, wz(y)), text: p?.name ?? '', color: p?.color });
        });
      }
      return out;
    },
  };
}
