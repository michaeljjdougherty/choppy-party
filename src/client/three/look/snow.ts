import * as THREE from 'three';

/**
 * Fresh snow: soft blue-grey hollows between brighter drifts, footprints of old tracks, and a
 * glitter that catches the light as the camera moves (tiny glints in the shader).
 */
let snowMap: THREE.Texture | null = null;
let snowBump: THREE.Texture | null = null;
function draw(): void {
  const S = 512;
  const c = document.createElement('canvas');
  const b = document.createElement('canvas');
  c.width = c.height = b.width = b.height = S;
  const g = c.getContext('2d')!;
  const h = b.getContext('2d')!;
  g.fillStyle = '#f3f7ff';
  g.fillRect(0, 0, S, S);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // wrap-around blobs so the texture tiles seamlessly
  const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 110;
    const hollow = rnd() < 0.5;
    blob(g, x, y, r, hollow ? 'rgba(170,195,235,0.28)' : 'rgba(255,255,255,0.5)');
    blob(h, x, y, r, hollow ? 'rgba(40,40,40,0.35)' : 'rgba(230,230,230,0.35)');
  }
  snowMap = new THREE.CanvasTexture(c);
  snowMap.colorSpace = THREE.SRGBColorSpace;
  snowMap.wrapS = snowMap.wrapT = THREE.RepeatWrapping;
  snowBump = new THREE.CanvasTexture(b);
  snowBump.wrapS = snowBump.wrapT = THREE.RepeatWrapping;
}

/** `tiles`: how many times the pattern repeats across the surface. */
export function snowMaterial(tiles = 8, tilesY = tiles): THREE.MeshStandardMaterial {
  if (!snowMap) draw();
  const map = snowMap!.clone();
  map.repeat.set(tiles, tilesY);
  map.needsUpdate = true;
  const bump = snowBump!.clone();
  bump.repeat.set(tiles, tilesY);
  bump.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', map, bumpMap: bump, bumpScale: 2.5, roughness: 0.75 });
  m.userData.noDetail = true;
  // glitter: tiny view-dependent sparkles on the surface
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;\nfloat snowHash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 cell = floor(vSnowW * 9.0);
          float h = snowHash(cell);
          vec3 vdir = normalize(cameraPosition - vSnowW);
          float tw = snowHash(cell + floor(vdir * 14.0));
          totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * step(0.985, h) * step(0.6, tw) * 1.4;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'snow-glitter';
  return m;
}
