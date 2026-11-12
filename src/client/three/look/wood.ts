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
