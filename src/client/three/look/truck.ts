import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './fxKit';

/**
 * A moving truck with some craft to it: glossy cargo box with a painted company stripe and name,
 * a rounded cab with tinted glass, chunky tyres with hubs, mirrors and glowing lights.
 * Length runs along +x (cab at the +x end), base at y=0.
 */
export function movingTruck(len: number, wid: number, color: string, name = 'CHOP MOVERS'): THREE.Group {
  const g = new THREE.Group();
  const h = wid * 1.05;
  const cargoL = len * 0.7, cabL = len * 0.26;
  // painted side panel
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f7f5f0';
  x.fillRect(0, 0, 512, 192);
  x.fillStyle = color;
  x.fillRect(0, 120, 512, 34);
  x.fillStyle = 'rgba(0,0,0,0.12)';
  x.fillRect(0, 154, 512, 6);
  x.fillStyle = color;
  x.font = 'bold 54px sans-serif';
  x.textAlign = 'center';
  x.fillText(name, 256, 92);
  for (let i = 1; i < 8; i++) {
    x.fillStyle = 'rgba(0,0,0,0.05)';
    x.fillRect(i * 64, 0, 2, 192);
  }
  const side = new THREE.CanvasTexture(c);
  side.colorSpace = THREE.SRGBColorSpace;
  const paint = new THREE.MeshPhysicalMaterial({ map: side, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const plain = new THREE.MeshPhysicalMaterial({ color: '#f7f5f0', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  for (const m of [paint, plain]) m.userData.noDetail = true;
  const wheelR = wid * 0.2;
  const cargo = new THREE.Mesh(new RoundedBoxGeometry(cargoL, h, wid, 3, 0.08), [plain, plain, plain, plain, paint, paint]);
  // box faces order: +x, -x, +y, -y, +z, -z : paint the long sides
  cargo.position.set(-len / 2 + cargoL / 2, wheelR * 1.3 + h / 2, 0);
  cargo.castShadow = cargo.receiveShadow = true;
  g.add(cargo);
  // roll-up door lines at the back
  const door = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.86, h * 0.88), new THREE.MeshStandardMaterial({ color: '#d8d6d0', roughness: 0.6 }));
  door.rotation.y = -Math.PI / 2;
  door.position.set(-len / 2 - 0.005, cargo.position.y, 0);
  g.add(door);
  // chassis
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2d33', roughness: 0.6, metalness: 0.4 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, wheelR * 0.6, wid * 0.8), steel);
  chassis.position.set(0, wheelR * 1.0, 0);
  g.add(chassis);
  // cab
  const cabMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  cabMat.userData.noDetail = true;
  const cabH = h * 0.78;
  const cab = new THREE.Mesh(new RoundedBoxGeometry(cabL, cabH, wid * 0.96, 4, 0.18), cabMat);
  cab.position.set(len / 2 - cabL / 2, wheelR * 1.3 + cabH / 2, 0);
  cab.castShadow = true;
  g.add(cab);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#203040', roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.5 });
  glass.userData.noDetail = true;
  const wind = new THREE.Mesh(new RoundedBoxGeometry(0.06, cabH * 0.42, wid * 0.82, 2, 0.02), glass);
  wind.position.set(len / 2 + 0.005, cab.position.y + cabH * 0.16, 0);
  g.add(wind);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new RoundedBoxGeometry(cabL * 0.55, cabH * 0.38, 0.05, 2, 0.02), glass);
    win.position.set(len / 2 - cabL * 0.45, cab.position.y + cabH * 0.16, s * wid * 0.485);
    g.add(win);
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.28, 0.14, 2, 0.03), steel);
    mirror.position.set(len / 2 - 0.05, cab.position.y + cabH * 0.12, s * (wid * 0.5 + 0.12));
    g.add(mirror);
    // headlights
    const lamp = glowSprite('#fff4d0', 0.55, 0.85);
    lamp.position.set(len / 2 + 0.06, wheelR * 1.7, s * wid * 0.34);
    g.add(lamp);
    const tail = glowSprite('#ff3020', 0.35, 0.7);
    tail.position.set(-len / 2 - 0.05, wheelR * 1.6, s * wid * 0.4);
    g.add(tail);
  }
  const bumper = new THREE.Mesh(new RoundedBoxGeometry(0.16, wheelR * 0.5, wid * 0.98, 2, 0.05), new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.9, roughness: 0.2 }));
  bumper.position.set(len / 2 + 0.03, wheelR * 1.15, 0);
  g.add(bumper);
  // tyres with hubs
  const tyre = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.85 });
  const hub = new THREE.MeshStandardMaterial({ color: '#d0d4dc', metalness: 0.9, roughness: 0.25 });
  const tg = new THREE.TorusGeometry(wheelR * 0.72, wheelR * 0.32, 12, 28);
  const hg = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, 0.1, 20).rotateX(Math.PI / 2);
  for (const wxp of [len / 2 - cabL * 0.5, -len / 2 + cargoL * 0.2, -len / 2 + cargoL * 0.38])
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(tg, tyre);
      t.position.set(wxp, wheelR, s * wid * 0.44);
      t.castShadow = true;
      g.add(t);
      const hb = new THREE.Mesh(hg, hub);
      hb.position.copy(t.position);
      g.add(hb);
    }
  return g;
}

/** A rectangular woven rug with a border and a diamond pattern. */
export function rectRugTexture(color: string, w = 3, h = 2): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = Math.round((S * h) / w);
  const x = c.getContext('2d')!;
  const H = c.height;
  x.fillStyle = color;
  x.fillRect(0, 0, S, H);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.fillRect(10, 10, S - 20, H - 20);
  x.fillStyle = color;
  x.fillRect(18, 18, S - 36, H - 36);
  x.strokeStyle = 'rgba(255,255,255,0.4)';
  x.lineWidth = 3;
  const cx = S / 2, cy = H / 2;
  for (let k = 1; k <= 3; k++) {
    x.beginPath();
    x.moveTo(cx, cy - k * H * 0.12);
    x.lineTo(cx + k * S * 0.12, cy);
    x.lineTo(cx, cy + k * H * 0.12);
    x.lineTo(cx - k * S * 0.12, cy);
    x.closePath();
    x.stroke();
  }
  // woven speckle
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    x.fillRect(Math.random() * S, Math.random() * H, 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
