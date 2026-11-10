import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { PartyState } from '../../../shared/party';
import { getBoard } from '../../../shared/board/boards';
import { currentPlayer, exits } from '../../../shared/board/engine';
import type { BoardDef, BoardState, SpaceType } from '../../../shared/board/types';
import { roundedRect } from '../../../shared/board/layout';
import { groundAt } from '../../../shared/board/terrain';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { darken, makeScene, mesh, toonWater, toy } from '../kit';
import { ramp, terrainMesh, waves } from '../terrain';
import { place, sky, texture } from '../assets';
import { fitProp } from './crew';
import { TILE_H, spaceGeo } from '../spaceShapes';
import { mapCam, steerMap } from '../../mapCam';

/** This frame's map-view controls; main.ts points it at the input manager. */
export let mapLook: () => { panX: number; panY: number; orbit: number; tilt: number; zoom: number } = () => ({ panX: 0, panY: 0, orbit: 0, tilt: 0, zoom: 0 });
export function setMapLook(f: typeof mapLook): void {
  mapLook = f;
}
import type { Tag, View } from '../stage';
import { sandMap, sandMaterial } from '../nature';

const SPACE_COLORS: Record<SpaceType, string> = {
  key: '#2f7dff',
  heart: '#21c45a',
  thorn: '#ff3b4e',
  crate: '#ff9f1c',
  lucky: '#ffc21a',
  event: '#14b8a6',
  post: '#8b5cf6',
  duel: '#ff6a00',
  stew: '#b4532a',
  fountain: '#ff7bd5',
  spring: '#7ddc3c',
  cannon: '#4b5563',
  vent: '#45e3ff',
  dynamite: '#e11d48',
  snare: '#4d7c0f',
  wisp: '#9a5bff',
  station: '#ff8a1f',
  counter: '#ff3fd2',
  camp: '#a16207',
};
const SPACE_ICON: Record<SpaceType, string> = {
  key: '+',
  heart: '♥',
  thorn: '−',
  crate: '▣',
  lucky: '★',
  event: '!',
  post: '⚑',
  duel: '⚔',
  stew: '♨',
  fountain: '♥',
  spring: '⇡',
  cannon: '◎',
  vent: '≋',
  dynamite: '✸',
  snare: '❦',
  wisp: '☾',
  station: '$',
  counter: '⚡',
  camp: '⌂',
};
/** Kenney models that float or stand on each kind of space. [model, size, floats] */
const SPACE_PROP: Partial<Record<SpaceType, [string, number, boolean]>> = {
  key: ['platformer/key', 0.55, true],
  heart: ['platformer/heart', 0.6, true],
  thorn: ['platformer/spike-block', 0.55, false],
  crate: ['platformer/crate-item', 0.7, false],
  lucky: ['platformer/star', 0.6, true],
  fountain: ['platformer/heart', 0.9, true],
  spring: ['platformer/spring', 0.8, false],
  cannon: ['pirate/cannon', 0.9, false],
  dynamite: ['platformer/bomb', 0.7, false],
  snare: ['forest/plant', 0.8, false],
  camp: ['forest/tent', 1.6, false],
};

function iconTexture(icon: string, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // fills the whole square: the space's own shape cuts it out
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '900 78px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCrown(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', roughness: 0.22, metalness: 0.75, emissive: '#5a3a00' });
  const band = mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.35, 28, 1, true), gold);
  band.material = gold.clone();
  (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.13, 0.42, 10), gold);
    spike.position.set(Math.cos(a) * 0.52, 0.36, Math.sin(a) * 0.52);
    g.add(spike);
    const ball = mesh(new THREE.SphereGeometry(0.08, 10, 8), gold);
    ball.position.set(Math.cos(a) * 0.52, 0.6, Math.sin(a) * 0.52);
    g.add(ball);
  }
  const gemMat = new THREE.MeshStandardMaterial({ color: '#ff3b6b', roughness: 0.1, emissive: '#550018' });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const gem = mesh(new THREE.SphereGeometry(0.08, 10, 8), gemMat);
    gem.position.set(Math.cos(a) * 0.53, 0, Math.sin(a) * 0.53);
    g.add(gem);
  }
  return g;
}

/** Theme dressing. Returns a per-frame animator. */
type Dresser = (scene: THREE.Scene, def: BoardDef) => (s: BoardState, t: number, dt: number) => void;

const hollowDecor: Dresser = (scene, def) => {
  // a valley: the village on its hillside, wooded slopes rising all round
  const valley = (x: number, z: number) => {
    const e = Math.hypot(x / 29, (z + 2) / 21);
    return groundAt(def.hills, x, z) + ramp(1, 2.3, e) * (9 + waves(x, z) * 5) + waves(x * 2, z * 2) * 0.3 * ramp(0.9, 1.2, e);
  };
  const grassA = new THREE.Color('#5d9a44'), grassB = new THREE.Color('#4f8a3c'), moss = new THREE.Color('#3e6e3a');
  const dusk = new THREE.Color('#5a4a7a'), dirt = new THREE.Color('#8a6a4a');
  scene.add(
    terrainMesh({
      w: 170, d: 150, seg: 120, cz: -10,
      height: valley,
      color: (x, z, y, slope, c) => {
        const far = ramp(1, 2.4, Math.hypot(x / 29, (z + 2) / 21));
        // mown stripes near the village, mossy higher up, rock where it's steep
        c.copy(Math.floor((x + z) / 3) % 2 ? grassA : grassB).lerp(moss, Math.min(1, y / 9)).lerp(dusk, far * 0.55);
        if (slope > 0.45) c.lerp(dirt, 0.6);
      },
    }),
  );
  // the pond under the Moon Bridge
  const pond = toonWater('#3f7fd6', 2);
  const pondMesh = mesh(new THREE.CircleGeometry(1, 40), pond.material, { cast: false, receive: true });
  pondMesh.rotation.x = -Math.PI / 2;
  pondMesh.scale.set(7.5, 2.6, 1);
  pondMesh.position.set(0, 0.04, 3.1);
  scene.add(pondMesh);
  // a sandy shore round the pond
  const shore = mesh(new THREE.CircleGeometry(1, 48), sandMaterial('#ead1a0', 4), { cast: false, receive: true });
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(8.4, 3.3, 1);
  shore.position.set(0, 0.025, 3.1);
  scene.add(shore);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    place(scene, i % 3 ? 'platformer/grass' : 'forest/stones', Math.cos(a) * 7.8, 0, 3.1 + Math.sin(a) * 2.9, { s: 1.4, ry: a, shadow: false });
  }
  // lily pads with glowing flowers
  for (const [x, z] of [[-4, 2.4], [-2.4, 4.2], [3.1, 2.3], [4.6, 3.9], [0.6, 4.6]] as [number, number][]) {
    const pad = mesh(new THREE.CircleGeometry(0.45, 12), toy('#3fae55', 0.6), { cast: false });
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.07, z);
    scene.add(pad);
  }
  // forest on the valley slopes: thick at the back and sides, open toward the camera
  for (let i = 0; i < 70; i++) {
    const a = Math.PI + (i / 70) * Math.PI * 1.3 - 0.15;
    const rr = 1.08 + ((i * 37) % 10) / 22;
    const x = Math.cos(a) * 29 * rr * 1.05;
    const z = Math.sin(a) * 21 * rr - 2;
    if (z > 10) continue;
    place(scene, ['forest/tree-high', 'forest/tree', 'graveyard/pine-crooked', 'platformer/tree-pine'][i % 4], x, valley(x, z), z, { s: 2.3 + (i % 5) * 0.35, ry: i }).userData.placed = true;
  }
  // far mountain ranges, layered blue-violet into the haze
  for (let ring = 0; ring < 2; ring++) {
    const col = toy(ring ? '#4b3f78' : '#5d4f8f', 0.95);
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 1.05 + (i / 15) * Math.PI * 0.9;
      const R = 85 + ring * 25;
      const h = 16 + ((i * 53 + ring * 19) % 13) + ring * 8;
      const m = mesh(new THREE.ConeGeometry(14 + (i % 3) * 4, h, 6), col, { cast: false });
      m.position.set(Math.cos(a) * R, h / 2 - 4, Math.sin(a) * R * 0.8 - 20);
      m.rotation.y = i;
      m.userData.sky = true;
      scene.add(m);
    }
  }
  // fireflies and drifting sky lanterns
  const flyGeo = new THREE.BufferGeometry();
  const flyBase: number[] = [];
  for (let i = 0; i < 160; i++) flyBase.push((Math.random() - 0.5) * 50, 0.6 + Math.random() * 3, (Math.random() - 0.5) * 34 - 2);
  flyGeo.setAttribute('position', new THREE.Float32BufferAttribute(flyBase.slice(), 3));
  const flyMat = new THREE.PointsMaterial({ color: '#fff27a', size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.userData.sky = true;
  scene.add(flies);
  const skyLanterns: THREE.Mesh[] = [];
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8a1f', emissiveIntensity: 1.4 });
  for (let i = 0; i < 18; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.6, 8), lanternMat, { cast: false });
    l.userData.sky = true;
    l.userData.seed = i;
    scene.add(l);
    skyLanterns.push(l);
  }
  // crooked trees and pumpkins around the edge
  const trunk = toy('#4a3426', 0.8);
  const leaves = [toy('#5a3d8c', 0.6), toy('#2f6e5a', 0.6), toy('#7a3d6e', 0.6)];
  const pumpkin = toy('#ff7a1a', 0.45);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 18 + (i % 3) * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.66;
    // tall trees only along the back and far sides, so they never block the follow camera
    if (i % 2 === 0 && (z < 2 || Math.abs(x) > 17)) {
      place(scene, i % 4 === 0 ? 'forest/tree-high' : 'forest/tree', x, 0, z, { s: 2.4 + (i % 3) * 0.3, ry: i });
      void leaves;
    } else {
      const p = mesh(new THREE.SphereGeometry(0.6, 16, 12), pumpkin);
      p.scale.y = 0.7;
      p.position.set(x, 0.42, z);
      scene.add(p);
      const face = mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe066' }), { cast: false });
      face.position.set(x * 0.97, 0.5, z * 0.97);
      scene.add(face);
    }
  }
  // the manor at the top of the board
  const wall = toy('#7d6aa8', 0.7);
  const roof = toy('#3b2d5c', 0.6);
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd76a' });
  const manor = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(6, 4, 3), wall, { receive: true });
  body.position.y = 2;
  const top = mesh(new THREE.ConeGeometry(4.6, 2.6, 4), roof);
  top.position.y = 5.3;
  top.rotation.y = Math.PI / 4;
  const tower = mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 12), wall);
  tower.position.set(3.2, 3, 0.2);
  const towerTop = mesh(new THREE.ConeGeometry(1.2, 2, 12), roof);
  towerTop.position.set(3.2, 7, 0.2);
  manor.add(body, top, tower, towerTop);
  for (const [x, y] of [[-1.6, 2.6], [0, 2.6], [1.6, 2.6], [3.2, 4.4]] as [number, number][]) {
    const w = mesh(new THREE.PlaneGeometry(0.7, 0.9), glow, { cast: false });
    w.position.set(x, y, 1.52);
    manor.add(w);
  }
  manor.position.set(0, 0, -22);
  scene.add(manor);
  // lantern posts
  const posts: THREE.Mesh[] = [];
  for (const [x, z] of [[-14, -9], [14, -9], [-14, 9], [14, 9], [-6, 0], [6, 0]] as [number, number][]) {
    const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), trunk);
    post.position.set(x, 1.2, z);
    scene.add(post);
    const lamp = mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: '#ffb020', emissiveIntensity: 1 }));
    lamp.position.set(x, 2.6, z);
    scene.add(lamp);
    posts.push(lamp);
  }
  // village props from the Mini Forest kit
  place(scene, 'forest/tent', -16, 0, -6, { s: 2.4, ry: 0.8 });
  place(scene, 'forest/tent', 16.5, 0, -5, { s: 2.2, ry: -0.9 });
  place(scene, 'forest/building-structure', 12.5, 0, -15, { s: 2.4, ry: 0.2 });
  place(scene, 'forest/building-roof', 12.5, 2.5, -15, { s: 2.4, ry: 0.2 });
  place(scene, 'forest/flag', -10, 0, -11.5, { s: 2.5 });
  place(scene, 'forest/flag', 13, 0, 11, { s: 2.5 });
  for (let i = 0; i < 8; i++) place(scene, 'forest/fence', -19 + i * 1.1 * 2.4, 0, 13.4, { s: 2.4 });
  for (const [x, z] of [[-18, 7], [19, -1], [0, 12.5]] as [number, number][]) place(scene, 'forest/rocks-low', x, 0, z, { s: 2, ry: x });
  for (const [x, z] of [[-2, 1], [2.5, 0.6], [-7, -5.6], [7, 5.6]] as [number, number][]) place(scene, 'platformer/mushrooms', x, 0, z, { s: 2.2, shadow: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff6d6', fog: false }));
  moon.position.set(30, 30, -70);
  moon.userData.sky = true;
  scene.add(moon);
  const hemi = scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const sun = scene.children.find((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
  // graveyard behind the board (Kenney Graveyard Kit)
  const G = 2.6;
  for (let i = 0; i < 12; i++) place(scene, 'graveyard/iron-fence', -16 + i * G, 0, -17.2, { s: G });
  place(scene, 'graveyard/iron-fence-border-gate', 15.5, 0, -17.2, { s: G });
  const stones = ['graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-bevel', 'graveyard/gravestone-decorative'];
  for (let i = 0; i < 10; i++) {
    const x = (i < 5 ? -18 : 12) + (i % 5) * 1.6;
    const z = -15.2 + ((i * 7) % 3) * 0.9;
    place(scene, stones[i % 4], x, 0, z, { s: G, ry: Math.sin(i * 3) * 0.25 });
  }
  place(scene, 'graveyard/crypt', 17.5, 0, -12.5, { s: G * 1.3, ry: -0.5 });
  place(scene, 'graveyard/coffin', -20.5, 0, -12, { s: G, ry: 0.4 });
  for (const [x, z] of [[-21, -2], [21.5, 1], [-20, 8], [20, 9.5], [-8, -16], [3, -16.5]] as [number, number][]) {
    place(scene, x > 0 ? 'graveyard/pine-crooked' : 'graveyard/pine-fall', x, 0, z, { s: 2.6, ry: x });
  }
  for (const [x, z, tall] of [[-3, 3, 0], [3.5, -3, 1], [-11, 3.2, 1], [11, -3, 0], [-1, -9, 0], [9.5, 8, 1], [-15, 11.5, 0]] as [number, number, number][]) {
    place(scene, tall ? 'graveyard/pumpkin-tall-carved' : 'graveyard/pumpkin-carved', x, 0, z, { s: 2.4, ry: x });
  }
  for (const [x, z] of [[-4.5, -15.5], [8, -15.5]] as [number, number][]) place(scene, 'graveyard/fire-basket', x, 0, z, { s: 2.4 });
  place(scene, 'graveyard/candle-multiple', -13, 0, -13.6, { s: 2.6 });
  // ghosts drift around the graveyard, only out at night
  const ghosts: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const g = place(scene, 'graveyard/character-ghost', 0, 0, 0, { s: 2.6, shadow: false });
    g.traverse((m) => {
      const mm = m as THREE.Mesh;
      if (mm.isMesh) {
        mm.material = (mm.material as THREE.Material).clone();
        (mm.material as THREE.Material).transparent = true;
      }
    });
    ghosts.push(g);
  }
  const morning = sky('morning');
  const nightTex = sky('night');
  const daySky = new THREE.Color('#ffb38a');
  const nightSky = new THREE.Color('#1d1846');
  const bg = new THREE.Color();
  scene.background = morning ?? bg;
  let k = 0;
  // closed routes fade out
  const gateLinks = Object.values(def.nodes).filter((n) => n.gate);
  void gateLinks;
  return (s, t, dt) => {
    k += ((s.night ? 1 : 0) - k) * Math.min(1, dt * 2);
    bg.copy(daySky).lerp(nightSky, k);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(bg);
    // swap skyboxes at dusk, dipping the brightness through the swap
    if (morning && nightTex) {
      scene.background = k < 0.5 ? morning : nightTex;
      scene.backgroundIntensity = 0.3 + 0.7 * Math.abs(2 * k - 1);
    }
    ghosts.forEach((g, i) => {
      const a = t * 0.35 + (i / ghosts.length) * Math.PI * 2;
      const gx = Math.cos(a) * (6 + i * 2.5), gz = -15 + Math.sin(a) * 2.2;
      g.position.set(gx, valley(gx, gz) + 1.2 + Math.sin(t * 2 + i) * 0.4, gz);
      g.rotation.y = -a;
      g.visible = k > 0.05;
      g.traverse((m) => {
        const mm = m as THREE.Mesh;
        if (mm.isMesh) (mm.material as THREE.MeshStandardMaterial).opacity = k * 0.85;
      });
    });
    hemi.intensity = 0.9 - k * 0.45;
    sun.intensity = 2.2 - k * 1.3;
    sun.color.set(k > 0.5 ? '#9fb3ff' : '#ffe0b8');
    moon.visible = k > 0.3;
    posts.forEach((p, i) => ((p.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + k * 1.6 + Math.sin(t * 6 + i) * 0.1));
    pond.update(t);
    // fireflies wander and glow brighter at night
    const fp = flyGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const x = flyBase[i * 3], z = flyBase[i * 3 + 2];
      fp.setXYZ(i, x + Math.sin(t * 0.7 + i) * 0.8, valley(x, z) + flyBase[i * 3 + 1] + Math.sin(t * 1.3 + i * 2) * 0.4, z + Math.cos(t * 0.6 + i * 1.7) * 0.8);
    }
    fp.needsUpdate = true;
    flyMat.opacity = 0.25 + k * 0.75;
    skyLanterns.forEach((l) => {
      const sd = l.userData.seed as number;
      const life = (t * 0.035 + sd / 18) % 1;
      l.position.set(-30 + ((sd * 29) % 60) + Math.sin(t * 0.3 + sd) * 2, 2 + life * 34, -30 - ((sd * 13) % 25));
      l.visible = k > 0.2;
    });
  };
};

const cosmoDecor: Dresser = (scene) => {
  scene.fog = null;
  const nebula = sky('space-nebula');
  if (nebula) scene.background = nebula;
  // Kenney Space Kit: hangar, dishes, rockets, astronauts and craters out on the deck
  place(scene, 'space/hangar_roundGlass', -2, -0.05, -15.5, { s: 3.2 });
  place(scene, 'space/satelliteDish_large', -17, -0.05, -8, { s: 3.4, ry: 0.6 });
  place(scene, 'space/satelliteDish', 17.5, -0.05, -8.5, { s: 3.2, ry: -0.8 });
  place(scene, 'space/machine_wireless', 16, -0.05, 9.5, { s: 3, ry: 2.6 });
  place(scene, 'space/machine_generator', -16.5, -0.05, 9.5, { s: 3, ry: 0.4 });
  place(scene, 'space/craft_racer', -9.5, -0.05, -10.5, { s: 2.4, ry: 0.9 });
  place(scene, 'space/craft_speederA', 17, -0.05, 12.5, { s: 2.2, ry: -2.4 });
  place(scene, 'space/astronautA', -3.2, -0.05, 2.6, { s: 1.6, ry: 0.4 });
  place(scene, 'space/astronautB', 3.4, -0.05, -2.6, { s: 1.6, ry: 3.4 });
  place(scene, 'space/alien', 12, -0.05, -10.5, { s: 1.6, ry: -0.6 });
  place(scene, 'space/rover', -12.5, -0.05, -1.2, { s: 4, ry: 1.2 });
  for (const [x, z, big] of [[-5, -9, 1], [7, -9.5, 0], [-11, 10, 0], [5, 10.5, 1], [13, 2.5, 0]] as [number, number, number][]) {
    place(scene, big ? 'space/craterLarge' : 'space/crater', x, -0.04, z, { s: 3.2, shadow: false });
  }
  for (const [x, z] of [[-19.5, 2], [19, -3], [-7, 12.5], [14, -12.6]] as [number, number][]) place(scene, 'space/rock_crystalsLargeA', x, -0.05, z, { s: 2.6, ry: x });
  place(scene, 'station/computer-wide', -14.5, -0.05, -10.6, { s: 2.4, ry: 0.5 });
  place(scene, 'station/container-tall', 18.5, -0.05, 5.5, { s: 2.2 });
  place(scene, 'station/container', 19.8, -0.05, 7.2, { s: 2.2, ry: 0.4 });
  // laser gates mark both ends of Laser Lane
  place(scene, 'modspace/gate-lasers', -18.5, -0.05, 0, { s: 0.75, ry: Math.PI / 2 });
  // a small rocket on a launch pad
  const rocket = new THREE.Group();
  let y = 0;
  for (const [part, h] of [['space/rocket_baseA', 1.6], ['space/rocket_fuelA', 0.5], ['space/rocket_sidesA', 1.0], ['space/rocket_topA', 0.8]] as [string, number][]) {
    place(rocket, part, 0, y, 0, { s: 1 });
    y += h;
  }
  rocket.scale.setScalar(1.8);
  rocket.position.set(-14, -0.05, -15);
  scene.add(rocket);
  // starfield
  const starGeo = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 0.9 + 0.05;
    const r = 120;
    pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 20, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.6, sizeAttenuation: true })));
  // station deck under the ring
  const grid = texture('proto-dark', 9, 9);
  const deckMat = grid ? new THREE.MeshStandardMaterial({ map: grid, color: '#8c9cff', roughness: 0.45 }) : toy('#2c3360', 0.4);
  const deck = mesh(new THREE.CylinderGeometry(22, 21, 1, 72), deckMat, { cast: false, receive: true });
  deck.scale.z = 0.66;
  deck.position.y = -0.55;
  scene.add(deck);
  const rim = mesh(new THREE.TorusGeometry(22, 0.35, 10, 90), new THREE.MeshStandardMaterial({ color: '#45e3ff', emissive: '#1aa8d6', emissiveIntensity: 0.9 }));
  rim.scale.y = 0.66;
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.1;
  scene.add(rim);
  // planets
  const planets: THREE.Object3D[] = [];
  const p1 = mesh(new THREE.SphereGeometry(6, 32, 20), toy('#ff7ab8', 0.5), { cast: false });
  p1.position.set(-36, 10, -40);
  const ring = mesh(new THREE.TorusGeometry(9, 0.6, 8, 64), toy('#ffd1ec', 0.5), { cast: false });
  ring.rotation.x = 1.2;
  p1.add(ring);
  const p2 = mesh(new THREE.SphereGeometry(3.5, 32, 20), toy('#5ad6a0', 0.5), { cast: false });
  p2.position.set(38, 14, -46);
  const p3 = mesh(new THREE.SphereGeometry(2, 24, 16), toy('#ffcf4a', 0.4), { cast: false });
  p3.position.set(18, 22, -50);
  scene.add(p1, p2, p3);
  planets.push(p1, p2, p3);
  // space-kit hardware around the rim of the deck
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = Math.cos(a) * 21;
    const z = Math.sin(a) * 13.6;
    if (Math.abs(z) < 3 && x > 0) continue; // leave room for the cannon
    if (z > 4) continue; // keep the camera side clear
    place(scene, i % 3 === 0 ? 'space/machine_wireless' : i % 3 === 1 ? 'station/container-tall' : 'space/satelliteDish', x, -0.05, z, { s: 2.6, ry: -a + Math.PI / 2 });
  }
  for (const [x, z, ry] of [[-11, 7.5, 0.3], [9, -6, 3.4], [-4, 7.5, 2.4], [4, -7.8, -0.5]] as [number, number, number][]) {
    place(scene, 'space/meteor', x, -0.3, z, { s: 2.2, ry });
  }
  // laser cannon at the right end of the lane, aiming back along it
  const cannon = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 20), toy('#5b647d', 0.35));
  base.position.y = 0.6;
  const barrel = mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.4, 20), toy('#e6e9f5', 0.3));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(-1.2, 1.9, 0);
  const tip = mesh(new THREE.TorusGeometry(0.6, 0.18, 10, 20), new THREE.MeshStandardMaterial({ color: '#ff3fd2', emissive: '#ff3fd2', emissiveIntensity: 1 }));
  tip.rotation.y = Math.PI / 2;
  tip.position.set(-2.9, 1.9, 0);
  cannon.add(base, barrel, tip);
  cannon.position.set(21.5, 0, 0);
  scene.add(cannon);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ff5ae0', transparent: true, opacity: 0.8 }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0, 1.9, 0);
  beam.visible = false;
  scene.add(beam);
  // the Command Core: a round top deck on four legs, with Laser Lane running underneath
  const core = new THREE.Group();
  const coreDeck = mesh(new THREE.CylinderGeometry(6.2, 5.6, 0.45, 48), deckMat, { receive: true });
  coreDeck.position.y = 4.62;
  const coreRim = mesh(new THREE.TorusGeometry(6.2, 0.16, 8, 64), new THREE.MeshStandardMaterial({ color: '#ff5ae0', emissive: '#ff3fd2', emissiveIntensity: 1 }), { cast: false });
  coreRim.rotation.x = Math.PI / 2;
  coreRim.position.y = 4.86;
  core.add(coreDeck, coreRim);
  for (const [lx, lz] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.45, 0.7, 5, 12), toy('#5b647d', 0.35));
    leg.position.set(lx, 2.1, lz);
    core.add(leg);
  }
  // a hologram of the station spinning over the middle of the top deck
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: '#45e3ff', wireframe: true, transparent: true, opacity: 0.8 }));
  holo.position.y = 7.3;
  const holoRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: '#ff5ae0' }));
  holoRing.position.y = 7.3;
  holoRing.rotation.x = 1.2;
  core.add(holo, holoRing);
  scene.add(core);
  // a big blue planet far below the station, with a soft glowing rim
  const world = mesh(new THREE.SphereGeometry(70, 64, 32), toy('#3d6fe0', 0.6), { cast: false, receive: false });
  world.position.set(60, -80, -170);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(73, 64, 32), new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.18, side: THREE.BackSide }));
  atmo.position.copy(world.position);
  const clouds = mesh(new THREE.SphereGeometry(70.6, 32, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 1 }), { cast: false });
  clouds.position.copy(world.position);
  clouds.scale.set(1, 0.98, 1);
  scene.add(world, atmo, clouds);
  // an asteroid belt drifting around the station
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, toy('#8a7f9c', 0.9), 140);
  const rockData: [number, number, number, number][] = [];
  for (let i = 0; i < 140; i++) rockData.push([42 + Math.random() * 22, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 8 + 3, 0.4 + Math.random() * 1.4]);
  scene.add(rocks);
  const dummy = new THREE.Object3D();
  // passing ships with engine glow, and blinking beacons on masts
  const ships: THREE.Object3D[] = [];
  for (const [i, name] of ['space/craft_speederA', 'space/craft_racer', 'space/craft_speederA'].entries()) {
    const sh = place(scene, name, 0, 0, 0, { s: 2.2 + i * 0.4, shadow: false });
    const glowM = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff9f40' }));
    glowM.position.set(0, 0.3, -1.4);
    sh.add(glowM);
    ships.push(sh);
  }
  const beacons: THREE.Mesh[] = [];
  for (const [x, z] of [[-20, -9], [20, -9], [-8, -14], [9, -14]] as [number, number][]) {
    const mast = mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), toy('#c8cee0', 0.3));
    mast.position.set(x, 2.9, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b4e' }));
    lamp.position.set(x, 6, z);
    scene.add(mast, lamp);
    beacons.push(lamp);
  }
  let lastCounter = -1;
  let fire = 0;
  return (s, t, dt) => {
    holo.rotation.y = t * 0.8;
    holo.rotation.x = t * 0.3;
    holoRing.rotation.z = t * 1.2;
    clouds.rotation.y = t * 0.01;
    world.rotation.y = t * 0.006;
    rockData.forEach(([R, a0, y, sc], i) => {
      const a = a0 + t * (0.6 / R);
      dummy.position.set(Math.cos(a) * R, y + Math.sin(a * 3 + i) * 0.6, Math.sin(a) * R * 0.75 - 6);
      dummy.rotation.set(t * 0.2 + i, t * 0.3 + i, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;
    ships.forEach((sh, i) => {
      const u = ((t * (0.025 + i * 0.008) + i * 0.37) % 1) * 2 - 1;
      sh.position.set(u * 90, 14 + i * 6, -45 - i * 15 + Math.sin(u * 3) * 4);
      sh.rotation.set(0, Math.PI / 2, Math.sin(t + i) * 0.2);
    });
    beacons.forEach((b, i) => (b.visible = Math.sin(t * 3 + i * 1.6) > 0.3));
    if (lastCounter !== -1 && s.counter > lastCounter) fire = 1.2;
    lastCounter = s.counter;
    fire = Math.max(0, fire - dt);
    beam.visible = fire > 0;
    beam.scale.x = beam.scale.z = 0.4 + Math.sin(t * 40) * 0.15 + fire;
    planets.forEach((p, i) => (p.rotation.y = t * (0.1 + i * 0.05)));
    (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + (1 - s.counter / 8) * 2 + Math.sin(t * 8) * 0.2;
  };
};

const gulchDecor: Dresser = (scene, def) => {
  // the desert floor, Bonanza Peak, buttes, and striped canyon walls closing the valley in
  const land = (x: number, z: number) => {
    const e = Math.hypot(x / 66, (z + 8) / 52);
    return groundAt(def.hills, x, z) + ramp(1, 1.18, e) * (17 + waves(x * 0.7, z * 0.7) * 6) + waves(x * 1.5, z * 1.5) * 0.45 * ramp(0.62, 0.95, e);
  };
  const sandA = new THREE.Color('#ecb878'), sandB = new THREE.Color('#e3a96a');
  const strata = ['#c4673e', '#d98a52', '#b5532f', '#e2a066', '#a8462a'].map((c) => new THREE.Color(c));
  const brush = new THREE.Color('#9aa65a');
  scene.add(
    terrainMesh({
      w: 200, d: 170, seg: 150, cz: -8,
      height: land,
      color: (x, z, y, slope, c) => {
        c.copy(waves(x * 3, z * 3) > 0.35 ? sandB : sandA);
        if (y > 0.8 || slope > 0.35) {
          // rock in horizontal bands, like real canyon walls
          c.copy(strata[(((Math.floor(y / 1.4 + waves(x, z) * 0.4)) % strata.length) + strata.length) % strata.length]);
          if (slope < 0.18 && y > 2) c.lerp(sandA, 0.35);
        }
        if (y < 0.5 && waves(x * 5, z * 5) > 0.72) c.lerp(brush, 0.7);
      },
    }),
  );
  // desert ripples over the whole canyon floor (and faintly on the rock)
  const canyon = scene.children[scene.children.length - 1] as THREE.Mesh;
  (canyon.material as THREE.MeshStandardMaterial).map = sandMap(200 / 7, 170 / 7);
  (canyon.material as THREE.MeshStandardMaterial).needsUpdate = true;
  // the Bonanza Mine up top: timber frame, rails out of the shaft, and a glittering gold pile
  const summit = new THREE.Vector3(0, 0, -38);
  place(scene, 'pirate/structure', summit.x, 0, summit.z, { s: 1.6 });
  place(scene, 'pirate/structure-roof', summit.x, 3.5, summit.z, { s: 1.6 });
  const shaft = mesh(new THREE.BoxGeometry(2.4, 2.6, 0.4), toy('#1a120c', 0.9), { cast: false });
  shaft.position.set(summit.x, 1.3, summit.z + 1.2);
  scene.add(shaft);
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#a57400', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });
  const nuggets: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const g = mesh(new THREE.OctahedronGeometry(0.3 + (i % 3) * 0.12), gold);
    g.position.set(summit.x + 3 + Math.cos(i) * 1.1, 0.2 + (i % 4) * 0.12, summit.z + 1.5 + Math.sin(i * 1.7) * 0.9);
    g.rotation.set(i, i * 2, 0);
    scene.add(g);
    nuggets.push(g);
  }
  place(scene, 'pirate/barrel', summit.x - 3, 0, summit.z + 1.2, { s: 0.8 });
  place(scene, 'pirate/crate', summit.x - 3.2, 0, summit.z - 0.6, { s: 0.9, ry: 0.4 });
  place(scene, 'pirate/flag-high-pennant', summit.x + 2.2, 0, summit.z - 1.8, { s: 1.5 });
  // a water tower and a windmill out on the flats
  const tower = new THREE.Group();
  const tank = mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 16), toy('#9a5a32', 0.8));
  tank.position.y = 5.2;
  const cap = mesh(new THREE.ConeGeometry(1.9, 1.1, 16), toy('#7a3b2a', 0.7));
  cap.position.y = 6.8;
  tower.add(tank, cap);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.2, 6), toy('#6b4a2b', 0.8));
    leg.position.set(lx, 2.1, lz);
    tower.add(leg);
  }
  tower.position.set(-31, 0, -9);
  scene.add(tower);
  const mill = new THREE.Group();
  const millPole = mesh(new THREE.CylinderGeometry(0.15, 0.3, 7, 6), toy('#6b4a2b', 0.8));
  millPole.position.y = 3.5;
  const fan = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.35, 1.8, 0.06), toy('#e6e9f5', 0.5));
    blade.position.y = 1;
    const arm = new THREE.Group();
    arm.add(blade);
    arm.rotation.z = (i / 8) * Math.PI * 2;
    fan.add(arm);
  }
  fan.position.set(0, 7, 0.4);
  mill.add(millPole, fan);
  mill.position.set(31, 0, -7);
  mill.rotation.y = -0.4;
  scene.add(mill);
  // hawks circling the peak, tumbleweeds rolling across the flats
  const hawks: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Group();
    for (const side of [-1, 1]) {
      const w = mesh(new THREE.BoxGeometry(1.1, 0.05, 0.35), toy('#3a2a20', 0.8), { cast: false });
      w.position.x = side * 0.55;
      w.rotation.z = side * 0.25;
      h.add(w);
    }
    h.userData.sky = true;
    scene.add(h);
    hawks.push(h);
  }
  const weeds: THREE.Mesh[] = [];
  const weedMat = new THREE.MeshStandardMaterial({ color: '#b48a4a', wireframe: true });
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), weedMat);
    w.userData.sky = true;
    scene.add(w);
    weeds.push(w);
  }
  // town buildings inside the loop
  const woods = ['#b0703e', '#c9874d', '#9a5a32', '#d49a5c'];
  for (let i = 0; i < 8; i++) {
    const x = -13 + (i % 4) * 8.6;
    const z = i < 4 ? -5 : 5;
    if (Math.abs(x - -7.5) < 2.2 || Math.abs(x - 7.5) < 2.2) continue; // keep the cut-throughs clear
    if (i % 2 === 1) {
      // a pirate-kit timber frame building with a roof, saloon style
      place(scene, 'pirate/structure', x, 0, z, { s: 1.5, ry: z < 0 ? 0 : Math.PI });
      place(scene, 'pirate/structure-roof', x, 3.3, z, { s: 1.5, ry: z < 0 ? 0 : Math.PI });
      place(scene, 'pirate/barrel', x + 2.4, 0, z + 1, { s: 0.7 });
      continue;
    }
    const h = 2.5 + (i % 3) * 0.8;
    const b = mesh(new THREE.BoxGeometry(4, h, 3.2), toy(woods[i % 4], 0.8), { receive: true });
    b.position.set(x, h / 2, z);
    scene.add(b);
    const front = z < 0 ? 1.62 : -1.62;
    const facade = mesh(new THREE.BoxGeometry(4.4, 1.2, 0.3), toy(darken(woods[i % 4], 0.2), 0.8));
    facade.position.set(x, h + 0.5, z + front);
    scene.add(facade);
    const roofM = mesh(new THREE.BoxGeometry(4.3, 0.25, 3.6), toy('#7a3b2a', 0.7));
    roofM.position.set(x, h + 0.1, z);
    scene.add(roofM);
    const door = mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), toy('#5a3520', 0.7), { cast: false });
    door.position.set(x, 0.75, z + front + (front > 0 ? 0.02 : -0.02));
    scene.add(door);
    for (const wxo of [-1.3, 1.3]) {
      const win = mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#806020', roughness: 0.3 }), { cast: false });
      win.position.set(x + wxo, h * 0.62, z + front + (front > 0 ? 0.02 : -0.02));
      scene.add(win);
    }
  }
  // cacti
  const green = toy('#3fae55', 0.5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rr = 29 + (i % 3) * 4;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.7;
    if (z < -12 && Math.abs(x) < 24) continue; // the mountain trail
    if (z > 14 && Math.abs(x) < 13) continue; // the mesa
    const c = mesh(new THREE.CapsuleGeometry(0.4, 1.8, 6, 10), green);
    c.position.set(x, 1.3, z);
    scene.add(c);
    if (i % 2) {
      const arm = mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), green);
      arm.position.set(x + 0.55, 1.6, z);
      scene.add(arm);
    }
  }
  // railway around the outside and a little train
  const trackPts = roundedRect(50, 34, 8, 220);
  const tie = toy('#6b4a2b', 0.9);
  const tiesGeo = new THREE.BoxGeometry(0.25, 0.12, 1.4);
  trackPts.forEach(([x, z], i) => {
    if (i % 2) return;
    const [nx, nz] = trackPts[(i + 1) % trackPts.length];
    const t = mesh(tiesGeo, tie, { cast: false, receive: true });
    t.position.set(x, 0.06, z);
    t.rotation.y = -Math.atan2(nz - z, nx - x);
    scene.add(t);
  });
  const daySky = sky('day');
  if (daySky) scene.background = daySky;
  const train = new THREE.Group();
  const cars: THREE.Object3D[] = [];
  // Kenney Train Kit: a steam locomotive pulling coal, lumber and boxcars
  for (const [i, name] of ['train/train-locomotive-a', 'train/train-carriage-coal', 'train/train-carriage-lumber', 'train/train-carriage-box'].entries()) {
    const holder = new THREE.Group();
    // the kit's trains point down +z; turn them to run along +x like our track maths expects
    place(holder, name, 0, 0, 0, { s: 1.15, ry: Math.PI / 2 });
    holder.userData.gap = i * 0.021;
    cars.push(holder);
    train.add(holder);
  }
  scene.add(train);
  place(scene, 'pirate/tower-complete-small', -27, 0, -2, { s: 1.2 });
  place(scene, 'pirate/tower-complete-small', 27, 0, 3, { s: 1.1, ry: 2 });
  for (const [x, z, ry] of [[-3, 0.5, 0], [3, -0.5, 1], [-17, -9, 0.4], [17, 9, 2], [-17, 9.5, 1.2], [17, -9.5, 0.8]] as [number, number, number][]) {
    place(scene, 'pirate/crate', x, 0, z, { s: 0.9, ry });
    place(scene, 'pirate/barrel', x + 1.1, 0, z + 0.6, { s: 0.7, ry });
  }
  for (const [x, z] of [[-30, 12], [30, -12], [-34, -6], [33, 8], [-20, 22], [22, 20]] as [number, number][]) place(scene, 'pirate/rocks-sand-a', x, 0, z, { s: 1.4, ry: x });
  place(scene, 'pirate/flag-high-pennant', 0, 0, 2.4, { s: 1.4 });
  place(scene, 'pirate/chest', 1.6, 0, -1.5, { s: 1, ry: 0.6 });

  // station platforms
  for (const st of def.stations ?? []) {
    const n = def.nodes[st];
    const pf = mesh(new THREE.BoxGeometry(3, 0.4, 2), toy('#8a5a34', 0.8), { receive: true });
    pf.position.set(n.x * 1.12, 0.2, n.z * 1.17);
    scene.add(pf);
    const roof = mesh(new THREE.BoxGeometry(3.4, 0.2, 2.4), toy('#c43c3c', 0.6));
    roof.position.set(n.x * 1.12, 2.6, n.z * 1.17);
    scene.add(roof);
  }
  const at = (u: number) => {
    const k = ((u % 1) + 1) % 1 * trackPts.length;
    const i = Math.floor(k);
    const f = k - i;
    const a = trackPts[i];
    const b = trackPts[(i + 1) % trackPts.length];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])] as const;
  };
  return (_s, t, dt) => {
    cars.forEach((car) => {
      const [x, z, ang] = at(t * 0.012 - (car.userData.gap as number));
      car.position.set(x, groundAt(def.hills, x, z), z);
      car.rotation.y = -ang;
    });
    fan.rotation.z += dt * 1.6;
    nuggets.forEach((g, i) => ((g.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 3 + i * 2.1)) * 0.8));
    hawks.forEach((h, i) => {
      const a = t * (0.25 + i * 0.06) + i * 2;
      h.position.set(Math.cos(a) * (9 + i * 3), 17 + i * 2, -34 + Math.sin(a) * (7 + i * 2));
      h.rotation.y = -a;
      h.children.forEach((w, k) => (w.rotation.z = (k ? 1 : -1) * (0.25 + Math.sin(t * 6 + i) * 0.2)));
    });
    weeds.forEach((w, i) => {
      const u = ((t * 0.05 + i * 0.21) % 1) * 2 - 1;
      const x = u * 45, z = 18 + i * 3 - (i % 2) * 40;
      w.position.set(x, land(x, z) + 0.6 + Math.abs(Math.sin(t * 3 + i)) * 0.5, z);
      w.rotation.z -= dt * 3;
    });
  };
};

const DECOR: Record<BoardDef['theme'], Dresser> = { hollow: hollowDecor, cosmo: cosmoDecor, gulch: gulchDecor };
const SKY: Record<BoardDef['theme'], [string, string, [string, number, number] | undefined]> = {
  hollow: ['#ff9a7a', '#ffd8b0', ['#ffb38a', 40, 110]],
  cosmo: ['#05041a', '#2a1660', undefined],
  gulch: ['#4ab3ff', '#ffe2b0', ['#ffe2b0', 60, 140]],
};
const PATH_COLOR: Record<BoardDef['theme'], string> = { hollow: '#d9b98a', cosmo: '#9fb4ff', gulch: '#a8743f' };
const RAIL_COLOR: Record<BoardDef['theme'], string> = { hollow: '#ffb347', cosmo: '#45e3ff', gulch: '#ffcf5a' };

/**
 * Keep scenery off the path: anything small enough to move that crowds a space is nudged
 * straight out from it, so trees, rocks and fences leave a clear lane around every space.
 */
function clearPath(scene: THREE.Scene, from: number, def: BoardDef, gy: (x: number, z: number) => number): void {
  const nodes = Object.values(def.nodes);
  const pts: [number, number, number][] = nodes.map((n) => [n.x, n.z, n.y]);
  // halfway points too, so nothing sits on the walkway between two spaces
  for (const n of nodes) for (const id of n.next) {
    const m = def.nodes[id];
    pts.push([(n.x + m.x) / 2, (n.z + m.z) / 2, (n.y + m.y) / 2]);
  }
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = from; i < scene.children.length; i++) {
    const o = scene.children[i];
    if (o.userData.ground || o.userData.sky || o.userData.keep) continue;
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getSize(size);
    box.getCenter(centre);
    const r = Math.max(size.x, size.z) / 2;
    // big set pieces (manor, mine, decks) and groups spread over the map stay where they are
    if (r > 3.2 || Math.hypot(centre.x - o.position.x, centre.z - o.position.z) > r * 0.6 + 0.3) continue;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const [px, pz, py] of pts) {
        // only things at about the same height as the path get in its way
        if (box.max.y < py - 0.5 || box.min.y > py + 2.5) continue;
        const need = 1.35 + r * 0.85;
        const dx = o.position.x - px;
        const dz = o.position.z - pz;
        const d = Math.hypot(dx, dz);
        if (d >= need) continue;
        const ux = d > 1e-3 ? dx / d : 1;
        const uz = d > 1e-3 ? dz / d : 0;
        const before = gy(o.position.x, o.position.z);
        o.position.x = px + ux * need;
        o.position.z = pz + uz * need;
        if (def.hills && !o.userData.fixedY) o.position.y += gy(o.position.x, o.position.z) - before;
        moved = true;
      }
      if (!moved) break;
      box.setFromObject(o);
    }
  }
}

export function boardView(env: THREE.Texture, party: PartyState, players: PlayerInfo[]): View {
  const def = getBoard(party.board!.boardId);
  const gy = (x: number, z: number) => groundAt(def.hills, x, z);
  const [top, bottom, fog] = SKY[def.theme];
  const scene = makeScene(env, { skyTop: top, skyBottom: bottom, fog, shadowSize: 30, sunDir: [12, 26, 16] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  const c0 = scene.children.length;
  const animateDecor = DECOR[def.theme](scene, def);
  // scenery stands on the hills (sky things and the ground itself excepted)
  if (def.hills) {
    for (let i = c0; i < scene.children.length; i++) {
      const o = scene.children[i];
      if (o.userData.ground || o.userData.sky || o.userData.placed) continue;
      o.position.y += gy(o.position.x, o.position.z);
    }
  }
  clearPath(scene, c0, def, gy);

  // spaces
  const rimMat = toy('#ffffff', 0.35);
  const capMats = new Map<SpaceType, THREE.Material>();
  const tileMats = new Map<SpaceType, THREE.Material>();
  const steamSpots: THREE.Vector3[] = [];
  const postFlags = new Map<string, THREE.Mesh>();
  // every space is a little spring: it dips when someone lands on it and wobbles back
  const springs = new Map<string, { parts: THREE.Object3D[]; base: number[]; y: number; v: number }>();
  for (const [nodeId, n] of Object.entries(def.nodes)) {
    if (!capMats.has(n.type)) {
      capMats.set(n.type, new THREE.MeshStandardMaterial({ map: iconTexture(SPACE_ICON[n.type], SPACE_COLORS[n.type]), roughness: 0.35 }));
      tileMats.set(n.type, toy(darken(SPACE_COLORS[n.type], 0.15), 0.4));
    }
    // each kind of space has its own silhouette (coins round, lucky stars, battle shields...)
    const sg = spaceGeo(n.type);
    const tile = mesh(sg.body, tileMats.get(n.type)!, { receive: true });
    tile.position.set(n.x, n.y, n.z);
    scene.add(tile);
    const rim = mesh(sg.rim, rimMat, { cast: false, receive: true });
    rim.position.set(n.x, n.y + TILE_H + 0.045, n.z);
    scene.add(rim);
    const cap = mesh(sg.face, capMats.get(n.type)!, { cast: false, receive: true });
    cap.position.set(n.x, n.y + TILE_H + 0.055, n.z);
    scene.add(cap);
    springs.set(nodeId, { parts: [tile, rim, cap], base: [n.y, n.y + TILE_H + 0.045, n.y + TILE_H + 0.055], y: 0, v: 0 });
    if (def.theme === 'cosmo' && !(Math.hypot(n.x, n.z) < 6 && n.y > 4)) {
      // every pad stands on a strut down to the deck
      const onDeck = (n.x / 22) ** 2 + (n.z / 14.5) ** 2 < 1;
      const h = onDeck ? n.y + 1.1 : 1.4;
      const pillar = mesh(new THREE.CylinderGeometry(n.y > 0.5 || !onDeck ? 0.22 : 0.6, 0.3, h, 12), toy('#7b86b8', 0.3));
      pillar.position.set(n.x, n.y + 0.05 - h / 2, n.z);
      scene.add(pillar);
    } else if (n.y - gy(n.x, n.z) > 0.45) {
      // bridges: two timber legs down to the ground
      for (const side of [-0.55, 0.55]) {
        const h = n.y - gy(n.x, n.z) + 0.6;
        const leg = mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 8), toy('#6b4a2b', 0.8));
        leg.position.set(n.x + side, n.y - h / 2 + 0.1, n.z);
        scene.add(leg);
      }
    }
  }
  // a Kenney model on each special space; Key and Heart pickups spin and bob
  const floaters: { o: THREE.Object3D; y: number; k: number }[] = [];
  for (const n of Object.values(def.nodes)) {
    const c0 = scene.children.length;
    const pp = SPACE_PROP[n.type];
    if (pp) {
      const [model, size, floats] = pp;
      const o = fitProp(model, size);
      if (n.type === 'camp') o.position.set(n.x + 1.3, 0, n.z - 1.1);
      else o.position.set(n.x, floats ? 1.0 : 0.33, n.z);
      scene.add(o);
      if (floats) floaters.push({ o, y: o.position.y + n.y, k: n.x + n.z });
    }
    if (n.type === 'fountain') {
      const col = fitProp('proto/column', 0.5, 'xz');
      col.position.set(n.x, 0.33, n.z);
      scene.add(col);
    }
    if (n.type === 'duel') {
      for (const side of [-1, 1]) {
        const sw = fitProp('proto/weapon-sword', 1.1, 'y');
        sw.position.set(n.x, 0.6, n.z);
        sw.rotation.z = side * 0.6;
        scene.add(sw);
      }
    }
    if (n.type === 'stew') {
      const pot = fitProp('pirate/barrel', 0.9);
      pot.scale.y *= 0.55;
      pot.position.set(n.x, 0.33, n.z);
      scene.add(pot);
      const soup = mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshStandardMaterial({ color: '#8bc34a', emissive: '#3b6b12', roughness: 0.3 }), { cast: false });
      soup.rotation.x = -Math.PI / 2;
      soup.position.set(n.x, 0.33 + 0.5, n.z);
      soup.name = 'soup';
      scene.add(soup);
      steamSpots.push(new THREE.Vector3(n.x, n.y + 1.0, n.z));
    }
    if (n.type === 'vent') {
      const grate = mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 24), toy('#a5f3fc', 0.3), { cast: false });
      grate.rotation.x = -Math.PI / 2;
      grate.position.set(n.x, 0.4, n.z);
      scene.add(grate);
    }
    if (n.type === 'post') {
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8), toy('#e5e7eb', 0.4));
      pole.position.set(n.x + 0.55, 1.35, n.z - 0.3);
      scene.add(pole);
      const flag = mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.6 }));
      flag.position.set(n.x + 0.92, 2.15, n.z - 0.3);
      scene.add(flag);
      const base = fitProp('platformer/platform', 0.6);
      base.position.set(n.x + 0.55, 0.3, n.z - 0.3);
      scene.add(base);
      postFlags.set(n.id, flag);
    }
    for (let i = c0; i < scene.children.length; i++) scene.children[i].position.y += n.y;
  }

  // paths between spaces: planks on the ground, raised walkways with glowing rails up high
  const pathMat = toy(PATH_COLOR[def.theme], 0.7);
  const railMat = new THREE.MeshStandardMaterial({ color: RAIL_COLOR[def.theme], emissive: RAIL_COLOR[def.theme], emissiveIntensity: 0.6, roughness: 0.4 });
  const gatedPaths: { mesh: THREE.Mesh; to: string; from: string }[] = [];
  for (const n of Object.values(def.nodes)) {
    for (const to of n.next) {
      const m2 = def.nodes[to];
      const a3 = new THREE.Vector3(n.x, n.y + 0.1, n.z);
      const b3 = new THREE.Vector3(m2.x, m2.y + 0.1, m2.z);
      const len = a3.distanceTo(b3);
      if (Math.hypot(m2.x - n.x, m2.z - n.z) > 6) continue; // long jumps are not drawn
      const mid = a3.clone().add(b3).multiplyScalar(0.5);
      // raised when it floats clear of the ground under its middle
      const raised = mid.y - gy(mid.x, mid.z) > 0.6;
      const w = raised ? 0.95 : 0.42;
      const p = mesh(new THREE.BoxGeometry(w, raised ? 0.16 : 0.12, len), n.gate ? pathMat.clone() : pathMat, { cast: raised, receive: true });
      p.position.copy(mid);
      if (!raised) p.position.y = Math.max(mid.y, gy(mid.x, mid.z) + 0.1);
      p.lookAt(b3.x, b3.y + (p.position.y - mid.y), b3.z);
      scene.add(p);
      if (raised) {
        for (const side of [-1, 1]) {
          const rail = mesh(new THREE.BoxGeometry(0.07, 0.07, len), railMat, { cast: false });
          rail.position.set(side * (w / 2), 0.32, 0);
          p.add(rail);
        }
      }
      if (n.gate) gatedPaths.push({ mesh: p, from: n.id, to });
    }
  }

  // Crown Chests: a pirate chest with a golden crown spinning over it
  const crownPool: THREE.Group[] = [];
  // hazard warnings: red target rings (meteors, falling pines, the boulder's lane)
  const warnGeo = new THREE.RingGeometry(0.75, 1.05, 32);
  const warnMat = new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const warns: THREE.Mesh[] = [];
  const takeWarn = (i: number) => {
    while (warns.length <= i) {
      const w = new THREE.Mesh(warnGeo, warnMat);
      w.rotation.x = -Math.PI / 2;
      scene.add(w);
      warns.push(w);
    }
    warns[i].visible = true;
    return warns[i];
  };
  const seenFx = new Set<number>();
  const lastHp = new Map<string, number>();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0.55, depthWrite: false });
  // branch arrows
  const arrowMat = toy('#ffffff', 0.3);
  const arrowSel = toy('#ffd23f', 0.3);
  const arrows: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = mesh(new THREE.ConeGeometry(0.35, 0.9, 12), arrowMat);
    a.visible = false;
    scene.add(a);
    arrows.push(a);
  }
  // dice block
  const blank = [diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?')];
  const dice = mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), blank);
  // spinning faces flicker through numbers; the result face goes on every side when it lands
  const faces = new Map<string, THREE.Material>();
  const face = (n: number) => faces.get(String(n)) ?? faces.set(String(n), diceFace(String(n))).get(String(n))!;
  let diceShown = -1;
  let wasSub = '';
  dice.visible = false;
  scene.add(dice);

  const models = new Map<string, ChoppyModel>();
  for (const p of players) {
    const m = new ChoppyModel(p.color, 0.55);
    models.set(p.id, m);
    scene.add(m.group);
  }

  // whole-board framing for the start of each turn
  const xs = Object.values(def.nodes).map((n) => n.x);
  const zs = Object.values(def.nodes).map((n) => n.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...zs) - Math.min(...zs)) * 1.5);
  const midZ = (Math.max(...zs) + Math.min(...zs)) / 2;
  const overview = new THREE.Vector3(0, span * 0.75, midZ + span * 0.62);
  const camPos = overview.clone();
  const camLook = new THREE.Vector3();
  let last = party.board!;
  const pos = new Map<string, THREE.Vector3>();
  const lastNode = new Map<string, string>();
  const lastCoins = new Map<string, number>();
  const lastCrowns = new Map<string, number>();
  const fx = new Fx(scene);
  const kick = (nodeId: string, v: number) => {
    const sp = springs.get(nodeId);
    if (sp) sp.v -= v;
  };

  /** Standing height (no hop arc): on the space, or partway along a hop between two heights. */
  function baseY(b: BoardState, id: string): number {
    const cur = currentPlayer(b);
    if (b.hop && id === cur) {
      const from = def.nodes[b.hop.from];
      const to = def.nodes[b.hop.to];
      const f = Math.max(0, Math.min(1, b.hop.t));
      return from.y + (to.y - from.y) * f + 0.33;
    }
    return def.nodes[b.players[id].node].y + 0.33;
  }

  function spotFor(b: BoardState, id: string): THREE.Vector3 {
    const me = b.players[id];
    const n = def.nodes[me.node];
    const cur = currentPlayer(b);
    if (b.hop && id === cur) {
      const from = def.nodes[b.hop.from];
      const to = def.nodes[b.hop.to];
      const f = Math.max(0, Math.min(1, b.hop.t));
      const arc = Math.sin(f * Math.PI) * (b.hop.t < 0 || Math.hypot(to.x - from.x, to.z - from.z) > 6 ? 4.5 : 1.5);
      return new THREE.Vector3(from.x + (to.x - from.x) * f, baseY(b, id) + arc, from.z + (to.z - from.z) * f);
    }
    // spread out players sharing a space; the current player stands in the middle
    const here = b.order.filter((o) => b.players[o].node === me.node && !(b.hop && o === cur));
    if (here.length <= 1 || id === cur) return new THREE.Vector3(n.x, n.y + 0.33, n.z);
    const others = here.filter((o) => o !== cur);
    const k = others.indexOf(id);
    const a = (k / others.length) * Math.PI * 2;
    return new THREE.Vector3(n.x + Math.cos(a) * 0.75, n.y + 0.33, n.z + Math.sin(a) * 0.75);
  }

  return {
    scene,
    camera,
    update(s: PartyState, _ps, t, dt) {
      const b = s.board;
      if (!b) return;
      last = b;
      animateDecor(b, t, dt);
      const cur = currentPlayer(b);

      for (const g of gatedPaths) {
        const open = exits(def, b, g.from).includes(g.to);
        const m = g.mesh.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity += ((open ? 1 : 0.15) - m.opacity) * Math.min(1, dt * 4);
      }

      // crowns
      crownPool.forEach((c) => (c.visible = false));
      b.crowns.forEach((nodeId, i) => {
        while (crownPool.length <= i) {
          const g = new THREE.Group();
          const c = makeCrown();
          c.name = 'crown';
          const chest = fitProp('pirate/chest', 1.2);
          chest.position.set(0.9, 0.33, -0.7);
          chest.rotation.y = -0.6;
          const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 36), ringMat);
          glow.rotation.x = -Math.PI / 2;
          glow.position.y = 0.36;
          g.add(c, chest, glow);
          scene.add(g);
          crownPool.push(g);
        }
        const g = crownPool[i];
        const n = def.nodes[nodeId];
        g.visible = true;
        g.position.set(n.x, n.y, n.z);
        const c = g.getObjectByName('crown')!;
        c.position.set(0.9, 2.0 + Math.sin(t * 2 + i) * 0.15, -0.7);
        c.rotation.y = t * 1.2;
      });

      for (const f of floaters) {
        f.o.position.y = f.y + Math.sin(t * 2.4 + f.k) * 0.12;
        f.o.rotation.y = t * 1.5 + f.k;
      }
      // Claim Post flags take the owner's colour
      for (const [nodeId, flag] of postFlags) {
        const post = b.posts[nodeId];
        const col = post ? (players.find((p) => p.id === post.owner)?.color ?? '#d1d5db') : '#d1d5db';
        const m = flag.material as THREE.MeshStandardMaterial;
        m.color.set(col);
        m.emissive.set(post?.mode === 'sting' ? '#550000' : '#000000');
        flag.rotation.y = Math.sin(t * 3 + flag.position.x) * 0.25;
      }
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4))
        for (const at of steamSpots) fx.emit(at, { tex: 'puff', n: 1, color: '#e8f5e9', speed: [0.1, 0.3], up: 1.2, life: [0.8, 1.2], size: [0.3, 0.9] });
      // hazard warnings
      warns.forEach((w) => (w.visible = false));
      const warnNodes =
        def.theme === 'cosmo'
          ? b.hazards.meteors
          : def.theme === 'hollow'
            ? b.night
              ? b.hazards.pine
              : []
            : Object.values(def.nodes).filter((n) => n.canyon === b.hazards.boulderLane).map((n) => n.id);
      warnNodes.forEach((nodeId, i) => {
        const n = def.nodes[nodeId];
        const w = takeWarn(i);
        const p = 1 + Math.sin(t * 6 + i) * 0.08;
        w.position.set(n.x, n.y + 0.42, n.z);
        w.scale.setScalar(p);
      });
      warnMat.opacity = def.theme === 'gulch' ? 0.35 : 0.75;
      // board effects: hits, heals, knockouts, items
      for (const e of b.fx) {
        if (seenFx.has(e.n)) continue;
        seenFx.add(e.n);
        const n = def.nodes[e.node];
        if (!n) continue;
        const at = new THREE.Vector3(n.x, n.y + 1.4, n.z);
        switch (e.kind) {
          case 'hit':
          case 'spikes':
          case 'arrow':
            fx.bonk(at.clone().setY(n.y + 1.8));
            shake(0.15);
            break;
          case 'ko':
            fx.blast(at, 1.6);
            shake(0.45);
            break;
          case 'heal':
            fx.sparkle(at, '#4cd97b', 12);
            break;
          case 'meteor':
          case 'boom':
          case 'cannon':
            fx.blast(at.clone().setY(0.6), 1.4);
            shake(0.35);
            break;
          case 'pine':
          case 'boulder':
          case 'vent':
            fx.dust(at.clone().setY(0.4), 1.6);
            shake(0.3);
            break;
          case 'crown':
            fx.party(at.clone().setY(2));
            break;
          case 'claim':
          case 'crate':
          case 'item':
          case 'dig':
          case 'warp':
          case 'swap':
          case 'spring':
          case 'sticky':
          case 'block':
            fx.sparkle(at, e.kind === 'block' ? '#3fa9f5' : '#ffd23f', 12);
            break;
          case 'laser':
            shake(0.3);
            break;
        }
      }
      if (seenFx.size > 400) for (const k of [...seenFx].slice(0, 200)) seenFx.delete(k);

      // tile springs
      for (const [id, pl] of Object.entries(b.players)) {
        const prevNode = lastNode.get(id);
        const n = def.nodes[pl.node];
        const at = new THREE.Vector3(n.x, n.y + 0.45, n.z);
        const top = n.y;
        if (prevNode !== undefined && prevNode !== pl.node) {
          kick(pl.node, 3.2);
          models.get(id)?.squash(6);
          fx.dust(at, 0.6);
        }
        lastNode.set(id, pl.node);
        const pc = lastCoins.get(id);
        if (pc !== undefined && pl.keys > pc) fx.sparkle(at.clone().setY(top + 1.6), '#ffd23f', 6 + Math.min(14, pl.keys - pc));
        if (pc !== undefined && pl.keys < pc) fx.emit(at.clone().setY(top + 1.4), { tex: 'puff', color: '#ff7a7a', n: 6, speed: [1, 2], up: 1, life: [0.3, 0.5], size: [0.4, 0.8] });
        lastCoins.set(id, pl.keys);
        lastHp.set(id, pl.hp);
        const pcr = lastCrowns.get(id);
        if (pcr !== undefined && pl.crowns > pcr) {
          fx.party(at.clone().setY(top + 1.8));
          shake(0.2);
        }
        lastCrowns.set(id, pl.crowns);
      }
      for (const sp of springs.values()) {
        if (sp.y === 0 && sp.v === 0) continue;
        for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
          const h = Math.min(left, 1 / 120);
          sp.v += (-sp.y * 260 - sp.v * 9) * h;
          sp.y += sp.v * h;
        }
        if (Math.abs(sp.y) < 1e-4 && Math.abs(sp.v) < 1e-3) sp.y = sp.v = 0;
        sp.parts.forEach((o, i) => (o.position.y = sp.base[i] + sp.y));
        sp.parts[0].scale.set(1 - sp.y * 0.6, 1 + sp.y * 1.5, 1 - sp.y * 0.6);
      }

      fx.update(dt);
      for (const [id, m] of models) {
        if (!b.players[id]) continue;
        const target = spotFor(b, id);
        const p = pos.get(id) ?? target.clone();
        if (id === cur && b.hop) p.copy(target);
        else p.lerp(target, Math.min(1, dt * 10));
        pos.set(id, p);
        // ride the tile spring, and let the model handle the hop arc so it squashes on landing
        const under = springs.get(b.players[id].node);
        const ground = b.hop && id === cur ? baseY(b, id) : p.y;
        const lift = Math.max(0, p.y - baseY(b, id));
        m.group.position.set(p.x, ground + (b.hop && id === cur ? 0 : (under?.y ?? 0)), p.z);
        const moving = id === cur && !!b.hop;
        if (moving) {
          const to = def.nodes[b.hop!.to];
          m.group.rotation.y = Math.atan2(to.x - p.x, to.z - p.z);
        } else {
          m.group.rotation.y += (Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - m.group.rotation.y) * Math.min(1, dt * 4);
        }
        const hit = id === cur && b.sub === 'rolling' && b.t < 0.45 ? Math.sin((b.t / 0.45) * Math.PI) : 0;
        m.update(dt, { speed: 0, jump: Math.max(hit, lift / 0.55), happy: id === cur && b.sub === 'rolled', t });
      }

      // dice above the current player while rolling
      const cp = pos.get(cur) ?? new THREE.Vector3();
      // roll: the die bobs; rolling: it spins hard, rises and shakes; rolled: it snaps to the number and pops
      dice.visible = b.sub === 'roll' || b.sub === 'rolling' || b.sub === 'rolled';
      const camYaw = Math.atan2(camera.position.x - cp.x, camera.position.z - cp.z);
      if (b.sub === 'roll') {
        if (diceShown !== 0) (dice.material = blank), (diceShown = 0);
        dice.position.set(cp.x, cp.y + 2.4 + Math.sin(t * 5) * 0.1, cp.z);
        dice.rotation.set(t * 1.4, t * 1.9, t * 1.1);
        dice.scale.setScalar(1);
      } else if (b.sub === 'rolling') {
        const k = Math.min(1, b.t / 1.3);
        const spin = 9 + k * 14;
        const n = 1 + (Math.floor(t * (10 + k * 10)) % 10);
        if (diceShown !== -n) (dice.material = [face(n), face(n), face(n), face(n), face(n), face(n)]), (diceShown = -n);
        dice.position.set(cp.x + Math.sin(t * 61) * 0.05 * k, cp.y + 2.5 + k * 0.9, cp.z + Math.cos(t * 53) * 0.05 * k);
        dice.rotation.set(t * spin, t * spin * 1.3, t * spin * 0.7);
        dice.scale.setScalar(1 + k * 0.25);
      } else if (b.sub === 'rolled') {
        if (diceShown !== 100 + b.roll) {
          const f = face(b.roll);
          dice.material = [f, f, f, f, f, f];
          diceShown = 100 + b.roll;
        }
        if (wasSub !== 'rolled') {
          fx.party(dice.position.clone());
          fx.sparkle(dice.position.clone(), '#ffe066', 22);
          shake(0.25);
        }
        // overshoot pop, then settle facing the camera
        const e = Math.min(1, b.t / 0.45);
        const pop = 1.25 + Math.sin(e * Math.PI) * 0.7 * (1 - e * 0.5) + (1 - e) * 0.2;
        dice.scale.setScalar(pop);
        dice.position.set(cp.x, cp.y + 3.4, cp.z);
        dice.rotation.set(0, camYaw, 0);
      }
      wasSub = b.sub;

      // branch arrows
      arrows.forEach((a) => (a.visible = false));
      if (b.sub === 'branch' && b.branch) {
        const here = def.nodes[b.players[cur].node];
        b.branch.options.forEach((o, i) => {
          const a = arrows[i];
          if (!a) return;
          const n = def.nodes[o];
          const ang = Math.atan2(n.z - here.z, n.x - here.x);
          a.visible = true;
          a.material = i === b.branch!.sel ? arrowSel : arrowMat;
          const bob = i === b.branch!.sel ? Math.sin(t * 8) * 0.15 : 0;
          a.position.set(here.x + Math.cos(ang) * (1.6 + bob), 0.9, here.z + Math.sin(ang) * (1.6 + bob));
          a.rotation.set(0, 0, 0);
          a.rotation.z = -Math.PI / 2;
          a.rotation.y = -ang;
          a.scale.setScalar(i === b.branch!.sel ? 1.25 : 0.9);
        });
      }

      // camera: overview at the top of a turn, then follow whoever is moving
      const wantOverview = (b.sub === 'turnIntro' && b.cur === 0 && b.t < 2) || b.sub === 'orderRoll' || b.sub === 'orderShow';
      let goalPos = wantOverview ? overview : new THREE.Vector3(cp.x, cp.y + 10.5, cp.z + 10.5);
      let goalLook = wantOverview ? new THREE.Vector3(0, 0, midZ + 1) : new THREE.Vector3(cp.x, cp.y + 0.6, cp.z);
      let follow = 2.2;
      if (mapCam.on) {
        // map view: a free orbit camera over the board
        if (mapCam.fresh) {
          mapCam.fresh = false;
          mapCam.fx = 0;
          mapCam.fz = midZ;
          mapCam.yaw = 0;
          mapCam.pitch = 0.95;
          mapCam.dist = span * 0.95;
        }
        steerMap(mapLook(), dt, span);
        const h = Math.sin(mapCam.pitch) * mapCam.dist;
        const r = Math.cos(mapCam.pitch) * mapCam.dist;
        goalLook = new THREE.Vector3(mapCam.fx, 0, mapCam.fz);
        goalPos = new THREE.Vector3(mapCam.fx + Math.sin(mapCam.yaw) * r, h, mapCam.fz + Math.cos(mapCam.yaw) * r);
        follow = 6;
      }
      camPos.lerp(goalPos, Math.min(1, dt * follow));
      camLook.lerp(goalLook, Math.min(1, dt * (follow + 0.8)));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    },
    tags(): Tag[] {
      const b = last;
      const cur = currentPlayer(b);
      const out: Tag[] = [];
      for (const p of players) {
        const v = pos.get(p.id);
        if (!v) continue;
        const isCur = p.id === cur;
        let sub: string | undefined;
        if (isCur && b.sub === 'rolled') sub = String(b.roll);
        else if (isCur && (b.sub === 'move' || b.sub === 'branch' || b.sub === 'prompt') && b.stepsLeft > 0) sub = String(b.stepsLeft);
        if (!isCur) continue; // keep the screen calm: only the mover is labelled
        out.push({
          pos: new THREE.Vector3(v.x, v.y + (isCur && sub ? 2.6 : 1.7), v.z),
          text: p.name,
          color: p.color,
          sub,
          subColor: '#ffd23f',
        });
      }
      return out;
    },
  };
}

function diceFace(label: string): THREE.Material {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#fff7c2');
  grad.addColorStop(1, '#ffd23f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ff8a1f';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#ff3b4e';
  g.font = '900 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 });
}
