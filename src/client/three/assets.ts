import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS } from '../../shared/players';

/**
 * Models from Kenney's CC0 kits (public/models). Everything is loaded once up front,
 * then cloned wherever it is placed so geometry and textures are shared.
 */
export const PROPS = [
  // pirate kit
  'pirate/palm-detailed-straight', 'pirate/palm-detailed-bend', 'pirate/palm-bend', 'pirate/ship-pirate-large', 'pirate/ship-pirate-medium',
  'pirate/ship-small', 'pirate/ship-wreck', 'pirate/chest', 'pirate/barrel', 'pirate/crate', 'pirate/crate-bottles', 'pirate/bottle-large',
  'pirate/flag-pirate', 'pirate/flag-high-pennant', 'pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c', 'pirate/rocks-sand-a',
  'pirate/rocks-sand-b', 'pirate/structure', 'pirate/structure-roof', 'pirate/structure-platform-dock', 'pirate/tower-complete-small',
  'pirate/cannon', 'pirate/grass-plant', 'pirate/patch-grass-foliage', 'pirate/boat-row-small', 'pirate/platform-planks',
  // mini forest
  'forest/tree', 'forest/tree-high', 'forest/tent', 'forest/fence', 'forest/rocks-high', 'forest/rocks-low', 'forest/flag', 'forest/plant',
  'forest/building-structure', 'forest/building-roof', 'forest/building-platform', 'forest/stones', 'forest/bridge',
  // platformer kit
  'platformer/coin-gold', 'platformer/jewel', 'platformer/bomb', 'platformer/mushrooms', 'platformer/flowers', 'platformer/flowers-tall',
  'platformer/tree', 'platformer/tree-pine', 'platformer/hedge', 'platformer/flag', 'platformer/sign', 'platformer/fence-straight',
  'platformer/rocks', 'platformer/stones', 'platformer/grass', 'platformer/plant', 'platformer/heart', 'platformer/star', 'platformer/chest',
  'platformer/barrel', 'platformer/crate', 'platformer/block-grass-low-hexagon', 'platformer/spring', 'platformer/pipe',
  // prototype kit
  'proto/column', 'proto/column-rounded', 'proto/pipe', 'proto/pipe-corner', 'proto/figurine-large', 'proto/figurine-cube-detailed',
  'proto/shape-hexagon', 'proto/shape-cylinder-detailed', 'proto/indicator-round-a', 'proto/indicator-special-cross', 'proto/crate-color',
  'proto/target-a-round', 'proto/vehicle-convertible',
];

const cache = new Map<string, GLTF>();
const loader = new GLTFLoader();

export async function preloadAll(onProgress: (done: number, total: number) => void): Promise<void> {
  const files = [...PROPS.map((p) => `${p}.glb`), ...CHARACTERS.map((c) => c.model)];
  let done = 0;
  await Promise.all(
    files.map(async (f) => {
      try {
        const g = await loader.loadAsync(`models/${f}`);
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        cache.set(f.replace(/\.glb$/, ''), g);
      } catch (e) {
        console.warn('Could not load model', f, e);
      }
      onProgress(++done, files.length);
    }),
  );
}

/** A copy of a static prop. Missing models give an empty group so a scene never breaks. */
export function prop(name: string, scale = 1): THREE.Object3D {
  const g = cache.get(name);
  if (!g) return new THREE.Group();
  const o = g.scene.clone(true);
  o.scale.setScalar(scale);
  return o;
}

/** Place a prop in a scene. */
export function place(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  opts: { s?: number; ry?: number; shadow?: boolean } = {},
): THREE.Object3D {
  const o = prop(name, opts.s ?? 1);
  o.position.set(x, y, z);
  o.rotation.y = opts.ry ?? 0;
  if (opts.shadow === false) o.traverse((m) => ((m as THREE.Mesh).castShadow = false));
  parent.add(o);
  return o;
}

export function character(path: string): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const g = cache.get(path.replace(/\.glb$/, ''));
  if (!g) return { scene: new THREE.Group(), animations: [] };
  return { scene: skeletonClone(g.scene), animations: g.animations };
}
