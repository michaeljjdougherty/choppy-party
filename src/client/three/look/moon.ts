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

/** A banded gas giant with a soft atmosphere halo (and optional ring), for space backdrops. */
export function gasGiant(radius: number, colors: [string, string, string] = ['#ff9a5c', '#ffcf9a', '#c8603a'], ringed = false): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  let y = 0;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (y < 256) {
    const h = 6 + rnd() * 26;
    x.fillStyle = colors[Math.floor(rnd() * 3)];
    x.globalAlpha = 0.6 + rnd() * 0.4;
    x.fillRect(0, y, 512, h);
    y += h;
  }
  x.globalAlpha = 1;
  // swirls and a storm spot
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.08})`;
    x.beginPath();
    x.ellipse(rnd() * 512, rnd() * 256, 20 + rnd() * 60, 2 + rnd() * 5, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = 'rgba(160,60,30,0.6)';
  x.beginPath();
  x.ellipse(330, 160, 26, 12, 0, 0, Math.PI * 2);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  body.material.userData.noDetail = true;
  body.rotation.z = 0.35;
  g.add(body);
  // atmosphere: a soft rim glow behind it
  const ac = document.createElement('canvas');
  ac.width = ac.height = 128;
  const ag = ac.getContext('2d')!;
  const gr = ag.createRadialGradient(64, 64, 44, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,180,0.6)');
  gr.addColorStop(1, 'rgba(255,180,120,0)');
  ag.fillStyle = gr;
  ag.fillRect(0, 0, 128, 128);
  const atmo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ac), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  atmo.scale.setScalar(radius * 2.9);
  g.add(atmo);
  if (ringed) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.1, 96), new THREE.MeshStandardMaterial({ color: colors[1], transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
    ring.rotation.x = -Math.PI / 2 + 0.35;
    ring.rotation.y = 0.2;
    g.add(ring);
  }
  return g;
}

/** Sci-fi deck plating: hex panels with faint glowing seams (use the same texture as an emissive map). */
let hexTex: THREE.Texture | null = null;
export function hexPlating(tiles: number): THREE.Texture {
  if (!hexTex) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    const r = S / 6;
    const w = Math.sqrt(3) * r;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    for (let row = -1; row < 6; row++)
      for (let col = -1; col < 4; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.stroke();
      }
    hexTex = new THREE.CanvasTexture(c);
    hexTex.wrapS = hexTex.wrapT = THREE.RepeatWrapping;
  }
  const t = hexTex.clone();
  t.repeat.set(tiles, tiles);
  t.needsUpdate = true;
  return t;
}

/** A home planet for the sky: oceans, green-brown continents, drifting cloud bands and a blue atmosphere. */
export function earthGlobe(radius: number): THREE.Group {
  const g = new THREE.Group();
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const sea = x.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#1d4f9a');
  sea.addColorStop(0.5, '#2a72c8');
  sea.addColorStop(1, '#1d4f9a');
  x.fillStyle = sea;
  x.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // continents: clusters of overlapping blobs
  for (let k = 0; k < 6; k++) {
    const cx = rnd() * W, cy = H * (0.25 + rnd() * 0.5);
    for (let i = 0; i < 40; i++) {
      const px = cx + (rnd() - 0.5) * 120, py = cy + (rnd() - 0.5) * 70;
      x.fillStyle = rnd() < 0.7 ? '#4f9a3e' : '#9a8a52';
      x.beginPath();
      x.ellipse(px, py, 6 + rnd() * 18, 4 + rnd() * 12, rnd() * 3, 0, Math.PI * 2);
      x.fill();
    }
  }
  // ice caps
  x.fillStyle = '#f2f6ff';
  x.fillRect(0, 0, W, 14);
  x.fillRect(0, H - 14, W, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, emissive: '#0a1a40', emissiveIntensity: 0.4 }));
  body.material.userData.noDetail = true;
  g.add(body);
  // clouds on their own slowly turning shell
  const cc = document.createElement('canvas');
  cc.width = W;
  cc.height = H;
  const cx2 = cc.getContext('2d')!;
  for (let i = 0; i < 160; i++) {
    cx2.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`;
    cx2.beginPath();
    cx2.ellipse(rnd() * W, rnd() * H, 10 + rnd() * 40, 2 + rnd() * 6, 0, 0, Math.PI * 2);
    cx2.fill();
  }
  const ct = new THREE.CanvasTexture(cc);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.015, 48, 32), new THREE.MeshStandardMaterial({ map: ct, transparent: true, depthWrite: false, roughness: 1 }));
  clouds.material.userData.noDetail = true;
  clouds.onBeforeRender = () => (clouds.rotation.y = performance.now() * 0.00002);
  g.add(clouds);
  const ac = document.createElement('canvas');
  ac.width = ac.height = 128;
  const ag = ac.getContext('2d')!;
  const gr = ag.createRadialGradient(64, 64, 42, 64, 64, 64);
  gr.addColorStop(0, 'rgba(140,200,255,0.7)');
  gr.addColorStop(1, 'rgba(80,150,255,0)');
  ag.fillStyle = gr;
  ag.fillRect(0, 0, 128, 128);
  const atmo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ac), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  atmo.scale.setScalar(radius * 2.9);
  g.add(atmo);
  g.rotation.z = 0.4;
  return g;
}
