import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS } from '../../shared/players';

/**
 * Models from Kenney's CC0 kits (public/models). Everything is loaded once up front,
 * then cloned wherever it is placed so geometry and textures are shared.
 */
/** Hosts that don't serve .glb get the same files with an extra suffix (set at build time). */
const MODEL_SUFFIX: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_SUFFIX ?? '';

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
  // food kit
  'food/pancakes', 'food/plate-dinner', 'food/plate', 'food/frying-pan', 'food/cooking-spatula', 'food/bottle-ketchup', 'food/bottle-oil',
  'food/honey', 'food/whipped-cream', 'food/strawberry', 'food/mug', 'food/cup-coffee', 'food/waffle', 'food/cake', 'food/cupcake',
  'food/donut-sprinkles', 'food/apple', 'food/banana', 'food/loaf-round', 'food/croissant', 'food/pie', 'food/cherries', 'food/watermelon', 'food/egg',
  // furniture kit
  'furniture/kitchenStove', 'furniture/kitchenFridge', 'furniture/kitchenCabinet', 'furniture/kitchenCabinetUpper', 'furniture/kitchenSink',
  'furniture/kitchenCoffeeMachine', 'furniture/kitchenBlender', 'furniture/toaster', 'furniture/kitchenMicrowave', 'furniture/pottedPlant',
  'furniture/plantSmall1', 'furniture/lampWall',
  // graveyard kit
  'graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-bevel', 'graveyard/gravestone-decorative', 'graveyard/crypt',
  'graveyard/iron-fence', 'graveyard/iron-fence-border-gate', 'graveyard/lightpost-single', 'graveyard/lightpost-double', 'graveyard/lantern-candle',
  'graveyard/pumpkin-carved', 'graveyard/pumpkin-tall-carved', 'graveyard/pine-crooked', 'graveyard/pine-fall', 'graveyard/character-ghost',
  'graveyard/fire-basket', 'graveyard/candle-multiple', 'graveyard/coffin', 'graveyard/urn-round',
  // holiday kit
  'holiday/present-a-cube', 'holiday/present-b-round', 'holiday/present-a-rectangle', 'holiday/present-b-cube', 'holiday/lights-colored',
  'holiday/candy-cane-red', 'holiday/candy-cane-green', 'holiday/lantern-hanging', 'holiday/tree-decorated', 'holiday/snowman-hat',
  // train kit
  'train/train-locomotive-a', 'train/train-carriage-coal', 'train/train-carriage-wood', 'train/train-carriage-box', 'train/train-carriage-lumber',
  // space kits
  'space/rocket_baseA', 'space/rocket_fuelA', 'space/rocket_sidesA', 'space/rocket_topA', 'space/rocket_finsA', 'space/satelliteDish_large',
  'space/satelliteDish', 'space/crater', 'space/craterLarge', 'space/rock_crystals', 'space/rock_crystalsLargeA', 'space/astronautA',
  'space/astronautB', 'space/alien', 'space/rover', 'space/craft_speederA', 'space/craft_racer', 'space/machine_generator',
  'space/machine_wireless', 'space/hangar_roundGlass', 'space/meteor', 'space/turret_double',
  // board layer: space pickups, posts, duels, items
  'platformer/key', 'platformer/spike-block', 'platformer/crate-item', 'platformer/trap-spikes', 'platformer/platform', 'platformer/lever',
  'platformer/saw', 'proto/weapon-sword', 'proto/weapon-shield', 'forest/weapon-bow', 'forest/weapon-arrow', 'pirate/tool-shovel',
  'pirate/cannon-mobile', 'pirate/cannon-ball', 'pirate/structure-fence', 'pirate/flag-pennant', 'forest/patch-dirt',
  'station/computer-wide', 'station/container-tall', 'station/container', 'station/display-wall-wide', 'modspace/gate-lasers', 'modspace/gate',
];

/** Equirectangular skies (Kenney Skyboxes), in public/sky. */
export const SKIES = ['day', 'night', 'morning', 'space-nebula', 'space-galaxy'] as const;
export type SkyName = (typeof SKIES)[number];
/** Tiling textures (Kenney retro fantasy + prototype textures), in public/tex. */
export const TEXTURES = [
  'floor_stone_pattern_small', 'floor_wood_planks', 'floor_wood_planks_wide', 'floor_tiles_blue_small', 'floor_tiles_tan_small',
  'floor_ground_grass', 'floor_ground_sand', 'floor_ground_dirt', 'wall_brick_stone_center', 'wall_timber', 'proto-dark', 'proto-purple', 'proto-orange',
] as const;
export type TexName = (typeof TEXTURES)[number];
const skyCache = new Map<string, THREE.Texture>();
const texCache = new Map<string, THREE.Texture>();

/** A sky texture for scene.background, or null if it failed to load. */
export function sky(name: SkyName): THREE.Texture | null {
  return skyCache.get(name) ?? null;
}

/** A tiling texture, repeated `rx` by `ry` times. Pixel-art textures keep crisp pixels. */
export function texture(name: TexName, rx = 1, ry = rx): THREE.Texture | null {
  const base = texCache.get(name);
  if (!base) return null;
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, GLTF>();
const loader = new GLTFLoader();

export async function preloadAll(onProgress: (done: number, total: number) => void): Promise<void> {
  const files = [...PROPS.map((p) => `${p}.glb`), ...CHARACTERS.map((c) => c.model)];
  const tl = new THREE.TextureLoader();
  const extra = SKIES.length + TEXTURES.length;
  let done = 0;
  const total = files.length + extra;
  const side = [
    ...SKIES.map(async (n) => {
      try {
        const t = await tl.loadAsync(`sky/${n}.jpg`);
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        skyCache.set(n, t);
      } catch (e) {
        console.warn('Could not load sky', n, e);
      }
      onProgress(++done, total);
    }),
    ...TEXTURES.map(async (n) => {
      try {
        const t = await tl.loadAsync(`tex/${n}.png`);
        t.colorSpace = THREE.SRGBColorSpace;
        if (!n.startsWith('proto')) {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestMipmapLinearFilter;
        } else t.anisotropy = 4;
        texCache.set(n, t);
      } catch (e) {
        console.warn('Could not load texture', n, e);
      }
      onProgress(++done, total);
    }),
  ];
  await Promise.all([
    ...side,
    ...files.map(async (f) => {
      try {
        const g = await loader.loadAsync(`models/${f}${MODEL_SUFFIX}`);
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
      onProgress(++done, total);
    }),
  ]);
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
