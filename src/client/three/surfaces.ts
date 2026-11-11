import * as THREE from 'three';

/**
 * Painted ground textures, drawn once on a canvas so they cost nothing to download:
 * a grass detail layer (tufts, clover and soft colour patches) that multiplies over the terrain's
 * own colours, and a road surface per board (cobbles, a metal walkway, a rutted wagon trail).
 */

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small seeded random so the textures look the same every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Draw something at (x, y) and again wherever it crosses an edge, so the texture tiles. */
function wrap(s: number, x: number, y: number, r: number, f: (x: number, y: number) => void) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) if (x + dx > -r && x + dx < s + r && y + dy > -r && y + dy < s + r) f(x + dx, y + dy);
}

let grass: THREE.Texture | null = null;
/** Near-white grass detail: multiply it over vertex-coloured terrain. Repeat about every 4 units. */
export function grassDetail(): THREE.Texture {
  if (grass) return grass;
  grass = canvasTexture(512, (g, s) => {
    const r = rng(7);
    g.fillStyle = '#e9efe2';
    g.fillRect(0, 0, s, s);
    // soft lighter and darker patches
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s, rad = 30 + r() * 70;
      const light = r() < 0.5;
      wrap(s, x, y, rad, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, light ? 'rgba(255,255,235,0.35)' : 'rgba(150,175,130,0.3)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      });
    }
    // grass tufts: little fans of blades, dark at the root and bright at the tip
    for (let i = 0; i < 520; i++) {
      const x = r() * s, y = r() * s;
      const blades = 3 + Math.floor(r() * 4);
      const h = 7 + r() * 9;
      wrap(s, x, y, 20, (px, py) => {
        for (let b = 0; b < blades; b++) {
          const a = -Math.PI / 2 + (b - (blades - 1) / 2) * 0.35 + (r() - 0.5) * 0.2;
          const gr = g.createLinearGradient(px, py, px + Math.cos(a) * h, py + Math.sin(a) * h);
          gr.addColorStop(0, 'rgba(120,150,95,0.75)');
          gr.addColorStop(1, 'rgba(255,255,230,0.85)');
          g.strokeStyle = gr;
          g.lineWidth = 2;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(px, py);
          g.quadraticCurveTo(px + Math.cos(a) * h * 0.5 + 1.5, py + Math.sin(a) * h * 0.5, px + Math.cos(a) * h, py + Math.sin(a) * h);
          g.stroke();
        }
      });
    }
    // clover and tiny flowers
    for (let i = 0; i < 70; i++) {
      const x = r() * s, y = r() * s;
      const flower = r() < 0.35;
      wrap(s, x, y, 8, (px, py) => {
        if (flower) {
          g.fillStyle = ['#fff6d0', '#ffd6ec', '#fff1a8'][i % 3];
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            g.beginPath();
            g.arc(px + Math.cos(a) * 2.6, py + Math.sin(a) * 2.6, 2, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(px, py, 1.6, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = 'rgba(130,165,105,0.6)';
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + 0.4;
            g.beginPath();
            g.arc(px + Math.cos(a) * 2.4, py + Math.sin(a) * 2.4, 2.4, 0, Math.PI * 2);
            g.fill();
          }
        }
      });
    }
  });
  return grass;
}

const roads = new Map<string, THREE.Texture>();
/** A road surface that runs along v (lengthways) and spans the width in u. */
export function roadTexture(theme: 'hollow' | 'cosmo' | 'gulch' | 'court'): THREE.Texture {
  const hit = roads.get(theme);
  if (hit) return hit;
  const t = canvasTexture(256, (g, s) => {
    const r = rng(theme.length * 31 + 3);
    if (theme === 'hollow') {
      // rounded cobbles in warm stone, mortar between, a darker kerb down each side
      g.fillStyle = '#8c7a62';
      g.fillRect(0, 0, s, s);
      const rows = 6;
      for (let row = 0; row < rows; row++) {
        const y = (row + 0.5) * (s / rows);
        const off = row % 2 ? s / 8 : 0;
        for (let k = -1; k < 5; k++) {
          const x = off + k * (s / 4) + s / 8;
          const w = s / 4 - 8 + (r() - 0.5) * 6, h = s / rows - 8 + (r() - 0.5) * 4;
          const base = 190 + Math.floor(r() * 40);
          g.fillStyle = `rgb(${base},${base - 18},${base - 42})`;
          g.beginPath();
          g.roundRect(x - w / 2, y - h / 2, w, h, 10);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.22)';
          g.beginPath();
          g.roundRect(x - w / 2 + 3, y - h / 2 + 3, w - 10, h / 2 - 4, 7);
          g.fill();
        }
      }
      g.fillStyle = 'rgba(70,52,34,0.55)';
      g.fillRect(0, 0, 14, s);
      g.fillRect(s - 14, 0, 14, s);
    } else if (theme === 'cosmo') {
      // a lit metal walkway: plates, rivets and a glowing centre line
      g.fillStyle = '#c9d3ff';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2; i++) {
        g.fillStyle = i ? '#b7c3f5' : '#d6defe';
        g.fillRect(0, i * (s / 2), s, s / 2 - 3);
      }
      g.fillStyle = '#8c98d0';
      g.fillRect(0, s / 2 - 3, s, 6);
      g.fillRect(0, s - 3, s, 3);
      for (const y of [s / 4, (3 * s) / 4]) for (const x of [24, s - 24]) {
        g.fillStyle = '#8590c4';
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#45e3ff';
      g.fillRect(s / 2 - 5, 0, 10, s);
      g.fillStyle = '#5c67a8';
      g.fillRect(0, 0, 12, s);
      g.fillRect(s - 12, 0, 12, s);
    } else if (theme === 'court') {
      // a painted lane on the hardwood: darker stained boards, orange centre stripe, white edge lines
      g.fillStyle = '#a8662f';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#b8743a' : '#9c5c28';
        g.fillRect(i * (s / 4), 0, s / 4 - 2, s);
      }
      for (let i = 0; i < 10; i++) {
        g.fillStyle = 'rgba(60,30,10,0.35)';
        g.fillRect(Math.floor(r() * 4) * (s / 4), r() * s, s / 4 - 2, 2);
      }
      g.fillStyle = '#ff8a1f';
      g.fillRect(s / 2 - 7, 0, 14, s);
      g.fillStyle = '#ffffff';
      g.fillRect(6, 0, 10, s);
      g.fillRect(s - 16, 0, 10, s);
    } else {
      // a packed-dirt wagon trail with two wheel ruts and pebbles
      g.fillStyle = '#b98a55';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) {
        const x = r() * s, y = r() * s;
        g.fillStyle = r() < 0.5 ? 'rgba(120,80,40,0.35)' : 'rgba(240,205,150,0.35)';
        g.beginPath();
        g.ellipse(x, y, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      for (const x of [s * 0.3, s * 0.7]) {
        g.fillStyle = 'rgba(110,70,35,0.45)';
        g.fillRect(x - 9, 0, 18, s);
        g.fillStyle = 'rgba(255,225,170,0.25)';
        g.fillRect(x + 7, 0, 3, s);
      }
      g.fillStyle = 'rgba(90,60,30,0.35)';
      g.fillRect(0, 0, 10, s);
      g.fillRect(s - 10, 0, 10, s);
    }
  });
  roads.set(theme, t);
  return t;
}

/** Stretch a box's UVs so a road texture repeats every `tile` units along its length (z). */
export function roadUVs(geo: THREE.BufferGeometry, len: number, tile: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // top face: u across, v along the length
    if (nrm.getY(i) > 0.5) uv.setXY(i, uv.getX(i), (pos.getZ(i) + len / 2) / tile);
  }
  uv.needsUpdate = true;
}
