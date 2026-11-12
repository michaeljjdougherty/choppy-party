import * as THREE from 'three';

/** Polished white marble with soft grey veins (counter tops, pedestals). */
let marbleTex: THREE.Texture | null = null;
export function marbleMaterial(color: THREE.ColorRepresentation = '#ffffff'): THREE.MeshPhysicalMaterial {
  if (!marbleTex) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f2ee';
    g.fillRect(0, 0, S, S);
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let v = 0; v < 14; v++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
      g.strokeStyle = `rgba(110,110,120,${0.08 + rnd() * 0.2})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 60; k++) {
        a += (rnd() - 0.5) * 0.6;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    marbleTex = new THREE.CanvasTexture(c);
    marbleTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshPhysicalMaterial({ color, map: marbleTex, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  m.userData.noDetail = true;
  return m;
}

/** A round woven rug in `color`: rings of tone, a light border and a soft fringe. */
export function rugTexture(color: string): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(color);
  for (let i = 12; i >= 0; i--) {
    const k = i / 12;
    const col = base.clone().offsetHSL(0, 0, (i % 2 ? 0.06 : -0.04) + (i === 11 ? 0.25 : 0));
    g.fillStyle = `#${col.getHexString()}`;
    g.beginPath();
    g.arc(S / 2, S / 2, (S / 2) * (0.1 + k * 0.88), 0, Math.PI * 2);
    g.fill();
  }
  // weave speckle
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
