import * as THREE from 'three';

/**
 * Space-station surfaces: wall panels with seams, bolts and grime, deck plates with a tread pattern,
 * and black-and-yellow hazard stripes for pillars and edges.
 */
const cache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, S: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}
function rep(t: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const c = t.clone();
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

const panel = () =>
  tex('panel', 256, (g) => {
    g.fillStyle = '#9aa4cc';
    g.fillRect(0, 0, 256, 256);
    // four panels per tile, bevelled
    for (const [x, y, w, h] of [[0, 0, 128, 160], [128, 0, 128, 160], [0, 160, 256, 96]]) {
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, '#b4bde0');
      gr.addColorStop(1, '#8e98c4');
      g.fillStyle = gr;
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.strokeStyle = 'rgba(30,34,60,0.7)';
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      g.fillStyle = 'rgba(40,44,70,0.8)';
      for (const [bx, by] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) {
        g.beginPath();
        g.arc(bx, by, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // a vent and a grime streak
    g.fillStyle = 'rgba(30,34,60,0.55)';
    for (let i = 0; i < 6; i++) g.fillRect(150, 40 + i * 12, 84, 5);
    const gr = g.createLinearGradient(0, 200, 0, 256);
    gr.addColorStop(0, 'rgba(40,40,60,0)');
    gr.addColorStop(1, 'rgba(40,40,60,0.25)');
    g.fillStyle = gr;
    g.fillRect(0, 160, 256, 96);
  });

const tread = () =>
  tex('tread', 256, (g) => {
    g.fillStyle = '#6e78a2';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32)
      for (let x = 0; x < 256; x += 32) {
        const r = ((x + y) / 32) % 2 === 0;
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.save();
        g.translate(x + 16, y + 16);
        g.rotate(r ? Math.PI / 4 : -Math.PI / 4);
        g.fillRect(-9, -2, 18, 4);
        g.restore();
      }
    g.strokeStyle = 'rgba(20,24,44,0.8)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 252, 252);
  });

const hazard = () =>
  tex('hazard', 128, (g) => {
    g.fillStyle = '#ffb020';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1e1e26';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, 128);
      g.lineTo(i * 32 + 16, 128);
      g.lineTo(i * 32 + 16 + 128, 0);
      g.lineTo(i * 32 + 128, 0);
      g.fill();
    }
  });

/** Bolted wall panels, `rx` x `ry` tiles. */
export function panelMaterial(rx: number, ry: number, color = '#ffffff'): THREE.MeshStandardMaterial {
  const map = rep(panel(), rx, ry);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, color, roughness: 0.5, metalness: 0.35 });
  m.userData.noDetail = true;
  return m;
}
/** Diamond-tread deck plating. */
export function treadMaterial(rx: number, ry: number, color = '#ffffff'): THREE.MeshStandardMaterial {
  const map = rep(tread(), rx, ry);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2, color, roughness: 0.45, metalness: 0.55 });
  m.userData.noDetail = true;
  return m;
}
/** Black-and-yellow hazard stripes. */
export function hazardMaterial(rx: number, ry: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: rep(hazard(), rx, ry), roughness: 0.5, metalness: 0.2 });
  m.userData.noDetail = true;
  return m;
}
