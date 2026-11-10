import * as THREE from 'three';

/**
 * Palette swaps for the characters. Every Kenney character in a pack shares one colour atlas, so a
 * swap finds the hue this model uses most (its "signature", e.g. Oobi's purple), then paints a
 * private copy of the atlas where that hue becomes the player's colour. Skin, eyes and trim keep
 * their colours, which keeps the models looking hand-made rather than dipped in paint.
 */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

/** Pixels of the atlas, read once per image. */
const pixelCache = new WeakMap<object, ImageData>();
function pixels(img: CanvasImageSource & { width: number; height: number }): ImageData | null {
  const hit = pixelCache.get(img);
  if (hit) return hit;
  if (typeof document === 'undefined' || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  pixelCache.set(img, data);
  return data;
}

/** Signature hue + how saturated/light it is, found from the texels this model's UVs land on. */
function signature(root: THREE.Object3D, data: ImageData, flipY: boolean): Hsl | null {
  const bins = new Array(36).fill(0);
  const acc = Array.from({ length: 36 }, () => ({ s: 0, l: 0 }));
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const uv = m.isMesh ? (m.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined) : undefined;
    if (!uv) return;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) - Math.floor(uv.getX(i));
      let v = uv.getY(i) - Math.floor(uv.getY(i));
      if (flipY) v = 1 - v;
      const x = Math.min(data.width - 1, Math.floor(u * data.width));
      const y = Math.min(data.height - 1, Math.floor(v * data.height));
      const k = (y * data.width + x) * 4;
      const c = rgbToHsl(data.data[k] / 255, data.data[k + 1] / 255, data.data[k + 2] / 255);
      if (c.s < 0.28 || c.l < 0.12 || c.l > 0.92) continue;
      // skin tones are left alone
      if (c.h > 0.03 && c.h < 0.11 && c.s < 0.75 && c.l > 0.45) continue;
      const b = Math.floor(c.h * 36) % 36;
      bins[b]++;
      acc[b].s += c.s;
      acc[b].l += c.l;
    }
  });
  // smooth over neighbouring bins so a gradient swatch counts as one colour
  let best = -1;
  let bestN = 0;
  for (let i = 0; i < 36; i++) {
    const n = bins[i] + 0.6 * (bins[(i + 1) % 36] + bins[(i + 35) % 36]);
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  if (best < 0 || bins[best] === 0) return null;
  return { h: (best + 0.5) / 36, s: acc[best].s / bins[best], l: acc[best].l / bins[best] };
}

const texCache = new Map<string, THREE.Texture>();

/** Repaint `root`'s signature colour as `color`. Safe to call before textures load (does nothing). */
export function recolor(root: THREE.Object3D, color: string, key: string): void {
  const target = new THREE.Color(color);
  const hex = target.getHex(THREE.SRGBColorSpace);
  const tHsl = rgbToHsl(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  // reuse one painted copy per character + colour
  const cached = texCache.get(`${key}|${color}`);
  let done: THREE.Texture | undefined = cached;
  const swap = (mat0: THREE.Material): THREE.Material => {
    const map = (mat0 as THREE.MeshStandardMaterial).map;
    if (!map?.image) return mat0;
    if (!done) {
      const data = pixels(map.image as HTMLImageElement);
      const sig = data && signature(root, data, map.flipY);
      if (data && sig) done = paint(map, data, sig, tHsl);
      if (done) texCache.set(`${key}|${color}`, done);
    }
    if (!done) return mat0;
    const mat = (mat0 as THREE.MeshStandardMaterial).clone();
    mat.map = done;
    return mat;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

function paint(src: THREE.Texture, data: ImageData, sig: Hsl, to: Hsl): THREE.Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  const g = c.getContext('2d')!;
  const out = g.createImageData(data.width, data.height);
  const d = data.data;
  const o = out.data;
  // greys and whites (Sir Clank's colour) are painted by lightness instead of hue
  const grey = to.s < 0.2;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const c0 = rgbToHsl(r, gg, b);
    const near = c0.s > 0.22 && hueDist(c0.h, sig.h) < 0.075;
    if (!near) {
      o[i] = d[i];
      o[i + 1] = d[i + 1];
      o[i + 2] = d[i + 2];
      o[i + 3] = d[i + 3];
      continue;
    }
    // keep the shading of the original swatch relative to the signature
    const dl = c0.l - sig.l;
    const l = Math.max(0.05, Math.min(0.97, to.l + dl * 0.9));
    const s = grey ? to.s : Math.max(0, Math.min(1, to.s * (c0.s / Math.max(0.01, sig.s))));
    const [nr, ng, nb] = hslToRgb(to.h, s, l);
    o[i] = nr * 255;
    o[i + 1] = ng * 255;
    o[i + 2] = nb * 255;
    o[i + 3] = d[i + 3];
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = src.colorSpace;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.needsUpdate = true;
  return t;
}
