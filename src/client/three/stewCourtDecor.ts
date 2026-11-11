import * as THREE from 'three';
import type { BoardDef, BoardState } from '../../shared/board/types';
import { COURT } from '../../shared/board/boards';
import { mesh, toy } from './kit';
import { place, sky } from './assets';
import { BOSS_INTRO, BOSS_SLAM, SPIN_STOP } from '../../shared/board/engine';
import { shake } from './fx';
import { sfx } from '../sfx';
import { postPulse } from './look/post';

/**
 * STEW COURT: a hardwood basketball court floating in deep space. Built in the board's
 * unspread coordinates (the board view scales the whole lot up with the spaces).
 * - the floor: hardwood with painted lines, a stew-pot logo at centre court, a glowing rim
 * - a hull underneath with thrusters, so it reads as floating
 * - a hoop at each end; the one holding the Crown Chest lights up gold
 * - floating bleachers behind the far sideline (the Bleacher Run goes through them)
 * - a jumbotron spinning slowly over centre court, planets, asteroids and a starfield
 */
const FLOOR = { w: 64, h: 40 };
const LINES = { w: 58, h: 34 };
/** Where the hoops' rims hang (x), just past the hoop spaces at the round ends of the loop. */
const RIM_X = COURT.hoopX + 1.1;
const RIM_Y = 4.4;

function courtTexture(evil = false, glow = false): THREE.CanvasTexture {
  const px = 18; // pixels per world unit
  const cw = FLOOR.w * px, ch = FLOOR.h * px;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  // hardwood: long boards running lengthways, slightly different tones
  const plank = 0.9 * px;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < ch; y += plank) {
    let x = -r() * 6 * px;
    while (x < cw) {
      const len = (4 + r() * 5) * px;
      const t = evil ? 34 + Math.floor(r() * 22) : 176 + Math.floor(r() * 24);
      g.fillStyle = glow ? '#000000' : evil ? `rgb(${t},${Math.floor(t * 0.5)},${Math.floor(t * 0.45)})` : `rgb(${t},${Math.floor(t * 0.66)},${Math.floor(t * 0.36)})`;
      g.fillRect(x, y, len - 2, plank - 2);
      x += len;
    }
  }
  if (!evil) {
    g.fillStyle = 'rgba(255,240,210,0.08)';
    g.fillRect(0, 0, cw, ch);
  }
  const X = (wx: number) => cw / 2 + wx * px;
  const Z = (wz: number) => ch / 2 + wz * px;
  // painted areas: the keys at each end and the centre circle, in deep stew orange
  g.fillStyle = glow ? 'rgba(120,20,0,1)' : evil ? 'rgba(150,30,0,0.85)' : 'rgba(196,74,22,0.75)';
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? X(-LINES.w / 2) : X(LINES.w / 2 - 7.5);
    g.fillRect(x0, Z(-3.2), 7.5 * px, 6.4 * px);
  }
  g.beginPath();
  g.arc(X(0), Z(0), 4.2 * px, 0, Math.PI * 2);
  g.fill();
  // apron outside the lines
  g.fillStyle = glow ? '#000000' : evil ? 'rgba(20,6,8,0.92)' : 'rgba(70,26,90,0.85)';
  g.fillRect(0, 0, cw, Z(-LINES.h / 2));
  g.fillRect(0, Z(LINES.h / 2), cw, ch - Z(LINES.h / 2));
  g.fillRect(0, 0, X(-LINES.w / 2), ch);
  g.fillRect(X(LINES.w / 2), 0, cw - X(LINES.w / 2), ch);
  // white lines
  g.strokeStyle = evil ? '#ff5a1a' : '#ffffff';
  g.lineWidth = 0.22 * px;
  g.strokeRect(X(-LINES.w / 2), Z(-LINES.h / 2), LINES.w * px, LINES.h * px);
  g.beginPath();
  g.moveTo(X(0), Z(-LINES.h / 2));
  g.lineTo(X(0), Z(LINES.h / 2));
  g.stroke();
  for (const rad of [4.2, 1.6]) {
    g.beginPath();
    g.arc(X(0), Z(0), rad * px, 0, Math.PI * 2);
    g.stroke();
  }
  for (const side of [-1, 1]) {
    const bx = side * (LINES.w / 2);
    const hx = side * RIM_X;
    // the key and its free-throw circle
    const ft = bx - side * 7.5;
    g.strokeRect(Math.min(X(bx), X(ft)), Z(-3.2), 7.5 * px, 6.4 * px);
    g.beginPath();
    g.arc(X(ft), Z(0), 3.2 * px, 0, Math.PI * 2);
    g.stroke();
    // three-point line: short straights off the baseline, then the arc
    const R = 12.5;
    const zc = 13.6;
    const dx = Math.sqrt(R * R - zc * zc > 0 ? R * R - zc * zc : 0);
    g.beginPath();
    if (side < 0) g.arc(X(hx), Z(0), R * px, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25);
    else g.arc(X(hx), Z(0), R * px, Math.PI / 2 + 0.25, (3 * Math.PI) / 2 - 0.25);
    g.stroke();
    void dx;
  }
  if (evil) {
    // glowing cracks burned right across the boards
    g.strokeStyle = '#ffb020';
    g.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let x = r() * cw, y = r() * ch;
      g.lineWidth = (0.08 + r() * 0.16) * px;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (r() - 0.5) * 5 * px;
        y += (r() - 0.5) * 5 * px;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // centre court: a bubbling stew pot and the name
  g.save();
  g.translate(X(0), Z(0));
  g.fillStyle = '#2a1238';
  g.beginPath();
  g.ellipse(0, 0.6 * px, 2.2 * px, 1.3 * px, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8bd448';
  g.beginPath();
  g.ellipse(0, -0.2 * px, 2.2 * px, 0.55 * px, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd23f';
  for (const [bx, by, br] of [[-0.8, -0.3, 0.28], [0.5, -0.15, 0.2], [1.2, -0.35, 0.14]]) {
    g.beginPath();
    g.arc(bx * px, by * px, br * px, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.font = `900 ${2.1 * px}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 0.35 * px;
  g.strokeStyle = '#2a1238';
  for (const side of [-1, 1]) {
    g.save();
    g.translate(X(side * 10.5), Z(0));
    g.rotate(side * Math.PI / 2);
    const word = evil ? 'CHOPPY VERSE' : 'STEW COURT';
    g.strokeText(word, 0, 0);
    g.fillStyle = evil ? '#ff3b1a' : '#ffd23f';
    g.fillText(word, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A basketball: orange with black seams. */
function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = 'rgba(120,40,0,0.18)';
    g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = '#1b0d05';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, 64);
  g.lineTo(256, 64);
  for (const x of [64, 192]) {
    g.moveTo(x, 0);
    g.lineTo(x, 128);
  }
  g.stroke();
  for (const x of [0, 128, 256]) {
    g.beginPath();
    g.ellipse(x, 64, 34, 64, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let ballTex: THREE.CanvasTexture | null = null;
export function basketball(r: number): THREE.Mesh {
  ballTex ??= ballTexture();
  return mesh(new THREE.SphereGeometry(r, 28, 18), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.65 }));
}


/** Canvas text on a transparent square, for jersey numbers. */
function labelTexture(txt: string, col: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '900 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1b0d05';
  g.strokeText(txt, 64, 70);
  g.fillStyle = col;
  g.fillText(txt, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The Stew Court villain (placeholder look until Michael picks one): a giant blocky space baller
 * with purple skin, glowing red eyes, a gold crown, a headband and a flaming ball. Stands on the
 * origin facing +z, `h` units tall. Returns the group plus the parts that animate.
 */
export function makeTyrant(h: number): { g: THREE.Group; ball: THREE.Object3D; armR: THREE.Object3D; eyes: THREE.MeshStandardMaterial; flame: THREE.Mesh } {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const skin = toy('#7a3fb0', 0.5);
  const jersey = toy('#16121f', 0.5);
  const trim = toy('#ff8a1f', 0.45);
  const shoe = toy('#ffffff', 0.4);
  const box = (w: number, hh: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = inner) => {
    const b = mesh(new THREE.BoxGeometry(w, hh, d), m);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  // legs and sneakers
  for (const sx of [-0.45, 0.45]) {
    box(0.55, 0.3, 0.85, shoe, sx, 0.15, 0.08);
    box(0.5, 1.5, 0.5, skin, sx, 1.05, 0);
    box(0.62, 0.9, 0.62, jersey, sx, 2.0, 0);
    box(0.64, 0.12, 0.64, trim, sx, 1.58, 0);
  }
  // torso with a jersey number
  box(1.7, 1.9, 0.95, jersey, 0, 3.2, 0);
  box(1.74, 0.14, 0.99, trim, 0, 4.1, 0);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: labelTexture('00', '#ff8a1f'), transparent: true }));
  num.position.set(0, 3.25, 0.48);
  inner.add(num);
  // arms: the right one holds the ball up high
  const armL = new THREE.Group();
  armL.position.set(-1.05, 3.95, 0);
  box(0.42, 1.6, 0.42, skin, 0, -0.8, 0, armL);
  box(0.46, 0.4, 0.46, trim, 0, -0.05, 0, armL);
  armL.rotation.z = -0.25;
  inner.add(armL);
  const armR = new THREE.Group();
  armR.position.set(1.05, 3.95, 0);
  box(0.42, 1.6, 0.42, skin, 0, 0.8, 0, armR);
  box(0.46, 0.4, 0.46, trim, 0, 0.05, 0, armR);
  armR.rotation.z = -0.35;
  inner.add(armR);
  const ball = basketball(0.55);
  ball.position.set(0, 1.95, 0);
  armR.add(ball);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff6a00', transparent: true, opacity: 0.75, depthWrite: false }));
  flame.position.set(0, 0.7, 0);
  ball.add(flame);
  // the big square head: red glowing eyes, a scowl, headband and a gold crown
  const head = box(1.3, 1.3, 1.2, skin, 0, 4.85, 0);
  void head;
  box(1.34, 0.22, 1.24, toy('#ff3b4e', 0.4), 0, 5.15, 0);
  const eyes = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff0000', emissiveIntensity: 2 });
  for (const sx of [-0.3, 0.3]) {
    const e = mesh(new THREE.BoxGeometry(0.28, 0.14, 0.05), eyes, { cast: false });
    e.position.set(sx, 4.88, 0.61);
    e.rotation.z = sx > 0 ? 0.3 : -0.3;
    inner.add(e);
  }
  box(0.6, 0.08, 0.05, toy('#1b0d05', 0.5), 0, 4.5, 0.61);
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', roughness: 0.22, metalness: 0.75, emissive: '#5a3a00' });
  box(1.36, 0.3, 1.26, gold, 0, 5.62, 0);
  for (const [x, z] of [[-0.55, 0.5], [0, 0.5], [0.55, 0.5], [-0.55, -0.5], [0.55, -0.5]]) {
    const sp = mesh(new THREE.ConeGeometry(0.16, 0.45, 4), gold);
    sp.position.set(x, 5.98, z);
    inner.add(sp);
  }
  inner.scale.setScalar(h / 6.3);
  return { g, ball, armR, eyes, flame };
}

interface Hoop {
  node: string;
  rim: THREE.MeshStandardMaterial;
  net: THREE.MeshStandardMaterial;
  board: THREE.MeshStandardMaterial;
  lamp: THREE.Mesh;
  glow: THREE.Mesh;
  g: THREE.Group;
}

/** A hoop standing behind the baseline at `side` (-1 west, 1 east), its rim over the hoop space. */
function makeHoop(side: number): Omit<Hoop, 'node'> {
  const g = new THREE.Group();
  g.userData.keep = true;
  const steel = toy('#2b2f45', 0.35);
  const padMat = toy('#ff8a1f', 0.5);
  const baseX = side * (LINES.w / 2 + 2.6);
  // a padded base and a tall pole, with an arm reaching out over the court
  const base = mesh(new THREE.BoxGeometry(2.2, 1.2, 2.6), padMat);
  base.position.set(baseX, 0.6, 0);
  const pole = mesh(new THREE.CylinderGeometry(0.22, 0.28, RIM_Y + 1.6, 12), steel);
  pole.position.set(baseX, (RIM_Y + 1.6) / 2, 0);
  const armLen = Math.abs(baseX - (RIM_X + 0.9) * side);
  const arm = mesh(new THREE.BoxGeometry(armLen, 0.3, 0.4), steel);
  arm.position.set((baseX + side * (RIM_X + 0.9)) / 2, RIM_Y + 1.2, 0);
  // the backboard: glass with an orange square, lit when the Crown Chest is here
  const boardMat = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, emissive: '#000000' });
  const board = mesh(new THREE.BoxGeometry(0.12, 2.2, 3.6), boardMat);
  board.position.set(side * (RIM_X + 0.85), RIM_Y + 0.9, 0);
  const frame = mesh(new THREE.BoxGeometry(0.16, 2.35, 3.75), new THREE.MeshStandardMaterial({ color: '#ffffff', wireframe: true }));
  frame.position.copy(board.position);
  const sq = mesh(new THREE.BoxGeometry(0.14, 0.9, 1.2), toy('#ff8a1f', 0.4));
  sq.position.set(side * (RIM_X + 0.8), RIM_Y + 0.55, 0);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#ff5a1a', roughness: 0.3, metalness: 0.5, emissive: '#000000' });
  const rim = mesh(new THREE.TorusGeometry(0.75, 0.07, 10, 32), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(side * RIM_X, RIM_Y, 0);
  // the net: an open cone of see-through white
  const netMat = new THREE.MeshStandardMaterial({ color: '#ffffff', wireframe: true, emissive: '#000000' });
  const net = mesh(new THREE.CylinderGeometry(0.74, 0.45, 1.0, 14, 3, true), netMat, { cast: false });
  net.position.set(side * RIM_X, RIM_Y - 0.5, 0);
  // a lamp on top that blinks gold when the chest is here, and a ring of light on the floor
  const lamp = mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0 }));
  lamp.position.set(side * (RIM_X + 0.85), RIM_Y + 2.3, 0);
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.0, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(side * COURT.hoopX, 0.03, 0);
  g.add(base, pole, arm, board, frame, sq, rim, net, lamp, glow);
  return { rim: rimMat, net: netMat, board: boardMat, lamp, glow, g };
}

/** A block of floating bleachers: stepped tiers of seats in team colours, with a few fans' heads. */
function bleachers(w: number, tiers: number, col: string): THREE.Group {
  const g = new THREE.Group();
  const steel = toy('#3a3f5c', 0.4);
  const seat = toy(col, 0.45);
  for (let i = 0; i < tiers; i++) {
    const step = mesh(new THREE.BoxGeometry(w, 0.55, 1.1), steel);
    step.position.set(0, 0.27 + i * 0.55, -i * 1.1);
    g.add(step);
    const bench = mesh(new THREE.BoxGeometry(w - 0.4, 0.18, 0.5), seat);
    bench.position.set(0, 0.64 + i * 0.55, -i * 1.1 - 0.15);
    g.add(bench);
  }
  // fans: little bobbing balls in bright colours
  const fans: THREE.Mesh[] = [];
  const cols = ['#ff5a5f', '#ffd23f', '#5fb8ff', '#4cd97b', '#c79bff', '#ffffff', '#ff9f1c'];
  for (let i = 0; i < tiers; i++) {
    for (let x = -w / 2 + 0.7; x < w / 2 - 0.5; x += 0.9 + ((i * 7 + x * 3) % 1) * 0.6) {
      if (((x * 13 + i * 5) | 0) % 3 === 0) continue;
      const f = mesh(new THREE.SphereGeometry(0.26, 10, 8), toy(cols[Math.abs((x * 7 + i * 3) | 0) % cols.length], 0.5));
      f.position.set(x, 1.05 + i * 0.55, -i * 1.1 - 0.2);
      f.userData.base = f.position.y;
      g.add(f);
      fans.push(f);
    }
  }
  g.userData.fans = fans;
  return g;
}

export function courtDecor(scene: THREE.Scene, def: BoardDef): (s: BoardState, t: number, dt: number) => void {
  scene.fog = null;
  const nebula = sky('space-nebula');
  const arenaBg = new THREE.Color('#171221');
  scene.background = arenaBg;
  // everything that only exists in one of the two worlds
  const chop: THREE.Object3D[] = [];
  const fucci: THREE.Object3D[] = [];
  const grab = (list: THREE.Object3D[], from: number) => list.push(...scene.children.slice(from));

  // the floating court
  const floorMat = new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.55, metalness: 0.0, color: '#e6d6c6' });
  const evilMat = new THREE.MeshStandardMaterial({ map: courtTexture(true), roughness: 0.7, color: '#b0a0a0', emissive: '#ffffff', emissiveMap: courtTexture(true, true), emissiveIntensity: 1.1 });
  const floorMats = [toy('#2a1238', 0.4), toy('#2a1238', 0.4), floorMat, toy('#1b1030', 0.5), toy('#2a1238', 0.4), toy('#2a1238', 0.4)];
  const floor = mesh(new THREE.BoxGeometry(FLOOR.w, 1.2, FLOOR.h), floorMats as unknown as THREE.Material, { cast: false, receive: true });
  floor.position.y = -0.62;
  floor.userData.ground = true;
  scene.add(floor);
  // a glowing rim all round the edge
  const rimMat = new THREE.MeshStandardMaterial({ color: '#ff8a1f', emissive: '#ff6a00', emissiveIntensity: 1.2 });
  for (const [w, d, x, z] of [[FLOOR.w + 0.4, 0.4, 0, FLOOR.h / 2], [FLOOR.w + 0.4, 0.4, 0, -FLOOR.h / 2], [0.4, FLOOR.h, FLOOR.w / 2, 0], [0.4, FLOOR.h, -FLOOR.w / 2, 0]]) {
    const strip = mesh(new THREE.BoxGeometry(w, 0.35, d), rimMat, { cast: false });
    strip.position.set(x, -0.15, z);
    strip.userData.ground = true;
    scene.add(strip);
  }
  // FUCCI VERSE: a normal arena. The court sits on the arena floor, with stands all round and a lighting rig
  let mark = scene.children.length;
  const ground = mesh(new THREE.CircleGeometry(95, 64), toy('#241b2e', 0.8), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.22;
  ground.userData.ground = true;
  scene.add(ground);
  const wall = mesh(new THREE.CylinderGeometry(78, 78, 40, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#2a2040', side: THREE.BackSide, roughness: 0.9 }), { cast: false });
  wall.position.y = 18;
  wall.userData.ground = true;
  scene.add(wall);
  for (const [y, col] of [[2.5, '#ff8a1f'], [9, '#5fb8ff']] as [number, string][]) {
    const band = mesh(new THREE.CylinderGeometry(77.5, 77.5, 1.2, 64, 1, true), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8, side: THREE.BackSide }), { cast: false });
    band.position.y = y;
    band.userData.ground = true;
    scene.add(band);
  }
  for (const [x, z, ry, w] of [[-41, 0, Math.PI / 2, 34], [41, 0, -Math.PI / 2, 34], [0, 30, Math.PI, 50]] as [number, number, number, number][]) {
    const st = bleachers(w, 8, '#3d5bff');
    st.position.set(x, -1.2, z);
    st.rotation.y = ry;
    st.userData.keep = true;
    scene.add(st);
  }
  const rig = new THREE.Group();
  rig.userData.sky = true;
  const truss = mesh(new THREE.TorusGeometry(26, 0.5, 6, 48), toy('#3a3f5c', 0.4), { cast: false });
  truss.rotation.x = Math.PI / 2;
  truss.scale.y = 0.62;
  rig.add(truss);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const lamp = mesh(new THREE.CylinderGeometry(0.7, 1.1, 1.2, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 2 }), { cast: false });
    lamp.position.set(Math.cos(a) * 26, -0.8, Math.sin(a) * 26 * 0.62);
    rig.add(lamp);
  }
  rig.position.y = 30;
  scene.add(rig);
  grab(fucci, mark);

  // CHOPPY VERSE: the court tears loose and floats in deep space, burning
  mark = scene.children.length;
  // the hull under the court: a shallow upturned pyramid of dark metal with thrusters
  const hull = mesh(new THREE.CylinderGeometry(1, 0.55, 4.5, 4, 1), toy('#1b1030', 0.5), { cast: false });
  hull.rotation.y = Math.PI / 4;
  hull.scale.set(FLOOR.w * 0.7, 1, FLOOR.h * 0.7);
  hull.position.y = -3.45;
  hull.userData.ground = true;
  scene.add(hull);
  const thrustMat = new THREE.MeshBasicMaterial({ color: '#5fd8ff', transparent: true, opacity: 0.75, depthWrite: false });
  const flames: THREE.Mesh[] = [];
  for (const [x, z] of [[-18, -9], [18, -9], [-18, 9], [18, 9], [0, 0]] as [number, number][]) {
    const nozzle = mesh(new THREE.CylinderGeometry(1.4, 1.9, 1.4, 16), toy('#3a3f5c', 0.3), { cast: false });
    nozzle.position.set(x, -5.6, z);
    nozzle.userData.ground = true;
    scene.add(nozzle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5, 16, 1, true), thrustMat);
    flame.rotation.x = Math.PI;
    flame.position.set(x, -8.8, z);
    flame.userData.ground = true;
    scene.add(flame);
    flames.push(flame);
  }

  // fire burning on the court (the board view nudges each one off the path)
  const fires: THREE.Group[] = [];
  const fireMats = ['#ff3b00', '#ff8a00', '#ffd23f'].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  let fseed = 3;
  const fr = () => ((fseed = (fseed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const f = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7 - k * 0.18, 2.4 - k * 0.6, 8, 1, true), fireMats[k]);
      cone.position.set((fr() - 0.5) * 0.3, (2.4 - k * 0.6) / 2, (fr() - 0.5) * 0.3);
      f.add(cone);
    }
    f.position.set((fr() - 0.5) * (FLOOR.w - 6), 0, (fr() - 0.5) * (FLOOR.h - 6));
    f.userData.k = fr() * 10;
    scene.add(f);
    fires.push(f);
  }
  const hellLight = new THREE.PointLight('#ff3010', 30, 70, 1.4);
  hellLight.position.set(0, 8, 0);
  scene.add(hellLight);
  grab(chop, mark);

  // hoops: the lit one holds the Crown Chest
  const west = def.crownSpots.find((id) => def.nodes[id].x < 0) ?? def.crownSpots[0];
  const east = def.crownSpots.find((id) => def.nodes[id].x > 0) ?? def.crownSpots[1];
  const hoops: Hoop[] = [
    { node: west, ...makeHoop(-1) },
    { node: east, ...makeHoop(1) },
  ];
  for (const h of hoops) scene.add(h.g);
  // ball racks by each hoop
  for (const side of [-1, 1]) {
    const rack = new THREE.Group();
    rack.userData.keep = true;
    const frame = mesh(new THREE.BoxGeometry(0.9, 0.1, 2.6), toy('#3a3f5c', 0.4));
    frame.position.y = 0.9;
    rack.add(frame);
    for (const leg of [-1.1, 1.1]) {
      const l = mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), toy('#3a3f5c', 0.4));
      l.position.set(0, 0.45, leg);
      rack.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const b = basketball(0.32);
      b.position.set(0, 1.28, -0.95 + i * 0.63);
      rack.add(b);
    }
    rack.position.set(side * (LINES.w / 2 + 1.2), 0, side * 7);
    scene.add(rack);
  }

  // the bench and scorer's table at the Respawn Camp (bottom middle)
  const camp = def.nodes[def.camp];
  const table = mesh(new THREE.BoxGeometry(7, 0.5, 1.2), toy('#2a1238', 0.4));
  table.position.set(camp.x, 0.25, camp.z + 4.2);
  table.userData.keep = true;
  scene.add(table);
  const tableFace = mesh(new THREE.BoxGeometry(6.6, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9f1c', emissiveIntensity: 0.6 }));
  tableFace.position.set(camp.x, 0.28, camp.z + 3.58);
  tableFace.userData.keep = true;
  scene.add(tableFace);
  for (const side of [-1, 1]) {
    const bench = bleachers(6, 1, side < 0 ? '#5fb8ff' : '#ff5a5f');
    bench.position.set(camp.x + side * 9.5, 0, camp.z + 4.4);
    bench.rotation.y = Math.PI;
    bench.userData.keep = true;
    scene.add(bench);
  }

  // floating bleachers behind the far sideline; the Bleacher Run walkway threads through them
  const stands: THREE.Group[] = [];
  for (const [x, col] of [[-16, '#5fb8ff'], [0, '#ffd23f'], [16, '#ff5a5f']] as [number, string][]) {
    const st = bleachers(13, 6, col);
    st.position.set(x, 1.2, -24.5);
    st.userData.keep = true;
    st.userData.base = st.position.y;
    scene.add(st);
    stands.push(st);
  }
  // a catwalk slab under each Bleacher Run space, with glowing edges
  const walkMat = toy('#3a3f5c', 0.35);
  const walkEdge = new THREE.MeshStandardMaterial({ color: '#ff8a1f', emissive: '#ff6a00', emissiveIntensity: 0.9 });
  const run = Object.values(def.nodes).filter((n) => n.id.startsWith('sb'));
  for (const n of run) {
    const slab = mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.35, 20), walkMat);
    slab.position.set(n.x, n.y - 0.2, n.z);
    slab.userData.keep = true;
    scene.add(slab);
    const edge = mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 28), walkEdge, { cast: false });
    edge.rotation.x = Math.PI / 2;
    edge.position.set(n.x, n.y - 0.04, n.z);
    edge.userData.keep = true;
    scene.add(edge);
  }

  // the jumbotron over centre court
  const jumbo = new THREE.Group();
  jumbo.userData.sky = true;
  const screenMat = new THREE.MeshStandardMaterial({ color: '#10173a', emissive: '#3d5bff', emissiveIntensity: 0.55 });
  const box = mesh(new THREE.BoxGeometry(5.5, 3, 5.5), [screenMat, screenMat, toy('#2b2f45', 0.4), toy('#2b2f45', 0.4), screenMat, screenMat] as unknown as THREE.Material);
  jumbo.add(box);
  for (const y of [-1.7, 1.7]) {
    const band = mesh(new THREE.BoxGeometry(5.9, 0.35, 5.9), new THREE.MeshStandardMaterial({ color: '#ff8a1f', emissive: '#ff6a00', emissiveIntensity: 1 }));
    band.position.y = y;
    jumbo.add(band);
  }
  const jball = basketball(1.1);
  jball.position.y = 3;
  jumbo.add(jball);
  jumbo.position.set(0, 25, -4);
  jumbo.scale.setScalar(0.8);
  scene.add(jumbo);

  // the wider universe (Choppy Verse only): planets, a ringed giant, asteroids, satellites and a starfield
  mark = scene.children.length;
  const planets: THREE.Object3D[] = [];
  const addPlanet = (r: number, col: string, x: number, y: number, z: number, ring?: string) => {
    const p = mesh(new THREE.SphereGeometry(r, 32, 20), toy(col, 0.55), { cast: false });
    p.position.set(x, y, z);
    p.userData.sky = true;
    if (ring) {
      const rg = mesh(new THREE.TorusGeometry(r * 1.7, r * 0.18, 4, 64), toy(ring, 0.5), { cast: false });
      rg.rotation.x = Math.PI / 2.4;
      rg.scale.z = 0.2;
      p.add(rg);
    }
    scene.add(p);
    planets.push(p);
  };
  addPlanet(9, '#ff9f5a', -55, 14, -60, '#ffd8a8');
  addPlanet(4.5, '#7ad3ff', 58, 8, -45);
  addPlanet(3, '#c79bff', 40, -14, 40);
  addPlanet(6, '#4cd97b', -48, -18, 30);
  const rocks: THREE.Object3D[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const R = 46 + (i % 3) * 6;
    const rock = new THREE.Group();
    place(rock, 'space/meteor', 0, 0, 0, { s: 2 + (i % 4) });
    rock.position.set(Math.cos(a) * R, -6 + ((i * 7) % 11) - 5, Math.sin(a) * R * 0.7);
    rock.userData.sky = true;
    rock.userData.spin = 0.2 + (i % 5) * 0.1;
    scene.add(rock);
    rocks.push(rock);
  }
  place(scene, 'space/satelliteDish_large', -36, 4, -30, { s: 3, ry: 0.8 });
  scene.children[scene.children.length - 1].userData.sky = true;
  place(scene, 'space/craft_racer', 34, 9, -26, { s: 3, ry: -0.9 });
  const racer = scene.children[scene.children.length - 1];
  racer.userData.sky = true;
  const starGeo = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let i = 0; i < 1200; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = (Math.random() - 0.35) * Math.PI * 0.9;
    const r = 130;
    pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.7, sizeAttenuation: true }));
  stars.userData.sky = true;
  scene.add(stars);
  grab(chop, mark);
  let wasChoppy: boolean | null = null;

  // the villain waits off-screen, high above the court
  const ty = makeTyrant(9);
  ty.g.visible = false;
  ty.g.userData.sky = true;
  scene.add(ty.g);
  let bossAt: THREE.Vector3 | null = null;
  let slammed = false;
  let leaveT = -1;
  const HOVER = new THREE.Vector3(0, 7, -4);

  return (s, t, dt) => {
    // flip worlds
    const choppy = !!s.choppy;
    if (choppy !== wasChoppy) {
      if (wasChoppy !== null) {
        shake(0.8);
        sfx.boom();
        postPulse('impact', 2);
        postPulse('dramatic', 1.2, choppy ? '#ff3b1a' : '#5fb8ff');
      }
      wasChoppy = choppy;
      for (const o of chop) o.visible = choppy;
      for (const o of fucci) o.visible = !choppy;
      floorMats[2] = choppy ? evilMat : floorMat;
      floor.material = floorMats as unknown as THREE.Material;
      scene.background = choppy ? (nebula ?? new THREE.Color('#05030f')) : arenaBg;
      rimMat.color.set(choppy ? '#ff2a10' : '#ff8a1f');
      rimMat.emissive.set(choppy ? '#ff2000' : '#ff6a00');
      walkEdge.emissive.set(choppy ? '#ff2000' : '#ff6a00');
    }
    if (choppy) {
      fires.forEach((f, i) => {
        const k = f.userData.k as number;
        f.children.forEach((c, j) => (c.scale.set(1, 0.75 + Math.abs(Math.sin(t * (7 + j * 3) + k + i)) * 0.5, 1)));
      });
      hellLight.intensity = 26 + Math.sin(t * 9) * 6;
    }
    // THE VILLAIN: drops out of the sky over centre court, hovers through his reel, then dunks his victim
    if (s.sub === 'boss' && s.boss) {
      const v = s.players[s.boss.pick];
      if (!bossAt && v) {
        const n = def.nodes[v.node];
        bossAt = new THREE.Vector3(n.x, n.y, n.z);
        slammed = false;
        leaveT = -1;
        sfx.whistle();
        postPulse('dramatic', 1, '#ff3b4e');
      }
      const hitAt = BOSS_INTRO + SPIN_STOP + 0.9;
      ty.g.visible = true;
      ty.flame.scale.y = 0.8 + Math.sin(t * 25) * 0.25;
      ty.eyes.emissiveIntensity = 1.6 + Math.sin(t * 9) * 0.6;
      if (s.t < BOSS_INTRO) {
        // descend with a spin
        const k = Math.min(1, s.t / 1.2);
        const e = 1 - (1 - k) * (1 - k);
        ty.g.position.set(HOVER.x, HOVER.y + (1 - e) * 40, HOVER.z);
        ty.g.rotation.y = (1 - e) * Math.PI * 4;
        ty.armR.rotation.z = -0.35;
        if (k >= 1 && s.t - dt < 1.2) {
          shake(0.4);
          sfx.boom();
        }
      } else if (s.t < hitAt - 0.7) {
        // hover menacingly, spinning the ball on one finger
        ty.g.position.set(HOVER.x, HOVER.y + Math.sin(t * 2) * 0.4, HOVER.z);
        ty.g.rotation.y = Math.sin(t * 0.9) * 0.5;
        ty.ball.rotation.y += dt * 12;
      } else if (bossAt && s.t < hitAt) {
        // leap at the victim and throw it down
        const k = Math.min(1, (s.t - (hitAt - 0.7)) / 0.7);
        const x = HOVER.x + (bossAt.x - HOVER.x) * k;
        const z = HOVER.z + (bossAt.z - 2 - HOVER.z) * k;
        const y = HOVER.y + (bossAt.y + 0.2 - HOVER.y) * k + Math.sin(k * Math.PI) * 6;
        ty.g.position.set(x, y, z);
        ty.g.rotation.y = Math.atan2(bossAt.x - HOVER.x, bossAt.z - HOVER.z) * (1 - k);
        ty.armR.rotation.z = -0.35 - k * 2.4;
      } else if (bossAt) {
        if (!slammed) {
          slammed = true;
          shake(1.0);
          sfx.boom();
          postPulse('impact', 1.6);
        }
        const a = s.t - hitAt;
        const sq = Math.max(0, 1 - a * 3) * 0.3;
        ty.g.position.set(bossAt.x, bossAt.y + 0.2, bossAt.z - 2);
        ty.g.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
        ty.g.rotation.y = 0;
        ty.armR.rotation.z = -2.75 + Math.min(1, a * 2) * 0.6;
        void BOSS_SLAM;
      }
    } else if (ty.g.visible) {
      // blast off back into space
      if (leaveT < 0) {
        leaveT = 0;
        sfx.boing();
      }
      leaveT += dt;
      const k = leaveT / 1.0;
      ty.g.scale.setScalar(1);
      ty.g.position.y += dt * (10 + k * 60);
      ty.g.rotation.y += dt * 8;
      if (k >= 1) {
        ty.g.visible = false;
        bossAt = null;
      }
    }

    for (const h of hoops) {
      const lit = s.crowns.includes(h.node);
      const pulse = lit ? 0.6 + Math.sin(t * 4) * 0.4 : 0;
      h.rim.emissive.set(lit ? '#ffb000' : '#000000');
      h.rim.emissiveIntensity = lit ? 0.8 + pulse : 0;
      h.rim.color.set(lit ? '#ffd23f' : '#ff5a1a');
      h.net.emissive.set(lit ? '#ffd23f' : '#000000');
      h.net.emissiveIntensity = lit ? 0.6 : 0;
      h.board.emissive.set(lit ? '#ffb000' : '#000000');
      h.board.emissiveIntensity = lit ? 0.25 + pulse * 0.25 : 0;
      (h.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = lit ? (Math.sin(t * 6) > 0 ? 2 : 0.4) : 0;
      const gm = h.glow.material as THREE.MeshBasicMaterial;
      gm.opacity += ((lit ? 0.55 + Math.sin(t * 3) * 0.15 : 0) - gm.opacity) * Math.min(1, dt * 3);
    }
    flames.forEach((f, i) => {
      f.scale.y = 0.85 + Math.sin(t * 22 + i * 1.7) * 0.15;
      (f.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 17 + i) * 0.15;
    });
    stands.forEach((st, i) => {
      st.position.y = (st.userData.base as number) + Math.sin(t * 0.8 + i * 1.9) * 0.12;
      (st.userData.fans as THREE.Mesh[]).forEach((f, k) => (f.position.y = (f.userData.base as number) + Math.max(0, Math.sin(t * 5 + k * 1.3)) * 0.12));
    });
    jumbo.rotation.y = t * 0.25;
    jball.rotation.y = -t * 1.5;
    planets.forEach((p, i) => (p.rotation.y = t * (0.04 + i * 0.02)));
    for (const r of rocks) {
      r.rotation.x += dt * (r.userData.spin as number) * 0.5;
      r.rotation.y += dt * (r.userData.spin as number);
    }
    racer.position.set(Math.cos(t * 0.12) * 38, 9 + Math.sin(t * 0.5) * 1.5, Math.sin(t * 0.12) * 30);
    racer.rotation.y = -t * 0.12 - Math.PI / 2;
    stars.rotation.y = t * 0.004;
  };
}
