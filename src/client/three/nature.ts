import * as THREE from 'three';
import { darken, lighten } from './kit';

/**
 * Water and sand from Michael's uploads, made small enough to load fast for ten players.
 *
 * Sea: the "Sea part" model (Ayberk Tosunoglu, CC-BY-4.0, Sketchfab) is a 44MB Alembic wave
 * simulation. Its 249 frames were resampled offline into a seamless 48x24 heightfield, 40 frames
 * stacked in one 34KB greyscale strip (public/tex/sea_waves.png). The water shader reads two
 * frames, blends them, and lights the surface from the slopes, so every sea in the game moves
 * like the original simulation.
 *
 * Sand: the ripple texture from "Desert Landscape" (Šimon Ustal, CC-BY-4.0, Sketchfab), made
 * tileable and greyscale (public/tex/sand_detail.jpg) so any sand colour can be tinted with it.
 */
const WAVE = { w: 48, h: 24, frames: 40, loop: 8.33 };

let waveTex: THREE.Texture | null = null;
let sandTex: THREE.Texture | null = null;

export async function loadNature(): Promise<void> {
  const tl = new THREE.TextureLoader();
  await Promise.all([
    tl
      .loadAsync('tex/sea_waves.png')
      .then((t) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.NoColorSpace;
        waveTex = t;
      })
      .catch((e) => console.warn('Could not load sea waves', e)),
    tl
      .loadAsync('tex/sand_detail.jpg')
      .then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        sandTex = t;
      })
      .catch((e) => console.warn('Could not load sand', e)),
  ]);
}

/** True once the wave strip has loaded. */
export const hasWaves = (): boolean => !!waveTex;

/** Rippled sand texture to use as a material map (tint it with the material colour). */
export function sandMap(rx: number, ry = rx): THREE.Texture | null {
  if (!sandTex) return null;
  const t = sandTex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** A sand material: the colour you pass, with the desert ripples over it. */
export function sandMaterial(color: THREE.ColorRepresentation, repeat: number, roughness = 0.95): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, map: sandMap(repeat), roughness });
}

/**
 * Animated sea for any flat water mesh (lying in the XZ plane). `tile` is how many world units
 * one tile of the wave simulation covers across; bigger = broader swells.
 */
export function seaWater(base: string, tile = 7): { material: THREE.MeshStandardMaterial; update: (t: number) => void } {
  const material = new THREE.MeshStandardMaterial({ color: base, roughness: 0.16, metalness: 0.05 });
  const uniforms = {
    uSea: { value: waveTex },
    uTime: { value: 0 },
    uTile: { value: new THREE.Vector2(tile, tile / 2) },
    uDeep: { value: darken(base, 0.1) },
    uCrest: { value: lighten(base, 0.22) },
    uFoam: { value: new THREE.Color('#f4fbff') },
  };
  material.onBeforeCompile = (sh) => {
    if (!waveTex) return;
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSeaW;
uniform sampler2D uSea;
uniform float uTime;
uniform vec2 uTile;
uniform vec3 uDeep, uCrest, uFoam;
const float NF = ${WAVE.frames}.0;
const float FH = ${WAVE.h}.0;
float seaFrame(vec2 uv, float f) {
  vec2 t = fract(uv);
  // stay half a texel inside each frame so frames don't bleed into each other
  float y = (f + 0.5 / FH + t.y * (FH - 1.0) / FH) / NF;
  return texture2D(uSea, vec2(t.x, y)).r;
}
float seaH(vec2 p) {
  float f = uTime / ${WAVE.loop.toFixed(2)} * NF;
  float f0 = mod(floor(f), NF);
  float k = fract(f);
  vec2 uv = p / uTile;
  float a = mix(seaFrame(uv, f0), seaFrame(uv, mod(f0 + 1.0, NF)), k);
  // a smaller, turned copy on top so the tiling never shows
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * p / (uTile * 0.47) + vec2(0.37, 0.71);
  float f2 = mod(f0 + 17.0, NF);
  float b = mix(seaFrame(uv2, f2), seaFrame(uv2, mod(f2 + 1.0, NF)), k);
  return a * 0.68 + b * 0.32;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
// far away the waves would shimmer (no mipmaps on a strip like this), so they calm down with distance
float seaNear = 1.0 - smoothstep(18.0, 70.0, length(vViewPosition));
float seaHt = mix(0.5, seaH(vSeaW.xz), seaNear);
float seaHx = mix(0.5, seaH(vSeaW.xz + vec2(0.3, 0.0)), seaNear);
float seaHz = mix(0.5, seaH(vSeaW.xz + vec2(0.0, 0.3)), seaNear);
vec3 seaC = mix(uDeep, diffuseColor.rgb, smoothstep(0.3, 0.52, seaHt));
seaC = mix(seaC, uCrest, smoothstep(0.56, 0.7, seaHt));
seaC = mix(seaC, uFoam, smoothstep(0.72, 0.8, seaHt) * 0.85);
diffuseColor.rgb = seaC;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
vec3 seaN = normalize(vec3(-(seaHx - seaHt) * 1.6, 0.3, -(seaHz - seaHt) * 1.6));
normal = normalize((viewMatrix * vec4(seaN, 0.0)).xyz);`,
      );
  };
  material.customProgramCacheKey = () => (waveTex ? 'sea-v4' : 'sea-off');
  return {
    material,
    update(t: number) {
      uniforms.uTime.value = t;
    },
  };
}
