import * as THREE from 'three';
import { softShadowMat } from '../look/fxKit';
import type { PlayerInfo } from '../../../shared/types';
import type { FuseState } from '../../../shared/games/fuseDraw';
import { BALL_R, PADDLE_H, PX0, PX1, PY0, PY1, type PaddleState } from '../../../shared/games/paddleClash';
import { ChoppyModel } from '../choppy';
import { place, texture } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toonWater, toy, wx, wz, frameRect } from '../kit';
import type { Tag, View } from '../stage';
import { fitProp } from './crew';
import { sandMaterial } from '../nature';

/** Fuse Draw: two rivals face off across a powder keg in a frontier street at sunset. */
export function fuseView(env: THREE.Texture, state: FuseState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'morning', skyTop: '#ff8a4c', skyBottom: '#ffe0a3', fog: ['#ffd29a', 30, 90], sunDir: [-10, 14, 12], sunColor: '#ffe2b0' });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);
  camera.position.set(0, 4.2, 12.5);
  camera.lookAt(0, 1.4, 0);
  const ground = mesh(new THREE.CircleGeometry(80, 48), sandMaterial('#f6d2a0', 18), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  place(scene, 'pirate/structure', -7, 0, -6, { s: 1.6, ry: 0.4 });
  place(scene, 'pirate/structure-roof', -7, 0, -6, { s: 1.6, ry: 0.4 });
  place(scene, 'forest/tent', 7.5, 0, -6.5, { s: 2.4, ry: -0.5 });
  for (const [x, z] of [[-4, -4], [4.5, -3.5], [-10, -1], [10, -1.5]] as [number, number][]) place(scene, 'pirate/barrel', x, 0, z, { s: 1.1, ry: x });
  place(scene, 'pirate/rocks-sand-a', -12, 0, -8, { s: 2 });
  place(scene, 'pirate/rocks-sand-b', 12, 0, -9, { s: 2.2 });
  // the powder keg and its fuse
  const keg = fitProp('pirate/barrel', 1.1);
  scene.add(keg);
  const fuseMat = toy('#3b2a1a', 0.8);
  const fuse = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), fuseMat, { cast: false });
  scene.add(fuse);
  const spark = new THREE.PointLight('#ffb347', 0, 6, 1.5);
  scene.add(spark);
  const fx = new Fx(scene);
  const models = state.ids.map((id, i) => {
    const p = players.find((q) => q.id === id);
    const m = new ChoppyModel(p?.color ?? '#fff', 1);
    m.group.position.set(i === 0 ? -3.2 : 3.2, 0, 0.6);
    m.group.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m.group);
    return m;
  });
  let lastPhase = state.phase;
  let last = state;
  let hop = [0, 0];
  return {
    scene,
    camera,
    update(s: FuseState, _p, t, dt) {
      last = s;
      // the fuse burns down while it's lit
      const left = s.phase === 'fuse' ? Math.max(0, 1 - s.phaseT / s.fuse) : 0;
      fuse.scale.y = 0.05 + left * 1.4;
      fuse.position.set(0, 1.05 + fuse.scale.y / 2, 0);
      fuse.visible = s.phase === 'fuse';
      spark.intensity = s.phase === 'fuse' ? 3 + Math.sin(t * 40) * 1.5 : 0;
      spark.position.set(0, 1.1 + fuse.scale.y, 0);
      if (s.phase === 'fuse' && Math.floor(t * 20) !== Math.floor((t - dt) * 20)) fx.emit(spark.position, { tex: 'star', n: 2, color: ['#ffd23f', '#ff7a1a'], speed: [0.5, 1.5], up: 1, life: [0.2, 0.4], size: [0.25, 0] });
      keg.visible = s.phase !== 'bang';
      if (s.phase !== lastPhase) {
        if (s.phase === 'bang') {
          fx.blast(new THREE.Vector3(0, 0.8, 0), 2);
          shake(0.5);
        }
        if (s.phase === 'point' && s.last?.id) hop[s.ids.indexOf(s.last.id)] = 1.2;
        lastPhase = s.phase;
      }
      fx.update(dt);
      hop = hop.map((h) => Math.max(0, h - dt));
      models.forEach((m, i) => {
        const won = hop[i] > 0;
        const lost = s.phase === 'point' && s.last && s.last.id && s.last.id !== s.ids[i];
        m.update(dt, { happy: won, stunned: !!lost && hop[1 - i] > 0, t });
      });
    },
    tags(): Tag[] {
      return last.ids.map((id, i) => {
        const p = players.find((q) => q.id === id);
        return { pos: new THREE.Vector3(i === 0 ? -3.2 : 3.2, 2.9, 0.6), text: p?.name ?? '', color: p?.color, sub: String(last.scores[id]) };
      });
    },
  };
}

/** Paddle Clash: a plank court out on the harbour, bats in each player's colour, a cannonball to whack. */
export function paddleView(env: THREE.Texture, state: PaddleState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#6ccaff', skyBottom: '#e6f7ff', fog: ['#cdeeff', 40, 110], shadowSize: 18 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  frameRect(camera, PX0 - 40, PX1 + 40, PY0, PY1, 0.98);
  const water = toonWater('#1273d6', 22);
  const sea = mesh(new THREE.CircleGeometry(90, 64), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.6;
  scene.add(sea);
  const w = (PX1 - PX0 + 160) * PX;
  const d = (PY1 - PY0 + 40) * PX;
  const cz = wz((PY0 + PY1) / 2);
  const court = mesh(new THREE.BoxGeometry(w, 0.5, d), new THREE.MeshStandardMaterial({ map: texture('floor_wood_planks', w / 2, d / 2), color: '#ffe6c8', roughness: 0.8 }), { receive: true });
  court.position.set(0, -0.25, cz);
  scene.add(court);
  // rails top and bottom, a dashed centre line
  for (const y of [PY0 - 10, PY1 + 10]) {
    const rail = mesh(new THREE.BoxGeometry(w, 0.5, 0.25), toy('#8a5a34', 0.7));
    rail.position.set(0, 0.25, wz(y));
    scene.add(rail);
  }
  for (let i = 0; i < 9; i++) {
    const dash = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.6), toy('#ffffff', 0.5), { cast: false });
    dash.position.set(0, 0.01, wz(PY0 + 30 + i * 55));
    scene.add(dash);
  }
  place(scene, 'pirate/ship-pirate-medium', -6, -0.6, -16, { s: 2.6, ry: 0.4 });
  place(scene, 'pirate/tower-complete-small', 18, -0.6, -6, { s: 2 });
  place(scene, 'pirate/palm-detailed-bend', -19, -0.6, -4, { s: 2.6 });
  const paddles = state.ids.slice(0, 2).map((id, i) => {
    const p = players.find((q) => q.id === id);
    const col = p?.color ?? '#fff';
    const bat = mesh(new THREE.BoxGeometry(0.4, 0.6, PADDLE_H * PX), toy(col, 0.35));
    scene.add(bat);
    const m = new ChoppyModel(col, 0.7);
    m.group.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m.group);
    return { bat, m, x: wx(i === 0 ? PX0 : PX1) };
  });
  const ball = fitProp('pirate/cannon-ball', BALL_R * PX * 2.4);
  scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry((BALL_R * PX * 1.2) * 2.4, (BALL_R * PX * 1.2) * 2.4), softShadowMat(0.40));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const fx = new Fx(scene);
  let hits = state.hits;
  let score = JSON.stringify(state.scores);
  let last = state;
  const prevY = [0, 0];
  return {
    scene,
    camera,
    update(s: PaddleState, _p, t, dt) {
      last = s;
      water.update(t);
      paddles.forEach((pd, i) => {
        const z = wz(s.paddles[i]);
        pd.bat.position.set(pd.x, 0.3, z);
        pd.m.group.position.set(pd.x + (i === 0 ? -0.9 : 0.9), 0, z);
        const speed = Math.min(1, Math.abs(z - prevY[i]) / Math.max(1e-3, dt) / 8);
        prevY[i] = z;
        pd.m.update(dt, { speed, t });
      });
      ball.visible = s.serve <= 0 || Math.floor(t * 8) % 2 === 0;
      ball.position.set(wx(s.ball.x), 0.4, wz(s.ball.y));
      ball.rotation.z -= s.ball.vx * dt * 0.05;
      shadow.position.set(wx(s.ball.x), 0.01, wz(s.ball.y));
      if (s.hits > hits) {
        fx.sparkle(ball.position.clone(), '#ffffff', 8);
        shake(0.08);
      }
      hits = s.hits;
      const sc = JSON.stringify(s.scores);
      if (sc !== score) {
        fx.splash(new THREE.Vector3(wx(s.ball.x < 640 ? PX0 - 80 : PX1 + 80), 0, cz));
        shake(0.25);
        score = sc;
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.ids.slice(0, 2).map((id, i) => {
        const p = players.find((q) => q.id === id);
        return { pos: new THREE.Vector3(paddles[i].x + (i === 0 ? -0.9 : 0.9), 2.2, wz(last.paddles[i])), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}
