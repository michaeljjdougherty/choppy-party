/**
 * Graphics quality: four presets (Low, Medium, High, Ultra) plus per-option overrides.
 *
 * Every heavy effect reads its switch from here, so the settings screen only has to call
 * setQuality('medium') or setGfx({ bloom: false }). Choices persist in localStorage, and
 * `?gfx=low|medium|high|ultra` in the URL wins for one visit (handy for testing).
 */
export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_NAMES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export interface Gfx {
  /** Highest device pixel ratio to render at. */
  maxPixelRatio: number;
  /** Shadow map size; 0 turns shadows off. */
  shadowMap: number;
  /** Soft shadow filtering. */
  softShadows: boolean;
  /** Post-processing chain at all (bloom, grading, vignette, flashes). */
  post: boolean;
  bloom: boolean;
  /** Ambient occlusion (contact darkening in corners and under props). */
  ao: boolean;
  /** Multisample anti-aliasing samples in the post chain (0 = FXAA instead). */
  msaa: number;
  /** Miniature tilt-shift blur on the boards. */
  tiltShift: boolean;
  /** Surface detail on every material: 0 off, 1 flat-projected, 2 tri-planar with bump, 3 plus macro variation and cloud shadows. */
  surface: 0 | 1 | 2 | 3;
  /** Surface texture resolution. */
  texSize: 512 | 1024;
  /** Image-based lighting from Poly Haven HDRIs instead of the plain studio room. */
  hdri: boolean;
  /** Background scenery density, 0..1.5. */
  scenery: number;
  /** Grass tufts and ground clutter density, 0..1.5. */
  clutter: number;
  /** Floating dust/snow/sparkle count multiplier. */
  particles: number;
}

export const PRESETS: Record<QualityName, Gfx> = {
  low: { maxPixelRatio: 1, shadowMap: 1024, softShadows: false, post: false, bloom: false, ao: false, msaa: 0, tiltShift: false, surface: 0, texSize: 512, hdri: false, scenery: 0.35, clutter: 0, particles: 0.4 },
  medium: { maxPixelRatio: 1.25, shadowMap: 1024, softShadows: true, post: true, bloom: true, ao: false, msaa: 0, tiltShift: false, surface: 1, texSize: 512, hdri: true, scenery: 0.7, clutter: 0.45, particles: 0.7 },
  high: { maxPixelRatio: 1.5, shadowMap: 2048, softShadows: true, post: true, bloom: true, ao: false, msaa: 4, tiltShift: true, surface: 2, texSize: 1024, hdri: true, scenery: 1, clutter: 1, particles: 1 },
  ultra: { maxPixelRatio: 2, shadowMap: 4096, softShadows: true, post: true, bloom: true, ao: true, msaa: 4, tiltShift: true, surface: 3, texSize: 1024, hdri: true, scenery: 1.3, clutter: 1.4, particles: 1.3 },
};

const KEY = 'choppy.gfx';
let preset: QualityName = 'high';
let overrides: Partial<Gfx> = {};
let current: Gfx = { ...PRESETS.high };
const listeners = new Set<(g: Gfx) => void>();

function guessPreset(): QualityName {
  if (typeof navigator === 'undefined') return 'high';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as { preset?: QualityName; overrides?: Partial<Gfx> };
      if (j.preset && PRESETS[j.preset]) preset = j.preset;
      overrides = j.overrides ?? {};
    } else preset = guessPreset();
  } catch {
    preset = guessPreset();
  }
  try {
    const q = new URLSearchParams(location.search);
    const url = q.get('gfx') as QualityName | null;
    if (url && PRESETS[url]) {
      preset = url;
      overrides = {};
    }
    // the old switch still works
    if (q.has('lowfx')) overrides = { ...overrides, post: false };
    // testing: ?fxoff=bloom,tiltShift turns single switches off
    for (const k of (q.get('fxoff') ?? '').split(',').filter(Boolean)) overrides = { ...overrides, [k]: k === 'msaa' || k === 'surface' ? 0 : false };
  } catch {
    /* no location (tests) */
  }
  current = { ...PRESETS[preset], ...overrides };
}
load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ preset, overrides }));
  } catch {
    /* private mode */
  }
}

/** The settings in force right now. */
export const gfx = (): Gfx => current;
export const qualityName = (): QualityName => preset;

/** Switch preset (drops per-option overrides). */
export function setQuality(name: QualityName): void {
  if (!PRESETS[name]) return;
  preset = name;
  overrides = {};
  current = { ...PRESETS[name] };
  save();
  listeners.forEach((f) => f(current));
}

/** Change individual options on top of the preset. */
export function setGfx(change: Partial<Gfx>): void {
  overrides = { ...overrides, ...change };
  current = { ...PRESETS[preset], ...overrides };
  save();
  listeners.forEach((f) => f(current));
}

/** Called whenever the settings change. Returns an unsubscribe function. */
export function onGfx(f: (g: Gfx) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Human labels for a settings screen. */
export const GFX_LABELS: Record<keyof Gfx, string> = {
  maxPixelRatio: 'Resolution scale',
  shadowMap: 'Shadow quality',
  softShadows: 'Soft shadows',
  post: 'Post effects',
  bloom: 'Glow',
  ao: 'Ambient occlusion',
  msaa: 'Anti-aliasing',
  tiltShift: 'Board miniature blur',
  surface: 'Surface detail',
  texSize: 'Texture resolution',
  hdri: 'Realistic lighting',
  scenery: 'Background scenery',
  clutter: 'Grass and clutter',
  particles: 'Particles',
};
