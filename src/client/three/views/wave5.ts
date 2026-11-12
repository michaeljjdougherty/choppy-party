import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { flame, glowSprite, groundFog, lampGlow, onTop } from '../look/fxKit';
import { snowMaterial } from '../look/snow';
import { moonMaterial } from '../look/moon';
import type { PlayerInfo } from '../../../shared/types';
import { tileCentre, type PlazaState } from '../../../shared/games/paintPlaza';
import type { CountState } from '../../../shared/games/alienCount';
import { TRACK, type LightsState } from '../../../shared/games/lightsOut';
import { BALL_R, LANE_LEN, LANE_W, type BowlState } from '../../../shared/games/pumpkinBowling';
import { bases, type CrownState } from '../../../shared/games/captureCrown';
import { seatPos, type SeatState } from '../../../shared/games/lastSeat';
import { place, texture } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz, yaw } from '../kit';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { crew, fitProp, pool } from './crew';
import { TEAM_COLORS } from './teams';
import { makeCrown } from './board';

const who = (players: PlayerInfo[], id: string) => players.find((p) => p.id === id);

/** Pull the camera back far enough to see an arena `w` by `h` pixels wide, centred on (640, cy). */
function fitCamera(camera: THREE.PerspectiveCamera, w: number, h: number, cy = 360, tilt = 0.85): void {
  const span = Math.max((w * PX) / 1.6, (h * PX) / 0.9);
  const d = Math.max(14, span * 0.95);
  camera.position.set(0, d, wz(cy) + d * tilt);
  camera.lookAt(0, 0, wz(cy) + 1);
}

function ground(scene: THREE.Scene, color: string, r = 90, y = -0.02, mat?: THREE.Material): void {
  const g = mesh(new THREE.CircleGeometry(r, 48), mat ?? toy(color, 0.95), { cast: false, receive: true });
  g.rotation.x = -Math.PI / 2;
  g.position.y = y;
  scene.add(g);
}

/* ------------------------------------------------------------------ Paint the Plaza */

export function plazaView(env: THREE.Texture, state: PlazaState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#ffeacc', fog: ['#e8f2ff', 50, 130], shadowSize: 24 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const W = state.cols * state.tile, H = state.rows * state.tile;
  const cy = state.y0 + H / 2;
  fitCamera(camera, W + 120, H + 160, cy);
  ground(scene, '#9fd36a');
  // the plaza: a stone rim with tiles that take each painter's colour
  const rim = mesh(new THREE.BoxGeometry(W * PX + 1.2, 0.3, H * PX + 1.2), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', 6, 3), color: '#d8d2c4', roughness: 0.9 }), { receive: true });
  rim.position.set(wx(state.x0 + W / 2), -0.1, wz(cy));
  scene.add(rim);
  const ts = state.tile * PX;
  const tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(ts * 0.94, 0.12, ts * 0.94, 2, 0.03), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', 1, 1), roughness: 0.85 }), state.tiles.length);
  tiles.receiveShadow = true;
  const m = new THREE.Matrix4();
  state.tiles.forEach((_, i) => {
    const [x, y] = tileCentre(state, i);
    m.makeTranslation(wx(x), 0.06, wz(y));
    tiles.setMatrixAt(i, m);
  });
  scene.add(tiles);
  // wet paint: a glossy splat with drips and spatter on top of each claimed tile (not a flat colour swap)
  const splatTex = (() => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = S * (0.36 + 0.06 * Math.sin(a * 5) + 0.04 * Math.sin(a * 11 + 1) + (i % 7 === 0 ? 0.07 : 0));
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    g.fill();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = S * (0.4 + Math.random() * 0.08), r = 3 + Math.random() * 9;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    // darker toward the rim so it reads as a thick blob
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.45);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = sh;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const paint = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(ts * 1.12, ts * 1.12).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: splatTex, transparent: true, alphaTest: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    state.tiles.length,
  );
  paint.receiveShadow = true;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < state.tiles.length; i++) paint.setMatrixAt(i, zero);
  scene.add(paint);
  const spin = state.tiles.map((_, i) => (i * 2.39996) % (Math.PI * 2));
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const stone = new THREE.Color('#d8d2c4');
  const cols = state.painters.map((p) => new THREE.Color(who(players, p.id)?.color ?? '#fff'));
  const shown: number[] = state.tiles.map(() => -2);
  const pop: number[] = state.tiles.map(() => 0);
  // dressing: a fountain-ish column, lamp posts, trees and flowers round the edge
  const ex = (W * PX) / 2 + 2.2, ez = (H * PX) / 2 + 2.2;
  for (const [n, x, z, s] of [
    ['platformer/tree', -ex - 1, wz(cy) - ez + 1, 2.4], ['platformer/tree', ex + 1, wz(cy) - ez + 1, 2.4], ['platformer/tree-pine', -ex - 2, wz(cy) + 2, 2.6],
    ['platformer/tree-pine', ex + 2, wz(cy) + 2, 2.6], ['platformer/flowers-tall', -ex, wz(cy) + ez - 1, 1.2], ['platformer/flowers-tall', ex, wz(cy) + ez - 1, 1.2],
    ['proto/column-rounded', -ex + 0.6, wz(cy) - ez + 0.6, 1.6], ['proto/column-rounded', ex - 0.6, wz(cy) - ez + 0.6, 1.6], ['platformer/hedge', 0, wz(cy) - ez - 0.5, 1.8],
    ['platformer/hedge', -4, wz(cy) - ez - 0.5, 1.8], ['platformer/hedge', 4, wz(cy) - ez - 0.5, 1.8],
  ] as [string, number, number, number][])
    place(scene, n, x, 0, z, { s });
  const fx = new Fx(scene);
  const team = crew(scene, players, state.painters, fx);
  // a paint bucket on each painter's head, in their colour
  const buckets = state.painters.map((p, k) => {
    const b = mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 14), toy(cols[k], 0.4));
    b.visible = false;
    scene.add(b);
    return { p, b };
  });
  let last = state;
  return {
    scene,
    camera,
    update(s: PlazaState, _p, t, dt) {
      last = s;
      let dirty = false;
      for (let i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i] !== shown[i]) {
          shown[i] = s.tiles[i];
          pop[i] = 0.25;
          tiles.setColorAt(i, stone);
          if (s.tiles[i] >= 0) paint.setColorAt(i, cols[s.tiles[i]]);
          spin[i] += 1.3;
          dirty = true;
        }
        if (pop[i] > 0) {
          pop[i] = Math.max(0, pop[i] - dt);
          const [x, y] = tileCentre(s, i);
          m.makeTranslation(wx(x), 0.06 + pop[i] * 0.8, wz(y));
          tiles.setMatrixAt(i, m);
          tiles.instanceMatrix.needsUpdate = true;
          // the splat slaps down: overshoots, then settles
          const k = 1 - pop[i] / 0.25;
          const size = s.tiles[i] < 0 ? 0 : 0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.25;
          paint.setMatrixAt(i, m.compose(pos.set(wx(x), 0.13 + pop[i] * 0.8, wz(y)), q.setFromAxisAngle(up, spin[i]), sc.set(size, 1, size)));
          paint.instanceMatrix.needsUpdate = true;
        }
      }
      if (dirty && tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
      if (dirty && paint.instanceColor) paint.instanceColor.needsUpdate = true;
      for (const sp of s.splashes) {
        fx.emit(new THREE.Vector3(wx(sp.x), 0.4, wz(sp.y)), { tex: 'puff', color: [`#${cols[sp.who].getHexString()}`, '#ffffff'], n: 22, speed: [3, 6], spread: 1, up: 3, life: [0.3, 0.6], size: [0.7, 0.2], gravity: 10 });
        shake(0.12);
        sfx.bump();
      }
      for (const { p, b } of buckets) {
        const r = s.painters.find((q) => q.id === p.id)!;
        b.visible = r.splashed > 0;
        b.position.set(wx(r.x), 2.3 + r.splashed * 2, wz(r.y));
        b.rotation.z = Math.PI * (1 - r.splashed * 2);
      }
      fx.update(dt);
      team.update(s.painters, dt);
      void t;
    },
    tags(): Tag[] {
      return team.tags(last.painters);
    },
  };
}

/* ------------------------------------------------------------------ Alien Count */

export function alienView(env: THREE.Texture, state: CountState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'space-nebula', skyTop: '#1a1440', skyBottom: '#5a3a8a', sunColor: '#e8e0ff', sunIntensity: 2, shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 220);
  camera.position.set(0, 11.5, 15.5);
  camera.lookAt(0, 0, -1.2);
  ground(scene, '#8a7fb0', 90, -0.02, moonMaterial('#a597cc', 16));
  // the parade road: five lanes of dusty moon track
  const road = mesh(new THREE.PlaneGeometry(40, 11), new THREE.MeshStandardMaterial({ map: texture('floor_ground_dirt', 10, 3), color: '#c7b6e8', roughness: 1 }), { cast: false, receive: true });
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -1);
  scene.add(road);
  for (const [n, x, z, s, r] of [
    ['space/hangar_roundGlass', -13, -17, 3.4, 0.4], ['space/rocket_baseA', 10, -14, 2.4, 0], ['space/satelliteDish_large', 14, -8, 3, -0.6], ['space/craterLarge', 2, -12, 4, 0],
    ['space/rock_crystalsLargeA', -16, -4, 2.4, 0.3], ['space/rock_crystals', 16, 1, 1.8, 1], ['space/rover', -14, 4, 2, 0.8], ['space/crater', 12, 6, 3, 0],
  ] as [string, number, number, number, number][])
    place(scene, n, x, 0, z, { s, ry: r });
  // the counters sit along the front, watching the road
  const bench = mesh(new RoundedBoxGeometry(Math.max(8, state.guessers.length * 1.6), 0.3, 1, 3, 0.1), new THREE.MeshStandardMaterial({ color: '#6b5aa8', metalness: 0.5, roughness: 0.35 }), { receive: true });
  bench.position.set(0, 0.15, 6.2);
  scene.add(bench);
  const crowd = state.guessers.map((g, i) => {
    const mdl = new ChoppyModel(who(players, g.id)?.color ?? '#fff', 0.7);
    mdl.group.position.set((i - (state.guessers.length - 1) / 2) * 1.5, 0.3, 6.4);
    mdl.group.rotation.y = Math.PI;
    scene.add(mdl.group);
    return { id: g.id, mdl };
  });
  const greenSuit = (o: THREE.Object3D) =>
    o.traverse((c) => {
      const me = c as THREE.Mesh;
      if (me.isMesh) {
        const mat = (me.material as THREE.MeshStandardMaterial).clone();
        mat.color.lerp(new THREE.Color('#5be35b'), 0.55);
        me.material = mat;
      }
    });
  const aliens = [pool(scene, () => fitProp('space/alien', 2.1, 'y')), pool(scene, () => fitProp('space/alien', 1.7, 'y'))];
  const astros = [pool(scene, () => fitProp('space/astronautA', 2.1, 'y')), pool(scene, () => fitProp('space/astronautB', 2.1, 'y'))];
  const decoys = pool(scene, () => {
    const o = fitProp('space/astronautA', 2.1, 'y');
    greenSuit(o);
    return o;
  });
  const fx = new Fx(scene);
  let revealed = -1;
  return {
    scene,
    camera,
    update(s: CountState, _p, t, dt) {
      for (const a of aliens) a.begin();
      for (const a of astros) a.begin();
      decoys.begin();
      if (s.phase === 'parade') {
        for (const r of s.runners) {
          const u = (s.phaseT - r.at) / r.dur;
          if (u < 0 || u > 1) continue;
          const o = r.alien ? aliens[r.kind].take() : r.style === 2 ? decoys.take() : astros[r.kind].take();
          const x = (r.dir > 0 ? -1 : 1) * (19 - 38 * u);
          const hop = r.style === 1 ? Math.abs(Math.sin(u * Math.PI * 7)) * 0.9 : Math.abs(Math.sin(u * Math.PI * 14)) * 0.12;
          o.position.set(x, hop, -4.4 + r.lane * 1.6);
          o.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      if (s.phase === 'reveal' && revealed !== s.round) {
        revealed = s.round;
        for (const g of s.guessers) if (g.guess === s.answer) fx.party(new THREE.Vector3(crowd.find((c) => c.id === g.id)!.mdl.group.position.x, 2.4, 6.4));
      }
      for (const c of crowd) {
        const g = s.guessers.find((q) => q.id === c.id)!;
        const happy = s.phase === 'reveal' && g.guess === s.answer;
        c.mdl.update(dt, { happy, stunned: s.phase === 'reveal' && Math.abs(g.guess - s.answer) > 2, t });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return crowd.map((c) => {
        const p = who(players, c.id);
        return { pos: c.mdl.group.position.clone().setY(2.2), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}

/* ------------------------------------------------------------------ Lights Out Freeze */

export function lightsView(env: THREE.Texture, state: LightsState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#101a3a', skyBottom: '#3a4a7a', fog: ['#1a2448', 30, 70], sunColor: '#bcd4ff', sunIntensity: 1.2, shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const L = TRACK * PX; // 100 units of snowy path
  const hw = state.halfW * PX;
  const snow = mesh(new THREE.PlaneGeometry(L + 60, 60), snowMaterial((L + 60) / 9, 60 / 9), { cast: false, receive: true });
  snow.rotation.x = -Math.PI / 2;
  snow.position.set(L / 2, -0.02, 0);
  scene.add(snow);
  const path = mesh(new THREE.PlaneGeometry(L + 4, hw * 2), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', L / 3, (hw * 2) / 3), color: '#cfd8ea', roughness: 0.9 }), { cast: false, receive: true });
  path.rotation.x = -Math.PI / 2;
  path.position.set(L / 2, 0, 0);
  scene.add(path);
  // start line and the big tree at the end
  const line = mesh(new THREE.PlaneGeometry(0.4, hw * 2), new THREE.MeshBasicMaterial({ color: '#ff5a5f' }), { cast: false });
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.02, 0);
  scene.add(line);
  place(scene, 'holiday/tree-decorated', L + 3, 0, 0, { s: 7 });
  place(scene, 'holiday/present-a-cube', L + 1, 0, 2.2, { s: 1.4 });
  place(scene, 'holiday/present-b-round', L + 1.4, 0, -2.4, { s: 1.4 });
  // pines, snowmen and lamp posts along both sides, and a string of bulbs on each edge
  const bulbs: THREE.Mesh[] = [];
  const halos: THREE.Sprite[] = [];
  const wireMat = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.6 });
  const bulbGeo = new THREE.SphereGeometry(0.13, 14, 10);
  const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6);
  const bulbCols = ['#ff4040', '#ffd23f', '#3fa9f5', '#4cd97b', '#ff7bd5'];
  for (let x = -6; x < L + 8; x += 5) {
    for (const side of [-1, 1]) {
      const z = side * (hw + 2.2 + ((x * 7) % 3));
      place(scene, (x / 5) % 2 ? 'holiday/tree-snow-a' : 'holiday/tree-snow-b', x, 0, z + side * 1.6, { s: 3 + ((x * 13) % 4) * 0.4 });
      if (((x / 5) | 0) % 4 === 1) place(scene, 'holiday/snowman', x + 2, 0, side * (hw + 1.4), { s: 1.2, ry: side > 0 ? Math.PI : 0 });
      // a sagging wire between little posts, with bulbs hanging off it that really glow
      const wz0 = side * (hw + 0.6);
      const sag = (u: number) => 1.45 - Math.sin(u * Math.PI) * 0.4;
      const wire = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, j) => new THREE.Vector3(x + (j / 8) * 5, sag(j / 8), wz0)));
      scene.add(mesh(new THREE.TubeGeometry(wire, 16, 0.025, 5), wireMat, { cast: false }));
      const post = mesh(postGeo, wireMat, { cast: true });
      post.position.set(x, 0.75, wz0);
      scene.add(post);
      for (let k = 0; k < 4; k++) {
        const col = bulbCols[(k + x) % 5 | 0] ?? '#fff';
        const b = mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2, roughness: 0.25 }), { cast: false });
        const u = (k + 0.6) / 4.4;
        b.position.set(x + u * 5, sag(u) - 0.16, wz0);
        b.scale.set(1, 1.35, 1);
        const halo = glowSprite(col, 1.3, 0.85);
        b.add(halo);
        halo.scale.set(1.3, 1.3 / 1.35, 1);
        scene.add(b);
        bulbs.push(b);
        halos.push(halo);
      }
    }
  }
  const hemi = scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const sun = scene.children.find((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
  const glow = new THREE.PointLight('#ffd9a0', 30, 30);
  scene.add(glow);
  const fx = new Fx(scene);
  // walkers: x runs along the path, y across it
  const movers = state.walkers.map((w) => ({ id: w.id, x: 0, y: 0, face: 0, z: 0 }));
  const models = state.walkers.map((w) => {
    const mdl = new ChoppyModel(who(players, w.id)?.color ?? '#fff', 0.8);
    scene.add(mdl.group);
    return mdl;
  });
  const lastX = state.walkers.map(() => 0);
  let camX = 0;
  let last = state;
  return {
    scene,
    camera,
    update(s: LightsState, _p, t, dt) {
      last = s;
      // the lights: steady when on, stuttering during the flicker, black in the dark
      const flick = s.phase === 'warn' ? (Math.sin(t * 60) > 0 ? 1 : 0.15) : s.phase === 'dark' ? 0 : 1;
      bulbs.forEach((b, i) => {
        // each bulb has its own faint shimmer, and they don't all die at exactly the same instant
        const own = s.phase === 'warn' ? (Math.sin(t * 60 + i * 1.7) > -0.2 ? 1 : 0.1) : flick;
        (b.material as THREE.MeshStandardMaterial).emissiveIntensity = own * (2 + Math.sin(t * 3 + i) * 0.2);
        halos[i].material.opacity = own * (0.75 + Math.sin(t * 2.3 + i * 0.7) * 0.1);
      });
      hemi.intensity = 0.25 + flick * 0.6;
      sun.intensity = 0.15 + flick * 1.05;
      glow.intensity = flick * 40;
      scene.fog!.color.set(flick > 0.5 ? '#1a2448' : '#05070f');
      s.walkers.forEach((w, i) => {
        const mdl = models[i];
        const px = w.x * PX, pz = w.y * PX;
        const speed = Math.min(1, Math.abs(px - lastX[i]) / Math.max(1e-3, dt) / 6);
        lastX[i] = px;
        mdl.group.position.set(px, 0, pz);
        mdl.group.rotation.y = yaw(w.face);
        mdl.update(dt, { speed, stunned: w.caught > 0, happy: w.doneAt >= 0, jump: (w.z * PX) / 0.8, t });
        movers[i].x = w.x;
        movers[i].y = w.y;
      });
      for (const id of s.caughtNow) {
        const w = s.walkers.find((q) => q.id === id)!;
        fx.bonk(new THREE.Vector3(w.x * PX, 2, w.y * PX));
        sfx.lose();
      }
      // the camera follows the pack, leaning toward the leader
      const xs = s.walkers.map((w) => w.x * PX);
      const lead = Math.max(...xs);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const goal = Math.min(L - 4, mean * 0.4 + lead * 0.6);
      camX += (goal - camX) * Math.min(1, dt * 2.5);
      const d = 12 + hw * 0.9;
      camera.position.set(camX - d * 0.75, d * 0.8, d * 0.75);
      camera.lookAt(camX + 3, 0, 0);
      glow.position.set(camX + 2, 6, 0);
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.walkers.map((w) => {
        const p = who(players, w.id);
        return { pos: new THREE.Vector3(w.x * PX, 2.3, w.y * PX), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}

/* ------------------------------------------------------------------ Pumpkin Bowling */

export function bowlView(env: THREE.Texture, state: BowlState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'night', skyTop: '#1b1436', skyBottom: '#4a3a6a', fog: ['#2a2040', 30, 80], sunColor: '#cdb8ff', sunIntensity: 1.6, shadowSize: 26 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  const n = state.bowlers.length;
  const gap = LANE_W * PX + 1;
  const laneX = (i: number) => (i - (n - 1) / 2) * gap;
  const len = (LANE_LEN + 140) * PX;
  const zOf = (y: number) => 6 - y * PX; // foul line at z = 6, pins far up the lanes
  ground(scene, '#3d4a2e', 90);
  const wide = n * gap;
  // pulled back far enough that the bowlers on the outside lanes stay in shot
  camera.position.set(0, 8 + wide * 0.4, 17 + wide * 0.55);
  camera.lookAt(0, 0, -4);
  const laneMat = new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', 1, 10), color: '#c9a477', roughness: 0.6 });
  const gutter = toy('#2d2438', 0.8);
  state.bowlers.forEach((_, i) => {
    const lane = mesh(new THREE.BoxGeometry(LANE_W * PX, 0.12, len), laneMat, { receive: true });
    lane.position.set(laneX(i), 0.06, 6 - len / 2);
    scene.add(lane);
    for (const s of [-1, 1]) {
      const g = mesh(new THREE.BoxGeometry(0.35, 0.18, len), gutter, { receive: true });
      g.position.set(laneX(i) + s * ((LANE_W * PX) / 2 + 0.18), 0.04, 6 - len / 2);
      scene.add(g);
    }
    const foul = mesh(new THREE.PlaneGeometry(LANE_W * PX, 0.15), new THREE.MeshBasicMaterial({ color: '#ff7a1a' }), { cast: false });
    foul.rotation.x = -Math.PI / 2;
    foul.position.set(laneX(i), 0.13, 6);
    scene.add(foul);
  });
  // graveyard dressing behind and round the lanes
  const back = zOf(LANE_LEN) - 5;
  place(scene, 'graveyard/crypt', 0, 0, back - 3, { s: 4 });
  for (let k = -3; k <= 3; k++) place(scene, 'graveyard/iron-fence', k * 4.2, 0, back, { s: 2.2 });
  for (const [nm, x, z, s] of [
    ['graveyard/pine-crooked', -wide / 2 - 4, -8, 3], ['graveyard/pine-crooked', wide / 2 + 4, -12, 3.4], ['graveyard/pine-fall', -wide / 2 - 5, 2, 3],
    ['graveyard/lightpost-double', -wide / 2 - 1.5, 4, 2], ['graveyard/lightpost-double', wide / 2 + 1.5, 4, 2], ['graveyard/pumpkin-tall-carved', wide / 2 + 3, 6, 1.4],
    ['graveyard/fire-basket', -wide / 2 - 3, -2, 1.4], ['graveyard/candle-multiple', wide / 2 + 3, -4, 1.2],
  ] as [string, number, number, number][]) {
    const o = place(scene, nm, x, 0, z, { s });
    // everything that should glow, glows: lamps, the brazier, the jack-o'-lantern
    if (nm === 'graveyard/lightpost-double') {
      onTop(o, lampGlow('#ffc070', 1.8), 0.9);
      const l = new THREE.PointLight('#ffb35c', 14, 12, 1.6);
      onTop(o, l, 0.9);
    }
    if (nm === 'graveyard/fire-basket') onTop(o, flame(0.9, { light: 6 }), 0.85);
    if (nm === 'graveyard/pumpkin-tall-carved' || nm === 'graveyard/candle-multiple') onTop(o, lampGlow('#ff9a3a', 1.6), 0.5);
  }
  scene.add(groundFog([-wide / 2 - 8, back - 6, wide / 2 + 8, 9], { count: 16, opacity: 0.3 }));
  const pins = pool(scene, () => fitProp('graveyard/gravestone-round', 0.62, 'y'));
  // the pumpkin balls glow from inside as they roll
  const balls = pool(scene, () => {
    const g = new THREE.Group();
    g.add(fitProp('graveyard/pumpkin-carved', BALL_R * 2 * PX * 1.3, 'max'));
    const glow = glowSprite('#ffa040', BALL_R * 2 * PX * 2.6, 0.75);
    glow.position.y = BALL_R * PX * 1.3;
    g.add(glow);
    return g;
  });
  const aims = pool(scene, () => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      d.position.z = -k * 0.9;
      g.add(d);
    }
    return g;
  });
  const meters = state.bowlers.map((_, i) => {
    const frame = mesh(new THREE.BoxGeometry(0.3, 2.1, 0.12), toy('#1d1530', 0.6));
    const fill = mesh(new THREE.BoxGeometry(0.22, 2, 0.14), new THREE.MeshStandardMaterial({ color: '#ff9f1c', emissive: '#ff6a00', emissiveIntensity: 0.5 }));
    frame.position.set(laneX(i) + (LANE_W * PX) / 2 + 0.6, 1.2, 6.6);
    scene.add(frame, fill);
    return { frame, fill };
  });
  const bowlers = state.bowlers.map((b, i) => {
    const mdl = new ChoppyModel(who(players, b.id)?.color ?? '#fff', 0.75);
    mdl.group.position.set(laneX(i), 0.12, 7.2);
    mdl.group.rotation.y = Math.PI;
    scene.add(mdl.group);
    return mdl;
  });
  const fx = new Fx(scene);
  let last = state;
  return {
    scene,
    camera,
    update(s: BowlState, _p, t, dt) {
      last = s;
      pins.begin();
      balls.begin();
      aims.begin();
      s.bowlers.forEach((b, i) => {
        const x0 = laneX(i);
        for (const p of b.pins) {
          const o = pins.take();
          const tip = p.down ? Math.min(1, p.fall / 0.35) * (Math.PI / 2) : 0;
          o.position.set(x0 + p.x * PX + (p.down ? p.dir * Math.min(1, p.fall / 0.35) * 0.25 : 0), 0.12, zOf(p.y));
          o.rotation.set(0, 0, p.dir * tip);
        }
        const aiming = b.phase === 'aim' || b.phase === 'charge';
        if (aiming || b.phase === 'rolling') {
          const o = balls.take();
          const bx = aiming ? b.aim * (LANE_W / 2 - BALL_R) : b.bx;
          o.position.set(x0 + bx * PX, 0.12, zOf(aiming ? 0 : b.by) + (aiming ? 0.2 : 0));
          o.rotation.set(-b.spin, 0, 0);
        }
        if (aiming) {
          const a = aims.take();
          a.position.set(x0 + b.aim * (LANE_W / 2 - BALL_R) * PX, 0.14, 5.2);
          a.rotation.y = b.aim * 0.02;
        }
        const m = meters[i];
        m.frame.visible = m.fill.visible = b.phase === 'charge';
        const k = Math.max(0.02, b.power);
        m.fill.scale.y = k;
        m.fill.position.set(m.frame.position.x, 0.2 + k, 6.66);
        bowlers[i].group.position.x = x0 + (aiming ? b.aim * (LANE_W / 2 - BALL_R) * PX : 0);
        bowlers[i].update(dt, { happy: b.phase === 'show' && b.last >= 8, stunned: b.phase === 'show' && b.last <= 2, t });
      });
      for (const h of s.hits) {
        const b = s.bowlers[h.lane];
        fx.emit(new THREE.Vector3(laneX(h.lane) + b.bx * PX, 0.5, zOf(LANE_LEN + 20)), { tex: 'puff', color: ['#c0b8a8', '#8a8070'], n: 6 + h.n * 2, speed: [1.5, 3.5], up: 2, life: [0.3, 0.6], size: [0.5, 0.2], gravity: 6 });
        if (h.n >= 3) shake(0.08);
        sfx.bump();
      }
      for (const b of s.bowlers) if (b.phase === 'show' && b.phaseT < 0.05 && b.last === 10) fx.party(new THREE.Vector3(laneX(s.bowlers.indexOf(b)), 1.5, zOf(LANE_LEN)));
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.bowlers.map((b, i) => {
        const p = who(players, b.id);
        return { pos: bowlers[i].group.position.clone().setY(2.2), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}

/* ------------------------------------------------------------------ Capture the Crown */

export function crownView(env: THREE.Texture, state: CrownState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#7cc8ff', skyBottom: '#ffeacc', fog: ['#dff0d0', 45, 120], shadowSize: 26 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);
  fitCamera(camera, state.w + 80, state.h + 120, 410);
  ground(scene, '#7fbf55');
  const fw = state.w * PX, fd = state.h * PX;
  const camp = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', fw / 3, fd / 3), color: '#bfe8a0', roughness: 1 }), { cast: false, receive: true });
  camp.rotation.x = -Math.PI / 2;
  camp.position.set(0, 0, wz(410));
  scene.add(camp);
  bases(state).forEach(([bx, by], team) => {
    const pad = mesh(new THREE.CircleGeometry(70 * PX, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], transparent: true, opacity: 0.45, depthWrite: false }), { cast: false });
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(wx(bx), 0.03, wz(by));
    scene.add(pad);
    place(scene, 'forest/tent', wx(bx) + (team ? 1.2 : -1.2), 0, wz(by) - 2.4, { s: 2.6, ry: team ? -0.4 : 0.4 });
    place(scene, 'forest/flag', wx(bx) + (team ? -1.6 : 1.6), 0, wz(by) - 1.4, { s: 1.8 });
  });
  // a ring of trees and rocks round the camp
  const rx = fw / 2 + 1.6, rz = fd / 2 + 1.6;
  for (let a = 0; a < Math.PI * 2; a += 0.33) {
    const x = Math.cos(a) * rx * 1.05, z = wz(410) + Math.sin(a) * rz * 1.1;
    if (z > wz(410) + rz * 0.6) continue; // keep the front open for the camera
    place(scene, a % 1 > 0.6 ? 'forest/tree-high' : 'forest/tree', x, 0, z, { s: 2.6 + (a % 0.7), ry: a * 3 });
  }
  place(scene, 'forest/rocks-high', -fw / 2 - 1, 0, wz(410) + fd / 2, { s: 2 });
  place(scene, 'forest/rocks-low', fw / 2 + 1, 0, wz(410) + fd / 2, { s: 2 });
  // the stump in the middle, and the crown
  const stump = mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 18), toy('#8a5a32', 0.8), { receive: true });
  stump.position.set(0, 0.25, wz(410));
  scene.add(stump);
  const crownM = makeCrown();
  crownM.scale.setScalar(0.8);
  scene.add(crownM);
  const fx = new Fx(scene);
  const team = crew(scene, players, state.campers, fx);
  // each camper wears a team-coloured ring so the sides read at a glance
  const rings = state.campers.map((c) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[c.team], transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2;
    scene.add(r);
    return r;
  });
  let last = state;
  return {
    scene,
    camera,
    update(s: CrownState, _p, t, dt) {
      last = s;
      const car = s.campers.find((c) => c.id === s.carrier);
      crownM.visible = !(s.respawn && s.respawn > 0 && !car);
      if (car) crownM.position.set(wx(car.x), 2.55 + car.z * PX + Math.sin(t * 8) * 0.05, wz(car.y));
      else crownM.position.set(wx(s.cx), (Math.hypot(s.cx - 640, s.cy - 410) < 10 ? 0.6 : 0.2) + Math.sin(t * 3) * 0.12 + 0.2, wz(s.cy));
      crownM.rotation.y = t * 1.8;
      for (const e of s.events) {
        const at = new THREE.Vector3(wx(e.x), 1.2, wz(e.y));
        if (e.kind === 'tag') {
          fx.bonk(at);
          shake(0.15);
          sfx.bump();
        } else if (e.kind === 'grab') {
          fx.sparkle(at, '#ffd23f', 12);
          sfx.gem();
        } else {
          fx.party(at.setY(2));
          sfx.cheer();
        }
      }
      s.campers.forEach((c, i) => rings[i].position.set(wx(c.x), 0.05, wz(c.y)));
      fx.update(dt);
      team.update(s.campers, dt, (r) => {
        const c = r as CrownState['campers'][number];
        return { stunned: c.stun > 0, happy: s.wonAt !== undefined && s.score[c.team] > s.score[1 - c.team] };
      });
    },
    tags(): Tag[] {
      return team.tags(last.campers);
    },
  };
}

/* ------------------------------------------------------------------ Last Seat */

export function seatView(env: THREE.Texture, state: SeatState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#2a1f3a', skyBottom: '#5a4466', fog: ['#2a1f3a', 40, 90], sunColor: '#ffe6c0', sunIntensity: 1.8, shadowSize: 20 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const R = state.ringR;
  fitCamera(camera, (R + 230) * 2, (R * 0.62 + 160) * 2, 400, 0.8);
  // a parlour: wooden floor, a big round rug, lamps and plants round the walls
  const fw = ((R + 260) * 2) * PX, fd = ((R * 0.62 + 190) * 2) * PX;
  const floor = mesh(new THREE.PlaneGeometry(fw + 20, fd + 20), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks_wide', (fw + 20) / 2, (fd + 20) / 2), color: '#e0b88a', roughness: 0.8 }), { cast: false, receive: true });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, wz(400));
  scene.add(floor);
  const rug = mesh(new THREE.CircleGeometry(1, 48), toy('#a83a5a', 0.95), { cast: false, receive: true });
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(R * PX * 1.25, R * PX * 0.62 * 1.25, 1);
  rug.position.set(0, 0.02, wz(400));
  scene.add(rug);
  const rug2 = mesh(new THREE.RingGeometry(0.86, 0.94, 48), toy('#ffd23f', 0.8), { cast: false });
  rug2.rotation.x = -Math.PI / 2;
  rug2.scale.copy(rug.scale);
  rug2.position.set(0, 0.03, wz(400));
  scene.add(rug2);
  const back = wz(400) - fd / 2;
  const wall = mesh(new THREE.BoxGeometry(fw + 6, 6, 0.4), new THREE.MeshStandardMaterial({ map: texture('wall_timber', (fw + 6) / 3, 2), color: '#f0d8b8', roughness: 0.9 }), { receive: true });
  wall.position.set(0, 3, back - 1.2);
  scene.add(wall);
  for (const [nm, x, z, s] of [
    ['furniture/pottedPlant', -fw / 2 + 0.5, back, 1.6], ['furniture/pottedPlant', fw / 2 - 0.5, back, 1.6], ['furniture/table', -fw / 2 + 2.5, back + 0.3, 1.8],
    ['furniture/lampWall', -4, back - 0.9, 1], ['furniture/lampWall', 4, back - 0.9, 1], ['furniture/plantSmall1', fw / 2 - 2.5, back + 0.2, 1],
  ] as [string, number, number, number][])
    place(scene, nm, x, 0, z, { s });
  const lamp = new THREE.PointLight('#ffcf8a', 40, 30);
  lamp.position.set(0, 7, wz(400));
  scene.add(lamp);
  const chairs = pool(scene, () => fitProp('furniture/chair', 1.25, 'y'));
  const fx = new Fx(scene);
  const team = crew(scene, players, state.sitters, fx);
  const wasOut = new Set<string>();
  let last = state;
  return {
    scene,
    camera,
    update(s: SeatState, _p, t, dt) {
      last = s;
      chairs.begin();
      for (const q of s.seats) {
        const [sx, sy] = seatPos(s, q);
        const o = chairs.take();
        o.position.set(wx(sx), 0, wz(sy));
        // chairs face out of the ring
        o.rotation.y = yaw(Math.atan2(sy - 400, sx - 640));
      }
      lamp.intensity = s.phase === 'scramble' ? 60 + Math.sin(t * 20) * 15 : 40;
      for (const id of s.outNow)
        if (!wasOut.has(id)) {
          wasOut.add(id);
          const p = s.sitters.find((q) => q.id === id)!;
          fx.bonk(new THREE.Vector3(wx(p.x), 2, wz(p.y)));
          sfx.lose();
        }
      fx.update(dt);
      team.update(s.sitters, dt, (r) => {
        const p = r as SeatState['sitters'][number];
        const seated = s.seats.some((q) => q.by === p.id);
        return { stunned: p.stun > 0 || p.outAt >= 0, happy: seated && s.phase === 'verdict' };
      });
      // seated players sit up on the chair, facing out
      for (const q of s.seats) {
        if (!q.by) continue;
        const m = team.models.get(q.by);
        if (!m) continue;
        const [sx, sy] = seatPos(s, q);
        m.group.position.set(wx(sx), 0.42, wz(sy));
        m.group.rotation.y = yaw(Math.atan2(sy - 400, sx - 640));
      }
    },
    tags(): Tag[] {
      return team.tags(last.sitters, 2.35, (r) => ((r as SeatState['sitters'][number]).outAt >= 0 ? 'OUT' : undefined));
    },
  };
}
