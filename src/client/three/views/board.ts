import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { PartyState } from '../../../shared/party';
import { COSMO_SPREAD, getBoard, unspread } from '../../../shared/board/boards';
import { markHazards } from '../hazardMarks';
import { BOSS_INTRO, SPIN_STOP, currentPlayer, exits, slowFace } from '../../../shared/board/engine';
import type { BoardDef, BoardState, SpaceType } from '../../../shared/board/types';
import { roundedRect } from '../../../shared/board/layout';
import { groundAt } from '../../../shared/board/terrain';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { darken, makeScene, mesh, toonWater, toy } from '../kit';
import { ramp, terrainMesh, waves } from '../terrain';
import { place, prop, sky, texture } from '../assets';
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
import { buildWeather } from '../weatherView';
import { grassDetail, roadTexture, roadUVs } from '../surfaces';
import { sfx } from '../../sfx';
import { postPulse } from '../look/post';
import { courtDecor, setCourtNames } from '../stewCourtDecor';

const SPACE_COLORS: Record<SpaceType, string> = {
  key: '#2f7dff',
  heart: '#21c45a',
  thorn: '#ff3b4e',
  chunk: '#4a1a2e',
  crate: '#ff9f1c',
  lucky: '#ffc21a',
  event: '#14b8a6',
  post: '#8b5cf6',
  duel: '#ff6a00',
  stew: '#b4532a',
  fountain: '#ff7bd5',
  spring: '#7ddc3c',
  oop: '#ff6a00',
  cannon: '#4b5563',
  vent: '#45e3ff',
  dynamite: '#e11d48',
  snare: '#4d7c0f',
  wisp: '#9a5bff',
  station: '#ff8a1f',
  counter: '#ff3fd2',
  camp: '#a16207',
  shop: '#0ea5a4',
};
const SPACE_ICON: Record<SpaceType, string> = {
  key: '+',
  heart: '♥',
  thorn: '−',
  chunk: '☠',
  crate: '▣',
  lucky: '★',
  event: '!',
  post: '⚑',
  duel: '⚔',
  stew: '♨',
  fountain: '♥',
  spring: '⇡',
  oop: '◓',
  cannon: '◎',
  vent: '≋',
  dynamite: '✸',
  snare: '❦',
  wisp: '☾',
  station: '$',
  counter: '⚡',
  camp: '⌂',
  shop: '$',
};
/** Kenney models that float or stand on each kind of space. [model, size, floats] */
const SPACE_PROP: Partial<Record<SpaceType, [string, number, boolean]>> = {
  key: ['platformer/coin-gold', 0.6, true],
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

/** A little market stall beside a shop space: striped awning, counter, stock and a SHOP sign. */
function shopStall(def: BoardDef, n: { x: number; y: number; z: number }): THREE.Group {
  const g = new THREE.Group();
  const [a, b] = def.theme === 'cosmo' ? ['#45e3ff', '#ffffff'] : def.theme === 'gulch' ? ['#e04b3a', '#fff3d6'] : ['#9a5bff', '#ffe9a8'];
  const wood = toy(def.theme === 'cosmo' ? '#7b86b8' : '#9a6a3c', 0.6);
  const counter = mesh(new THREE.BoxGeometry(1.7, 0.75, 0.7), wood);
  counter.position.set(0, 0.38, 0);
  g.add(counter);
  for (const sx of [-0.8, 0.8]) {
    const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), wood);
    post.position.set(sx, 0.95, -0.25);
    g.add(post);
  }
  // striped awning
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? b : a;
    x.fillRect(i * 16, 0, 16, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const awning = mesh(new THREE.BoxGeometry(2.0, 0.08, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  awning.position.set(0, 1.9, 0.05);
  awning.rotation.x = 0.28;
  g.add(awning);
  // a sign on top
  const sc = document.createElement('canvas');
  sc.width = 128;
  sc.height = 48;
  const sx2 = sc.getContext('2d')!;
  sx2.fillStyle = '#2a1b5e';
  sx2.fillRect(0, 0, 128, 48);
  sx2.fillStyle = '#ffd23f';
  sx2.font = '900 34px system-ui, sans-serif';
  sx2.textAlign = 'center';
  sx2.textBaseline = 'middle';
  sx2.fillText('SHOP', 64, 26);
  const st = new THREE.CanvasTexture(sc);
  st.colorSpace = THREE.SRGBColorSpace;
  const sign = mesh(new THREE.BoxGeometry(1.1, 0.42, 0.06), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5 }));
  sign.position.set(0, 2.25, -0.2);
  g.add(sign);
  // goods on the counter
  for (const [m, px] of [['platformer/crate-item', -0.5], ['platformer/heart', 0.05], ['platformer/coin-gold', 0.55]] as [string, number][]) {
    const o = fitProp(m, 0.38);
    o.position.set(px, 0.76, 0.05);
    g.add(o);
  }
  // stand it beside the space, facing the camera side of the path
  g.position.set(n.x + 1.5, n.y, n.z - 0.9);
  g.rotation.y = -0.35;
  g.userData.placed = true;
  return g;
}

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

/** Mister Chunk, standing on the origin and `h` units tall, facing +z (the camera). */
function chunkModel(h: number): THREE.Group {
  const o = prop('misc/mister-chunk', 1);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = h / Math.max(1e-6, size.y);
  o.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  o.position.set(-c.x, -box.min.y * k, -c.z);
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = true;
  });
  const g = new THREE.Group();
  g.add(o);
  return g;
}

/**
 * A Chobglob, the prize you buy at the chest: the Kenney whipped-cream dollop turned into
 * a glossy golden glob with a face.
 */
export function makeGlob(): THREE.Group {
  const g = new THREE.Group();
  const body = fitProp('food/whipped-cream', 1.15);
  const goo = new THREE.MeshStandardMaterial({ color: '#ffc21a', roughness: 0.12, metalness: 0.35, emissive: '#6a3c00', emissiveIntensity: 0.6 });
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = goo;
  });
  const box = new THREE.Box3().setFromObject(body);
  body.position.y -= box.min.y + (box.max.y - box.min.y) / 2;
  g.add(body);
  const h = (box.max.y - box.min.y) / 2;
  const front = Math.max(box.max.z, (box.max.x - box.min.x) / 2) * 0.82;
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1f1d26', roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.13, 14, 10), white);
    eye.scale.set(1, 1.2, 0.6);
    eye.position.set(sx * 0.17, -h * 0.15, front);
    const pupil = mesh(new THREE.SphereGeometry(0.065, 10, 8), dark);
    pupil.position.set(sx * 0.17, -h * 0.17, front + 0.07);
    g.add(eye, pupil);
  }
  return g;
}

export function makeCrown(): THREE.Group {
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
  const valleyMesh = terrainMesh({
      w: 170, d: 150, seg: 120, cz: -10,
      height: valley,
      color: (x, z, y, slope, c) => {
        const far = ramp(1, 2.4, Math.hypot(x / 29, (z + 2) / 21));
        // mown stripes near the village, mossy higher up, rock where it's steep
        c.copy(Math.floor((x + z) / 3) % 2 ? grassA : grassB).lerp(moss, Math.min(1, y / 9)).lerp(dusk, far * 0.55);
        if (slope > 0.45) c.lerp(dirt, 0.6);
      },
    });
  // painted grass tufts, clover and flowers over the whole valley
  const tuft = grassDetail().clone();
  tuft.repeat.set(170 / 4.5, 150 / 4.5);
  tuft.needsUpdate = true;
  (valleyMesh.material as THREE.MeshStandardMaterial).map = tuft;
  scene.add(valleyMesh);
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

const cosmoDecor: Dresser = (scene, def) => {
  const first = scene.children.length;
  const tick = cosmoDecorInner(scene, def);
  // the station is built at its old size, then spread out to match the spread-out spaces
  const K = COSMO_SPREAD;
  for (const o of scene.children.slice(first)) {
    if (Math.hypot(o.position.x, o.position.z) > 32 || (o as THREE.Points).isPoints || (o as THREE.InstancedMesh).isInstancedMesh) continue;
    o.position.x *= K;
    o.position.z *= K;
    if (o.userData.spread === 'xz') {
      o.scale.x *= K;
      o.scale.z *= K;
    } else if (o.userData.spread === 'xy') {
      o.scale.x *= K;
      o.scale.y *= K;
    } else if (o.userData.spread === 'y') o.scale.y *= K;
  }
  return tick;
};

const cosmoDecorInner: Dresser = (scene) => {
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
  // more life out on the (now roomier) deck: a crew at work, cargo, turrets and crystal patches
  place(scene, 'space/turret_double', -9, -0.05, -5.2, { s: 2.2, ry: 0.8 });
  place(scene, 'space/turret_double', 9.5, -0.05, 5.4, { s: 2.2, ry: -2.3 });
  place(scene, 'station/display-wall-wide', 6.5, -0.05, -6.6, { s: 2.2, ry: -0.2 });
  place(scene, 'station/container', -7.5, -0.05, 5.6, { s: 2, ry: 0.3 });
  place(scene, 'station/container-tall', -8.8, -0.05, 6.4, { s: 2, ry: -0.2 });
  place(scene, 'space/machine_generator', 11.5, -0.05, -5.2, { s: 2.4, ry: 2 });
  place(scene, 'space/rover', 7.5, -0.05, 2.6, { s: 3, ry: -1.9 });
  place(scene, 'space/astronautA', -10.8, -0.05, -3.4, { s: 1.5, ry: 2.4 });
  place(scene, 'space/astronautB', 12.5, -0.05, 3.4, { s: 1.5, ry: -1.2 });
  place(scene, 'space/alien', -6.2, -0.05, -6.8, { s: 1.4, ry: 0.4 });
  for (const [x, z] of [[-13.5, 5.4], [13.6, -3.6], [-2.4, 9.6], [2.6, -9.8]] as [number, number][]) place(scene, 'space/rock_crystals', x, -0.05, z, { s: 2.2, ry: x * 0.7 });
  for (const [x, z] of [[-12, -7.5], [10.5, 7.8], [0.5, 8.6]] as [number, number][]) place(scene, 'space/crater', x, -0.04, z, { s: 2.4, shadow: false });
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
  deck.userData.spread = 'xz';
  scene.add(deck);
  const rim = mesh(new THREE.TorusGeometry(22, 0.35, 10, 90), new THREE.MeshStandardMaterial({ color: '#45e3ff', emissive: '#1aa8d6', emissiveIntensity: 0.9 }));
  rim.scale.y = 0.66;
  rim.rotation.x = Math.PI / 2;
  rim.userData.spread = 'xy';
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
  beam.userData.spread = 'y';
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
  coreDeck.scale.set(COSMO_SPREAD, 1, COSMO_SPREAD);
  coreRim.scale.set(COSMO_SPREAD, COSMO_SPREAD, 1);
  for (const leg of core.children) if (leg !== coreDeck && leg !== coreRim && leg !== holo && leg !== holoRing) leg.position.multiply(new THREE.Vector3(COSMO_SPREAD, 1, COSMO_SPREAD));
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

const DECOR: Record<BoardDef['theme'], Dresser> = { hollow: hollowDecor, cosmo: cosmoDecor, gulch: gulchDecor, court: courtDecor };
const SKY: Record<BoardDef['theme'], [string, string, [string, number, number] | undefined]> = {
  hollow: ['#ff9a7a', '#ffd8b0', ['#ffb38a', 40, 110]],
  cosmo: ['#05041a', '#2a1660', undefined],
  court: ['#04031a', '#1c1250', undefined],
  gulch: ['#4ab3ff', '#ffe2b0', ['#ffe2b0', 60, 140]],
};
const PATH_COLOR: Record<BoardDef['theme'], string> = { hollow: '#d9b98a', cosmo: '#9fb4ff', gulch: '#a8743f', court: '#c98a4b' };
const RAIL_COLOR: Record<BoardDef['theme'], string> = { hollow: '#ffb347', cosmo: '#45e3ff', gulch: '#ffcf5a', court: '#ff8a1f' };

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
  const [top, bottom, fog0] = SKY[def.theme];
  // a spread-out board pushes the haze back with it
  const fog = fog0 ? ([fog0[0], fog0[1] * (def.spread ?? 1), fog0[2] * (def.spread ?? 1)] as [string, number, number]) : undefined;
  const scene = makeScene(env, { skyTop: top, skyBottom: bottom, fog, shadowSize: 30 * (def.spread ?? 1), sunDir: [12, 26, 16] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  const c0 = scene.children.length;
  // the scenery is built at the board's original size, then blown up with it (see spread())
  const K = def.spread ?? 1;
  const small = unspread(def);
  const gy0 = (x: number, z: number) => groundAt(small.hills, x, z);
  setCourtNames(Object.fromEntries(players.map((p) => [p.id, p.name])));
  const animateDecor = DECOR[def.theme](scene, small);
  // scenery stands on the hills (sky things and the ground itself excepted)
  if (small.hills) {
    for (let i = c0; i < scene.children.length; i++) {
      const o = scene.children[i];
      if (o.userData.ground || o.userData.sky || o.userData.placed) continue;
      o.position.y += gy0(o.position.x, o.position.z);
    }
  }
  clearPath(scene, c0, small, gy0);
  if (K !== 1) {
    const world = new THREE.Group();
    world.scale.setScalar(K);
    world.add(...scene.children.slice(c0));
    world.userData.placed = true;
    scene.add(world);
  }
  const hazardMarks = markHazards(scene, def, gy);

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
      // Gold Strikes are a gamble: a gold "?" space instead of the plain event diamond
      const gold = def.theme === 'gulch' && n.type === 'event';
      const col = gold ? '#e8a400' : SPACE_COLORS[n.type];
      capMats.set(n.type, new THREE.MeshStandardMaterial({ map: iconTexture(gold ? '?' : SPACE_ICON[n.type], col), roughness: 0.3, metalness: gold ? 0.35 : 0 }));
      tileMats.set(n.type, toy(darken(col, 0.15), 0.4));
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
    if (def.theme === 'cosmo' && !(Math.hypot(n.x, n.z) < 6 * COSMO_SPREAD && n.y > 4)) {
      // every pad stands on a strut down to the deck
      const onDeck = (n.x / (22 * COSMO_SPREAD)) ** 2 + (n.z / (14.5 * COSMO_SPREAD)) ** 2 < 1;
      const h = onDeck ? n.y + 1.1 : 1.4;
      const pillar = mesh(new THREE.CylinderGeometry(n.y > 0.5 || !onDeck ? 0.22 : 0.6, 0.3, h, 12), toy('#7b86b8', 0.3));
      pillar.position.set(n.x, n.y + 0.05 - h / 2, n.z);
      scene.add(pillar);
    } else if (n.y - gy(n.x, n.z) > 0.45 && def.theme !== 'court') {
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
  const chunkStatues: { o: THREE.Object3D; y: number; k: number }[] = [];
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
    if (n.type === 'shop') scene.add(shopStall(def, n));
    if (n.type === 'chunk') {
      // a little Mister Chunk statue glowering on his space
      const st = chunkModel(1.05);
      st.position.set(n.x, n.y + 0.33, n.z);
      scene.add(st);
      chunkStatues.push({ o: st, y: n.y + 0.33, k: n.x * 0.7 + n.z });
    }
    if (n.type === 'event' && def.theme === 'gulch') {
      // a heap of gold nuggets with a pickaxe stuck in it, glinting
      const heap = new THREE.Group();
      const nug = new THREE.MeshStandardMaterial({ color: '#ffc61a', emissive: '#7a4a00', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 });
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const r = i === 0 ? 0 : 0.2 + (i % 3) * 0.08;
        const m = mesh(new THREE.DodecahedronGeometry(0.13 + (i % 2) * 0.05, 0), nug, { cast: true });
        m.position.set(Math.cos(a) * r, (i === 0 ? 0.2 : 0.08) + (i % 4) * 0.02, Math.sin(a) * r);
        m.rotation.set(i, i * 1.7, 0);
        heap.add(m);
      }
      const handle = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 8), toy('#7a4f2a', 0.8));
      handle.position.set(0.12, 0.45, 0);
      handle.rotation.z = -0.35;
      const head = mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 16, Math.PI), toy('#9aa3b5', 0.3));
      head.position.set(0.25, 0.8, 0);
      head.rotation.z = -0.35;
      heap.add(handle, head);
      heap.position.set(n.x, 0.36, n.z);
      scene.add(heap);
    }
    if (n.type === 'fountain') {
      const col = fitProp('proto/column', 0.5, 'xz');
      col.position.set(n.x, 0.33, n.z);
      scene.add(col);
    }
    if (n.type === 'duel') {
      for (const side of [-1, 1]) {
        const sw = fitProp('proto/weapon-sword', 1.1, 'max');
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
  // roads: cobbles in the village, a lit walkway on the station, a wagon trail in the gulch
  const pathMat = new THREE.MeshStandardMaterial({ map: roadTexture(def.theme), roughness: 0.8, color: '#ffffff' });
  void PATH_COLOR;
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
      const w = raised ? 0.95 : 0.9;
      const geo = new THREE.BoxGeometry(w, raised ? 0.16 : 0.12, len);
      roadUVs(geo, len, w * 1.1);
      const p = mesh(geo, n.gate ? pathMat.clone() : pathMat, { cast: raised, receive: true });
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

  // scenery that can get between the camera and the action fades out of the way
  const occluders = sceneryOccluders(scene);
  let occT = 0;

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
  // branch arrows: a big flat arrow on the ground down each path. The picked one is gold, glowing,
  // pulsing and pointing along a dotted trail; the others shrink to dim ghosts.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -0.32);
  arrowShape.lineTo(1.0, -0.32);
  arrowShape.lineTo(1.0, -0.72);
  arrowShape.lineTo(1.9, 0);
  arrowShape.lineTo(1.0, 0.72);
  arrowShape.lineTo(1.0, 0.32);
  arrowShape.lineTo(0, 0.32);
  arrowShape.closePath();
  const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  arrowGeo.rotateX(Math.PI / 2); // lie flat, pointing along +x
  arrowGeo.translate(0, 0.22, 0);
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, transparent: true, opacity: 0.8 });
  const arrowSel = new THREE.MeshStandardMaterial({ color: '#ffae00', roughness: 0.3, emissive: '#ff5a00', emissiveIntensity: 0.45 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#3a1a00', side: THREE.BackSide });
  const ghostRimMat = new THREE.MeshBasicMaterial({ color: '#2a2f45', side: THREE.BackSide, transparent: true, opacity: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0.9, depthWrite: false });
  const arrows: { g: THREE.Group; body: THREE.Mesh; rim: THREE.Mesh; glow: THREE.Mesh; dots: THREE.Mesh[] }[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const body = mesh(arrowGeo, arrowMat);
    const rim = new THREE.Mesh(arrowGeo, outlineMat);
    rim.scale.set(1.08, 1.3, 1.14);
    rim.position.x = -0.07;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(1, 0.05, 0);
    g.add(glow, rim, body);
    const dots: THREE.Mesh[] = [];
    for (let d = 0; d < 5; d++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), dotMat);
      dot.rotation.x = -Math.PI / 2;
      scene.add(dot);
      dots.push(dot);
    }
    g.visible = false;
    scene.add(g);
    arrows.push({ g, body, rim, glow, dots });
  }
  // a pulsing gold ring on the space the picked path leads to
  const pickRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.25, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  pickRing.rotation.x = -Math.PI / 2;
  pickRing.visible = false;
  scene.add(pickRing);
  // the big Mister Chunk who stomps in on a CHUNK SPACE
  const bigChunk = chunkModel(4.2);
  bigChunk.visible = false;
  scene.add(bigChunk);
  const chunkFace = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ color: '#2a0010', transparent: true, opacity: 0.4, depthWrite: false }));
  chunkFace.rotation.x = -Math.PI / 2;
  chunkFace.visible = false;
  scene.add(chunkFace);
  // turn cinematics: a spotlight on whoever's turn it is, and a shockwave when they land
  const spot = new THREE.SpotLight('#fff3d0', 0, 26, 0.32, 0.55, 1.2);
  spot.castShadow = false;
  scene.add(spot, spot.target);
  const pool2 = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool2.rotation.x = -Math.PI / 2;
  scene.add(pool2);
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  wave.rotation.x = -Math.PI / 2;
  scene.add(wave);
  let waveT = 9;
  let cineSub = '';
  let cineT = 0;
  let cineCur = '';
  let chunkAt: THREE.Vector3 | null = null;
  let bossNode: string | null = null;
  let chunkLanded = false;
  let chunkLeave = -1;
  // the dice: Geug's red die model, up to three of them in a row over the current player
  const dieBody = toy('#d81e2c', 0.22);
  const diePips = toy('#ffffff', 0.35);
  const dice: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const m = prop('misc/dice', 0.55);
    m.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh) me.material = me.name.includes('pips') || o.parent?.name.includes('pips') ? diePips : dieBody;
    });
    if (!m.children.length) g.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), dieBody));
    else g.add(m);
    g.visible = false;
    scene.add(g);
    dice.push(g);
  }
  let wasRolls = 0;
  // the turn-order roll: a 12-sided die per player, in that player's colour, lined up under the
  // 2D panel (they ride on the camera so they always sit in the same spot on screen)
  scene.add(camera);
  const d12s = players.map((p) => {
    const g = new THREE.Group();
    const m = prop('misc/d12', 1);
    const body = toy(p.color, 0.25);
    const nums = toy('#ffffff', 0.35);
    body.fog = nums.fog = false;
    m.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh) me.material = me.name.includes('pips') || o.parent?.name.includes('pips') ? nums : body;
    });
    g.add(m);
    g.visible = false;
    camera.add(g);
    return { id: p.id, g, shown: 0, pop: 0 };
  });
  const yawQ = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.42);
  const faceQ = (n: number, yaw: number, out: THREE.Quaternion) =>
    out.setFromUnitVectors(DIE_FACE[n] ?? DIE_FACE[1], Z_AXIS).premultiply(tiltQ).premultiply(yawQ.setFromAxisAngle(Y_AXIS, yaw));
  const tmpQ = new THREE.Quaternion();
  const tumble = new THREE.Euler();

  // tour highlights: a glowing ring and a soft beam of light over each feature Brian shows
  const tourLights: THREE.Group[] = [];
  const tourRingMat = new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.9, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 36; i++) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.09, 8, 40), tourRingMat);
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 7, 24, 1, true), beamMat);
    beam.position.y = 3.5;
    g.add(ring, beam);
    g.visible = false;
    scene.add(g);
    tourLights.push(g);
  }

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
  const weather = buildWeather(scene, def, fx);
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
      weather.update(b, t, dt);
      // sandblind players can't see the chests on their own turn
      const blind = weather.chestsHidden(b, currentPlayer(b));
      if (!blind) b.crowns.forEach((nodeId, i) => {
        while (crownPool.length <= i) {
          const g = new THREE.Group();
          const c = makeGlob();
          c.name = 'crown';
          const chest = fitProp('pirate/chest', 1.2);
          chest.position.set(0.9, 0.33, -0.7);
          chest.rotation.y = -0.6;
          const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 36), ringMat);
          glow.rotation.x = -Math.PI / 2;
          glow.position.y = 0.36;
          // on Stew Court the hoop is the chest: the crown hangs in the lit hoop, no treasure chest
          if (def.theme === 'court') chest.visible = false;
          g.add(c, chest, glow);
          scene.add(g);
          crownPool.push(g);
        }
        const g = crownPool[i];
        const n = def.nodes[nodeId];
        g.visible = true;
        g.position.set(n.x, n.y, n.z);
        const c = g.getObjectByName('crown')!;
        if (def.theme === 'court') c.position.set(Math.sign(n.x) * 1.1 * (def.spread ?? 1), 5.5 * (def.spread ?? 1) + Math.sin(t * 2 + i) * 0.15, 0);
        else c.position.set(0.9, 2.0 + Math.sin(t * 2 + i) * 0.15, -0.7);
        c.rotation.y = t * 1.2;
        // the glob jiggles like the goo it is
        const w = Math.sin(t * 5 + i) * 0.07;
        c.scale.set(1 + w, 1 - w, 1 + w);
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
          : []; // pines and boulder canyons are marked on the ground, with blinking signs
      hazardMarks.update(b, t);
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
        if (weather.onFx(e.kind, at, b, e.amount)) continue;
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

      // dice above the current player: they come out one at a time. The next die bobs and
      // tumbles, the one just thrown spins hard and rises, and each lands showing its number.
      const cp = pos.get(cur) ?? new THREE.Vector3();
      const camYaw = Math.atan2(camera.position.x - cp.x, camera.position.z - cp.z);
      const showDice = b.sub === 'roll' || b.sub === 'rolling' || b.sub === 'rolled';
      const me = b.players[cur];
      const nDice = b.rolls.length ? b.diceN : me?.rollCap ? 1 : Math.max(1, me?.dice ?? 2);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw); // camera right
      const final = b.sub === 'rolled' && b.rolls.length >= b.diceN;
      const landed = b.sub === 'rolled' && b.rolls.length !== wasRolls;
      dice.forEach((d, i) => {
        d.visible = showDice && i < Math.max(nDice, 1);
        if (!d.visible) return;
        const off = (i - (nDice - 1) / 2) * (final ? 2.3 : 1.6);
        const done = i < b.rolls.length;
        const throwing = i === b.rolls.length - 1;
        let y = cp.y + 2.6;
        let sc = 1;
        if (b.sub === 'rolling' && throwing) {
          const k = Math.min(1, b.t / 1.3);
          const spin = 9 + k * 14;
          tumble.set(t * spin + i, t * spin * 1.3, t * spin * 0.7);
          d.quaternion.setFromEuler(tumble);
          y += k * 0.9;
          sc = 1 + k * 0.25;
          d.position.set(cp.x + rx * off + Math.sin(t * 61) * 0.05 * k, y, cp.z + rz * off + Math.cos(t * 53) * 0.05 * k);
          d.scale.setScalar(sc);
          return;
        }
        if (done && b.weather?.hiddenRoll) {
          // hidden in the fog: the dice never settle on a face
          tumble.set(t * 3 + i * 2, t * 3.8 + i, t * 2.2);
          d.quaternion.setFromEuler(tumble);
          y = cp.y + 3.1;
        } else if (done) {
          // landed: face the camera with its number, a pop when it first hits
          faceQ(b.rolls[i], camYaw, tmpQ);
          d.quaternion.slerp(tmpQ, Math.min(1, dt * 14));
          const pop = (b.sub === 'rolled' && (throwing || final)) ? Math.min(1, b.t / 0.45) : 1;
          sc = 1.15 + Math.sin(pop * Math.PI) * 0.55 * (1 - pop * 0.5) + (final && b.doubles ? Math.sin(t * 9) * 0.06 : 0);
          y = cp.y + 3.1;
        } else if (me?.slowRoll && i === b.rolls.length && b.sub === 'roll') {
          // Slow Roller: the die clicks through its faces, showing the one A will stop on
          faceQ(slowFace(b, me), camYaw, tmpQ);
          d.quaternion.slerp(tmpQ, Math.min(1, dt * 16));
          y = cp.y + 3.0;
          sc = 1.2;
        } else {
          // waiting to be rolled: lazy tumble and bob
          tumble.set(t * 1.4 + i * 2, t * 1.9 + i, t * 1.1);
          d.quaternion.setFromEuler(tumble);
          y += Math.sin(t * 5 + i) * 0.1;
        }
        d.position.set(cp.x + rx * off, y, cp.z + rz * off);
        d.scale.setScalar(sc);
      });
      if (landed && b.rolls.length) {
        const d = dice[b.rolls.length - 1];
        fx.sparkle(d.position.clone(), '#ffe066', 14);
        shake(0.18);
        if (final) {
          fx.party(dice[0].position.clone().lerp(d.position, 0.5));
          if (b.doubles) dice.slice(0, b.rolls.length).forEach((dd) => fx.sparkle(dd.position.clone(), '#7cf3ff', 30));
          shake(0.3);
        }
      }
      if (b.sub !== 'rolled') wasRolls = b.sub === 'roll' || b.sub === 'rolling' ? Math.min(wasRolls, b.rolls.length) : 0;
      else wasRolls = b.rolls.length;

      // turn-order dice
      const ordering = b.sub === 'orderRoll' || b.sub === 'orderShow';
      if (ordering) {
        const ids = b.sub === 'orderShow' ? b.order : players.map((p) => p.id).filter((id) => b.order.includes(id));
        const n = ids.length;
        const size = Math.min(104, (1100 - (n - 1) * 14) / n);
        const x0 = 640 - (n * size + (n - 1) * 14) / 2;
        const dist = 12;
        const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const px = halfH / 360; // world units per HUD pixel at that distance
        for (const d of d12s) {
          const i = ids.indexOf(d.id);
          d.g.visible = i >= 0;
          if (i < 0) continue;
          const sx = x0 + i * (size + 14) + size / 2;
          const sy = 260 + size / 2;
          d.g.position.set((sx - 640) * px, (360 - sy) * px, -dist);
          const v = b.orderRolls[d.id] ?? 0;
          if (v && d.shown !== v) {
            d.shown = v;
            d.pop = 0;
          }
          d.pop = Math.min(1, d.pop + dt / 0.45);
          const base = (size * 0.46 * px) / 1;
          if (v) {
            d12Q(v, tmpQ);
            d.g.quaternion.slerp(tmpQ, Math.min(1, dt * 12));
            d.g.scale.setScalar(base * (1 + Math.sin(d.pop * Math.PI) * 0.35));
          } else {
            d.shown = 0;
            tumble.set(t * 6 + i, t * 7.3 + i * 2, t * 4.1);
            d.g.quaternion.setFromEuler(tumble);
            d.g.scale.setScalar(base * (1 + Math.sin(t * 14 + i) * 0.05));
          }
        }
      } else for (const d of d12s) d.g.visible = false;

      // branch arrows
      pickRing.visible = false;
      for (const a of arrows) {
        a.g.visible = false;
        for (const d of a.dots) d.visible = false;
      }
      if (b.sub === 'branch' && b.branch) {
        const here = def.nodes[b.players[cur].node];
        b.branch.options.forEach((o, i) => {
          const a = arrows[i];
          if (!a) return;
          const n = def.nodes[o];
          const ang = Math.atan2(n.z - here.z, n.x - here.x);
          const sel = i === b.branch!.sel;
          a.g.visible = true;
          a.body.material = sel ? arrowSel : arrowMat;
          a.rim.material = sel ? outlineMat : ghostRimMat;
          a.glow.visible = sel;
          const push = sel ? 1.3 + (Math.sin(t * 7) * 0.5 + 0.5) * 0.4 : 1.2;
          const y = here.y + (sel ? 0.55 + Math.sin(t * 7) * 0.1 : 0.12);
          a.g.position.set(here.x + Math.cos(ang) * push, y, here.z + Math.sin(ang) * push);
          a.g.rotation.set(0, -ang, 0);
          a.g.scale.setScalar(sel ? 1.5 + Math.sin(t * 7) * 0.08 : 0.75);
          (glowMat as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 7) * 0.12;
          // a dotted trail marching from the arrow to the next space on the picked path
          if (sel) {
            pickRing.visible = true;
            pickRing.position.set(n.x, n.y + 0.42, n.z);
            pickRing.scale.setScalar(1 + Math.sin(t * 7) * 0.12);
            const sx = here.x + Math.cos(ang) * (push + 2.2), sz = here.z + Math.sin(ang) * (push + 2.2);
            const len = Math.max(0, Math.hypot(n.x - sx, n.z - sz) - 0.9);
            a.dots.forEach((d, k) => {
              const f = ((k + ((t * 1.6) % 1)) / a.dots.length) * len;
              if (len < 0.3) return;
              d.visible = true;
              const q = f / Math.max(0.01, len);
              d.position.set(sx + Math.cos(ang) * f, here.y + (n.y - here.y) * q + 0.12, sz + Math.sin(ang) * f);
            });
          }
        });
      }

      // turn cinematics: track how long we've been in this part of the turn
      if (b.sub !== cineSub || cur !== cineCur) {
        cineSub = b.sub;
        cineCur = cur;
        cineT = 0;
        if (b.sub === 'land') {
          // the landing lands: a shockwave in the space's colour, a puff of dust and a thump
          const n = def.nodes[b.players[cur]?.node];
          if (n) {
            waveT = 0;
            wave.position.set(n.x, n.y + 0.4, n.z);
            (wave.material as THREE.MeshBasicMaterial).color.set(SPACE_COLORS[n.type] ?? '#ffffff');
            fx.dust(new THREE.Vector3(n.x, n.y + 0.3, n.z), 1.1);
            shake(0.22);
            sfx.land();
            postPulse('impact', 0.5);
          }
        }
        if (b.sub === 'turnIntro' && !b.tour) postPulse('vignette', 0.6);
        if (b.sub === 'chunk') postPulse('dramatic', 1, '#ff3b4e');
      } else cineT += dt;
      waveT += dt;
      {
        const k = Math.min(1, waveT / 0.55);
        wave.scale.setScalar(0.6 + k * 2.6);
        (wave.material as THREE.MeshBasicMaterial).opacity = k >= 1 ? 0 : 0.85 * (1 - k);
      }
      const lit = !b.tour && ['turnIntro', 'roll', 'rolling', 'rolled', 'land', 'prompt', 'branch', 'itemSpin', 'gamble', 'chunk'].includes(b.sub);
      const sp = pos.get(cur);
      if (sp) {
        const want = lit ? (b.sub === 'turnIntro' ? 90 * Math.min(1, cineT / 0.35) : 45) : 0;
        spot.intensity += (want - spot.intensity) * Math.min(1, dt * 6);
        spot.position.set(sp.x + 1.5, sp.y + 11, sp.z + 3);
        spot.target.position.copy(sp);
        pool2.position.set(sp.x, sp.y + 0.36, sp.z);
        (pool2.material as THREE.MeshBasicMaterial).color.set(players.find((p) => p.id === cur)?.color ?? '#ffffff');
        (pool2.material as THREE.MeshBasicMaterial).opacity = (spot.intensity / 90) * 0.35 * (0.85 + Math.sin(t * 5) * 0.15);
      }

      // Mister Chunk: drops out of the sky beside the victim, slams down, glares through his reel, then leaps away
      for (const c of chunkStatues) {
        c.o.rotation.y = Math.sin(t * 1.3 + c.k) * 0.35;
        c.o.position.y = c.y + Math.abs(Math.sin(t * 2.2 + c.k)) * 0.08;
      }
      if (b.sub === 'chunk' && b.chunk) {
        const v = b.players[b.chunk.victim];
        const n = v && def.nodes[v.node];
        if (n && !chunkAt) {
          chunkAt = new THREE.Vector3(n.x + 2.3, n.y, n.z - 0.9);
          chunkLanded = false;
          chunkLeave = -1;
          sfx.whistle();
        }
        if (chunkAt) {
          const DROP = 0.5;
          const k = Math.min(1, b.t / DROP);
          bigChunk.visible = true;
          chunkFace.visible = true;
          chunkFace.position.set(chunkAt.x, chunkAt.y + 0.06, chunkAt.z);
          const air = (1 - k * k) * 14;
          let sx = 1, sy = 1;
          if (k >= 1) {
            if (!chunkLanded) {
              chunkLanded = true;
              shake(0.7);
              fx.dust(chunkAt.clone().setY(chunkAt.y + 0.3), 2.6);
              fx.blast(chunkAt.clone().setY(chunkAt.y + 0.2), 0.8);
              sfx.boom();
              postPulse('impact', 1.2);
            }
            const after = b.t - DROP;
            const squash = Math.max(0, 1 - after * 4) * 0.35;
            sy = 1 - squash + Math.sin(after * 3.2) * 0.03;
            sx = 1 + squash * 0.7;
          }
          bigChunk.position.set(chunkAt.x, chunkAt.y + air, chunkAt.z);
          bigChunk.scale.set(sx, sy, sx);
          // glare at the camera, with a slow menacing sway
          bigChunk.rotation.y = Math.sin(t * 1.7) * 0.12;
          (chunkFace.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.3 * k;
        }
      } else if (chunkAt) {
        // he leaps off into the sky
        if (chunkLeave < 0) {
          chunkLeave = 0;
          sfx.boing();
        }
        chunkLeave += dt;
        const k = chunkLeave / 0.7;
        bigChunk.position.set(chunkAt.x, chunkAt.y + k * k * 16, chunkAt.z - k * 3);
        bigChunk.rotation.y += dt * 9;
        bigChunk.scale.setScalar(1);
        (chunkFace.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - k));
        if (k >= 1) {
          bigChunk.visible = false;
          chunkFace.visible = false;
          chunkAt = null;
        }
      }

      // camera: overview at the top of a turn, then follow whoever is moving
      const step = b.sub === 'tour' && b.tour ? b.tour.steps[b.tour.i] : null;
      const wantOverview = b.sub === 'orderRoll' || b.sub === 'orderShow' || (!!step && !step.node);
      // the follow camera breathes with the turn: it swoops in at the start of a turn, punches in when the
      // dice land, and leans in on the landing
      let zoom = 1;
      let swing = 0;
      if (!b.tour && b.sub === 'turnIntro') {
        const p = Math.min(1, cineT / 1.1);
        const e = 1 - Math.pow(1 - p, 3);
        zoom = 1.55 - 0.8 * e + (cineT > 1.1 ? Math.min(0.25, (cineT - 1.1) * 0.4) : 0);
        swing = (1 - e) * 0.7;
      } else if (b.sub === 'rolled' && b.rolls.length >= b.diceN && b.rolls.length > 0) {
        zoom = 1 - 0.16 * Math.exp(-cineT * 3) * Math.min(1, cineT / 0.08);
      } else if (b.sub === 'land') zoom = 1 - 0.22 * Math.min(1, cineT / 0.25) * Math.max(0, 1 - Math.max(0, cineT - 0.9) / 0.6);
      const off = new THREE.Vector3(Math.sin(swing) * 13 * zoom, 14.5 * zoom, Math.cos(swing) * 13 * zoom);
      let goalPos = wantOverview ? overview : new THREE.Vector3(cp.x + off.x, cp.y + off.y, cp.z + off.z);
      let goalLook = wantOverview ? new THREE.Vector3(0, 0, midZ + 1) : new THREE.Vector3(cp.x, cp.y + 0.6, cp.z);
      let follow = !b.tour && b.sub === 'turnIntro' ? 3.2 : b.sub === 'rolled' || b.sub === 'land' ? 5 : 2.2;
      // board tour: fly to the feature Brian is talking about and light it up
      tourLights.forEach((l) => (l.visible = false));
      if (step?.node) {
        const ids = [step.node, ...(step.also ?? []).filter((x) => x !== step.node)].slice(0, tourLights.length);
        // whole zones are marked on the ground already: only single features get the spotlight
        (ids.length > 4 ? [] : ids).forEach((id, k) => {
          const n = def.nodes[id];
          if (!n) return;
          const l = tourLights[k];
          l.visible = true;
          l.position.set(n.x, n.y + 0.36, n.z);
          const pulse = 1 + Math.sin(t * 5 + k * 0.6) * 0.12;
          l.scale.set(pulse, 1, pulse);
          (l.children[1] as THREE.Mesh).rotation.y = t * 0.8;
        });
        const n = def.nodes[step.node];
        const spread = ids.map((id) => def.nodes[id]).filter(Boolean);
        if (n && spread.length > 4) {
          // a whole area (weather zone, hazard lane): pull back and look down on all of it
          const lo = new THREE.Vector3(Infinity, 0, Infinity), hi = new THREE.Vector3(-Infinity, 0, -Infinity);
          let y = 0;
          for (const q of spread) {
            lo.set(Math.min(lo.x, q.x), 0, Math.min(lo.z, q.z));
            hi.set(Math.max(hi.x, q.x), 0, Math.max(hi.z, q.z));
            y = Math.max(y, q.y);
          }
          const c = lo.clone().add(hi).multiplyScalar(0.5);
          const ext = Math.max(hi.x - lo.x, hi.z - lo.z);
          const d = Math.max(11, ext * 0.85);
          goalLook = new THREE.Vector3(c.x, y + 0.4, c.z);
          goalPos = new THREE.Vector3(c.x, Math.max(y + d * 1.05, gy(c.x, c.z + d * 0.55) + 8), c.z + d * 0.55);
          follow = 2.2;
        } else if (n) {
          goalLook = new THREE.Vector3(n.x, n.y + 0.4, n.z);
          // a little higher than the follow camera, and never inside a hill
          const cx = n.x, cz = n.z + 10;
          goalPos = new THREE.Vector3(cx, Math.max(n.y + 12, gy(cx, cz) + 7, gy(n.x, n.z + 5) + 8), cz);
          follow = 2.6;
        }
      }
      if (b.sub === 'boss' && b.boss) {
        // the villain: the whole court while he arrives and spins, then in close on the slam
        if (!bossNode) bossNode = b.players[b.boss.pick]?.node ?? null;
        const n = bossNode ? def.nodes[bossNode] : null;
        const k = def.spread ?? 1;
        if (b.boss.dance) {
          // his entrance and dance party: in close on centre court, where he dances
          goalLook = new THREE.Vector3(0, 4.6 * k, -4 * k);
          goalPos = new THREE.Vector3(0, 8.5 * k, 13 * k);
          follow = 2;
        } else if (b.t < BOSS_INTRO + SPIN_STOP + 0.2 || !n) {
          goalLook = new THREE.Vector3(0, 6 * k, -4 * k);
          goalPos = new THREE.Vector3(0, 22 * k, 26 * k);
          follow = 2;
        } else {
          goalLook = new THREE.Vector3(n.x, n.y + 4 * k, n.z - 1.5 * k);
          goalPos = new THREE.Vector3(n.x, n.y + 13 * k, n.z + 21 * k);
          follow = 3;
        }
      } else bossNode = null;
      if (b.sub === 'chunk' && chunkAt) {
        // frame the victim and Chunk together in the lower part of the screen, under the reel
        goalLook = new THREE.Vector3(chunkAt.x - 1.2, chunkAt.y + 3.6, chunkAt.z + 0.5);
        goalPos = new THREE.Vector3(chunkAt.x - 1.2, Math.max(chunkAt.y + 6, gy(chunkAt.x, chunkAt.z + 11) + 4), chunkAt.z + 11.5);
        follow = 3;
      }
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
      // fade any tree, building or prop standing between the camera and what it's looking at
      occT -= dt;
      if (occT <= 0) {
        occT = 0.1;
        const hit = new Set<Occluder>();
        const targets = [camLook.clone().setY(camLook.y + 0.6)];
        if (!mapCam.on && !step) targets.push(cp.clone().setY(cp.y + 1.2));
        // anything near the line from the camera to what it's looking at (a fat line, not a thin ray,
        // so a big rock just beside the view still gets out of the way)
        const from = camera.position;
        for (const tgt of targets) {
          const seg = tgt.clone().sub(from);
          const len2 = seg.lengthSq();
          for (const o of occluders) {
            const k = THREE.MathUtils.clamp(o.sphere.center.clone().sub(from).dot(seg) / len2, 0, 1);
            if (k > 0.92) continue; // behind or right at the target: fine
            const d = o.sphere.center.distanceTo(from.clone().addScaledVector(seg, k));
            if (d < o.sphere.radius * 0.75 + 1.4) hit.add(o);
            // big things right in front of the lens, even if they're off to one side
            else if (k < 0.4 && d < o.sphere.radius + 3) hit.add(o);
          }
        }
        for (const o of occluders) o.want = hit.has(o) ? 0.18 : 1;
      }
      for (const o of occluders) fadeOccluder(o, dt);
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
        if (isCur && b.weather?.hiddenRoll) sub = b.sub === 'rolled' || b.sub === 'move' || b.sub === 'branch' ? '?' : undefined;
        else if (isCur && b.sub === 'rolled') sub = String(b.roll);
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

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Which way each number faces on the die model. */
const DIE_FACE: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(0, 0, -1),
  5: new THREE.Vector3(-1, 0, 0),
  6: new THREE.Vector3(0, 1, 0),
};

interface Occluder {
  obj: THREE.Object3D;
  sphere: OccluderSphere;
  mats: THREE.Material[] | null;
  opacity: number;
  want: number;
}
interface OccluderSphere extends THREE.Sphere {
  intersectsRay(r: THREE.Ray): boolean;
}

/** Everything taller than a space tile that was placed as scenery (trees, houses, rocks, space props). */
function sceneryOccluders(scene: THREE.Scene): (Occluder & { sphere: OccluderSphere })[] {
  const out: (Occluder & { sphere: OccluderSphere })[] = [];
  scene.updateMatrixWorld(true);
  for (const obj of scene.children) {
    if ((obj as THREE.Light).isLight || (obj as THREE.InstancedMesh).isInstancedMesh) continue;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    // skip flat things (tiles, ground, water) and whole-map things (terrain, sea, sky domes)
    if (size.y < 1.2 || Math.max(size.x, size.z) > 30) continue;
    const sphere = box.getBoundingSphere(new THREE.Sphere()) as OccluderSphere;
    sphere.intersectsRay = (r: THREE.Ray) => r.intersectsSphere(sphere);
    out.push({ obj, sphere, mats: null, opacity: 1, want: 1 });
  }
  return out;
}

function fadeOccluder(o: Occluder, dt: number): void {
  if (Math.abs(o.opacity - o.want) < 0.01) return;
  o.opacity += (o.want - o.opacity) * Math.min(1, dt * 8);
  if (Math.abs(o.opacity - o.want) < 0.01) o.opacity = o.want;
  if (!o.mats) {
    // own copies of the materials, so fading one tree doesn't fade every tree
    o.mats = [];
    o.obj.traverse((m) => {
      const me = m as THREE.Mesh;
      if (!me.isMesh) return;
      const list = Array.isArray(me.material) ? me.material : [me.material];
      const copies = list.map((x) => {
        const c = x.clone();
        c.userData.baseTransparent = x.transparent;
        c.userData.baseOpacity = x.opacity;
        o.mats!.push(c);
        return c;
      });
      me.material = Array.isArray(me.material) ? copies : copies[0];
    });
  }
  const solid = o.opacity > 0.99;
  for (const m of o.mats) {
    const tr = solid ? m.userData.baseTransparent : true;
    if (m.transparent !== tr || m.depthWrite !== solid) {
      m.transparent = tr;
      m.depthWrite = solid;
      m.needsUpdate = true;
    }
    m.opacity = (m.userData.baseOpacity ?? 1) * o.opacity;
  }
}

/** Which way each number faces on the 12-sided die model. */
const D12_FACE: Record<number, [number, number, number]> = {
  1: [-0.2756, -0.4472, -0.8509],
  2: [0.7241, -0.4472, -0.5251],
  3: [0.2771, 0.4472, -0.8504],
  4: [0.8944, 0.4472, 0.0008],
  5: [0.7231, -0.4472, 0.5264],
  6: [-0.8944, -0.4472, -0.0008],
  7: [-0.2771, -0.4472, 0.8504],
  8: [-0.7241, 0.4472, 0.5251],
  9: [0.2756, 0.4472, 0.8509],
  10: [-0.7231, 0.4472, -0.5264],
  11: [0, 1, 0],
  12: [0, -1, 0],
};
const d12Tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.25);
function d12Q(v: number, out: THREE.Quaternion): THREE.Quaternion {
  const f = D12_FACE[v] ?? D12_FACE[1];
  return out.setFromUnitVectors(new THREE.Vector3(f[0], f[1], f[2]), Z_AXIS).premultiply(d12Tilt);
}
