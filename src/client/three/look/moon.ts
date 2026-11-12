import * as THREE from 'three';

/** Moon/asteroid regolith: dusty ground pocked with soft-rimmed craters of every size, tinted to `color`. */
let tex: { map: THREE.Texture; bump: THREE.Texture } | null = null;
function draw() {
  const S = 512;
  const c = document.createElement('canvas');
  const b = document.createElement('canvas');
  c.width = c.height = b.width = b.height = S;
  const g = c.getContext('2d')!;
  const h = b.getContext('2d')!;
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, S, S);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // dusty mottling
  for (let i = 0; i < 400; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 30, v = 170 + rnd() * 80;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // craters: dark floor, lit rim on one side, shaded on the other (and the same in the bump map)
  for (let i = 0; i < 110; i++) {
    const r = rnd() < 0.85 ? 3 + rnd() * 12 : 16 + rnd() * 34;
    const x = r + rnd() * (S - r * 2), y = r + rnd() * (S - r * 2);
    for (const [ctx, floor, rimL, rimD] of [
      [g, 'rgba(120,120,120,0.55)', 'rgba(255,255,255,0.55)', 'rgba(80,80,80,0.45)'],
      [h, 'rgba(40,40,40,0.8)', 'rgba(220,220,220,0.8)', 'rgba(220,220,220,0.8)'],
    ] as [CanvasRenderingContext2D, string, string, string][]) {
      const fl = ctx.createRadialGradient(x, y, 0, x, y, r);
      fl.addColorStop(0, floor);
      fl.addColorStop(0.75, floor);
      fl.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.strokeStyle = rimL;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = rimD;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 1.9, Math.PI * 2.9);
      ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  for (const t of [map, bump]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  tex = { map, bump };
}

export function moonMaterial(color: THREE.ColorRepresentation, tiles = 10): THREE.MeshStandardMaterial {
  if (!tex) draw();
  const map = tex!.map.clone();
  const bump = tex!.bump.clone();
  for (const t of [map, bump]) {
    t.repeat.set(tiles, tiles);
    t.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({ color, map, bumpMap: bump, bumpScale: 3, roughness: 0.95 });
  m.userData.noDetail = true;
  return m;
}
