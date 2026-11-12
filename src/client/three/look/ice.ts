import * as THREE from 'three';

/**
 * Real-looking rink ice: glossy clear-coated surface that picks up the sky, with frosty cloudy
 * patches, a scuffed ring of skate scratches and darker clear spots, all drawn once on a canvas.
 */
let iceMap: THREE.Texture | null = null;
let iceRough: THREE.Texture | null = null;
function draw(): void {
  const S = 1024;
  const col = document.createElement('canvas');
  const rough = document.createElement('canvas');
  col.width = col.height = rough.width = rough.height = S;
  const c = col.getContext('2d')!;
  const r = rough.getContext('2d')!;
  c.fillStyle = '#d4eefc';
  c.fillRect(0, 0, S, S);
  r.fillStyle = '#2a2a2a'; // mostly glossy
  r.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // cloudy frost and clear dark patches
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, rad = 40 + rnd() * 160;
    const frost = rnd() < 0.6;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, frost ? 'rgba(255,255,255,0.35)' : 'rgba(120,180,225,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    if (frost) {
      const h = r.createRadialGradient(x, y, 0, x, y, rad);
      h.addColorStop(0, 'rgba(140,140,140,0.6)');
      h.addColorStop(1, 'rgba(140,140,140,0)');
      r.fillStyle = h;
      r.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // skate scratches: long thin curved strokes, mostly circling the middle like skaters do
  for (let i = 0; i < 520; i++) {
    const cx = S / 2 + (rnd() - 0.5) * 160, cy = S / 2 + (rnd() - 0.5) * 160;
    const rad = 60 + rnd() * S * 0.45;
    const a0 = rnd() * Math.PI * 2, len = 0.15 + rnd() * 0.6;
    const a = 0.08 + rnd() * 0.22;
    c.strokeStyle = `rgba(255,255,255,${a})`;
    c.lineWidth = 0.6 + rnd() * 1.6;
    c.beginPath();
    c.arc(cx, cy, rad, a0, a0 + len);
    c.stroke();
    r.strokeStyle = `rgba(200,200,200,${a * 1.5})`;
    r.lineWidth = c.lineWidth * 1.5;
    r.beginPath();
    r.arc(cx, cy, rad, a0, a0 + len);
    r.stroke();
  }
  // a few short sharp stop-marks
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 10 + rnd() * 40;
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 2 + rnd() * 3;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  iceMap = new THREE.CanvasTexture(col);
  iceMap.colorSpace = THREE.SRGBColorSpace;
  iceMap.anisotropy = 4;
  iceRough = new THREE.CanvasTexture(rough);
}

export function iceMaterial(env?: THREE.Texture): THREE.MeshPhysicalMaterial {
  if (!iceMap) draw();
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: iceMap,
    roughness: 0.35,
    roughnessMap: iceRough,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMap: env ?? null,
    envMapIntensity: 0.9,
    sheen: 0.4,
    sheenColor: new THREE.Color('#bfe6ff'),
  });
}
