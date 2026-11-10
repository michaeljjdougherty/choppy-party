import * as THREE from 'three';
import type { SpaceType } from '../../shared/board/types';

/**
 * Every kind of space gets its own silhouette as well as its colour, so a board reads at a glance:
 * coins are round, lucky spaces are stars, battles are shields, hearts are hearts, and so on.
 * Shapes are drawn in a unit box (about -1..1) with +y pointing away from the camera.
 */
type ShapeName = 'circle' | 'heart' | 'spiky' | 'square' | 'star' | 'diamond' | 'pennant' | 'shield' | 'flower' | 'octagon' | 'hexagon' | 'burst' | 'drop' | 'house';

export const SPACE_SHAPE: Record<SpaceType, ShapeName> = {
  key: 'circle',
  heart: 'heart',
  thorn: 'spiky',
  crate: 'square',
  lucky: 'star',
  event: 'diamond',
  post: 'pennant',
  duel: 'shield',
  stew: 'shield',
  fountain: 'heart',
  spring: 'flower',
  cannon: 'octagon',
  vent: 'hexagon',
  dynamite: 'burst',
  snare: 'flower',
  wisp: 'drop',
  station: 'square',
  counter: 'hexagon',
  camp: 'house',
};

function poly(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function ring(n: number, r: (i: number) => number, rot = Math.PI / 2): THREE.Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r(i), Math.sin(a) * r(i)]);
  }
  return poly(pts);
}

function roundedSquare(h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

function shapeOf(name: ShapeName): THREE.Shape {
  switch (name) {
    case 'circle': {
      const s = new THREE.Shape();
      s.absarc(0, 0, 1, 0, Math.PI * 2, false);
      return s;
    }
    case 'heart': {
      const s = new THREE.Shape();
      s.moveTo(0, -1.05);
      s.bezierCurveTo(-0.55, -0.55, -1.15, -0.15, -1.05, 0.35);
      s.bezierCurveTo(-0.95, 0.95, -0.25, 1.05, 0, 0.55);
      s.bezierCurveTo(0.25, 1.05, 0.95, 0.95, 1.05, 0.35);
      s.bezierCurveTo(1.15, -0.15, 0.55, -0.55, 0, -1.05);
      return s;
    }
    case 'spiky':
      return ring(24, (i) => (i % 2 ? 0.82 : 1.05));
    case 'square':
      return roundedSquare(0.86, 0.26);
    case 'star':
      return ring(10, (i) => (i % 2 ? 0.55 : 1.15));
    case 'diamond':
      return ring(4, () => 1.12);
    case 'pennant':
      return ring(5, () => 1.02);
    case 'shield': {
      const s = new THREE.Shape();
      s.moveTo(-0.95, 0.9);
      s.quadraticCurveTo(0, 1.12, 0.95, 0.9);
      s.lineTo(0.95, 0.05);
      s.quadraticCurveTo(0.85, -0.7, 0, -1.12);
      s.quadraticCurveTo(-0.85, -0.7, -0.95, 0.05);
      s.lineTo(-0.95, 0.9);
      return s;
    }
    case 'flower':
      return ring(48, (i) => 0.9 + 0.12 * Math.cos((i / 48) * Math.PI * 2 * 6));
    case 'octagon':
      return ring(8, () => 1.02, Math.PI / 8);
    case 'hexagon':
      return ring(6, () => 1.04, 0);
    case 'burst':
      return ring(16, (i) => (i % 2 ? 0.72 : 1.12));
    case 'drop': {
      const s = new THREE.Shape();
      s.moveTo(0, 1.15);
      s.bezierCurveTo(0.35, 0.6, 0.95, 0.15, 0.95, -0.25);
      s.bezierCurveTo(0.95, -0.8, 0.5, -1.0, 0, -1.0);
      s.bezierCurveTo(-0.5, -1.0, -0.95, -0.8, -0.95, -0.25);
      s.bezierCurveTo(-0.95, 0.15, -0.35, 0.6, 0, 1.15);
      return s;
    }
    case 'house':
      return poly([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.3], [0, 1.1], [-0.9, 0.3]]);
  }
}

function scaled(src: THREE.Shape, k: number): THREE.Shape {
  const pts = src.getPoints(24).map((p) => p.clone().multiplyScalar(k));
  return new THREE.Shape(pts);
}

/** Map a flat shape's UVs onto -1..1 so a square icon texture centres on it. */
function boxUv(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / SIZE + 1) / 2, (p.getY(i) / SIZE + 1) / 2);
  uv.needsUpdate = true;
}

/** World radius of a space (the old round tiles were 1.0; the gap between spaces is bigger now). */
export const SIZE = 0.8;
export const TILE_H = 0.3;

export interface SpaceGeo {
  /** The thick tile, extruded upward from y = 0 to TILE_H. */
  body: THREE.BufferGeometry;
  /** White lip on top. */
  rim: THREE.BufferGeometry;
  /** Coloured face with the icon, a little inside the rim. */
  face: THREE.BufferGeometry;
}

const cache = new Map<ShapeName, SpaceGeo>();

export function spaceGeo(type: SpaceType): SpaceGeo {
  const name = SPACE_SHAPE[type];
  const hit = cache.get(name);
  if (hit) return hit;
  const base = scaled(shapeOf(name), SIZE);
  const body = new THREE.ExtrudeGeometry(base, { depth: TILE_H, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2, curveSegments: 20 });
  // extrusion runs along +z: stand it up so it rises along +y, with the shape's +y pointing away (−z)
  body.rotateX(-Math.PI / 2);
  const rim = new THREE.ShapeGeometry(scaled(shapeOf(name), SIZE * 1.02), 20);
  rim.rotateX(-Math.PI / 2);
  const faceShape = scaled(shapeOf(name), SIZE * 0.82);
  const face = new THREE.ShapeGeometry(faceShape, 20);
  boxUv(face);
  face.rotateX(-Math.PI / 2);
  const g = { body, rim, face };
  cache.set(name, g);
  return g;
}
