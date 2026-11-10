import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { PartyState } from '../../../shared/party';
import { getBoard } from '../../../shared/board/boards';
import { currentPlayer, exits } from '../../../shared/board/engine';
import type { BoardDef, BoardState, SpaceType } from '../../../shared/board/types';
import { roundedRect } from '../../../shared/board/layout';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { darken, makeScene, mesh, toy } from '../kit';
import { place, sky, texture } from '../assets';
import type { Tag, View } from '../stage';

const SPACE_COLORS: Record<SpaceType, string> = {
  blue: '#2f7dff',
  red: '#ff3b4e',
  event: '#21c45a',
  lucky: '#ffc21a',
  wisp: '#9a5bff',
  station: '#ff8a1f',
  counter: '#ff3fd2',
};
const SPACE_ICON: Record<SpaceType, string> = {
  blue: '+',
  red: '−',
  event: '!',
  lucky: '?',
  wisp: '☾',
  station: '$',
  counter: '⚡',
};

function iconTexture(icon: string, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
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
  const island = mesh(new THREE.CylinderGeometry(24, 22, 2, 64), toy('#4c7a3a', 0.9), { cast: false, receive: true });
  island.scale.z = 0.72;
  island.position.y = -1.05;
  scene.add(island);
  const cliff = mesh(new THREE.CylinderGeometry(22, 12, 8, 64), toy('#6b4b36', 0.9), { cast: false, receive: true });
  cliff.scale.z = 0.72;
  cliff.position.y = -6;
  scene.add(cliff);
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
  manor.position.set(-5, 0, -12.5);
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
  place(scene, 'forest/building-structure', 9, 0, -12.5, { s: 2.4, ry: 0.2 });
  place(scene, 'forest/building-roof', 9, 2.5, -12.5, { s: 2.4, ry: 0.2 });
  place(scene, 'forest/flag', -10, 0, -11.5, { s: 2.5 });
  place(scene, 'forest/flag', 13, 0, 11, { s: 2.5 });
  for (let i = 0; i < 8; i++) place(scene, 'forest/fence', -19 + i * 1.1 * 2.4, 0, 13.4, { s: 2.4 });
  for (const [x, z] of [[-4, 4.5], [4, -4.6], [-18, 7], [19, -1], [0, 12.5]] as [number, number][]) place(scene, 'forest/rocks-low', x, 0, z, { s: 2, ry: x });
  for (const [x, z] of [[-2, 1], [2.5, 0.6], [-7, -5.6], [7, 5.6]] as [number, number][]) place(scene, 'platformer/mushrooms', x, 0, z, { s: 2.2, shadow: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff6d6', fog: false }));
  moon.position.set(30, 26, -60);
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
      g.position.set(Math.cos(a) * (6 + i * 2.5), 1.2 + Math.sin(t * 2 + i) * 0.4, -14 + Math.sin(a) * 2.2);
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
  rocket.position.set(-20, -0.05, -6.5);
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
  for (const [x, z, ry] of [[-6, -5.5, 0.3], [6, 5.5, 3.4], [-9, 5, 2.4], [9, -5, -0.5]] as [number, number, number][]) {
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
  let lastCounter = -1;
  let fire = 0;
  return (s, t, dt) => {
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
  const sand = mesh(new THREE.CircleGeometry(120, 48), toy('#e8b273', 0.9), { cast: false, receive: true });
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  scene.add(sand);
  const rock = toy('#c4673e', 0.85);
  for (let i = 0; i < 9; i++) {
    const w = 4 + (i % 3) * 2;
    const m = mesh(new THREE.CylinderGeometry(w, w * 1.2, 6 + (i % 2) * 4, 8), rock, { receive: true });
    m.position.set(-48 + i * 12, 3, -34 - (i % 3) * 6);
    scene.add(m);
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
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const c = mesh(new THREE.CapsuleGeometry(0.4, 1.8, 6, 10), green);
    c.position.set(Math.cos(a) * 30, 1.3, Math.sin(a) * 20);
    scene.add(c);
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
  for (const [x, z] of [[-30, 12], [30, -12], [-34, -6], [33, 8], [0, 21], [-12, -21]] as [number, number][]) place(scene, 'pirate/rocks-sand-a', x, 0, z, { s: 1.4, ry: x });
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
  return (_s, t) => {
    cars.forEach((car, i) => {
      const [x, z, ang] = at(t * 0.012 - (car.userData.gap as number));
      car.position.set(x, 0, z);
      car.rotation.y = -ang;
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

export function boardView(env: THREE.Texture, party: PartyState, players: PlayerInfo[]): View {
  const def = getBoard(party.board!.boardId);
  const [top, bottom, fog] = SKY[def.theme];
  const scene = makeScene(env, { skyTop: top, skyBottom: bottom, fog, shadowSize: 30, sunDir: [12, 26, 16] });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  const animateDecor = DECOR[def.theme](scene, def);

  // spaces
  const tileGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.32, 36);
  const rimMat = toy('#ffffff', 0.35);
  const capGeo = new THREE.CircleGeometry(0.78, 36);
  const capMats = new Map<SpaceType, THREE.Material>();
  const tileMats = new Map<SpaceType, THREE.Material>();
  // every space is a little spring: it dips when someone lands on it and wobbles back
  const springs = new Map<string, { parts: THREE.Object3D[]; base: number[]; y: number; v: number }>();
  for (const [nodeId, n] of Object.entries(def.nodes)) {
    if (!capMats.has(n.type)) {
      capMats.set(n.type, new THREE.MeshStandardMaterial({ map: iconTexture(SPACE_ICON[n.type], SPACE_COLORS[n.type]), roughness: 0.35 }));
      tileMats.set(n.type, toy(darken(SPACE_COLORS[n.type], 0.15), 0.4));
    }
    const tile = mesh(tileGeo, [tileMats.get(n.type)!, rimMat, rimMat], { receive: true });
    tile.position.set(n.x, 0.16, n.z);
    scene.add(tile);
    const cap = mesh(capGeo, capMats.get(n.type)!, { cast: false, receive: true });
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(n.x, 0.33, n.z);
    scene.add(cap);
    springs.set(nodeId, { parts: [tile, cap], base: [0.16, 0.33], y: 0, v: 0 });
    if (def.theme === 'cosmo') {
      const pillar = mesh(new THREE.CylinderGeometry(0.6, 0.3, 1.2, 12), toy('#7b86b8', 0.3));
      pillar.position.set(n.x, -0.45, n.z);
      scene.add(pillar);
    }
  }
  // paths between spaces
  const pathMat = toy(PATH_COLOR[def.theme], 0.7);
  const gatedPaths: { mesh: THREE.Mesh; to: string; from: string }[] = [];
  for (const n of Object.values(def.nodes)) {
    for (const to of n.next) {
      const m2 = def.nodes[to];
      const dx = m2.x - n.x;
      const dz = m2.z - n.z;
      const len = Math.hypot(dx, dz);
      if (len > 6) continue; // long jumps (none today) are not drawn
      const p = mesh(new THREE.BoxGeometry(len, 0.12, 0.42), n.gate ? pathMat.clone() : pathMat, { cast: false, receive: true });
      p.position.set((n.x + m2.x) / 2, 0.08, (n.z + m2.z) / 2);
      p.rotation.y = -Math.atan2(dz, dx);
      scene.add(p);
      if (n.gate) gatedPaths.push({ mesh: p, from: n.id, to });
    }
  }

  // crowns
  const crownPool: THREE.Group[] = [];
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
  const diceMat = toy('#ffffff', 0.25);
  const dice = mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), [
    diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?'), diceFace('?'),
  ]);
  void diceMat;
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
  const span = Math.max(...xs) - Math.min(...xs);
  const overview = new THREE.Vector3(0, span * 0.75, span * 0.62);
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

  function spotFor(b: BoardState, id: string): THREE.Vector3 {
    const me = b.players[id];
    const n = def.nodes[me.node];
    const cur = currentPlayer(b);
    if (b.hop && id === cur) {
      const from = def.nodes[b.hop.from];
      const to = def.nodes[b.hop.to];
      const f = Math.max(0, Math.min(1, b.hop.t));
      const arc = Math.sin(f * Math.PI) * (b.hop.t < 0 || Math.hypot(to.x - from.x, to.z - from.z) > 6 ? 4.5 : 1.5);
      return new THREE.Vector3(from.x + (to.x - from.x) * f, 0.33 + arc, from.z + (to.z - from.z) * f);
    }
    // spread out players sharing a space; the current player stands in the middle
    const here = b.order.filter((o) => b.players[o].node === me.node && !(b.hop && o === cur));
    if (here.length <= 1 || id === cur) return new THREE.Vector3(n.x, 0.33, n.z);
    const others = here.filter((o) => o !== cur);
    const k = others.indexOf(id);
    const a = (k / others.length) * Math.PI * 2;
    return new THREE.Vector3(n.x + Math.cos(a) * 0.75, 0.33, n.z + Math.sin(a) * 0.75);
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
          const c = makeCrown();
          const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 36), ringMat);
          glow.rotation.x = -Math.PI / 2;
          glow.position.y = -1.85;
          c.add(glow);
          scene.add(c);
          crownPool.push(c);
        }
        const c = crownPool[i];
        const n = def.nodes[nodeId];
        c.visible = true;
        c.position.set(n.x, 2.2 + Math.sin(t * 2 + i) * 0.15, n.z);
        c.rotation.y = t * 1.2;
      });

      // tile springs
      for (const [id, pl] of Object.entries(b.players)) {
        const prevNode = lastNode.get(id);
        const n = def.nodes[pl.node];
        const at = new THREE.Vector3(n.x, 0.45, n.z);
        if (prevNode !== undefined && prevNode !== pl.node) {
          kick(pl.node, 3.2);
          models.get(id)?.squash(6);
          fx.dust(at, 0.6);
        }
        lastNode.set(id, pl.node);
        const pc = lastCoins.get(id);
        if (pc !== undefined && pl.coins > pc) fx.sparkle(at.clone().setY(1.6), '#ffd23f', 6 + Math.min(14, pl.coins - pc));
        if (pc !== undefined && pl.coins < pc) fx.emit(at.clone().setY(1.4), { tex: 'puff', color: '#ff7a7a', n: 6, speed: [1, 2], up: 1, life: [0.3, 0.5], size: [0.4, 0.8] });
        lastCoins.set(id, pl.coins);
        const pcr = lastCrowns.get(id);
        if (pcr !== undefined && pl.crowns > pcr) {
          fx.party(at.clone().setY(1.8));
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
        const lift = Math.max(0, p.y - 0.33);
        m.group.position.set(p.x, 0.33 + (b.hop && id === cur ? 0 : (under?.y ?? 0)), p.z);
        const moving = id === cur && !!b.hop;
        if (moving) {
          const to = def.nodes[b.hop!.to];
          m.group.rotation.y = Math.atan2(to.x - p.x, to.z - p.z);
        } else {
          m.group.rotation.y += (Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - m.group.rotation.y) * Math.min(1, dt * 4);
        }
        m.update(dt, { speed: 0, jump: lift / 0.55, happy: id === cur && b.sub === 'rolled', t });
      }

      // dice above the current player while rolling
      const cp = pos.get(cur) ?? new THREE.Vector3();
      dice.visible = b.sub === 'roll' || b.sub === 'rolled';
      dice.position.set(cp.x, cp.y + 2.4 + (b.sub === 'rolled' ? Math.min(1, b.t * 4) * 0.6 : Math.sin(t * 5) * 0.1), cp.z);
      if (b.sub === 'roll') dice.rotation.set(t * 7, t * 9, t * 5);
      else dice.rotation.set(0, 0, 0);

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
      const wantOverview = b.sub === 'turnIntro' && b.cur === 0 && b.t < 2;
      const goalPos = wantOverview ? overview : new THREE.Vector3(cp.x, cp.y + 10.5, cp.z + 10.5);
      const goalLook = wantOverview ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(cp.x, cp.y + 0.6, cp.z);
      camPos.lerp(goalPos, Math.min(1, dt * 2.2));
      camLook.lerp(goalLook, Math.min(1, dt * 3));
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
