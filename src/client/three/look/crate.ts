import * as THREE from 'three';

/** Painted crates: a pale wood face with a darker frame and cross-brace, so a paint colour stays bright. */
let crate: THREE.Texture | null = null;
export function paintedCrateTexture(): THREE.Texture {
  if (crate) return crate;
  crate = (() => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2ece2';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? 'rgba(120,90,60,0.08)' : 'rgba(255,255,255,0.1)';
      g.fillRect(0, (i * S) / 5, S, S / 5);
      g.fillStyle = 'rgba(80,60,40,0.18)';
      g.fillRect(0, (i * S) / 5, S, 1.5);
    }
    g.strokeStyle = 'rgba(70,50,30,0.55)';
    g.lineWidth = 14;
    g.strokeRect(7, 7, S - 14, S - 14);
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(14, S - 14);
    g.lineTo(S - 14, 14);
    g.stroke();
    g.fillStyle = 'rgba(40,30,20,0.7)';
    for (const [x, y] of [[12, 12], [S - 12, 12], [12, S - 12], [S - 12, S - 12]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
    })();
  return crate;
}

/**
 * Steel lattice for cranes and gantries: a see-through truss (frame and zig-zag braces) painted
 * safety yellow. `rx`/`ry` are how many truss bays fit along each axis.
 */
let truss: THREE.Texture | null = null;
export function trussMaterial(rx: number, ry: number, color = '#ffb020'): THREE.MeshStandardMaterial {
  if (!truss) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#ffffff';
    g.lineCap = 'square';
    g.lineWidth = 9;
    g.strokeRect(4.5, -10, S - 9, S + 20);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(S - 6, S / 2);
    g.lineTo(6, S);
    g.stroke();
    g.beginPath();
    g.moveTo(6, 2);
    g.lineTo(S - 6, 2);
    g.stroke();
    truss = new THREE.CanvasTexture(c);
    truss.wrapS = truss.wrapT = THREE.RepeatWrapping;
  }
  const map = truss.clone();
  map.repeat.set(rx, ry);
  map.needsUpdate = true;
  // the canvas lines run vertically: rotate the pattern for horizontal members
  if (rx > ry) {
    map.rotation = Math.PI / 2;
    map.repeat.set(ry, rx);
  }
  const m = new THREE.MeshStandardMaterial({ color, alphaMap: map, map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.4 });
  m.userData.noDetail = true;
  return m;
}
