import * as THREE from 'three';
import { getBoard } from '../../../shared/board/boards';
import type { BoardDef } from '../../../shared/board/types';
import { setDetailMood, type DetailMood } from './detail';
import { relight, type LightMood } from './lighting';
import type { Grade } from './post';
import { dressScene, type DressOpts, type Life, type Shape, type Theme } from './scenery';

/**
 * The look of every screen in one table: which scenery theme, which surface palette, which HDRI
 * and lights, and how the picture is graded. Minigames are keyed by game id; anything not listed
 * (new games from the minigame thread) gets a look guessed from its sky.
 */
export interface Look {
  theme: Theme;
  palette?: DetailMood['palette'];
  light?: LightMood;
  grade?: Partial<Grade>;
  clouds?: number;
  /** Where play happens, in world units (default: the 1280x720 logic rectangle). */
  keepOut?: Shape[];
  /** Ground area to dress (default: what the camera sees on the first frame). */
  bounds?: [number, number, number, number];
  density?: number;
  horizon?: number;
  /** Push fog further away (multiplier on near/far). */
  fogScale?: number;
  noScenery?: boolean;
}

/* station (Cosmo deck) borrows the space look; filled in below */
const DAY: LightMood = { hdri: 'park', envIntensity: 0.55, sun: 1.05, hemi: 0.85, rim: '#ffe6c4', rimIntensity: 0.55 };
const DAY_GRADE: Partial<Grade> = { contrast: 1.08, saturation: 1.14, gain: [1.03, 1.0, 0.96], lift: [0.0, 0.004, 0.02], vignette: 0.3 };

const THEMES = {
  meadow: { palette: 'meadow', light: DAY, grade: DAY_GRADE, clouds: 0.22 },
  plaza: { palette: 'plaza', light: DAY, grade: DAY_GRADE, clouds: 0.2 },
  prairie: { palette: 'village', light: { ...DAY, hdri: 'sky' }, grade: { ...DAY_GRADE, gain: [1.05, 1.0, 0.93] }, clouds: 0.22 },
  beach: { palette: 'beach', light: { ...DAY, hdri: 'sky' }, grade: { ...DAY_GRADE, saturation: 1.16 }, clouds: 0.2 },
  sea: { palette: 'sea', light: { ...DAY, hdri: 'sky' }, grade: { ...DAY_GRADE, saturation: 1.16 }, clouds: 0.15 },
  desert: {
    palette: 'desert',
    light: { hdri: 'sunset', envIntensity: 0.5, sun: 1.05, hemi: 0.8, rim: '#ffb26b', rimIntensity: 0.8 },
    grade: { contrast: 1.1, saturation: 1.1, gain: [1.07, 1.0, 0.9], lift: [0.02, 0.0, 0.035], vignette: 0.38, vignetteColor: '#2a1020' },
    clouds: 0.12,
  },
  snow: {
    palette: 'snow',
    light: { hdri: 'dawn', envIntensity: 0.4, sun: 0.95, hemi: 0.8, rim: '#cfe4ff', rimIntensity: 0.6 },
    grade: { contrast: 1.06, saturation: 1.08, gain: [0.98, 1.0, 1.04], lift: [0.0, 0.006, 0.03], vignette: 0.3, vignetteColor: '#101830' },
    clouds: 0.1,
  },
  spooky: {
    palette: 'spooky',
    light: { hdri: 'night', envIntensity: 1.2, sun: 1.15, hemi: 1.35, rim: '#8a6bff', rimIntensity: 1.3 },
    grade: { exposure: 1.12, contrast: 1.12, saturation: 1.06, gain: [0.98, 0.98, 1.05], lift: [0.012, 0.0, 0.05], vignette: 0.5, vignetteColor: '#0a0518', bloom: 0.45, bloomThreshold: 1.05 },
  },
  space: {
    palette: 'space',
    light: { hdri: 'studio', envIntensity: 0.3, sun: 1.0, hemi: 0.95, rim: '#6fd8ff', rimIntensity: 1.0 },
    grade: { exposure: 0.95, contrast: 1.12, saturation: 1.12, gain: [0.98, 1.0, 1.05], lift: [0.01, 0.0, 0.04], vignette: 0.45, vignetteColor: '#050318', bloom: 0.5, bloomThreshold: 1.15 },
  },
  indoor: {
    palette: 'indoor',
    light: { hdri: 'lobby', envIntensity: 0.6, sun: 1.0, hemi: 0.9, rim: '#fff0d8', rimIntensity: 0.45 },
    grade: { contrast: 1.07, saturation: 1.1, gain: [1.04, 1.0, 0.95], lift: [0.01, 0.004, 0.0], vignette: 0.34, vignetteColor: '#20100a' },
    noScenery: true,
  },
} as Record<Theme, Omit<Look, 'theme'>>;

THEMES.station = THEMES.space;

/** Minigames by id. */
export const GAME_LOOKS: Record<string, Look> = {
  'shrinking-rink': { theme: 'sea', keepOut: [{ circle: [0, 0, 10] }] },
  'quick-draw-cactus': { theme: 'desert', keepOut: [{ rect: [-12, -6, 12, 6] }] },
  'pancake-panic': { theme: 'indoor' },
  'coin-cloudburst': { theme: 'meadow' },
  'meteor-shower': { theme: 'space' },
  'present-pile-up': { theme: 'snow' },
  'graveyard-shift': { theme: 'spooky' },
  'train-hop': { theme: 'prairie' },
  'fuse-draw': { theme: 'desert', keepOut: [{ rect: [-9, -4, 9, 5] }], horizon: 120 },
  'paddle-clash': { theme: 'beach' },
  'rope-pull': { theme: 'meadow' },
  'crate-grab': { theme: 'beach' },
  'hot-potato-bomb': { theme: 'beach' },
  'kitchen-raid': { theme: 'indoor' },
  'lantern-hunt': { theme: 'spooky' },
  'haunted-memory': { theme: 'spooky' },
  'snowball-scramble': { theme: 'snow' },
  'laser-limbo': { theme: 'space' },
  'treasure-dig': { theme: 'beach' },
  'cannon-king': { theme: 'beach' },
  'raft-rowing': { theme: 'sea', density: 0.6 },
  'burger-builder': { theme: 'indoor' },
  'color-craze': { theme: 'plaza', palette: { greenUp: ['toy', 0.5, 2.5], greenSide: ['toy', 0.5, 2.5] }, noScenery: true },
  'station-repair': { theme: 'space' },
};

const BOARD_LOOKS: Record<BoardDef['theme'], Look> = {
  hollow: {
    theme: 'meadow',
    palette: 'village',
    light: { hdri: 'sunset', envIntensity: 0.55, sun: 1.05, hemi: 0.85, rim: '#ffc28a', rimIntensity: 0.7 },
    grade: { ...DAY_GRADE, gain: [1.05, 1.0, 0.95], lift: [0.01, 0.0, 0.03], tilt: 0.55, vignette: 0.36 },
    clouds: 0.18,
    horizon: 1,
  },
  cosmo: { theme: 'station', palette: 'space', grade: { tilt: 0.45, bloom: 0.3, bloomThreshold: 1.35 }, horizon: 0, density: 0.35 },
  gulch: { theme: 'desert', light: { hdri: 'sky', envIntensity: 0.55, sun: 1.1, hemi: 0.85, rim: '#ffd09a', rimIntensity: 0.6 }, grade: { contrast: 1.1, saturation: 1.12, gain: [1.05, 1.0, 0.93], lift: [0.015, 0.0, 0.03], tilt: 0.55, vignette: 0.34 }, clouds: 0.2, fogScale: 1.7, horizon: 1 },
};

/** Guess a look for a game nobody has listed yet, from the sky it asked for. */
function guess(scene: THREE.Scene): Look {
  const o = (scene.userData.sceneOpts ?? {}) as { sky?: string; skyTop?: string };
  const sky = o.sky ?? '';
  if (/space/.test(sky)) return { theme: 'space' };
  if (sky === 'night') return { theme: 'spooky' };
  const top = new THREE.Color(o.skyTop ?? '#7cc8ff');
  const hsl = { h: 0, s: 0, l: 0 };
  top.getHSL(hsl);
  if (hsl.h < 0.12 && hsl.s > 0.4) return { theme: 'desert' };
  if (!o.sky && hsl.l > 0.7) return { theme: 'indoor' };
  return { theme: 'meadow' };
}

export function lookFor(key: string, scene: THREE.Scene): { look: Look; board?: BoardDef } {
  if (key.startsWith('game:')) {
    const id = key.split(':')[1];
    return { look: GAME_LOOKS[id] ?? guess(scene) };
  }
  if (key.startsWith('board:')) {
    const def = getBoard(key.split(':')[1]);
    return { look: BOARD_LOOKS[def.theme], board: def };
  }
  // menus: the dusk party island and the lobby stage keep their own lights, with a warm evening fill
  return {
    look: {
      theme: 'meadow',
      noScenery: true,
      palette: 'plaza',
      light: { hdri: 'sunset', envIntensity: 0.5, sun: 1, hemi: 1, rim: key === 'main-menu' ? '#b48cff' : '#ffd6f0', rimIntensity: 0.6 },
      grade: { contrast: 1.08, saturation: 1.12, vignette: 0.34, bloom: 0.42, bloomThreshold: 1.2, gain: [1.03, 1.0, 0.98] },
      clouds: 0,
    },
  };
}

export interface Dressed {
  lives: Life[];
  grade: Partial<Grade>;
}

/** Re-light, set the surface palette and fill in the scenery for one view. */
export function dressView(key: string, scene: THREE.Scene, cam: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): Dressed {
  const { look, board } = lookFor(key, scene);
  const base = THEMES[look.theme];
  const full: Look = { ...base, ...look, light: { ...base.light, ...look.light }, grade: { ...base.grade, ...look.grade } };
  setDetailMood({ palette: full.palette ?? look.theme, clouds: full.clouds ?? 0 });
  relight(renderer, scene, full.light ?? {});
  if (full.fogScale && scene.fog instanceof THREE.Fog) {
    scene.fog.near *= full.fogScale;
    scene.fog.far *= full.fogScale;
  }
  let lives: Life[] = [];
  if (!full.noScenery && key !== 'menu' && key !== 'main-menu') {
    const opts: DressOpts = { theme: full.theme, density: full.density, seed: hash(key.split(':').slice(0, 2).join(':')) };
    if (board) {
      // the whole board, kept clear of every path between spaces
      const ns = Object.values(board.nodes);
      const xs = ns.map((n) => n.x), zs = ns.map((n) => n.z);
      const pad = 26;
      opts.bounds = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
      opts.paths = [];
      for (const n of ns) for (const id of n.next) {
        const m = board.nodes[id];
        if (m) opts.paths.push([n.x, n.z, m.x, m.z]);
      }
      opts.pathClear = 1.9;
      opts.frontZ = Infinity;
      opts.maxProps = 260;
      opts.keepOut = [];
      const span = Math.max(opts.bounds[2] - opts.bounds[0], opts.bounds[3] - opts.bounds[1]);
      opts.horizon = full.horizon ? span * 0.95 : 0;
      opts.centre = [(opts.bounds[0] + opts.bounds[2]) / 2, (opts.bounds[1] + opts.bounds[3]) / 2];
    } else {
      opts.keepOut = full.keepOut ?? [{ rect: [-16.5, -9.5, 16.5, 9.5] }];
      if (full.bounds) opts.bounds = full.bounds;
      opts.horizon = full.horizon ?? 0;
    }
    try {
      lives = dressScene(scene, cam, opts);
    } catch (e) {
      console.warn('Scenery failed for', key, e);
    }
  }
  return { lives, grade: full.grade ?? {} };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
