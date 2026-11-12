import * as THREE from 'three';

/**
 * Wood that reads as wood: cut faces with growth rings and cracks, bark with vertical furrows.
 * treeStump() gives a stump with flared roots instead of a plain brown cylinder.
 */
let ringTex: THREE.Texture | null = null;
let barkTex: THREE.Texture | null = null;

export function endGrainTexture(): THREE.Texture {
  if (ringTex) return ringTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b07a';
  g.fillRect(0, 0, S, S);
  for (let r = S / 2; r > 2; r -= 5 + Math.random() * 5) {
    g.strokeStyle = `rgba(130,80,40,${0.25 + Math.random() * 0.3})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + r) * 0.02);
      g.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr);
    }
    g.stroke();
  }
  // a couple of radial drying cracks
  g.strokeStyle = 'rgba(70,40,20,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * S * 0.12, S / 2 + Math.sin(a) * S * 0.12);
    g.lineTo(S / 2 + Math.cos(a + 0.05) * S * 0.45, S / 2 + Math.sin(a + 0.05) * S * 0.45);
    g.stroke();
  }
  // darker bark rim
  g.strokeStyle = '#5a3a22';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2);
  g.stroke();
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

export function barkTexture(): THREE.Texture {
  if (barkTex) return barkTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e4a2e';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S;
    g.strokeStyle = Math.random() < 0.6 ? `rgba(40,24,14,${0.4 + Math.random() * 0.4})` : `rgba(150,110,80,${0.25 + Math.random() * 0.3})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    let xx = x;
    g.moveTo(xx, 0);
    for (let y = 0; y <= S; y += 16) {
      xx += (Math.random() - 0.5) * 5;
      g.lineTo(xx, y);
    }
    g.stroke();
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A sawn tree stump of radius `r` and height `h`, base at y=0, with root flare. */
export function treeStump(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    pts.push(new THREE.Vector2(r * (1 + Math.pow(1 - k, 3) * 0.45), k * h));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), a = Math.atan2(z, x);
    // roots bulge out at the base
    const root = Math.max(0, Math.sin(a * 5 + 0.7)) ** 3 * Math.pow(1 - y / h, 2) * 0.35;
    const k = 1 + root + Math.sin(a * 17) * 0.015;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  const bark = barkTexture().clone();
  bark.repeat.set(3, 1);
  bark.needsUpdate = true;
  const side = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: 2, roughness: 0.95 }));
  side.castShadow = side.receiveShadow = true;
  side.material.userData.noDetail = true;
  g.add(side);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 1.0, 40), new THREE.MeshStandardMaterial({ map: endGrainTexture(), roughness: 0.85 }));
  top.material.userData.noDetail = true;
  top.rotation.x = -Math.PI / 2;
  top.position.y = h;
  top.receiveShadow = true;
  g.add(top);
  return g;
}

/** A polished plank floor: long boards in slightly varied tones with soft grain and staggered joints. */
let floorTex: THREE.Texture | null = null;
export function woodFloorMaterial(rx: number, ry: number, color = '#ffffff'): THREE.MeshPhysicalMaterial {
  if (!floorTex) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const rows = 8, bh = S / rows;
    let seed = 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tones = ['#b07a4a', '#a26c3e', '#bb8654', '#9a6638', '#b47e4c'];
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * S * 0.5;
      while (x < S) {
        const L = S * (0.45 + rnd() * 0.4);
        g.fillStyle = tones[Math.floor(rnd() * tones.length)];
        g.fillRect(x, r * bh, L, bh);
        // grain streaks along the board
        for (let k = 0; k < 10; k++) {
          g.strokeStyle = `rgba(${rnd() < 0.5 ? '60,35,15' : '220,170,120'},${0.08 + rnd() * 0.12})`;
          g.lineWidth = 0.6 + rnd() * 1.2;
          const y = r * bh + rnd() * bh;
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + L * 0.3, y + (rnd() - 0.5) * 6, x + L * 0.6, y + (rnd() - 0.5) * 6, x + L, y + (rnd() - 0.5) * 4);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,22,10,0.55)';
        g.fillRect(x, r * bh, 2, bh);
        x += L;
      }
      g.fillStyle = 'rgba(40,22,10,0.5)';
      g.fillRect(0, r * bh, S, 2);
    }
    floorTex = new THREE.CanvasTexture(c);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.anisotropy = 8;
  }
  const map = floorTex.clone();
  map.repeat.set(rx, ry);
  map.needsUpdate = true;
  const m = new THREE.MeshPhysicalMaterial({ map, color, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  m.userData.noDetail = true;
  return m;
}
