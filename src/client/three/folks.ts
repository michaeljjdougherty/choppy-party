import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mesh, toy, darken, lighten } from './kit';
import { buildStrandHair, type HairParams } from './folkHair';

/**
 * The Choppy crew: playable characters based on real people, built in Square Brian's chunky
 * toy style. All the personality lives in the head (hair, face, facial hair, glasses); every
 * character shares one plain base body whose shirt takes the player's colour, with attach
 * slots so outfits, hats and accessories can be added later without touching the heads.
 */

// ------------------------------------------------------------------ expressions

export type FolkExpr = 'idle' | 'happy' | 'sad' | 'hurt' | 'wow' | 'blink' | 'talk';

type MouthKind = 'grin' | 'smile' | 'smirk' | 'oh' | 'flat' | 'frown' | 'talk' | 'yell';

interface Face {
  /** 0 = shut, 1 = normal, 1.3 = wide */
  open: number;
  /** happy upturned arcs instead of open eyes */
  squint?: boolean;
  /** pupils look left (-1) / right (+1) */
  look?: number;
  /** brow raise (px, + is up) and tilt (+ = inner end down, i.e. cross) for left and right brows */
  brows: [number, number, number, number];
  mouth: MouthKind;
  /** mouth width multiplier */
  mw?: number;
  /** lopsided mouth: + lifts the right corner */
  tilt?: number;
}

type FacialHair = 'none' | 'moustache' | 'stubble' | 'moustache-goatee' | 'boxed' | 'full';
type HairStyle = 'spiky-crop' | 'wavy-tousle' | 'wavy-swoop' | 'side-sweep' | 'swept-up' | 'curly-fringe' | 'curly-crop' | 'tall-volume' | 'fade-crop' | 'curly-mop';

export interface FolkSpec {
  id: string;
  name: string;
  /** one-line personality for the lobby and Brian's intros */
  tagline: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eyes: string;
  /** brow thickness in px on the 256px face */
  browW: number;
  facialHair: FacialHair;
  /** beard colour when it differs from the hair */
  beard?: string;
  cheeks?: number;
  freckles?: boolean;
  earring?: boolean;
  glasses?: 'aviator-shades' | 'round-wire';
  /** something held in the mouth corner */
  toothpick?: boolean;
  /** a signature hat they always wear (goes in the hat slot) */
  hat?: { kind: 'cap-backwards'; color: string };
  /** frame colour for round glasses */
  frames?: string;
  /** the signature resting face */
  idle: Face;
  /** overrides for other expressions */
  faces?: Partial<Record<FolkExpr, Partial<Face>>>;
}

const BASE_FACES: Record<Exclude<FolkExpr, 'idle'>, Face> = {
  happy: { open: 1, squint: true, brows: [6, -2, 6, -2], mouth: 'grin', mw: 1.15 },
  sad: { open: 0.75, look: 0, brows: [0, -8, 0, -8], mouth: 'frown' },
  hurt: { open: 0, brows: [-4, 8, -4, 8], mouth: 'yell', mw: 0.9 },
  wow: { open: 1.3, brows: [14, 0, 14, 0], mouth: 'oh', mw: 0.9 },
  blink: { open: 0, brows: [0, 0, 0, 0], mouth: 'smile' },
  talk: { open: 1, brows: [3, 0, 3, 0], mouth: 'talk' },
};

// ------------------------------------------------------------------ the crew

export const FOLKS: FolkSpec[] = [
  {
    id: 'rik',
    name: 'Rik',
    tagline: 'All teeth, all the time',
    skin: '#f3c9ad',
    hair: '#d9a955',
    hairStyle: 'wavy-swoop',
    eyes: '#7c8fa6',
    browW: 9,
    facialHair: 'stubble',
    beard: '#c99a5a',
    cheeks: 0.45,
    idle: { open: 1.1, brows: [8, -3, 8, -3], mouth: 'grin', mw: 1.3 },
    faces: { blink: { mouth: 'grin', mw: 1.3 }, happy: { mw: 1.4 } },
  },
  {
    id: 'pete',
    name: 'Pete',
    tagline: 'Was not ready for that',
    skin: '#e8b892',
    hair: '#2b1d16',
    hairStyle: 'side-sweep',
    eyes: '#3a2518',
    browW: 15,
    facialHair: 'stubble',
    idle: { open: 1.1, brows: [4, 0, 4, 0], mouth: 'oh', mw: 1.15 },
    faces: { blink: { mouth: 'oh', mw: 1.15 } },
  },
  {
    id: 'fucci',
    name: 'Fucci',
    tagline: 'Laughing before the joke lands',
    skin: '#e3ab88',
    hair: '#2a1c14',
    hairStyle: 'swept-up',
    eyes: '#3a2416',
    browW: 14,
    facialHair: 'moustache-goatee',
    cheeks: 0.3,
    earring: true,
    idle: { open: 0.55, brows: [2, -2, 2, -2], mouth: 'grin', mw: 1.15, tilt: 4 },
    faces: { blink: { mouth: 'grin', mw: 1.15, tilt: 4 } },
  },
  {
    id: 'zach',
    name: 'Zach',
    tagline: 'Dressed up and beaming',
    skin: '#e9b896',
    hair: '#141012',
    hairStyle: 'curly-fringe',
    eyes: '#2e1a10',
    browW: 14,
    facialHair: 'none',
    cheeks: 0.4,
    idle: { open: 0.9, brows: [3, 0, 3, 0], mouth: 'grin', mw: 1.2 },
    faces: { blink: { mouth: 'grin', mw: 1.2 } },
  },
  {
    id: 'johnny',
    name: 'Johnny John',
    tagline: 'Too cool to be impressed',
    skin: '#f2c6aa',
    hair: '#2b1f19',
    hairStyle: 'curly-crop',
    eyes: '#5a4632',
    browW: 10,
    facialHair: 'stubble',
    beard: '#8a6a4c',
    freckles: true,
    glasses: 'aviator-shades',
    idle: { open: 0.8, brows: [-2, 3, -2, 3], mouth: 'flat', mw: 0.85, tilt: -2 },
    faces: { happy: { mouth: 'smirk', squint: false, mw: 1, tilt: 6 } },
  },
  {
    id: 'kg',
    name: 'KG',
    tagline: 'Not buying it',
    skin: '#efc0a2',
    hair: '#2e2219',
    hairStyle: 'tall-volume',
    eyes: '#4f5a48',
    browW: 12,
    facialHair: 'full',
    beard: '#2a1d15',
    cheeks: 0.35,
    idle: { open: 0.75, brows: [-2, 8, 10, -4], mouth: 'smirk', mw: 0.95, tilt: -5 },
    faces: { blink: { brows: [-2, 8, 10, -4], mouth: 'smirk', tilt: -5 } },
  },
  {
    id: 'chops',
    name: 'Chops',
    tagline: 'Knows something you do not',
    skin: '#e9b796',
    hair: '#1e1714',
    hairStyle: 'fade-crop',
    eyes: '#3a2a20',
    browW: 13,
    facialHair: 'boxed',
    beard: '#241913',
    cheeks: 0.25,
    idle: { open: 0.45, brows: [2, -2, 2, -2], mouth: 'smirk', mw: 1.1, tilt: 3 },
    faces: { blink: { mouth: 'smirk', mw: 1.1, tilt: 3 } },
  },
  {
    id: 'maddog',
    name: 'Mad Dog',
    tagline: 'Up to something',
    skin: '#f0bfa2',
    hair: '#4a3426',
    hairStyle: 'curly-mop',
    eyes: '#6b7a6a',
    browW: 12,
    facialHair: 'full',
    beard: '#6b4a35',
    cheeks: 0.4,
    idle: { open: 0.8, look: -0.8, brows: [6, -2, 0, 2], mouth: 'grin', mw: 1, tilt: 6 },
    faces: { blink: { mouth: 'grin', tilt: 6 } },
  },
  {
    id: 'mm',
    name: 'MM',
    tagline: 'Quietly plotting the win',
    skin: '#f1c3a8',
    hair: '#7a4a2a',
    hairStyle: 'wavy-tousle',
    eyes: '#5f8a6a',
    browW: 11,
    facialHair: 'full',
    beard: '#a4522c',
    cheeks: 0.45,
    glasses: 'round-wire',
    idle: { open: 0.85, brows: [3, 0, 3, 0], mouth: 'smile', mw: 0.9, tilt: 2 },
    faces: { blink: { mouth: 'smile', mw: 0.9, tilt: 2 } },
  },
  {
    id: 'regs',
    name: 'Regs',
    tagline: 'The moustache does the talking',
    skin: '#e6b28e',
    hair: '#1f1814',
    hairStyle: 'swept-up',
    eyes: '#3a2618',
    browW: 14,
    facialHair: 'moustache',
    cheeks: 0.35,
    idle: { open: 0.6, brows: [4, -2, 4, -2], mouth: 'grin', mw: 1.3 },
    faces: { blink: { mouth: 'grin', mw: 1.3 } },
  },
  {
    id: 'shmama',
    name: 'Shmama',
    tagline: 'Unbothered. Always.',
    skin: '#efc3a6',
    hair: '#1d1714',
    hairStyle: 'wavy-tousle',
    eyes: '#6d7a6c',
    browW: 14,
    facialHair: 'stubble',
    beard: '#2a201b',
    toothpick: true,
    idle: { open: 0.55, brows: [-2, 2, -2, 2], mouth: 'flat', mw: 0.8 },
    faces: { blink: { mouth: 'flat', mw: 0.8 } },
  },
  {
    id: 'aids',
    name: 'Aids',
    tagline: 'Smiling like he already won',
    skin: '#f6c9b2',
    hair: '#b77a4a',
    hairStyle: 'spiky-crop',
    eyes: '#6f8aa0',
    browW: 9,
    facialHair: 'stubble',
    beard: '#b98a62',
    cheeks: 0.7,
    idle: { open: 0.7, brows: [2, 0, 2, 0], mouth: 'smirk', mw: 1.0, tilt: 3 },
    faces: { blink: { mouth: 'smirk', tilt: 3 } },
  },
  {
    id: 'fick',
    name: 'Fick',
    tagline: 'Squinting through it',
    skin: '#f0c2a4',
    hair: '#3a2a20',
    hairStyle: 'side-sweep',
    eyes: '#5a4632',
    browW: 11,
    facialHair: 'stubble',
    beard: '#3a2a20',
    cheeks: 0.35,
    glasses: 'round-wire',
    frames: '#c9ccd2',
    toothpick: true,
    hat: { kind: 'cap-backwards', color: '#c8b08a' },
    idle: { open: 0.15, brows: [4, -2, 4, -2], mouth: 'flat', mw: 0.95, tilt: -3 },
    faces: { blink: { mouth: 'flat', mw: 0.95, tilt: -3 } },
  },
];

const KG_VARIANTS: Record<string, { name: string; tagline: string }> = {
  'kg-king': { name: 'King KG', tagline: 'Still not buying it, royally' },
  'kg-evil': { name: 'Evil KG', tagline: 'Never bought it' },
  'kg-space': { name: 'Space KG', tagline: 'Not buying it in orbit' },
  'kg-chef': { name: 'Chef KG', tagline: 'Not buying it, cooking it' },
};

export function folk(id: string): FolkSpec {
  // the extra KGs (kg-king, kg-evil, ...) are all KG underneath, with their own name and tagline
  const kg = KG_VARIANTS[id];
  if (kg) return { ...folk('kg'), ...kg };
  return FOLKS.find((f) => f.id === id) ?? FOLKS[0];
}

function faceFor(spec: FolkSpec, expr: FolkExpr): Face {
  if (expr === 'idle') return spec.idle;
  const base = { ...BASE_FACES[expr] };
  // blink keeps the signature brows and mouth unless told otherwise
  if (expr === 'blink') Object.assign(base, { brows: spec.idle.brows, mouth: spec.idle.mouth, mw: spec.idle.mw, tilt: spec.idle.tilt, open: 0, squint: false });
  return { ...base, ...(spec.faces?.[expr] ?? {}) } as Face;
}

// ------------------------------------------------------------------ face texture

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const css = (c: THREE.Color) => `#${c.getHexString()}`;
const shade = (hex: string, a: number) => css(darken(hex, a));
const tint = (hex: string, a: number) => css(lighten(hex, a));

/** face texture size in pixels */
const FACE_RES = 1024;
const EYE_Y = 120;
const EYE_X = [82, 174];
const MOUTH_Y = 196;

/** Facial hair drawn onto the face. The full and boxed beards also get 3D blocks around the jaw. */
function drawFacialHair(g: CanvasRenderingContext2D, spec: FolkSpec): void {
  const col = spec.beard ?? spec.hair;
  const r = rng(hash(spec.id));
  const speckle = (x0: number, y0: number, x1: number, y1: number, n: number, alpha: number, inside?: (x: number, y: number) => boolean) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0);
      const y = y0 + r() * (y1 - y0);
      if (inside && !inside(x, y)) continue;
      g.globalAlpha = alpha * (0.5 + r() * 0.5);
      g.fillRect(x, y, 2 + r() * 2, 2 + r() * 2);
    }
    g.globalAlpha = 1;
  };
  const jaw = (x: number, y: number) => {
    // lower face: below the nose, outside a little oval round the mouth
    if (y < 168) return false;
    const dx = (x - 128) / 40;
    const dy = (y - MOUTH_Y) / 14;
    return dx * dx + dy * dy > 1;
  };
  // the lower-face region a beard covers; `top` is where it starts on the cheeks
  const jawPath = (top: number, inner: number) => {
    g.beginPath();
    g.moveTo(0, top);
    g.lineTo(14, top);
    g.quadraticCurveTo(24, inner, 70, inner + 14);
    g.lineTo(186, inner + 14);
    g.quadraticCurveTo(232, inner, 242, top);
    g.lineTo(256, top);
    g.lineTo(256, 256);
    g.lineTo(0, 256);
    g.closePath();
  };
  const softFill = (alpha: number) => {
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.fill();
    g.globalAlpha = 1;
  };
  switch (spec.facialHair) {
    case 'stubble':
      // a soft shadow along the jaw and upper lip, plus fine flecks
      jawPath(168, 176);
      softFill(0.13);
      g.beginPath();
      g.ellipse(128, 180, 44, 9, 0, 0, Math.PI * 2);
      softFill(0.1);
      speckle(16, 172, 240, 256, 500, 0.18, jaw);
      break;
    case 'moustache':
      // a light shadow of stubble on the chin; the moustache itself goes on over the mouth
      jawPath(176, 184);
      softFill(0.08);
      break;
    case 'moustache-goatee': {
      // short, even beard along the jaw that joins a chin beard and a moustache
      jawPath(150, 168);
      softFill(0.55);
      speckle(16, 150, 240, 256, 600, 0.35, (x, y) => y > 150);
      break;
    }
    case 'boxed':
    case 'full': {
      const full = spec.facialHair === 'full';
      jawPath(full ? 132 : 150, full ? 160 : 170);
      g.fillStyle = col;
      g.fill();
      // soft texture so it reads as hair
      g.fillStyle = tint(col, 0.2);
      for (let i = 0; i < 220; i++) {
        const x = r() * 256;
        const y = (full ? 140 : 158) + r() * 120;
        if (!(y > 214 || x < 62 || x > 194)) continue;
        g.globalAlpha = 0.45;
        g.fillRect(x, y, 2, 5);
      }
      g.globalAlpha = 1;
      break;
    }
  }
}

function drawMouth(g: CanvasRenderingContext2D, spec: FolkSpec, f: Face): void {
  const w = 42 * (f.mw ?? 1);
  const tilt = f.tilt ?? 0;
  const lip = '#c86c6a';
  const dark = '#4a1f22';
  const x0 = 128 - w;
  const x1 = 128 + w;
  const yL = MOUTH_Y + tilt;
  const yR = MOUTH_Y - tilt;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (f.mouth) {
    case 'grin':
    case 'yell':
    case 'talk': {
      const depth = f.mouth === 'grin' ? 34 : f.mouth === 'yell' ? 34 : 20;
      const upper = f.mouth === 'grin' ? -6 : -10;
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(x0, yL);
      g.quadraticCurveTo(128, MOUTH_Y + upper, x1, yR);
      g.quadraticCurveTo(128, MOUTH_Y + depth * 1.6, x0, yL);
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      // tongue
      g.fillStyle = '#e07b84';
      g.beginPath();
      g.ellipse(128, MOUTH_Y + depth * 0.95, w * 0.55, depth * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      // top teeth
      if (f.mouth !== 'yell') {
        g.fillStyle = '#fbf6ec';
        g.fillRect(x0, MOUTH_Y + upper - 10, w * 2, 22 - upper * 0.6 + Math.abs(tilt));
        g.strokeStyle = 'rgba(160,140,120,0.5)';
        g.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.moveTo(128 + i * w * 0.32, MOUTH_Y + upper - 6);
          g.lineTo(128 + i * w * 0.32, MOUTH_Y + 10);
          g.stroke();
        }
      }
      g.restore();
      g.strokeStyle = lip;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x0, yL);
      g.quadraticCurveTo(128, MOUTH_Y + depth * 1.6, x1, yR);
      g.stroke();
      break;
    }
    case 'smile':
    case 'smirk': {
      const line = () => {
        g.beginPath();
        if (f.mouth === 'smile') {
          g.moveTo(x0 + 6, yL - 4);
          g.quadraticCurveTo(128, MOUTH_Y + 18, x1 - 6, yR - 4);
        } else {
          // one side curls up
          g.moveTo(x0 + 8, yL + 4);
          g.quadraticCurveTo(118, MOUTH_Y + 12, x1 - 4, yR - 10);
        }
        g.stroke();
      };
      // closed lips: a soft filled shape, then the line between them
      g.fillStyle = spec.facialHair === 'full' || spec.facialHair === 'boxed' ? '#c27a72' : lip;
      g.beginPath();
      if (f.mouth === 'smile') {
        g.moveTo(x0 + 4, yL - 5);
        g.quadraticCurveTo(128, MOUTH_Y + 2, x1 - 4, yR - 5);
        g.quadraticCurveTo(128, MOUTH_Y + 30, x0 + 4, yL - 5);
      } else {
        g.moveTo(x0 + 6, yL + 3);
        g.quadraticCurveTo(118, MOUTH_Y - 4, x1 - 2, yR - 11);
        g.quadraticCurveTo(118, MOUTH_Y + 26, x0 + 6, yL + 3);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = dark;
      g.lineWidth = 5;
      line();
      // dimple at the high corner
      g.lineWidth = 4;
      g.beginPath();
      const cx = tilt >= 0 ? x1 - 2 : x0 + 2;
      g.arc(cx, (tilt >= 0 ? yR : yL) - 6, 7, tilt >= 0 ? -0.6 : Math.PI - 0.4, tilt >= 0 ? 0.6 : Math.PI + 0.6);
      g.stroke();
      break;
    }
    case 'oh': {
      g.fillStyle = lip;
      g.beginPath();
      g.ellipse(128, MOUTH_Y + 2, w * 0.62, 17, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = dark;
      g.beginPath();
      g.ellipse(128, MOUTH_Y + 3, w * 0.48, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fbf6ec';
      g.fillRect(128 - w * 0.36, MOUTH_Y - 6, w * 0.72, 5);
      break;
    }
    case 'flat': {
      // pressed lips, unimpressed
      g.fillStyle = lip;
      g.beginPath();
      g.ellipse(128, MOUTH_Y, w * 0.8, 8, (-tilt * Math.PI) / 180, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = dark;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(128 - w * 0.75, yL);
      g.lineTo(128 + w * 0.75, yR);
      g.stroke();
      break;
    }
    case 'frown': {
      g.strokeStyle = dark;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x0 + 10, MOUTH_Y + 10);
      g.quadraticCurveTo(128, MOUTH_Y - 12, x1 - 10, MOUTH_Y + 10);
      g.stroke();
      break;
    }
  }
}

const faceCache = new Map<string, HTMLCanvasElement>();

/** The front of a character's head, drawn on a canvas so the 3D model and the 2D HUD share it. */
export function folkFace(spec: FolkSpec, expr: FolkExpr): HTMLCanvasElement {
  const key = `${spec.id}:${expr}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const f = faceFor(spec, expr);
  const c = document.createElement('canvas');
  c.width = c.height = FACE_RES;
  const g = c.getContext('2d')!;
  // everything below is drawn in 256-unit space, scaled up for a sharper texture
  g.scale(FACE_RES / 256, FACE_RES / 256);
  g.fillStyle = spec.skin;
  g.fillRect(0, 0, 256, 256);
  // cheeks
  if (spec.cheeks) {
    g.fillStyle = `rgba(232,120,110,${0.3 * spec.cheeks})`;
    for (const x of [48, 208]) {
      g.beginPath();
      g.ellipse(x, 166, 30, 18, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (spec.freckles) {
    const r = rng(hash(spec.id + 'fr'));
    g.fillStyle = shade(spec.skin, 0.25);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      g.beginPath();
      g.arc(128 + side * (40 + r() * 50), 140 + r() * 26, 1.6 + r() * 1.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  drawFacialHair(g, spec);

  // eyes
  const lidCol = shade(spec.skin, 0.12);
  for (const [i, x] of EYE_X.entries()) {
    g.lineCap = 'round';
    if (f.open <= 0.05) {
      g.strokeStyle = '#2b1b14';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x - 18, EYE_Y + 2);
      g.quadraticCurveTo(x, EYE_Y + 8, x + 18, EYE_Y + 2);
      g.stroke();
      continue;
    }
    if (f.squint) {
      g.strokeStyle = '#2b1b14';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(x, EYE_Y + 10, 17, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      continue;
    }
    const h = 17 * f.open;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, EYE_Y, 23, h + 2, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(x, EYE_Y, 23, h + 2, 0, 0, Math.PI * 2);
    g.clip();
    const px = x + (f.look ?? 0) * 9 + (i === 0 ? 1 : -1);
    g.fillStyle = spec.eyes;
    g.beginPath();
    g.arc(px, EYE_Y + 1, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#120c0a';
    g.beginPath();
    g.arc(px, EYE_Y + 1, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(px + 4, EYE_Y - 4, 3, 0, Math.PI * 2);
    g.fill();
    // lids close from the top for sleepy/squinty looks
    if (f.open < 0.9) {
      g.fillStyle = lidCol;
      g.fillRect(x - 26, EYE_Y - 22, 52, 22 - 20 * f.open);
    }
    g.restore();
    g.strokeStyle = '#2b1b14';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(x, EYE_Y, 23, h + 2, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
  }

  // brows
  const [lUp, lTilt, rUp, rTilt] = f.brows;
  g.strokeStyle = spec.hair;
  g.lineWidth = spec.browW;
  g.lineCap = 'round';
  const browY = 88;
  g.beginPath();
  g.moveTo(EYE_X[0] - 24, browY - lUp - lTilt * 0.3);
  g.lineTo(EYE_X[0] + 22, browY - lUp + lTilt);
  g.moveTo(EYE_X[1] - 22, browY - rUp + rTilt);
  g.lineTo(EYE_X[1] + 24, browY - rUp - rTilt * 0.3);
  g.stroke();

  // nose: a soft shaded wedge
  g.fillStyle = shade(spec.skin, 0.14);
  g.beginPath();
  g.ellipse(128, 160, 15, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = tint(spec.skin, 0.25);
  g.beginPath();
  g.ellipse(124, 154, 6, 4, 0, 0, Math.PI * 2);
  g.fill();

  drawMouth(g, spec, f);
  // moustaches sit over the top lip
  if (spec.facialHair !== 'none' && spec.facialHair !== 'stubble') {
    const col = spec.beard ?? spec.hair;
    g.fillStyle = col;
    if (spec.facialHair === 'moustache') {
      // the signature: a thick, full moustache that hangs past the corners of the mouth
      g.beginPath();
      g.moveTo(70, 196);
      g.quadraticCurveTo(84, 166, 128, 170);
      g.quadraticCurveTo(172, 166, 186, 196);
      g.quadraticCurveTo(170, 184, 128, 186);
      g.quadraticCurveTo(86, 184, 70, 196);
      g.closePath();
      g.fill();
    }
    g.beginPath();
    g.moveTo(80, 190);
    g.quadraticCurveTo(128, 162, 176, 190);
    g.lineTo(172, 194);
    g.quadraticCurveTo(128, 176, 84, 194);
    g.closePath();
    g.fill();
  }
  faceCache.set(key, c);
  return c;
}

const texCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(spec: FolkSpec, expr: FolkExpr): THREE.CanvasTexture {
  const key = `${spec.id}:${expr}`;
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(folkFace(spec, expr));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

// ------------------------------------------------------------------ 3D head

/** Head cube size. Big heads, small bodies: that's where the personality is. */
export const HEAD = 1.24;
const H = HEAD / 2;

type Blk = [w: number, h: number, d: number, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number];

export function rbox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  const rad = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return new RoundedBoxGeometry(w, h, d, 2, Math.max(0.005, rad));
}

function blocks(list: Blk[], mat: THREE.Material, round = 0.06): THREE.Mesh[] {
  return list.map(([w, h, d, x, y, z, rx = 0, ry = 0, rz = 0]) => {
    const m = mesh(rbox(w, h, d, round), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  });
}

/** Little round curls, used by the curly styles. */
function curls(list: [x: number, y: number, z: number, r: number][], mat: THREE.Material): THREE.Mesh[] {
  return list.map(([x, y, z, r]) => {
    const m = mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set(x, y, z);
    return m;
  });
}

/** A ring of curls scattered over a region, deterministic per character. */
function curlField(seed: string, n: number, x: [number, number], y: [number, number], z: [number, number], r: [number, number]): [number, number, number, number][] {
  const rnd = rng(hash(seed));
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++)
    out.push([x[0] + rnd() * (x[1] - x[0]), y[0] + rnd() * (y[1] - y[0]), z[0] + rnd() * (z[1] - z[0]), r[0] + rnd() * (r[1] - r[0])]);
  return out;
}

/**
 * Builds the hair. Returns two groups: `top` (hidden when a hat goes on) and `sides`
 * (the short back and sides that still show under a hat).
 */
function buildHair(spec: FolkSpec): { top: THREE.Group; sides: THREE.Group } {
  const top = new THREE.Group();
  const sides = new THREE.Group();
  const hair = toy(spec.hair, 0.72);
  const hi = hair;
  const fade = toy(css(new THREE.Color(spec.hair).lerp(new THREE.Color(spec.skin), 0.45)), 0.8);
  const T = HEAD; // top of the cube
  // shared back-and-sides shell
  const shell = (len: number, mat = hair, frontGap = 0.25): void => {
    sides.add(...blocks([
      [HEAD + 0.06, len, 0.1, 0, T - len / 2 + 0.02, -H - 0.03],
      [0.08, len, HEAD - frontGap, -H - 0.03, T - len / 2 + 0.02, -frontGap / 2],
      [0.08, len, HEAD - frontGap, H + 0.03, T - len / 2 + 0.02, -frontGap / 2],
    ], mat, 0.03));
  };
  const cap = (h = 0.16, mat = hair) => top.add(...blocks([[HEAD + 0.05, h, HEAD + 0.05, 0, T + h / 2 - 0.04, 0]], mat, 0.07));

  switch (spec.hairStyle) {
    case 'spiky-crop': {
      // Aids: short textured crop, tufts pushed up at the front
      shell(0.34, hair, 0.34);
      cap(0.14);
      top.add(...blocks([[HEAD + 0.02, 0.16, HEAD - 0.1, 0, T + 0.1, -0.04]], hair, 0.07));
      const rnd = rng(hash('aids'));
      for (let i = 0; i < 16; i++) {
        const x = -0.5 + (i % 6) * 0.2 + rnd() * 0.06;
        const z = 0.42 - Math.floor(i / 6) * 0.38 + rnd() * 0.06;
        const sp = mesh(rbox(0.2, 0.2, 0.16, 0.06), hair);
        sp.position.set(x, T + 0.2, z);
        sp.rotation.set(0.5 + rnd() * 0.3, rnd() * 0.6, (rnd() - 0.5) * 0.5);
        top.add(sp);
      }
      break;
    }
    case 'wavy-tousle': {
      // MM: tousled wavy hair swept up and over to one side
      shell(0.48, hair, 0.3);
      cap(0.18);
      top.add(...blocks([[1.2, 0.26, 1.08, 0, T + 0.14, -0.04]], hair, 0.12));
      const lumps: [number, number, number, number][] = [
        [-0.36, T + 0.26, 0.3, 0.24], [-0.06, T + 0.3, 0.34, 0.25], [0.26, T + 0.28, 0.3, 0.24],
        [0.48, T + 0.2, 0.2, 0.2], [-0.5, T + 0.16, 0.0, 0.2], [-0.2, T + 0.3, -0.1, 0.24],
        [0.2, T + 0.3, -0.12, 0.24], [0.0, T + 0.22, -0.42, 0.22], [0.42, T + 0.18, -0.3, 0.2],
        // flicks over the brow
        [-0.3, T + 0.04, H + 0.02, 0.15], [0.02, T + 0.08, H + 0.04, 0.14],
      ];
      for (const [x, y, z, r] of lumps) {
        const m = mesh(new THREE.IcosahedronGeometry(r, 1), hair);
        m.scale.set(1.25, 0.72, 1.05);
        m.position.set(x, y, z);
        m.rotation.z = x * 0.6;
        top.add(m);
      }
      break;
    }
    case 'wavy-swoop': {
      // Rik: big fluffy blonde waves, parted in the middle and swooping out over the brow
      shell(0.52, hair, 0.3);
      cap(0.22);
      top.add(...blocks([
        [1.3, 0.34, 1.12, 0, T + 0.2, -0.06],
        // two big waves either side of the part, flipping up and out
        [0.66, 0.36, 0.7, -0.32, T + 0.3, 0.16, -0.15, 0.1, 0.22],
        [0.66, 0.38, 0.7, 0.32, T + 0.32, 0.16, -0.15, -0.1, -0.26],
        // fringe swoops curling down over the forehead corners
        [0.5, 0.26, 0.26, -0.4, T + 0.02, H + 0.02, 0.15, 0, 0.55],
        [0.5, 0.26, 0.26, 0.42, T + 0.04, H + 0.02, 0.15, 0, -0.6],
        // wings flicking out over the ears
        [0.26, 0.34, 0.64, -H - 0.08, T - 0.04, 0.0, 0, 0, 0.45],
        [0.26, 0.34, 0.64, H + 0.08, T - 0.02, 0.0, 0, 0, -0.5],
      ], hair, 0.14));
      top.add(...blocks([
        [0.36, 0.12, 0.42, -0.3, T + 0.48, 0.12, -0.15, 0.1, 0.22],
        [0.36, 0.12, 0.42, 0.32, T + 0.5, 0.12, -0.15, -0.1, -0.26],
      ], hi, 0.06));
      break;
    }
    case 'side-sweep': {
      // Pete: short, dark, combed back with a lift at the front and a side part
      shell(0.42, hair, 0.4);
      cap(0.14);
      top.add(...blocks([
        [1.16, 0.2, 1.0, 0, T + 0.12, -0.1, 0.06],
        [0.86, 0.24, 0.42, 0.1, T + 0.2, 0.36, -0.22, 0, -0.06],
        [0.3, 0.16, 0.36, -0.42, T + 0.08, 0.36, -0.1, 0, 0.2],
      ], hair, 0.08));
      top.add(...blocks([[0.5, 0.06, 0.5, 0.18, T + 0.33, 0.2, -0.2, 0, -0.06]], hi, 0.03));
      break;
    }
    case 'swept-up': {
      // Fucci: short sides, longer top brushed up and back
      shell(0.4, fade, 0.3);
      cap(0.14);
      top.add(...blocks([
        [1.08, 0.24, 0.96, 0, T + 0.14, -0.06, 0.08],
        [0.92, 0.3, 0.4, 0.02, T + 0.24, 0.32, -0.45],
      ], hair, 0.1));
      top.add(...blocks([[0.6, 0.08, 0.3, 0.06, T + 0.34, 0.32, -0.45]], hi, 0.03));
      break;
    }
    case 'curly-fringe': {
      // Zach: black curls piled on top, a few falling over the forehead
      shell(0.36, fade, 0.3);
      cap(0.16);
      top.add(...curls(curlField('zach', 34, [-0.56, 0.56], [T + 0.08, T + 0.3], [-0.5, 0.5], [0.13, 0.19]), hair));
      top.add(...curls([
        [-0.3, T + 0.02, H + 0.04, 0.15],
        [-0.08, T + 0.06, H + 0.06, 0.14],
        [0.16, T + 0.04, H + 0.03, 0.13],
        [-0.18, T - 0.1, H + 0.07, 0.1],
        [0.38, T + 0.08, H, 0.14],
      ], hair));
      top.add(...curls(curlField('zach-hi', 8, [-0.4, 0.4], [T + 0.32, T + 0.38], [-0.2, 0.3], [0.06, 0.08]), hi));
      break;
    }
    case 'curly-crop': {
      // Johnny John: tight curly crop with a fringe, faded sides
      shell(0.42, fade, 0.3);
      cap(0.14);
      top.add(...curls(curlField('johnny', 30, [-0.52, 0.52], [T + 0.06, T + 0.24], [-0.45, 0.48], [0.12, 0.17]), hair));
      top.add(...curls([
        [-0.36, T - 0.02, H + 0.02, 0.13],
        [-0.14, T - 0.06, H + 0.05, 0.13],
        [0.1, T - 0.04, H + 0.05, 0.13],
        [0.32, T - 0.0, H + 0.02, 0.12],
      ], hair));
      top.add(...curls(curlField('johnny-hi', 7, [-0.35, 0.35], [T + 0.26, T + 0.3], [-0.2, 0.3], [0.05, 0.07]), hi));
      break;
    }
    case 'tall-volume': {
      // KG: big swept-up volume with a side part, short at the sides
      shell(0.46, hair, 0.34);
      cap(0.16);
      top.add(...blocks([
        [1.16, 0.3, 1.06, 0, T + 0.14, -0.04, 0.05],
        [1.04, 0.32, 0.62, 0.04, T + 0.26, 0.24, -0.3, 0, -0.06],
        [0.4, 0.22, 0.44, -0.4, T + 0.1, 0.32, -0.2, 0, 0.25],
      ], hair, 0.14));
      top.add(...blocks([[0.56, 0.06, 0.4, 0.14, T + 0.42, 0.24, -0.3, 0, -0.06]], hi, 0.03));
      break;
    }
    case 'fade-crop': {
      // Chops: tight crop on top, skin fade at the sides
      shell(0.32, fade, 0.34);
      top.add(...blocks([[HEAD + 0.03, 0.1, HEAD + 0.02, 0, T + 0.02, -0.01]], hair, 0.05));
      // front line: a squared-off hairline across the forehead
      top.add(...blocks([[0.96, 0.08, 0.06, 0, T - 0.04, H + 0.01]], hair, 0.02));
      break;
    }
    case 'curly-mop': {
      // Mad Dog: a big messy mop of loose curls, one flopping over the forehead
      shell(0.56, hair, 0.22);
      cap(0.18);
      top.add(...curls(curlField('maddog', 40, [-0.62, 0.62], [T + 0.06, T + 0.36], [-0.6, 0.5], [0.15, 0.22]), hair));
      top.add(...curls([
        [-0.2, T - 0.0, H + 0.06, 0.16],
        [0.06, T - 0.08, H + 0.08, 0.15],
        [0.04, T - 0.22, H + 0.06, 0.09],
        [0.32, T + 0.02, H + 0.04, 0.15],
        [-H - 0.04, T - 0.18, 0.1, 0.14],
        [H + 0.04, T - 0.16, 0.12, 0.14],
      ], hair));
      top.add(...curls(curlField('maddog-hi', 10, [-0.45, 0.45], [T + 0.36, T + 0.42], [-0.3, 0.3], [0.07, 0.09]), hi));
      break;
    }
  }
  return { top, sides };
}

function buildBeard(spec: FolkSpec): THREE.Group {
  const g = new THREE.Group();
  if (spec.facialHair !== 'full' && spec.facialHair !== 'boxed') return g;
  const mat = toy(spec.beard ?? spec.hair, 0.8);
  const full = spec.facialHair === 'full';
  // thin plates on the sides of the jaw so the beard wraps round, plus a chin that juts a little
  const sideH = full ? 0.56 : 0.44;
  g.add(...blocks([
    [0.04, sideH, HEAD * 0.62, -H - 0.01, sideH / 2 - 0.02, H * 0.38],
    [0.04, sideH, HEAD * 0.62, H + 0.01, sideH / 2 - 0.02, H * 0.38],
  ], mat, 0.02));
  return g;
}

function buildSunglasses(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#d8b25a', metalness: 0.7, roughness: 0.3 });
  const lens = new THREE.MeshStandardMaterial({ color: '#20242c', metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.92 });
  const z = H + 0.04;
  const y = HEAD * (1 - 120 / 256);
  for (const x of [-0.26, 0.26]) {
    // hexagonal aviator lenses
    const l = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 6), lens, { cast: false });
    l.rotation.set(Math.PI / 2, Math.PI / 6, 0);
    l.scale.set(1.05, 1, 0.85);
    l.position.set(x, y, z);
    const rim = mesh(new THREE.TorusGeometry(0.205, 0.018, 6, 6), gold, { cast: false });
    rim.rotation.z = Math.PI / 6;
    rim.scale.set(1.05, 0.85, 1);
    rim.position.set(x, y, z + 0.005);
    // a glint
    const glint = mesh(new THREE.PlaneGeometry(0.05, 0.16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }), { cast: false });
    glint.position.set(x - 0.07, y + 0.02, z + 0.02);
    glint.rotation.z = -0.5;
    g.add(l, rim, glint);
  }
  const bridge = mesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), gold, { cast: false });
  bridge.position.set(0, y + 0.1, z);
  const brow = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), gold, { cast: false });
  brow.position.set(0, y + 0.03, z);
  g.add(bridge, brow);
  for (const x of [-H - 0.01, H + 0.01]) {
    const arm = mesh(new THREE.BoxGeometry(0.025, 0.025, HEAD * 0.85), gold, { cast: false });
    arm.position.set(x, y + 0.06, 0.06);
    g.add(arm);
  }
  return g;
}

/** A baseball cap worn backwards: crown, button, and the brim sticking out at the back. */
export function buildBackwardsCap(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = toy(color, 0.8);
  // a blocky crown that hugs the cube head, with soft rounded edges
  const crown = mesh(rbox(HEAD + 0.1, 0.42, HEAD + 0.1, 0.18), mat);
  crown.position.y = 0.06;
  const seam = mesh(rbox(0.05, 0.02, HEAD + 0.12, 0.01), toy(css(darken(color, 0.15)), 0.8), { cast: false });
  seam.position.y = 0.275;
  const brim = mesh(rbox(0.86, 0.06, 0.52, 0.03), toy(css(darken(color, 0.08)), 0.8));
  brim.position.set(0, -0.1, -H - 0.3);
  brim.rotation.x = -0.1;
  const button = mesh(new THREE.SphereGeometry(0.07, 12, 8), mat);
  button.position.y = 0.28;
  // it's on backwards, so the snapback opening and strap are over the forehead
  const gap = mesh(rbox(0.46, 0.16, 0.04, 0.03), toy('#3a2a20', 0.8), { cast: false });
  gap.position.set(0, -0.06, H + 0.04);
  const strap = mesh(rbox(0.52, 0.08, 0.05, 0.02), toy(css(lighten(color, 0.25)), 0.6), { cast: false });
  strap.position.set(0, -0.12, H + 0.05);
  g.add(crown, seam, brim, button, gap, strap);
  return g;
}

function buildRoundGlasses(frames = '#3a3330'): THREE.Group {
  const g = new THREE.Group();
  const wire = new THREE.MeshStandardMaterial({ color: frames, metalness: 0.6, roughness: 0.35 });
  const lens = new THREE.MeshStandardMaterial({ color: '#dff2ff', transparent: true, opacity: 0.18, roughness: 0.05 });
  const z = H + 0.05;
  const y = HEAD * (1 - 120 / 256);
  for (const x of [-0.27, 0.27]) {
    const rim = mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 28), wire, { cast: false });
    rim.position.set(x, y, z);
    const l = mesh(new THREE.CircleGeometry(0.2, 28), lens, { cast: false });
    l.position.set(x, y, z - 0.005);
    g.add(rim, l);
  }
  const bridge = mesh(new THREE.TorusGeometry(0.07, 0.013, 5, 12, Math.PI), wire, { cast: false });
  bridge.position.set(0, y + 0.02, z);
  g.add(bridge);
  for (const x of [-H - 0.01, H + 0.01]) {
    const arm = mesh(new THREE.BoxGeometry(0.02, 0.02, HEAD * 0.85), wire, { cast: false });
    arm.position.set(x, y + 0.04, 0.06);
    const hinge = mesh(new THREE.BoxGeometry(Math.abs(x) - 0.45, 0.02, 0.02), wire, { cast: false });
    hinge.position.set(Math.sign(x) * (0.47 + (Math.abs(x) - 0.47) / 2), y + 0.04, z);
    g.add(arm, hinge);
  }
  return g;
}

/** Strand-hair recipes, one per person (colours come from the spec). */
const HAIR: Record<string, Omit<HairParams, 'color'>> = {
  rik: { top: 0.44, sides: 0.5, sideLen: 0.22, flow: 'up', part: 0, lift: 0.8, fringe: 0.2, wave: 0.6, volume: 1.6, thick: 0.09 },
  pete: { top: 0.3, sides: 0.42, sideLen: 0.1, flow: 'back', part: 0.26, lift: 0.4, recede: 0.18, wave: 0.2, volume: 0.5, thick: 0.075 },
  fucci: { top: 0.3, sides: 0.38, sideLen: 0.05, flow: 'up', lift: 0.6, recede: 0.1, wave: 0.3, volume: 0.6, thick: 0.075 },
  zach: { top: 0.2, sides: 0.34, sideLen: 0.05, flow: 'forward', curl: 0.95, curlSize: 0.1, fringe: 0.24, fringeSide: -0.4, volume: 1.0 },
  johnny: { top: 0.18, sides: 0.4, sideLen: 0.04, flow: 'forward', curl: 0.95, curlSize: 0.085, fringe: 0.2, volume: 0.7 },
  kg: { top: 0.4, sides: 0.44, sideLen: 0.08, flow: 'back', part: -0.24, lift: 0.85, wave: 0.3, volume: 1.0, thick: 0.08 },
  chops: { top: 0.07, sides: 0.3, sideLen: 0.02, flow: 'forward', wave: 0.1, volume: 0.1, thick: 0.04, grid: 12 },
  maddog: { top: 0.3, sides: 0.55, sideLen: 0.12, flow: 'forward', curl: 0.95, curlSize: 0.13, fringe: 0.32, fringeSide: 0.3, volume: 1.3 },
  mm: { top: 0.36, sides: 0.45, sideLen: 0.12, flow: 'up', lift: 0.6, fringe: 0.12, fringeSide: 0.5, wave: 0.9, curl: 0.35, curlSize: 0.1, volume: 1.0 },
  regs: { top: 0.36, sides: 0.4, sideLen: 0.03, flow: 'back', lift: 1.0, wave: 0.25, volume: 0.9, thick: 0.08 },
  shmama: { top: 0.4, sides: 0.45, sideLen: 0.1, flow: 'back', lift: 0.7, fringe: 0.16, fringeSide: -0.3, wave: 0.9, curl: 0.5, curlSize: 0.11, volume: 1.2 },
  aids: { top: 0.22, sides: 0.32, sideLen: 0.04, flow: 'up', lift: 0.9, wave: 0.6, volume: 0.8, thick: 0.065, grid: 10 },
  fick: { top: 0.0, sides: 0.42, sideLen: 0.14, flow: 'back', wave: 0.5, volume: 0.5 },
};

// ------------------------------------------------------------------ the model

/** Named attachment points for outfits, hats and accessories. */
export interface FolkSlots {
  /** sits on the crown of the head; adding a hat should call `hideHairTop(true)` */
  hat: THREE.Group;
  /** in front of the face (masks, glasses) */
  face: THREE.Group;
  /** wraps the torso (jackets, vests, logos); origin at chest centre */
  torso: THREE.Group;
  /** on the back (capes, backpacks, jetpacks) */
  back: THREE.Group;
  /** held items */
  handL: THREE.Group;
  handR: THREE.Group;
  /** on the feet */
  feet: THREE.Group;
}

export const BODY = {
  legH: 0.42,
  torsoH: 0.66,
  torsoW: 0.84,
  torsoD: 0.52,
};

/**
 * A playable Choppy character. Pass the character spec and the player's colour (their shirt).
 * Call `update(dt, t, motion)` each frame; set `expr` for reactions and `talking` to flap the mouth.
 */
export class FolkModel {
  readonly group = new THREE.Group();
  readonly spec: FolkSpec;
  readonly slots: FolkSlots;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private hairTop: THREE.Group;
  private hairSides: THREE.Object3D;
  private hairClip: { plane: THREE.Plane; y: number } | null = null;
  private clipPlane = new THREE.Plane();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private faceMat: THREE.MeshStandardMaterial;
  private shirtMat: THREE.MeshStandardMaterial;
  private shirtDark: THREE.MeshStandardMaterial;
  private face: FolkExpr = 'idle';
  /** the face to wear when not blinking or talking */
  expr: FolkExpr = 'idle';
  talking = false;
  private sq = 0;
  private sqv = 0;
  private blinkT = 1 + Math.random() * 3;
  private walk = 0;
  private hop = 0;
  private hopV = 0;
  private exprT = 0;
  private pendingHat: THREE.Group | null = null;
  private headCube!: THREE.Object3D;
  /** Body parts that outfits restyle or hide (see cosmetics.ts). */
  readonly parts = {
    torso: null as unknown as THREE.Mesh,
    hem: null as unknown as THREE.Mesh,
    collar: null as unknown as THREE.Mesh,
    sleeves: [] as THREE.Mesh[],
    forearms: [] as THREE.Mesh[],
    arms: [] as THREE.Group[],
    shirtMat: null as unknown as THREE.MeshStandardMaterial,
    shirtDark: null as unknown as THREE.MeshStandardMaterial,
    /** the character's own hat and glasses, hidden when a cosmetic takes their place */
    ownHat: null as THREE.Group | null,
    ownGlasses: null as THREE.Group | null,
    color: '#ffffff',
  };

  constructor(spec: FolkSpec, color: string, scale = 1) {
    this.spec = spec;
    const skin = toy(spec.skin, 0.6);
    this.shirtMat = toy(color, 0.55);
    this.shirtDark = toy(css(darken(color, 0.25)), 0.6);
    const pants = toy('#3a4462', 0.8);

    // legs pivot at the hips
    for (const [leg, x] of [[this.legL, -0.2], [this.legR, 0.2]] as [THREE.Group, number][]) {
      leg.position.set(x, BODY.legH, 0);
      const l = mesh(rbox(0.3, BODY.legH - 0.06, 0.34, 0.05), pants);
      l.position.y = -BODY.legH / 2 + 0.04;
      const shoe = mesh(rbox(0.34, 0.16, 0.46, 0.06), toy('#f4f4f4', 0.45));
      shoe.position.set(0, -BODY.legH + 0.08, 0.05);
      const sole = mesh(rbox(0.36, 0.06, 0.48, 0.02), toy('#2d2f38', 0.6));
      sole.position.set(0, -BODY.legH + 0.03, 0.05);
      leg.add(l, shoe, sole);
      this.body.add(leg);
    }
    // plain tee: torso, collar and hem in the player's colour
    const torsoY = BODY.legH + BODY.torsoH / 2;
    const torso = mesh(rbox(BODY.torsoW, BODY.torsoH, BODY.torsoD, 0.1), this.shirtMat);
    torso.position.y = torsoY;
    const hem = mesh(rbox(BODY.torsoW + 0.04, 0.1, BODY.torsoD + 0.04, 0.04), this.shirtDark);
    hem.position.y = BODY.legH + 0.04;
    const collar = mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), this.shirtDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = BODY.legH + BODY.torsoH - 0.02;
    this.body.add(torso, hem, collar);
    Object.assign(this.parts, { torso, hem, collar, shirtMat: this.shirtMat, shirtDark: this.shirtDark, color });
    // arms pivot at the shoulders
    const shoulderY = BODY.legH + BODY.torsoH - 0.1;
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      arm.position.set(side * (BODY.torsoW / 2 + 0.12), shoulderY, 0);
      const sleeve = mesh(rbox(0.26, 0.3, 0.3, 0.06), this.shirtMat);
      sleeve.position.y = -0.12;
      const forearm = mesh(rbox(0.2, 0.3, 0.22, 0.05), skin);
      forearm.position.y = -0.38;
      const hand = mesh(rbox(0.24, 0.22, 0.24, 0.08), skin);
      hand.position.y = -0.56;
      arm.add(sleeve, forearm, hand);
      this.parts.sleeves.push(sleeve);
      this.parts.forearms.push(forearm);
      this.parts.arms.push(arm);
      this.body.add(arm);
    }
    // neck and head
    const neck = mesh(rbox(0.3, 0.14, 0.3, 0.04), skin);
    neck.position.y = BODY.legH + BODY.torsoH + 0.04;
    this.body.add(neck);
    this.head.position.y = BODY.legH + BODY.torsoH + 0.08;
    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(spec, 'idle'), roughness: 0.6 });
    const sideSkin = toy(spec.skin, 0.6);
    const cube = mesh(rbox(HEAD, HEAD, HEAD, 0.08), sideSkin);
    cube.position.y = H;
    // the face is a plane just proud of the rounded cube so its corners stay soft
    const facePlane = mesh(new THREE.PlaneGeometry(HEAD - 0.06, HEAD - 0.06), this.faceMat, { cast: false });
    facePlane.position.set(0, H, H + 0.002);
    for (const x of [-H, H]) {
      const ear = mesh(rbox(0.1, 0.24, 0.18, 0.04), skin);
      ear.position.set(x + Math.sign(x) * 0.03, H - 0.02, 0.02);
      this.head.add(ear);
    }
    if (spec.earring) {
      const stud = mesh(new THREE.OctahedronGeometry(0.045), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.9, roughness: 0.05, emissive: '#cfe8ff', emissiveIntensity: 0.4 }), { cast: false });
      stud.position.set(H + 0.09, H - 0.1, 0.04);
      this.head.add(stud);
    }
    // a little 3D nose so the face has a profile
    const nose = mesh(rbox(0.14, 0.14, 0.1, 0.04), skin, { cast: false });
    nose.position.set(0, HEAD * (1 - 158 / 256), H + 0.04);
    this.head.add(cube, facePlane, nose);
    this.headCube = cube;
    const recipe = HAIR[spec.id];
    const hair = recipe
      ? (() => {
          const h = buildStrandHair(spec.id, { color: spec.hair, ...recipe }, HEAD);
          const top = new THREE.Group();
          top.add(h.top);
          return { top, sides: h.sides as THREE.Object3D };
        })()
      : buildHair(spec);
    this.hairTop = hair.top;
    this.hairSides = hair.sides;
    this.head.add(hair.top, hair.sides, buildBeard(spec));
    if (spec.toothpick) {
      const pick = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 6), toy('#e2c48e', 0.6), { cast: false });
      pick.rotation.set(Math.PI / 2 - 0.35, 0, 0.9);
      pick.position.set(0.16, HEAD * (1 - 198 / 256) - 0.04, H + 0.1);
      this.head.add(pick);
    }
    if (spec.hat?.kind === 'cap-backwards') {
      this.pendingHat = buildBackwardsCap(spec.hat.color);
    }
    const glasses = spec.glasses === 'aviator-shades' ? buildSunglasses() : spec.glasses === 'round-wire' ? buildRoundGlasses(spec.frames) : null;
    if (glasses) {
      this.head.add(glasses);
      this.parts.ownGlasses = glasses;
    }
    this.body.add(this.head);

    // attach slots
    const slot = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const s = new THREE.Group();
      s.position.set(x, y, z);
      parent.add(s);
      return s;
    };
    this.slots = {
      hat: slot(this.head, 0, HEAD, 0),
      face: slot(this.head, 0, H, H),
      torso: slot(this.body, 0, torsoY, 0),
      back: slot(this.body, 0, torsoY, -BODY.torsoD / 2),
      handL: slot(this.armL, 0, -0.6, 0),
      handR: slot(this.armR, 0, -0.6, 0),
      feet: slot(this.body, 0, 0, 0),
    };

    if (this.pendingHat) {
      this.slots.hat.add(this.pendingHat);
      this.parts.ownHat = this.pendingHat;
      this.hideHairTop(true);
    }

    this.group.add(this.body);
    this.group.scale.setScalar(scale);
  }

  /** Change the shirt colour (e.g. when a player picks a different colour in the lobby). */
  setColor(color: string): void {
    this.shirtMat.color.set(color);
    this.shirtDark.color.set(darken(color, 0.25));
    this.parts.color = color;
    this.onColor?.(color);
  }

  /** Set by cosmetics so an outfit can re-tint itself when the player's colour changes. */
  onColor: ((color: string) => void) | null = null;

  /** Hide the top of the hair so a hat can sit on the head. */
  hideHairTop(hide: boolean): void {
    this.hairTop.visible = !hide;
  }

  /**
   * Slide something held in the right hand out sideways until it no longer passes into the torso or head
   * (measured with the arm at rest, so the swing animation only ever moves it further out).
   */
  holdClear(o: THREE.Object3D, gap = 0.04): void {
    const rx = this.armR.rotation.x, rz = this.armR.rotation.z;
    this.armR.rotation.set(0, 0, 0);
    this.body.updateWorldMatrix(true, true);
    const inv = this.body.matrixWorld.clone().invert();
    const inBody = (root: THREE.Object3D, deep: boolean) => {
      const box = new THREE.Box3();
      const m = new THREE.Matrix4();
      root.traverse((c) => {
        const g = (c as THREE.Mesh).geometry;
        if (!(c as THREE.Mesh).isMesh || !g || (!deep && c !== root)) return;
        if (!g.boundingBox) g.computeBoundingBox();
        box.union(g.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(inv, c.matrixWorld)));
      });
      return box;
    };
    const item = inBody(o, true);
    let push = 0;
    for (const b of [inBody(this.parts.torso, false), inBody(this.headCube, false)]) {
      const yz = item.max.y > b.min.y && item.min.y < b.max.y && item.max.z > b.min.z && item.min.z < b.max.z;
      if (yz && item.min.x < b.max.x + gap) push = Math.max(push, b.max.x + gap - item.min.x);
    }
    if (push > 0) {
      // body +x expressed in the hand slot's parent space
      const parent = o.parent!;
      const dir = new THREE.Vector3(1, 0, 0).transformDirection(this.body.matrixWorld);
      dir.transformDirection(parent.matrixWorld.clone().invert());
      o.position.addScaledVector(dir, Math.min(push, 0.5) / parent.getWorldScale(new THREE.Vector3()).x * this.body.getWorldScale(new THREE.Vector3()).x);
    }
    this.armR.rotation.x = rx;
    this.armR.rotation.z = rz;
  }

  /** The hair's bounds in head space (the hat slot sits at y = HEAD). `withTop` adds the hair on top. */
  hairBox(withTop = true): THREE.Box3 {
    const box = new THREE.Box3();
    this.head.updateWorldMatrix(true, true);
    const inv = this.head.matrixWorld.clone().invert();
    const m = new THREE.Matrix4();
    const parts = withTop ? [this.hairSides, this.hairTop] : [this.hairSides];
    for (const root of parts)
      root.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (!(o as THREE.Mesh).isMesh || !g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        box.union(g.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
      });
    return box;
  }

  /**
   * Trim the hair flat at height `y` (head space) so nothing pokes up through a hat; null puts it back.
   * Uses a clipping plane that follows the head, so it works while bouncing, turning and squashing.
   */
  clipHair(y: number | null): void {
    const meshes: THREE.Mesh[] = [];
    for (const root of [this.hairSides, this.hairTop]) root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    if (y === null) {
      this.hairClip = null;
      for (const m of meshes) {
        const mat = m.material as THREE.Material;
        if (mat.clippingPlanes?.length) {
          mat.clippingPlanes = null;
          mat.needsUpdate = true;
        }
      }
      return;
    }
    this.hairClip ??= { plane: this.clipPlane, y };
    const placePlane = () => {
      const c = this.hairClip;
      if (!c) return;
      // the plane faces down: everything above the cut is clipped away
      const up = new THREE.Vector3(0, 1, 0).transformDirection(this.head.matrixWorld);
      const at = new THREE.Vector3(0, c.y, 0).applyMatrix4(this.head.matrixWorld);
      c.plane.setFromNormalAndCoplanarPoint(up.negate(), at);
    };
    for (const m of meshes) {
      if (m.userData.clipHooked) continue;
      m.userData.clipHooked = true;
      // our own copy of the material, so other models with the same hair aren't trimmed too
      m.material = (m.material as THREE.Material).clone();
      const prev = m.onBeforeRender;
      m.onBeforeRender = (...args) => {
        prev.apply(m, args);
        placePlane();
      };
    }
    this.hairClip.y = y;
    this.head.updateWorldMatrix(true, false);
    placePlane();
    for (const m of meshes) {
      const mat = m.material as THREE.Material;
      mat.clippingPlanes = [this.hairClip.plane];
      mat.needsUpdate = true;
    }
  }

  /** Show an expression for a while (e.g. 'hurt' when hit, 'happy' on a win), then go back to idle. */
  react(expr: FolkExpr, seconds = 1.2): void {
    this.expr = expr;
    this.exprT = seconds;
    this.boing(expr === 'hurt' ? 7 : 4);
  }

  boing(power = 5): void {
    this.sqv -= power;
  }

  jump(): void {
    if (this.hop <= 0.01) this.hopV = 4.6;
  }

  private setFace(f: FolkExpr): void {
    if (f === this.face) return;
    this.face = f;
    this.faceMat.map = faceTexture(this.spec, f);
    this.faceMat.needsUpdate = true;
  }

  /** `speed` is ground speed in world units/s (0 when standing). */
  update(dt: number, t: number, motion: { speed?: number; cheer?: boolean } = {}): void {
    if (this.exprT > 0) {
      this.exprT -= dt;
      if (this.exprT <= 0) this.expr = 'idle';
    }
    this.blinkT -= dt;
    let f: FolkExpr = this.expr;
    if (this.talking && Math.sin(t * 16) > 0.1) f = 'talk';
    if (this.blinkT < 0.12 && (f === 'idle' || f === 'talk')) f = 'blink';
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.setFace(f);

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
    const speed = motion.speed ?? 0;
    const moving = speed > 0.2;
    this.walk += dt * (moving ? 6 + speed * 1.5 : 0);
    const swing = moving ? Math.sin(this.walk) * 0.7 : 0;
    const breathe = Math.sin(t * 2.4) * 0.015;
    const sq = THREE.MathUtils.clamp(this.sq + breathe, -0.35, 0.35);
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.body.position.y = this.hop + (moving ? Math.abs(Math.sin(this.walk)) * 0.1 : 0);

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    const cheer = motion.cheer || this.expr === 'happy';
    const k = 1 - Math.exp(-dt * 12);
    const lz = cheer ? -2.6 + Math.sin(t * 10) * 0.2 : 0.1 + Math.sin(t * 2.4) * 0.03;
    const rz = cheer ? 2.6 - Math.sin(t * 10) * 0.2 : -0.1 - Math.sin(t * 2.4) * 0.03;
    this.armL.rotation.z += (lz - this.armL.rotation.z) * k;
    this.armR.rotation.z += (rz - this.armR.rotation.z) * k;
    this.armL.rotation.x += ((cheer ? 0 : -swing) - this.armL.rotation.x) * k;
    this.armR.rotation.x += ((cheer ? 0 : swing) - this.armR.rotation.x) * k;
    // the head bobs on a slight delay, and wobbles when hurt
    const hurt = this.expr === 'hurt' ? Math.sin(t * 30) * 0.12 : 0;
    this.head.rotation.set(Math.sin(t * 1.3) * 0.03 + (moving ? 0.06 : 0), Math.sin(t * 0.7) * 0.08, Math.sin(t * 0.9) * 0.03 + hurt);
  }
}

/**
 * A character's head in 2D for HUD portraits: hair silhouette, cube head with their face.
 * (x, y) is the centre of the head; `size` is the head's width in px.
 */
export function drawFolkBust(ctx: CanvasRenderingContext2D, spec: FolkSpec, color: string, x: number, y: number, size: number, expr: FolkExpr = 'idle'): void {
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, s * 1.15);
  ctx.lineTo(-s * 0.7, s * 0.6);
  ctx.lineTo(s * 0.7, s * 0.6);
  ctx.lineTo(s * 0.85, s * 1.15);
  ctx.closePath();
  ctx.fill();
  ctx.drawImage(folkFace(spec, expr), -s / 2, -s / 2, s, s);
  ctx.fillStyle = spec.hair;
  const curly = spec.hairStyle.startsWith('curly');
  if (curly) {
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(-s * 0.45 + (i * s * 0.9) / 6, -s * 0.52 - (i % 2) * s * 0.06, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tall = spec.hairStyle === 'tall-volume' || spec.hairStyle === 'wavy-swoop' ? 0.28 : spec.hairStyle === 'fade-crop' ? 0.06 : 0.16;
  ctx.fillRect(-s * 0.54, -s * (0.5 + tall), s * 1.08, s * (tall + 0.06));
  ctx.restore();
}
