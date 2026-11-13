import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The Choppy Party die (Michael picked it from the title screen): a cream cube with a gold rim and
 * big red numbers. Faces follow the board's DIE_FACE layout: 3 on +x, 5 on -x, 6 on +y, 1 on -y,
 * 2 on +z, 4 on -z.
 */
const faces = new Map<string, THREE.MeshStandardMaterial>();
function face(n: number): THREE.MeshStandardMaterial {
  const key = String(n);
  const hit = faces.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // warm cream, a soft inner shade toward the rim, then the gold border
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 180);
  grad.addColorStop(0, '#fffaf0');
  grad.addColorStop(1, '#f3e6c4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 22;
  g.strokeRect(11, 11, 234, 234);
  g.fillStyle = '#ff3b4e';
  g.font = '900 172px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(key, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.22 });
  m.userData.noDetail = true;
  faces.set(key, m);
  return m;
}

/** A die `size` across. */
export function partyDie(size = 1.1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, size * 0.06), [face(3), face(5), face(6), face(1), face(2), face(4)]);
  body.castShadow = true;
  body.userData.noDetail = true;
  g.add(body);
  // the glowing gold edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size * 1.01, size * 1.01, size * 1.01)), new THREE.LineBasicMaterial({ color: '#ffe680' }));
  g.add(edges);
  return g;
}
