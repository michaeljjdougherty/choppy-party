import * as THREE from 'three';
import { mesh, toy } from './kit';

/**
 * Square Brian, the party's host. A blocky figure with a cube head, tall swept-up hair, his
 * signature pout, and a black hoodie with a cream button placket and drawstrings.
 * He is never a player: he presents, explains and reacts.
 */

export type BrianFace = 'pout' | 'talk' | 'smug' | 'wow' | 'blink' | 'proud';
export type BrianPose = 'idle' | 'wave' | 'point' | 'cheer' | 'present' | 'think';

const SKIN = '#f2c9a6';
const SKIN_SHADE = '#dca784';
const HAIR = '#2a201b';
const HOODIE = '#2e2f35';
const CREAM = '#efe4cf';
const JEANS = '#34405e';

const faceCache = new Map<BrianFace, HTMLCanvasElement>();

/** The front of Brian's head, drawn on a canvas so the 3D model and the 2D HUD share it. */
export function brianFace(face: BrianFace): HTMLCanvasElement {
  const hit = faceCache.get(face);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = SKIN;
  g.fillRect(0, 0, 256, 256);
  // soft cheeks
  g.fillStyle = 'rgba(232,140,130,0.28)';
  for (const x of [62, 194]) {
    g.beginPath();
    g.ellipse(x, 168, 26, 16, 0, 0, Math.PI * 2);
    g.fill();
  }
  // brows: straight and calm; one lifts when he's smug
  g.strokeStyle = HAIR;
  g.lineCap = 'round';
  g.lineWidth = 11;
  const browY = face === 'wow' ? 70 : 86;
  g.beginPath();
  g.moveTo(52, browY + (face === 'smug' ? -10 : 0));
  g.lineTo(104, browY + (face === 'smug' ? -14 : 2));
  g.moveTo(152, browY + 2);
  g.lineTo(204, browY);
  g.stroke();
  // eyes: half-lidded and wise, wide when surprised, shut when blinking
  if (face === 'blink' || face === 'proud') {
    g.lineWidth = 7;
    for (const x of [80, 176]) {
      g.beginPath();
      if (face === 'proud') g.arc(x, 124, 15, Math.PI * 1.1, Math.PI * 1.9);
      else {
        g.moveTo(x - 17, 120);
        g.lineTo(x + 17, 120);
      }
      g.stroke();
    }
  } else {
    const open = face === 'wow' ? 1 : 0.62;
    for (const x of [80, 176]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(x, 120, 19, 13 * open + 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2b1b14';
      g.beginPath();
      g.arc(x + 2, 121, 10 * Math.max(0.75, open), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + 6, 116, 3, 0, Math.PI * 2);
      g.fill();
      // heavy upper lid: the calm, knowing look
      g.fillStyle = SKIN_SHADE;
      g.fillRect(x - 23, 100, 46, 22 - 12 * open);
      g.strokeStyle = '#3a2a22';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x - 20, 122 - 12 * open);
      g.lineTo(x + 20, 122 - 12 * open);
      g.stroke();
    }
  }
  // nose
  g.fillStyle = SKIN_SHADE;
  g.beginPath();
  g.ellipse(128, 156, 13, 8, 0, 0, Math.PI * 2);
  g.fill();
  // the pout: puckered duck lips (the 3D lips sit on top of this; the HUD uses the drawing)
  const lips = (w: number, h: number, openH: number) => {
    g.fillStyle = '#d67f7f';
    g.beginPath();
    g.ellipse(128, 200, w, h, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e99a97';
    g.beginPath();
    g.ellipse(128, 194, w * 0.8, h * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b2a2a';
    g.beginPath();
    g.ellipse(128, 202, w * 0.5, openH, 0, 0, Math.PI * 2);
    g.fill();
  };
  if (face === 'talk') lips(22, 18, 9);
  else if (face === 'wow') lips(18, 20, 12);
  else if (face === 'proud') lips(30, 13, 1.5);
  else lips(25, 15, 2);
  faceCache.set(face, c);
  return c;
}

const texCache = new Map<BrianFace, THREE.CanvasTexture>();
function faceTexture(face: BrianFace): THREE.CanvasTexture {
  let t = texCache.get(face);
  if (!t) {
    t = new THREE.CanvasTexture(brianFace(face));
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(face, t);
  }
  return t;
}

export class SquareBrian {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private strings: THREE.Mesh[] = [];
  private faceMat: THREE.MeshStandardMaterial;
  private face: BrianFace = 'pout';
  pose: BrianPose = 'idle';
  /** True while he is speaking: the mouth flaps and he bobs a little. */
  talking = false;
  /** Which face to wear when not talking or blinking. */
  mood: BrianFace = 'pout';
  private sq = 0;
  private sqv = 0;
  private blinkT = 2;
  private poseT = 0;
  private lastPose: BrianPose = 'idle';
  private hop = 0;
  private hopV = 0;

  constructor(scale = 1) {
    const skin = toy(SKIN, 0.6);
    const hoodie = toy(HOODIE, 0.85);
    const cream = toy(CREAM, 0.7);

    // legs and sneakers
    for (const x of [-0.21, 0.21]) {
      const leg = mesh(new THREE.BoxGeometry(0.34, 0.86, 0.38), toy(JEANS, 0.8));
      leg.position.set(x, 0.55, 0);
      const shoe = mesh(new THREE.BoxGeometry(0.38, 0.2, 0.52), toy('#f4f4f4', 0.5));
      shoe.position.set(x, 0.1, 0.06);
      const sole = mesh(new THREE.BoxGeometry(0.4, 0.06, 0.54), toy('#d64545', 0.5));
      sole.position.set(x, 0.03, 0.06);
      this.body.add(leg, shoe, sole);
    }
    // hoodie body, with the front pocket, hood, tee, placket, button and drawstrings
    const torso = mesh(new THREE.BoxGeometry(1.04, 1.0, 0.62), hoodie);
    torso.position.y = 1.45;
    const pocket = mesh(new THREE.BoxGeometry(0.66, 0.26, 0.04), toy('#26272c', 0.9));
    pocket.position.set(0, 1.13, 0.32);
    const hood = mesh(new THREE.BoxGeometry(0.96, 0.34, 0.3), hoodie);
    hood.position.set(0, 1.92, -0.2);
    const tee = mesh(new THREE.BoxGeometry(0.4, 0.16, 0.04), toy('#ffffff', 0.6));
    tee.position.set(0.05, 1.88, 0.31);
    const placket = mesh(new THREE.BoxGeometry(0.24, 0.42, 0.04), cream);
    placket.position.set(-0.08, 1.7, 0.33);
    const button = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), toy('#111111', 0.2));
    button.rotation.x = Math.PI / 2;
    button.position.set(-0.08, 1.8, 0.36);
    this.body.add(torso, pocket, hood, tee, placket, button);
    for (const x of [-0.3, 0.3]) {
      const s = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 6), cream, { cast: false });
      s.geometry.translate(0, -0.28, 0);
      s.position.set(x, 1.9, 0.34);
      const tip = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), toy('#bdb3a0', 0.4), { cast: false });
      tip.position.y = -0.58;
      s.add(tip);
      this.body.add(s);
      this.strings.push(s);
    }
    // arms pivot at the shoulders
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      arm.position.set(side * 0.66, 1.86, 0);
      const sleeve = mesh(new THREE.BoxGeometry(0.28, 0.82, 0.32), hoodie);
      sleeve.position.y = -0.4;
      const cuff = mesh(new THREE.BoxGeometry(0.3, 0.08, 0.34), toy('#26272c', 0.9));
      cuff.position.y = -0.8;
      const hand = mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), skin);
      hand.position.y = -0.95;
      arm.add(sleeve, cuff, hand);
      this.body.add(arm);
    }
    // neck and the famous cube head
    const neck = mesh(new THREE.BoxGeometry(0.32, 0.18, 0.32), skin);
    neck.position.y = 2.0;
    this.body.add(neck);
    this.head.position.y = 2.06;
    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTexture('pout'), roughness: 0.6 });
    const cube = mesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), [skin, skin, skin, skin, this.faceMat, skin]);
    cube.position.y = 0.53;
    for (const x of [-0.56, 0.56]) {
      const ear = mesh(new THREE.BoxGeometry(0.1, 0.22, 0.16), skin);
      ear.position.set(x, 0.55, 0);
      this.head.add(ear);
    }
    // 3D pout so it reads from the side too
    const lips = mesh(new THREE.SphereGeometry(0.11, 14, 10), toy('#d67f7f', 0.35), { cast: false });
    lips.scale.set(1.15, 0.65, 0.75);
    lips.position.set(0, 0.25, 0.54);
    lips.name = 'lips';
    // hair: short at the back and sides, sweeping up and forward into a tall quiff
    const hair = toy(HAIR, 0.5);
    const cap = mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), hair);
    cap.position.set(0, 1.1, -0.01);
    const back = mesh(new THREE.BoxGeometry(1.1, 0.46, 0.12), hair);
    back.position.set(0, 0.86, -0.5);
    const sideL = mesh(new THREE.BoxGeometry(0.1, 0.3, 0.86), hair);
    sideL.position.set(-0.55, 0.94, -0.08);
    const sideR = sideL.clone();
    sideR.position.x = 0.55;
    const quiff: THREE.Mesh[] = [];
    // tufts lean forward and climb toward the front, each a little narrower
    const tufts: [number, number, number, number, number, number][] = [
      // w, h, d, y, z, tilt
      [1.06, 0.34, 0.9, 1.24, -0.02, -0.12],
      [0.98, 0.3, 0.62, 1.42, 0.1, -0.38],
      [0.84, 0.26, 0.4, 1.58, 0.26, -0.7],
    ];
    for (const [w, h, d, y, z, tilt] of tufts) {
      const q = mesh(new THREE.BoxGeometry(w, h, d), hair);
      q.position.set(0, y, z);
      q.rotation.x = tilt;
      quiff.push(q);
    }
    // a few spiky strands on top so it reads as hair, not a hat
    const strand = toy('#3b2e26', 0.45);
    for (let i = 0; i < 5; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.12, 0.42, 4), strand, { cast: false });
      sp.position.set(-0.36 + i * 0.18, 1.62 - Math.abs(i - 2) * 0.05, 0.3 + (i % 2) * 0.06);
      sp.rotation.set(0.9, 0, (i - 2) * 0.12);
      quiff.push(sp);
    }
    this.head.add(...quiff);
    this.head.add(cube, lips, cap, back, sideL, sideR);
    this.body.add(this.head);

    this.group.add(this.body);
    this.group.scale.setScalar(scale);
  }

  /** A little bounce, e.g. when he starts a new line or something exciting happens. */
  boing(power = 5): void {
    this.sqv -= power;
  }

  /** A small celebratory hop. */
  jump(): void {
    if (this.hop <= 0.01) this.hopV = 4.2;
  }

  private setFace(f: BrianFace): void {
    if (f === this.face) return;
    this.face = f;
    this.faceMat.map = faceTexture(f);
    this.faceMat.needsUpdate = true;
  }

  update(dt: number, t: number): void {
    if (this.pose !== this.lastPose) {
      this.lastPose = this.pose;
      this.poseT = 0;
      this.boing(4);
    }
    this.poseT += dt;
    // face: blink now and then, flap the mouth while talking
    this.blinkT -= dt;
    let f: BrianFace = this.mood;
    if (this.talking) f = Math.sin(t * 16) > 0.1 ? 'talk' : this.mood === 'talk' ? 'pout' : this.mood;
    if (this.blinkT < 0.12) f = 'blink';
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.setFace(f);
    const lips = this.head.getObjectByName('lips')!;
    lips.visible = f !== 'talk' && f !== 'wow';

    // squash and stretch spring (under-damped, so he wobbles)
    for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.sqv += (-this.sq * 200 - this.sqv * 10) * h;
      this.sq += this.sqv * h;
      this.hopV -= 14 * h;
      this.hop = Math.max(0, this.hop + this.hopV * h);
      if (this.hop === 0 && this.hopV < -2) {
        this.sqv -= Math.min(6, -this.hopV * 1.2);
        this.hopV = 0;
      }
    }
    const breathe = Math.sin(t * 2.2) * 0.015 + (this.talking ? Math.abs(Math.sin(t * 8)) * 0.03 : 0);
    const sq = THREE.MathUtils.clamp(this.sq + breathe, -0.35, 0.35);
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.body.position.y = this.hop;

    // head: a slow, wise nod; tilts when thinking
    const nod = this.talking ? Math.sin(t * 5) * 0.06 : Math.sin(t * 0.9) * 0.03;
    this.head.rotation.set(nod, Math.sin(t * 0.6) * 0.12, this.pose === 'think' ? 0.18 : Math.sin(t * 0.7) * 0.03);

    // arms by pose
    const k = Math.min(1, this.poseT * 6);
    let lz = 0.12;
    let rz = -0.12;
    let lx = 0;
    let rx = 0;
    switch (this.pose) {
      case 'wave':
        rz = 2.6 + Math.sin(t * 9) * 0.35;
        break;
      case 'point':
        rx = -1.45;
        rz = -0.15;
        break;
      case 'cheer':
        lz = -2.7 + Math.sin(t * 10) * 0.2;
        rz = 2.7 - Math.sin(t * 10) * 0.2;
        if (Math.sin(t * 5) > 0.95) this.jump();
        break;
      case 'present':
        lz = 0.9;
        rz = -0.9;
        lx = -0.5;
        rx = -0.5;
        break;
      case 'think':
        rx = -1.9;
        rz = 0.55;
        break;
      default:
        lz += Math.sin(t * 2.2) * 0.04;
        rz -= Math.sin(t * 2.2) * 0.04;
        if (this.talking) rx = -0.35 + Math.sin(t * 4) * 0.25;
    }
    const ease = (a: number, b: number) => a + (b - a) * k;
    this.armL.rotation.z = ease(this.armL.rotation.z, lz);
    this.armR.rotation.z = ease(this.armR.rotation.z, rz);
    this.armL.rotation.x = ease(this.armL.rotation.x, lx);
    this.armR.rotation.x = ease(this.armR.rotation.x, rx);
    // drawstrings swing a little as he moves
    this.strings.forEach((s, i) => (s.rotation.z = Math.sin(t * 3 + i) * 0.08 + this.sqv * 0.01));
  }
}

/**
 * Brian in 2D for HUD corners: hoodie shoulders, cube head with his face, and the quiff.
 * (x, y) is the centre of the head; `size` is the head's width in px.
 */
export function drawBrianBust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
  o: { talking?: boolean; mood?: BrianFace; tilt?: number } = {},
): void {
  const s = size;
  let face: BrianFace = o.mood ?? 'pout';
  if (o.talking && Math.sin(t * 16) > 0.1) face = 'talk';
  if ((t % 3.3) < 0.12) face = 'blink';
  const bob = Math.sin(t * 2.4) * s * 0.02 + (o.talking ? Math.abs(Math.sin(t * 8)) * s * 0.03 : 0);
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.rotate(o.tilt ?? Math.sin(t * 0.8) * 0.04);
  // shoulders
  ctx.fillStyle = HOODIE;
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, s * 1.25);
  ctx.lineTo(-s * 0.8, s * 0.62);
  ctx.lineTo(s * 0.8, s * 0.62);
  ctx.lineTo(s * 0.95, s * 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.12, s * 0.6, s * 0.34, s * 0.1);
  ctx.fillStyle = CREAM;
  ctx.fillRect(-s * 0.2, s * 0.62, s * 0.2, s * 0.45);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-s * 0.1, s * 0.75, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = Math.max(2, s * 0.03);
  for (const dx of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.moveTo(s * dx, s * 0.64);
    ctx.lineTo(s * dx + Math.sin(t * 3 + dx) * s * 0.03, s * 1.1);
    ctx.stroke();
  }
  // head: side face for a little depth, then the front
  ctx.fillStyle = SKIN_SHADE;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, -s * 0.5);
  ctx.lineTo(s * 0.62, -s * 0.42);
  ctx.lineTo(s * 0.62, s * 0.58);
  ctx.lineTo(s * 0.5, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.drawImage(brianFace(face), -s / 2, -s / 2, s, s);
  ctx.strokeStyle = 'rgba(60,30,20,0.35)';
  ctx.lineWidth = Math.max(1.5, s * 0.02);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  // hair: cap plus a tall swept-up quiff
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.28);
  ctx.lineTo(-s * 0.55, -s * 0.58);
  ctx.lineTo(-s * 0.35, -s * 0.86);
  ctx.lineTo(s * 0.05, -s * 1.06);
  ctx.lineTo(s * 0.42, -s * 1.02);
  ctx.lineTo(s * 0.62, -s * 0.72);
  ctx.lineTo(s * 0.62, -s * 0.3);
  ctx.lineTo(s * 0.5, -s * 0.36);
  ctx.lineTo(s * 0.5, -s * 0.5);
  ctx.lineTo(-s * 0.45, -s * 0.5);
  ctx.lineTo(-s * 0.45, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.6);
  ctx.lineTo(s * 0.1, -s * 0.95);
  ctx.moveTo(s * 0.05, -s * 0.58);
  ctx.lineTo(s * 0.32, -s * 0.92);
  ctx.stroke();
  ctx.restore();
}
