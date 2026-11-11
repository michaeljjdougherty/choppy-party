/**
 * Turns a short song description (key, mode, chords, groove, instruments) into a looping score.
 * Melodies are composed from a seed: a two-bar motif is written once per section, then repeated,
 * varied and resolved over the chords the way a hand-written tune would be (A A' A cadence).
 * The same spec and seed always give the same song.
 */
import type { Drum, Voice } from './voices';

export type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'lydian' | 'phrygian' | 'harmonic' | 'phrygdom';
export type MelStyle = 'bouncy' | 'driving' | 'lyrical' | 'synco' | 'fast' | 'sneaky' | 'march' | 'waltz' | 'jig' | 'fanfare';
export type AccStyle = 'stab' | 'offbeat' | 'arp' | 'arp16' | 'pad' | 'strum' | 'alberti' | 'waltz' | 'pulse8' | 'hits';
export type BassStyle = 'root' | 'oompah' | 'walking' | 'octave' | 'gallop' | 'pedal' | 'synco' | 'arp8' | 'boogie' | 'pump';
export type DrumStyle =
  | 'rock' | 'disco' | 'march' | 'polka' | 'shuffle' | 'waltz' | 'gallop' | 'spooky' | 'tango' | 'reggae' | 'calypso'
  | 'funk' | 'breakbeat' | 'halftime' | 'techno' | 'sneaky' | 'chase' | 'bossa' | 'stomp' | 'jig' | 'train' | 'tribal'
  | 'sleigh' | 'none';

export interface SongSpec {
  id: string;
  title: string;
  /** Short description shown in the jukebox. */
  mood: string;
  bpm: number;
  /** Beats per bar: 4 (default) or 3. */
  meter?: 3 | 4;
  /** 0..0.5: how late the off-beat eighths land (0.33 = triplet swing). */
  swing?: number;
  /** MIDI note of the tonic in the melody's octave (60 = middle C). */
  key: number;
  mode: Mode;
  /** Section order, e.g. 'AABA'. Each letter needs a progression in `prog`. */
  form: string;
  /** Chords per bar as scale degrees 1-7; 'x-y' splits a bar in two. */
  prog: Record<string, string>;
  lead: Voice;
  melody: MelStyle;
  /** Lead octave shift (default 0). */
  leadOct?: number;
  /** Second lead that doubles the tune a third or sixth below in the B section (and the last A). */
  counter?: Voice;
  /** Scale degrees (1-7) the tune avoids, for pentatonic or folk colour. */
  avoid?: number[];
  parts: { voice: Voice; style: AccStyle; oct?: number; gain?: number; only?: string }[];
  bass: { voice: Voice; style: BassStyle; gain?: number };
  drums: DrumStyle;
  /** Wet amount for the shared hall reverb (default 0.18). */
  reverb?: number;
  /** Echo send for spacey songs (0..0.5). */
  echo?: number;
  /** Overall level (default 1). */
  gain?: number;
  seed?: number;
}

export interface NoteEv {
  step: number;
  len: number;
  midi: number;
  vel: number;
}
export interface DrumEv {
  step: number;
  drum: Drum;
  vel: number;
}
export interface Score {
  spec: SongSpec;
  stepsPerBar: number;
  totalSteps: number;
  tracks: { voice: Voice; gain: number; notes: NoteEv[] }[];
  drums: DrumEv[];
}

const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygdom: [0, 1, 4, 5, 7, 8, 10],
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rhythm cells for one bar of melody: [start, length] in 16th notes. */
const CELLS4: Record<MelStyle, [number, number][][]> = {
  bouncy: [
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 6], [14, 2]],
  ],
  driving: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  ],
  lyrical: [
    [[0, 8], [8, 4], [12, 4]],
    [[0, 6], [6, 2], [8, 8]],
    [[0, 4], [4, 4], [8, 8]],
    [[0, 4], [4, 2], [6, 2], [8, 8]],
  ],
  synco: [
    [[0, 3], [3, 3], [6, 2], [8, 2], [10, 3], [13, 3]],
    [[2, 2], [4, 3], [7, 3], [10, 2], [12, 4]],
    [[0, 2], [3, 3], [6, 2], [8, 3], [11, 5]],
  ],
  fast: [
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2], [8, 1], [9, 1], [10, 1], [11, 1], [12, 4]],
    [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2], [8, 2], [10, 1], [11, 1], [12, 2], [14, 2]],
    [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]],
  ],
  sneaky: [
    [[0, 1], [4, 1], [6, 1], [8, 2], [12, 1], [14, 1]],
    [[0, 1], [2, 1], [4, 1], [8, 1], [10, 1], [12, 2]],
    [[0, 2], [3, 1], [6, 1], [8, 1], [9, 1], [10, 1], [12, 3]],
  ],
  march: [
    [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]],
    [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
    [[0, 2], [2, 2], [4, 3], [7, 1], [8, 8]],
  ],
  fanfare: [
    [[0, 2], [2, 1], [3, 1], [4, 4], [8, 8]],
    [[0, 3], [3, 1], [4, 3], [7, 1], [8, 4], [12, 4]],
    [[0, 1], [1, 1], [2, 2], [4, 4], [8, 4], [12, 4]],
  ],
  waltz: [[[0, 16]]],
  jig: [[[0, 16]]],
};
const CELLS3: Partial<Record<MelStyle, [number, number][][]>> = {
  waltz: [
    [[0, 4], [4, 4], [8, 4]],
    [[0, 6], [6, 2], [8, 4]],
    [[0, 4], [4, 2], [6, 2], [8, 4]],
    [[0, 8], [8, 4]],
  ],
  jig: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2]],
  ],
  lyrical: [
    [[0, 8], [8, 4]],
    [[0, 12]],
    [[0, 4], [4, 8]],
  ],
  bouncy: [
    [[0, 4], [4, 2], [6, 2], [8, 4]],
    [[0, 2], [2, 2], [4, 4], [8, 4]],
  ],
  sneaky: [
    [[0, 1], [4, 1], [6, 1], [8, 2]],
    [[0, 2], [4, 1], [8, 1], [10, 1]],
  ],
};

function cellsFor(style: MelStyle, meter: number): [number, number][][] {
  if (meter === 3) return CELLS3[style] ?? CELLS3.waltz!;
  if (style === 'waltz' || style === 'jig') return CELLS4.bouncy;
  return CELLS4[style];
}

/** Drum patterns per bar. One character per 16th: x = hit, o = soft hit. */
const DRUMS: Record<DrumStyle, Partial<Record<Drum, string>>> = {
  rock: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
  disco: { kick: 'x...x...x...x...', snare: '....x.......x...', ohat: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' },
  march: { kick: 'x.......x.......', snare: 'x..ox.o.x..oxoxo', crash: '' },
  polka: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..o...o...o...o.', tamb: '....x.......x...' },
  shuffle: { kick: 'x.......x.o.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  waltz: { kick: 'x...........', snare: '....o...o...', hat: '..o...o...o.' },
  jig: { kick: 'x.....x.....', snare: '...o.....o..', tamb: 'x.o.o.x.o.o.' },
  gallop: { kick: 'x.....x.x.....x.', snare: '....x.......x...', wood: 'x.xxx.xxx.xxx.xx' },
  spooky: { ltom: 'x.........x.....', rim: '....x.......x..o', shaker: '..o...o...o...o.' },
  tango: { kick: 'x..x..x.x.......', snare: '............x...', rim: 'x..x..x...x.x.x.' },
  reggae: { kick: '........x.......', rim: '........x.......', hat: 'o.x.o.x.o.x.o.x.' },
  calypso: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', cow: '..x....x..x....x' },
  funk: { kick: 'x.x....x..x.....', snare: '....x..o.o..x...', hat: 'xoxoxoxoxoxoxoxo' },
  breakbeat: { kick: 'x.........x.....', snare: '....x..o.o..x..o', hat: 'x.x.x.x.x.x.x.xx' },
  halftime: { kick: 'x.......o.....x.', snare: '........x.......', hat: 'x.o.x.o.x.o.x.o.' },
  techno: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'o.o.o.o.o.o.o.o.' },
  sneaky: { rim: 'x.....x...x.....', shaker: '..o...o...o...o.', ltom: '........x.......' },
  chase: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
  bossa: { kick: 'x..x..x.x..x..x.', rim: 'x..x..x...x..x..', shaker: 'xoooxoooxoooxooo' },
  stomp: { kick: 'x...x...x...x...', clap: '....x.......x...', tamb: '..o...o...o...o.' },
  train: { kick: 'x.......x.......', brush: 'xoox.oox.oox.oox', snare: '....x.......x...' },
  tribal: { tom: 'x..x..x...x..x..', ltom: 'x.......x.....x.', shaker: 'o.o.o.o.o.o.o.o.' },
  sleigh: { kick: 'x.......x.......', snare: '....x.......x...', sleigh: 'x.o.x.o.x.o.x.o.' },
  none: {},
};

function parseChord(tok: string): number {
  return Math.max(0, Math.min(6, parseInt(tok, 10) - 1));
}

/** Chord roots for every 16th step of a section. */
function chordMap(prog: string, spb: number): number[] {
  const bars = prog.trim().split(/\s+/);
  const out: number[] = [];
  for (const bar of bars) {
    const parts = bar.split('-').map(parseChord);
    for (let i = 0; i < spb; i++) out.push(parts[Math.min(parts.length - 1, Math.floor((i / spb) * parts.length))]);
  }
  return out;
}

export function compose(spec: SongSpec): Score {
  const meter = spec.meter ?? 4;
  const spb = meter * 4;
  const scale = MODES[spec.mode];
  const R = rng(spec.seed ?? hashString(spec.id));
  const tonic = spec.key;
  /** Scale degree (any integer, 0 = tonic) to MIDI, around the melody octave. */
  const deg = (d: number, base = tonic): number => base + Math.floor(d / 7) * 12 + scale[((d % 7) + 7) % 7];
  const chordTones = (root: number): number[] => [root, root + 2, root + 4];
  const avoid = new Set((spec.avoid ?? []).map((a) => a - 1));

  // ---- melodies, one per section letter -------------------------------------------------------
  const letters = [...new Set(spec.form.split(''))];
  const melodies: Record<string, NoteEv[]> = {};
  const cellPool = cellsFor(spec.melody, meter);
  letters.forEach((L, li) => {
    const cmap = chordMap(spec.prog[L], spb);
    const bars = cmap.length / spb;
    const cellA = cellPool[Math.floor(R() * cellPool.length)];
    let cellB = cellPool[Math.floor(R() * cellPool.length)];
    if (cellPool.length > 1 && cellB === cellA) cellB = cellPool[(cellPool.indexOf(cellA) + 1) % cellPool.length];
    // motif contour: scale steps between notes
    const contour: number[] = [];
    let dir = R() < 0.5 ? 1 : -1;
    for (let i = 0; i < 24; i++) {
      const r = R();
      const step = r < 0.12 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
      if (R() < 0.3) dir = -dir;
      contour.push(step * dir);
    }
    const lift = li === 0 ? 0 : li % 2 ? 2 : -1; // B sections sit a little higher
    const notes: NoteEv[] = [];
    let pitch = 2 + lift; // start on the third
    for (let b = 0; b < bars; b++) {
      const phrasePos = b % 4; // 0,1 motif / 2 variation / 3 cadence
      const isCadence = b === bars - 1 || (bars >= 8 && b === 3);
      const cell: [number, number][] = isCadence
        ? meter === 3
          ? [[0, 4], [4, 8]]
          : b === bars - 1
            ? [[0, 4], [4, 4], [8, 8]]
            : [[0, 6], [6, 2], [8, 8]]
        : phrasePos % 2 === 0
          ? cellA
          : cellB;
      // restart the motif at the top of each phrase so the tune repeats like a real hook
      if (phrasePos === 0) pitch = (b >= 4 ? 4 : 2) + lift;
      let ci = phrasePos === 2 ? 5 : phrasePos * 8;
      cell.forEach(([st, ln], ni) => {
        const step = b * spb + st;
        const root = cmap[step];
        const strong = st === 0 || (meter === 4 && st === 8);
        if (ni > 0 || phrasePos !== 0) pitch += contour[ci++ % contour.length];
        // keep the tune in a comfortable range around the tonic
        if (pitch > 9 + lift) pitch -= 3;
        if (pitch < -3) pitch += 3;
        const last = isCadence && ni === cell.length - 1;
        if (last) {
          // resolve: tonic at the end of the section, a chord tone (often the fifth) mid-section
          const target = b === bars - 1 ? (L === letters[0] || R() < 0.6 ? 0 : 4) : 4;
          const opts = [target, target + 7, target - 7];
          pitch = opts.reduce((a, c) => (Math.abs(c - pitch) < Math.abs(a - pitch) ? c : a));
        } else if (strong) {
          const ct = chordTones(root);
          let best = pitch;
          let bd = 99;
          for (let o = -14; o <= 14; o += 7)
            for (const c of ct) {
              const d = Math.abs(c + o - pitch);
              if (d < bd) (bd = d), (best = c + o);
            }
          pitch = best;
        }
        if (avoid.has(((pitch % 7) + 7) % 7)) pitch += R() < 0.5 ? 1 : -1;
        const vel = strong ? 1 : 0.82;
        notes.push({ step, len: ln, midi: deg(pitch) + 12 * (spec.leadOct ?? 0), vel });
      });
    }
    melodies[L] = notes;
  });

  // ---- lay the sections end to end -----------------------------------------------------------
  const tracks: Score['tracks'] = [];
  const lead: NoteEv[] = [];
  const counter: NoteEv[] = [];
  const bass: NoteEv[] = [];
  const parts = spec.parts.map(() => [] as NoteEv[]);
  const drums: DrumEv[] = [];
  let offset = 0;
  const pattern = DRUMS[spec.drums];
  const bassRoot = tonic - 24;
  spec.form.split('').forEach((L, si) => {
    const cmap = chordMap(spec.prog[L], spb);
    const len = cmap.length;
    const lastA = si === spec.form.length - 1;
    for (const n of melodies[L]) {
      lead.push({ ...n, step: n.step + offset });
      if (spec.counter && (L !== spec.form[0] || lastA)) {
        // harmony a diatonic third below (or a sixth when that would sit too low)
        const d = scaleDegreeOf(n.midi - 12 * (spec.leadOct ?? 0), tonic, scale);
        counter.push({ ...n, step: n.step + offset, midi: deg(d - 2) + 12 * (spec.leadOct ?? 0), vel: n.vel * 0.8 });
      }
    }
    const bars = len / spb;
    for (let b = 0; b < bars; b++) {
      const s0 = offset + b * spb;
      // bass
      const rootAt = (i: number) => cmap[b * spb + i];
      bassLine(spec.bass.style, spb, (i) => rootAt(i), (d) => deg(d, bassRoot), b, R).forEach((n) => bass.push({ ...n, step: n.step + s0 }));
      // accompaniment
      spec.parts.forEach((p, pi) => {
        if (p.only && !p.only.includes(L)) return;
        const base = tonic - 12 + 12 * (p.oct ?? 0);
        accomp(p.style, spb, rootAt, (d) => deg(d, base), b).forEach((n) => parts[pi].push({ ...n, step: n.step + s0 }));
      });
      // drums, with a fill on the last bar of each section and a crash at its start
      const fill = b === bars - 1 && spec.drums !== 'none' && spec.drums !== 'spooky' && spec.drums !== 'sneaky';
      for (const [dr, pat] of Object.entries(pattern) as [Drum, string][]) {
        for (let i = 0; i < spb; i++) {
          const c = pat[i % pat.length];
          if (!c || c === '.') continue;
          if (fill && i >= spb / 2 && (dr === 'snare' || dr === 'clap' || dr === 'brush')) continue;
          drums.push({ step: s0 + i, drum: dr, vel: c === 'x' ? 1 : 0.55 });
        }
      }
      if (fill) {
        const fd: Drum = pattern.snare ? 'snare' : pattern.tom || pattern.ltom ? 'tom' : pattern.clap ? 'clap' : 'snare';
        for (let i = spb / 2; i < spb; i += i >= spb - 4 ? 1 : 2) drums.push({ step: s0 + i, drum: fd, vel: 0.5 + (0.5 * (i - spb / 2)) / (spb / 2) });
      }
      if (b === 0 && spec.drums !== 'none' && spec.drums !== 'sneaky') drums.push({ step: s0, drum: spec.drums === 'spooky' ? 'timp' : 'crash', vel: si === 0 ? 1 : 0.7 });
    }
    offset += len;
  });

  tracks.push({ voice: spec.lead, gain: 1, notes: lead });
  if (spec.counter) tracks.push({ voice: spec.counter, gain: 0.55, notes: counter });
  spec.parts.forEach((p, i) => tracks.push({ voice: p.voice, gain: p.gain ?? 0.5, notes: parts[i] }));
  tracks.push({ voice: spec.bass.voice, gain: spec.bass.gain ?? 0.85, notes: bass });
  return { spec, stepsPerBar: spb, totalSteps: offset, tracks, drums };
}

function scaleDegreeOf(midi: number, tonic: number, scale: number[]): number {
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let best = 0;
  for (let i = 0; i < 7; i++) if (scale[i] <= pc) best = i;
  return oct * 7 + best;
}

function bassLine(style: BassStyle, spb: number, root: (i: number) => number, deg: (d: number) => number, bar: number, R: () => number): NoteEv[] {
  const n = (step: number, len: number, d: number, vel = 1): NoteEv => ({ step, len, midi: deg(d), vel });
  const r0 = root(0);
  const half = spb / 2;
  const q = 4;
  const out: NoteEv[] = [];
  switch (style) {
    case 'root':
      out.push(n(0, half - 1, r0), n(half, half - 1, root(half)));
      break;
    case 'oompah':
      for (let i = 0; i < spb; i += q * (spb === 12 ? 3 : 2)) out.push(n(i, 3, root(i)), ...(spb === 16 ? [n(i + 4, 2, root(i) + 4, 0.7)] : []));
      if (spb === 12) out.push(n(0, 3, r0));
      break;
    case 'walking':
      for (let i = 0; i < spb; i += q) {
        const r = root(i);
        const k = i / q;
        const d = k === 0 ? r : k === 1 ? r + 2 : k === 2 ? r + 4 : r + (R() < 0.5 ? 5 : 3);
        out.push(n(i, q - 1, d, k === 0 ? 1 : 0.8));
      }
      break;
    case 'octave':
      for (let i = 0; i < spb; i += 2) out.push(n(i, 1, root(i) + (i % 4 === 2 ? 7 : 0), i % 4 === 0 ? 1 : 0.75));
      break;
    case 'gallop':
      for (let i = 0; i < spb; i += 4) out.push(n(i, 2, root(i)), n(i + 2, 1, root(i) + 4, 0.6), n(i + 3, 1, root(i) + 4, 0.6));
      break;
    case 'pedal':
      out.push(n(0, spb - 1, 0, 0.9));
      break;
    case 'synco':
      out.push(n(0, 2, r0), n(3, 1, r0 + 7, 0.7), n(6, 2, r0), n(10, 2, root(10) + 4, 0.8), n(12, 1, root(12)), n(14, 2, root(14) + 6, 0.7));
      break;
    case 'arp8':
      for (let i = 0; i < spb; i += 2) out.push(n(i, 2, root(i) + [0, 2, 4, 2][(i / 2) % 4], 0.85));
      break;
    case 'boogie':
      for (let i = 0; i < spb; i += 2) out.push(n(i, 2, root(i) + [0, 2, 4, 5, 6, 5, 4, 2][(i / 2) % 8], 0.85));
      break;
    case 'pump':
      for (let i = 0; i < spb; i += 2) out.push(n(i, 1, root(i), i % 4 === 0 ? 1 : 0.7));
      break;
  }
  void bar;
  return out.filter((e) => e.step < spb);
}

function accomp(style: AccStyle, spb: number, root: (i: number) => number, deg: (d: number) => number, bar: number): NoteEv[] {
  const chord = (i: number, len: number, vel = 0.8): NoteEv[] => {
    const r = root(i);
    return [r, r + 2, r + 4].map((d) => ({ step: i, len, midi: deg(d), vel }));
  };
  const out: NoteEv[] = [];
  switch (style) {
    case 'stab':
      for (let i = 4; i < spb; i += 8) out.push(...chord(i, 2));
      break;
    case 'offbeat':
      for (let i = 2; i < spb; i += 4) out.push(...chord(i, 1, 0.7));
      break;
    case 'arp':
      for (let i = 0; i < spb; i += 2) {
        const r = root(i);
        out.push({ step: i, len: 2, midi: deg(r + [0, 2, 4, 7, 4, 2, 0, 2][(i / 2) % 8]), vel: 0.7 });
      }
      break;
    case 'arp16':
      for (let i = 0; i < spb; i++) {
        const r = root(i);
        out.push({ step: i, len: 1, midi: deg(r + [0, 2, 4, 7][i % 4] + (Math.floor(i / 4) % 2) * 7), vel: i % 4 === 0 ? 0.8 : 0.55 });
      }
      break;
    case 'pad':
      if (root(0) === root(spb - 1)) out.push(...chord(0, spb, 0.7));
      else out.push(...chord(0, spb / 2, 0.7), ...chord(spb / 2, spb / 2, 0.7));
      break;
    case 'strum':
      for (const i of spb === 12 ? [0, 6] : [0, 6, 8, 12]) chord(i, 3).forEach((e, k) => out.push({ ...e, step: e.step + k * 0 }));
      break;
    case 'alberti':
      for (let i = 0; i < spb; i += 2) {
        const r = root(i);
        out.push({ step: i, len: 2, midi: deg(r + [0, 4, 2, 4][(i / 2) % 4]), vel: 0.6 });
      }
      break;
    case 'waltz':
      for (let i = 4; i < spb; i += 4) out.push(...chord(i, 3, 0.65));
      break;
    case 'pulse8':
      for (let i = 0; i < spb; i += 2) out.push(...chord(i, 1, i % 4 === 0 ? 0.7 : 0.5));
      break;
    case 'hits':
      if (bar % 2 === 0) out.push(...chord(0, 3, 1), ...chord(6, 2, 0.8));
      else out.push(...chord(0, 6, 0.9));
      break;
  }
  return out;
}
