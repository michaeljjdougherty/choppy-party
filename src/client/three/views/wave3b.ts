import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { BEAM_HALF, BEAM_LEN, CRYPT_Y, KEEPER, LX0, LX1, LY0, LY1, STONES, type LanternState } from '../../../shared/games/lanternHunt';
import { STONE_COLORS, lit, type MemoryState } from '../../../shared/games/hauntedMemory';
import { FORTS, SX0, SX1, SY0, SY1, type SnowState } from '../../../shared/games/snowballScramble';
import { place, texture } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz } from '../kit';
import type { Tag, View } from '../stage';
import { crew, fitProp, pool } from './crew';

const GRAVES = ['graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-bevel', 'graveyard/gravestone-decorative'];

function nightYard(fogNear = 30) {
  const scene = makeScene(new THREE.Texture(), {
    sky: 'night',
    skyTop: '#0d1030',
    skyBottom: '#3a2d5c',
    fog: ['#1e1b3a', fogNear, 75],
    sunColor: '#a8b8ff',
    sunIntensity: 1.1,
    sunDir: [-6, 18, 8],
    shadowSize: 22,
  });
  scene.environmentIntensity = 0.2;
  return scene;
}

/** Lantern Hunt: a moonlit graveyard, the crypt at the top and a real cone of lantern light. */
export function lanternView(env: THREE.Texture, state: LanternState, players: PlayerInfo[]): View {
  const scene = nightYard();
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 18, 16);
  camera.lookAt(0, 0, 1.6);
  const fw = (LX1 - LX0) * PX;
  const fd = (LY1 - LY0) * PX;
  const cx = wx((LX0 + LX1) / 2);
  const cz = wz((LY0 + LY1) / 2);
  const outer = mesh(new THREE.CircleGeometry(90, 48), toy('#1d2a1c', 0.95), { cast: false, receive: true });
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  const grass = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', fw / 2, fd / 2), color: '#6d8a76', roughness: 0.95 }), {
    cast: false,
    receive: true,
  });
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0, cz);
  scene.add(grass);
  place(scene, 'graveyard/crypt', wx(KEEPER.x), 0, wz(CRYPT_Y) - 3.2, { s: 3.2 });
  STONES.forEach(([x, y], i) => place(scene, GRAVES[i % GRAVES.length], wx(x), 0, wz(y), { s: 2.4, ry: (i % 3) * 0.2 - 0.2 }));
  for (let i = 0; i < 12; i++) {
    const x = LX0 + (i / 11) * (LX1 - LX0);
    place(scene, 'graveyard/iron-fence', wx(x), 0, wz(LY1) + 0.9, { s: 2.2 });
  }
  for (const x of [-1, 1]) place(scene, 'graveyard/pine-crooked', cx + x * (fw / 2 + 1.5), 0, cz - 2, { s: 4 });
  place(scene, 'graveyard/lightpost-double', cx - fw / 2 - 1, 0, cz + 3, { s: 2.6 });
  // the lantern's light: a real spotlight plus a soft visible cone on the ground
  const spot = new THREE.SpotLight('#ffd48a', 160, BEAM_LEN * PX * 1.2, BEAM_HALF * 1.15, 0.35, 1.2);
  spot.castShadow = true;
  spot.position.set(wx(KEEPER.x), 2.4, wz(KEEPER.y));
  scene.add(spot, spot.target);
  const coneShape = new THREE.Shape();
  coneShape.moveTo(0, 0);
  coneShape.absarc(0, 0, BEAM_LEN * PX, -BEAM_HALF, BEAM_HALF, false);
  coneShape.lineTo(0, 0);
  const cone = new THREE.Mesh(
    new THREE.ShapeGeometry(coneShape, 24),
    new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(wx(KEEPER.x), 0.04, wz(KEEPER.y));
  scene.add(cone);
  const lantern = fitProp('graveyard/lantern-candle', 0.7, 'y');
  scene.add(lantern);
  const fx = new Fx(scene);
  const team = crew(scene, players, state.folk, fx);
  let last = state;
  return {
    scene,
    camera,
    update(s: LanternState, _p, t, dt) {
      last = s;
      // arena angle -> world: +y in the arena is +z in the world
      const dir = new THREE.Vector3(Math.cos(s.angle), 0, Math.sin(s.angle));
      spot.target.position.set(wx(KEEPER.x) + dir.x * 8, 0, wz(KEEPER.y) + dir.z * 8);
      cone.rotation.z = -s.angle;
      (cone.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 9) * 0.02;
      const k = s.folk.find((f) => f.keeper)!;
      lantern.position.set(wx(k.x) + dir.x * 0.7, 1.4, wz(k.y) + dir.z * 0.7);
      for (const c of s.caughtNow) {
        fx.bonk(new THREE.Vector3(wx(c.x), 1.6, wz(c.y)));
        shake(0.15);
      }
      fx.update(dt);
      team.update(s.folk, dt, (r) => {
        const f = r as LanternState['folk'][number];
        return { stunned: f.frozen || f.caught > 0, happy: f.inAt >= 0, hidden: f.inAt >= 0 && s.t - f.inAt > 0.6 };
      });
      for (const f of s.folk) {
        // frozen sneakers crouch low
        const m = team.models.get(f.id);
        if (m) m.group.scale.y = f.frozen ? 0.8 * 0.6 : 0.8;
      }
    },
    tags() {
      return team.tags(last.folk, 2.35, (r) => {
        const f = r as LanternState['folk'][number];
        return f.keeper ? 'KEEPER' : f.frozen ? 'frozen' : undefined;
      }, (r) => (r as LanternState['folk'][number]).inAt >= 0);
    },
  };
}

/** Haunted Memory: four big gravestones round a candle, lighting up; everyone stands in a row facing them. */
export function memoryView(env: THREE.Texture, state: MemoryState, players: PlayerInfo[]): View {
  const scene = nightYard(40);
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 9, 15);
  camera.lookAt(0, 1.8, -1);
  const ground = mesh(new THREE.CircleGeometry(60, 48), toy('#26351f', 0.95), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // stones: up (back), right, down (front), left
  const spots: [number, number][] = [[0, -6.5], [4.6, -3.6], [0, -0.8], [-4.6, -3.6]];
  const lights: THREE.PointLight[] = [];
  const glows: THREE.MeshStandardMaterial[] = [];
  spots.forEach(([x, z], i) => {
    const plinth = mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 24), toy('#4a4a5a', 0.8), { receive: true });
    plinth.position.set(x, 0.2, z);
    scene.add(plinth);
    place(scene, GRAVES[i], x, 0.4, z, { s: 3.6 });
    const gm = new THREE.MeshStandardMaterial({ color: STONE_COLORS[i], emissive: STONE_COLORS[i], emissiveIntensity: 0.15, transparent: true, opacity: 0.5 });
    const ring = mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 40), gm, { cast: false });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.45, z);
    scene.add(ring);
    glows.push(gm);
    const l = new THREE.PointLight(STONE_COLORS[i], 0, 9, 2);
    l.position.set(x, 2.4, z + 0.6);
    scene.add(l);
    lights.push(l);
  });
  place(scene, 'graveyard/candle-multiple', 0, 0, -3.6, { s: 2.2 });
  const arrowLabels = ['▲', '▶', '▼', '◀'];
  for (const [i, [x, z]] of spots.entries()) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = STONE_COLORS[i];
    g.font = '900 96px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(arrowLabels[i], 64, 70);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    sp.scale.setScalar(1.1);
    sp.position.set(x, 3.9, z);
    scene.add(sp);
  }
  for (const [x, z] of [[-9, -6], [9, -6], [-11, -1], [11, -1]]) place(scene, 'graveyard/pine-crooked', x, 0, z, { s: 4 });
  const fx = new Fx(scene);
  const models = new Map<string, ChoppyModel>();
  const n = state.folk.length;
  const gap = Math.min(1.7, 14 / Math.max(1, n));
  state.folk.forEach((f, i) => {
    const m = new ChoppyModel(players.find((p) => p.id === f.id)?.color ?? '#fff', 0.7);
    m.group.position.set((i - (n - 1) / 2) * gap, 0, 3.4);
    scene.add(m.group);
    models.set(f.id, m);
  });
  const seen = new Map(state.folk.map((f) => [f.id, f.lastT]));
  const outSeen = new Set<string>();
  let last = state;
  return {
    scene,
    camera,
    update(s: MemoryState, _p, t, dt) {
      last = s;
      const on = lit(s);
      // the stone each player just pressed flickers too, so the room feels alive while everyone answers
      const recent = new Set<number>();
      for (const f of s.folk) if (s.t - f.lastT < 0.25 && f.last >= 0) recent.add(f.last);
      lights.forEach((l, i) => {
        const hot = i === on ? 1 : recent.has(i) ? 0.35 : 0;
        l.intensity += (hot * 40 - l.intensity) * Math.min(1, dt * 18);
        glows[i].emissiveIntensity = 0.15 + hot * 2.5;
        glows[i].opacity = 0.5 + hot * 0.5;
      });
      for (const f of s.folk) {
        const m = models.get(f.id)!;
        const pressed = f.lastT !== seen.get(f.id);
        seen.set(f.id, f.lastT);
        if (pressed) m.squash(5);
        const out = f.outRound >= 0;
        if (out && !outSeen.has(f.id)) {
          outSeen.add(f.id);
          fx.emit(m.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), { tex: 'puff', color: ['#b9b3ff', '#6a5cff'], n: 14, speed: [1, 3], up: 2, life: [0.5, 1], size: [0.8, 0.3] });
        }
        // a slip sends you down into the ground like a ghost took you
        m.group.position.y += ((out ? -2.6 : 0) - m.group.position.y) * Math.min(1, dt * 2);
        m.update(dt, { speed: 0, happy: s.phase === 'judge' && !out, stunned: out, t: t + f.id.length });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.folk
        .filter((f) => f.outRound < 0)
        .map((f) => {
          const m = models.get(f.id)!;
          const p = players.find((q) => q.id === f.id);
          return { pos: new THREE.Vector3(m.group.position.x, 2.1, m.group.position.z), text: p?.name ?? '', color: p?.color };
        });
    },
  };
}

/** Snowball Scramble: a snowy village square with snow forts, snowmen and snowy pines. */
export function snowView(env: THREE.Texture, state: SnowState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'morning', skyTop: '#9fc8ff', skyBottom: '#ffe6f0', fog: ['#e8f0ff', 40, 110], sunIntensity: 2, shadowSize: 18 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 16.5, 15);
  camera.lookAt(0, 0, 1.6);
  const fw = (SX1 - SX0) * PX;
  const fd = (SY1 - SY0) * PX;
  const cx = wx((SX0 + SX1) / 2);
  const cz = wz((SY0 + SY1) / 2);
  const snow = mesh(new THREE.CircleGeometry(90, 48), toy('#f4f8ff', 0.9), { cast: false, receive: true });
  snow.rotation.x = -Math.PI / 2;
  scene.add(snow);
  const square = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: texture('floor_stone_pattern_small', fw / 2, fd / 2), color: '#dfe8ff', roughness: 0.8 }), {
    cast: false,
    receive: true,
  });
  square.rotation.x = -Math.PI / 2;
  square.position.set(cx, 0.01, cz);
  scene.add(square);
  const fortMat = toy('#ffffff', 0.85);
  for (const [x, y, hw, hh] of FORTS) {
    const f = mesh(new THREE.BoxGeometry(hw * 2 * PX, 1.1, hh * 2 * PX), fortMat, { receive: true });
    f.position.set(wx(x), 0.55, wz(y));
    scene.add(f);
    // rounded snow cap
    const cap = mesh(new THREE.CapsuleGeometry(Math.min(hw, hh) * PX, Math.abs(hw - hh) * 2 * PX, 6, 12), fortMat, { receive: true });
    cap.rotation.z = hw > hh ? Math.PI / 2 : 0;
    cap.rotation.x = hw > hh ? 0 : Math.PI / 2;
    cap.position.set(wx(x), 1.1, wz(y));
    scene.add(cap);
  }
  const ring: [string, number, number, number][] = [
    ['holiday/tree-snow-a', -1, -1, 3.4], ['holiday/tree-snow-b', 1, -1, 3.6], ['holiday/snowman', -1, 1, 2.6], ['holiday/tree-snow-a', 1, 1, 3.2],
    ['holiday/cabin-wall', 0, -1, 3], ['holiday/lantern', -0.5, -1, 2.4], ['holiday/lantern', 0.5, -1, 2.4], ['holiday/sled', 1, 0, 2.4], ['holiday/bench', -1, 0, 2.4],
  ];
  for (const [n, sx, sz, s] of ring) place(scene, n, cx + sx * (fw / 2 + 1.6), 0, cz + sz * (fd / 2 + 1.2), { s, ry: sx > 0 ? -Math.PI / 2 : sx < 0 ? Math.PI / 2 : 0 });
  place(scene, 'holiday/tree-decorated', cx, 0, cz - fd / 2 - 3, { s: 5 });
  const fx = new Fx(scene);
  const team = crew(scene, players, state.folk, fx);
  const ballMat = toy('#ffffff', 0.6);
  const ballGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const balls = pool(scene, () => mesh(ballGeo, ballMat));
  let last = state;
  return {
    scene,
    camera,
    update(s: SnowState, _p, t, dt) {
      last = s;
      balls.begin();
      for (const b of s.balls) {
        const o = balls.take();
        o.position.set(wx(b.x), 1.1 + Math.sin((1 - b.life / 1.1) * Math.PI) * 0.4, wz(b.y));
      }
      for (const sp of s.splats) {
        fx.emit(new THREE.Vector3(wx(sp.x), 1, wz(sp.y)), { tex: 'puff', color: ['#ffffff', '#dff2ff'], n: sp.hit ? 16 : 8, speed: [1.5, 4], up: 2, life: [0.3, 0.6], size: [0.5, 0.15], gravity: 6 });
        if (sp.hit) shake(0.12);
      }
      fx.update(dt);
      team.update(s.folk, dt, (r) => {
        const f = r as SnowState['folk'][number];
        const out = f.outAt >= 0;
        return { stunned: out || f.safe > 0.6, hidden: (out && s.t - f.outAt > 1.4) || (f.safe > 0 && Math.floor(t * 14) % 2 === 0) };
      });
    },
    tags() {
      return team.tags(last.folk, 2.35, (r) => '♥'.repeat((r as SnowState['folk'][number]).hearts), (r) => (r as SnowState['folk'][number]).outAt >= 0);
    },
  };
}
