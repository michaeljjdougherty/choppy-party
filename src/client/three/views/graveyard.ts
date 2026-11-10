import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { GRAVES, GX0, GX1, GY0, GY1, type GraveyardState } from '../../../shared/games/graveyardShift';
import { place, texture } from '../assets';
import { Fx } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz } from '../kit';
import type { View } from '../stage';
import { crew, fitProp, pool } from './crew';

const STONES = ['graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-bevel', 'graveyard/gravestone-decorative'];

/** Graveyard Shift: Graveyard Kit at night, candles glowing on the grass, ghosts rising from the graves. */
export function graveyardView(env: THREE.Texture, state: GraveyardState, players: PlayerInfo[]): View {
  const scene = makeScene(env, {
    sky: 'night',
    skyTop: '#0d1030',
    skyBottom: '#3a2d5c',
    fog: ['#1e1b3a', 30, 70],
    sunColor: '#a8b8ff',
    sunIntensity: 1.3,
    sunDir: [-6, 18, 8],
    shadowSize: 22,
  });
  scene.environmentIntensity = 0.25;
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 17.5, 17);
  camera.lookAt(0, 0, 2);

  const fw = (GX1 - GX0) * PX;
  const fd = (GY1 - GY0) * PX;
  const cx = wx((GX0 + GX1) / 2);
  const cz = wz((GY0 + GY1) / 2);
  const outer = mesh(new THREE.CircleGeometry(90, 48), toy('#243321', 0.95), { cast: false, receive: true });
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  const grass = mesh(
    new THREE.PlaneGeometry(fw, fd),
    new THREE.MeshStandardMaterial({ map: texture('floor_ground_grass', fw / 2, fd / 2), color: '#7d9a86', roughness: 0.95 }),
    { cast: false, receive: true },
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0, cz);
  scene.add(grass);

  // iron fence around the yard, a gate at the front
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.round(len / 2);
    for (let i = 0; i < steps; i++) {
      const k = (i + 0.5) / steps;
      place(scene, 'graveyard/iron-fence', x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k, { s: 2, ry: -Math.atan2(z1 - z0, x1 - x0) });
    }
  };
  const L = cx - fw / 2 - 0.4, R = cx + fw / 2 + 0.4, T = cz - fd / 2 - 0.4, B = cz + fd / 2 + 0.4;
  fence(L, T, R, T);
  fence(L, T, L, B);
  fence(R, T, R, B);
  place(scene, 'graveyard/crypt', cx, 0, T - 3, { s: 3.2 });
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    place(scene, i % 3 ? 'graveyard/pine-crooked' : 'graveyard/pine-fall', cx + side * (fw / 2 + 2.5 + (i % 3) * 1.6), 0, cz - fd / 2 + (i >> 1) * (fd / 5), { s: 3 + (i % 2), ry: i });
  }
  for (let i = 0; i < 6; i++) place(scene, 'graveyard/pine-crooked', cx - fw / 2 + 2 + i * (fw / 5.5), 0, T - 5.5 - (i % 2) * 2, { s: 3.4, ry: i * 1.3 });
  // lamp posts with real light at the corners
  for (const [x, z] of [[L + 0.6, T + 0.6], [R - 0.6, T + 0.6], [L + 0.6, B - 0.6], [R - 0.6, B - 0.6]] as [number, number][]) {
    place(scene, 'graveyard/lightpost-single', x, 0, z, { s: 2.6 });
    const l = new THREE.PointLight('#ffb35a', 12, 12, 1.6);
    l.position.set(x, 2.6, z);
    scene.add(l);
  }
  for (const [x, z, n] of [[L - 1.5, B - 1, 0], [R + 1.4, B - 2, 1], [L - 1.6, cz, 0], [R + 1.8, cz - 2, 1]] as [number, number, number][])
    place(scene, n ? 'graveyard/pumpkin-tall-carved' : 'graveyard/pumpkin-carved', x, 0, z, { s: 2.2, ry: x });
  place(scene, 'graveyard/fire-basket', L - 1.4, 0, T + 1.5, { s: 2.2 });
  place(scene, 'graveyard/fire-basket', R + 1.4, 0, T + 1.5, { s: 2.2 });
  // the solid gravestones from the sim, each with a little dirt mound
  const dirt = toy('#4a3a2a', 0.95);
  GRAVES.forEach(([x, y], i) => {
    place(scene, STONES[i % STONES.length], wx(x), 0, wz(y), { s: 2.3, ry: (i % 3) * 0.12 - 0.12 });
    const m = mesh(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dirt, { receive: true });
    m.scale.set(0.7, 0.2, 0.9);
    m.position.set(wx(x), 0, wz(y) + 0.75);
    scene.add(m);
  });

  const fx = new Fx(scene);
  const team = crew(scene, players, state.keepers, fx);
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,220,140,1)');
    grd.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const candles = pool(scene, () => {
    const g = new THREE.Group();
    g.add(fitProp('graveyard/candle-multiple', 0.9));
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.6);
    glow.position.y = 0.7;
    glow.name = 'glow';
    g.add(glow);
    return g;
  });
  const ghosts = pool(scene, () => {
    const g = new THREE.Group();
    const o = fitProp('graveyard/character-ghost', 1.4, 'y');
    o.traverse((m) => {
      const mm = m as THREE.Mesh;
      if (mm.isMesh) {
        mm.material = (mm.material as THREE.MeshStandardMaterial).clone();
        const mat = mm.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.emissive = new THREE.Color('#9fd0ff');
        mat.emissiveIntensity = 0.35;
        mm.castShadow = false;
      }
    });
    g.add(o);
    return g;
  });
  const prevCandles = new Map(state.keepers.map((k) => [k.id, k.candles]));
  const prevScared = new Map<string, number>();
  let last = state;

  return {
    scene,
    camera,
    update(s: GraveyardState, _p, t, dt) {
      last = s;
      candles.begin();
      for (const c of s.candles) {
        const g = candles.take();
        // a dropped candle flies out in a little arc
        const air = c.fly > 0 ? Math.sin((c.fly / 0.6) * Math.PI) * 1.5 : 0;
        g.position.set(wx(c.x), air, wz(c.y));
        const glow = g.getObjectByName('glow') as THREE.Sprite;
        glow.scale.setScalar(1.5 + Math.sin(t * 9 + c.x) * 0.15);
      }
      ghosts.begin();
      for (const gh of s.ghosts) {
        const g = ghosts.take();
        const fade = Math.min(1, gh.life / 1.5) * Math.min(1, gh.rise * 1.5);
        g.position.set(wx(gh.x), -1.2 + gh.rise * 1.6 + Math.sin(t * 2.5 + gh.grave) * 0.18, wz(gh.y));
        const target = s.keepers.reduce((b, k) => (Math.hypot(k.x - gh.x, k.y - gh.y) < Math.hypot(b.x - gh.x, b.y - gh.y) ? k : b), s.keepers[0]);
        if (target) g.rotation.y = Math.atan2(target.x - gh.x, target.y - gh.y);
        g.traverse((m) => {
          const mm = m as THREE.Mesh;
          if (mm.isMesh) (mm.material as THREE.MeshStandardMaterial).opacity = 0.8 * fade;
        });
      }
      for (const k of s.keepers) {
        const at = new THREE.Vector3(wx(k.x), 1.6, wz(k.y));
        const was = prevCandles.get(k.id) ?? 0;
        if (k.candles > was) fx.sparkle(at, '#ffd27a', 8);
        if (k.scared > 0 && !(prevScared.get(k.id) ?? 0)) fx.bonk(at.setY(1.9));
        prevScared.set(k.id, k.scared);
        prevCandles.set(k.id, k.candles);
      }
      fx.update(dt);
      team.update(s.keepers, dt, (r) => ({ stunned: (r as GraveyardState['keepers'][number]).scared > 0 }));
    },
    tags() {
      return team.tags(last.keepers);
    },
  };
}
