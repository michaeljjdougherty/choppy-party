/**
 * Tiny synthesized sound effects (WebAudio, no files). Everything is bright and bouncy:
 * pitch sweeps up for good things and down for bad things.
 */
let ac: AudioContext | null = null;
let master: GainNode | null = null;

function ctx(): AudioContext | null {
  if (!ac) {
    try {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = 0.35 * sfxVol;
      master.connect(ac.destination);
    } catch {
      return null;
    }
  }
  return ac;
}

const SFX_KEY = 'choppy.sfxVolume';
let sfxVol = 1;
try {
  const v = localStorage.getItem(SFX_KEY);
  if (v !== null) sfxVol = Math.max(0, Math.min(1, Number(v)));
} catch {
  /* private mode */
}
/** Sound effects volume, 0..1 (remembered between visits). */
export function sfxVolume(): number {
  return sfxVol;
}
export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v));
  if (master && ac) master.gain.setTargetAtTime(0.35 * sfxVol, ac.currentTime, 0.03);
  try {
    localStorage.setItem(SFX_KEY, String(sfxVol));
  } catch {
    /* private mode */
  }
}

/** Browsers only allow audio after a user gesture, so call this on the first key/pad/click. */
export function unlockAudio(): void {
  const a = ctx();
  if (a && a.state === 'suspended') void a.resume();
}

function tone(freq: number, to: number, dur: number, type: OscillatorType = 'square', vol = 0.25, delay = 0): void {
  const a = ctx();
  if (!a || !master || a.state !== 'running') return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.3, cutoff = 1200): void {
  const a = ctx();
  if (!a || !master || a.state !== 'running') return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

// ---- recorded sounds (Kenney Interface Sounds, Impact Sounds, UI Audio) ------------------------
const SAMPLES = [
  'move', 'select', 'back', 'join', 'leave', 'lose', 'drop', 'gem', 'bong', 'pluck', 'step1', 'step2', 'bump', 'bump-big',
  'land', 'thud', 'bell', 'plate', 'wood', 'metal', 'glass', 'switch', 'click',
] as const;
type Sample = (typeof SAMPLES)[number];
const buffers = new Map<Sample, AudioBuffer>();

/** Fetch and decode every sample. Safe to call before the first click (the context starts suspended). */
export async function loadSamples(): Promise<void> {
  const a = ctx();
  if (!a) return;
  await Promise.all(
    SAMPLES.map(async (n) => {
      try {
        const res = await fetch(`sfx/${n}.ogg`);
        buffers.set(n, await a.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // missing or undecodable: the synth fallback plays instead
      }
    }),
  );
}

/** Play a sample with a little random pitch so repeats don't sound robotic. Returns false if unavailable. */
function play(n: Sample, vol = 0.6, pitch = 1, jitter = 0.08): boolean {
  const a = ctx();
  const buf = buffers.get(n);
  if (!a || !master || !buf || a.state !== 'running') return false;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * jitter);
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return true;
}
let stepFlip = false;

export const sfx = {
  /** Highlighting a different menu item or button. */
  move: () => play('move', 0.5, 1, 0.03) || tone(520, 640, 0.06, 'triangle', 0.18),
  /** The mouse moving onto a button: a lighter tick than the stick/keys highlight. */
  hover: () => play('click', 0.35, 1.25, 0.04) || tone(900, 1000, 0.03, 'triangle', 0.1),
  select: () => {
    if (play('select', 0.7, 1, 0)) return;
    tone(660, 990, 0.09, 'square', 0.15);
    tone(990, 1320, 0.1, 'square', 0.12, 0.07);
  },
  back: () => play('back', 0.6, 1, 0) || tone(500, 300, 0.1, 'triangle', 0.18),
  join: () => {
    if (play('join', 0.7, 1.1, 0.05)) return;
    tone(400, 800, 0.12, 'triangle', 0.22);
    tone(800, 1200, 0.1, 'triangle', 0.16, 0.08);
  },
  leave: () => play('leave', 0.6) || tone(500, 300, 0.1, 'triangle', 0.18),
  boing: () => {
    play('bump-big', 0.6);
    tone(180, 520, 0.16, 'sine', 0.22);
  },
  bump: () => play('bump', 0.55, 1.1, 0.15),
  land: () => play('land', 0.4, 1.2, 0.15),
  gem: () => play('gem', 0.6) || tone(1500, 2400, 0.15, 'sine', 0.15),
  plate: () => play('plate', 0.35, 1.2, 0.2),
  bell: () => play('bell', 0.5, 1, 0),
  step: () => {
    stepFlip = !stepFlip;
    play(stepFlip ? 'step1' : 'step2', 0.7, 1.1, 0.1) || tone(300, 460, 0.07, 'sine', 0.2);
    tone(320, 520, 0.06, 'sine', 0.08);
  },
  /** The die spinning: clicks that speed up for a second. */
  diceSpin: () => {
    let at = 0;
    for (let i = 0; i < 14; i++) {
      tone(700 + (i % 3) * 120, 640, 0.03, 'square', 0.06, at);
      at += 0.13 - i * 0.0065;
    }
  },
  /** The number lands. */
  diceHit: () => {
    tone(523, 523, 0.12, 'square', 0.12);
    tone(659, 659, 0.12, 'square', 0.12, 0.08);
    tone(1047, 1047, 0.3, 'square', 0.12, 0.16);
  },
  dice: () => {
    for (let i = 0; i < 4; i++) tone(900 + i * 140, 700, 0.04, 'square', 0.08, i * 0.05);
  },
  coin: () => {
    tone(988, 988, 0.06, 'square', 0.12);
    tone(1319, 1319, 0.16, 'square', 0.12, 0.06);
  },
  lose: () => play('lose', 0.5) || tone(420, 160, 0.3, 'sawtooth', 0.12),
  boom: () => {
    play('thud', 0.8, 0.8, 0.1);
    noise(0.45, 0.5, 700);
    tone(120, 40, 0.4, 'sine', 0.4);
  },
  horn: () => {
    // a two-tone steam whistle
    tone(392, 392, 0.5, 'sawtooth', 0.07);
    tone(494, 494, 0.5, 'sawtooth', 0.06);
  },
  whistle: () => {
    tone(1900, 2100, 0.12, 'sine', 0.18);
    tone(2100, 1900, 0.35, 'sine', 0.18, 0.14);
  },
  /** Count-in beep: 3, 2, 1. */
  count: (n: number) => tone(n === 1 ? 880 : 660, n === 1 ? 880 : 660, 0.16, 'square', 0.12),
  /** GO! A bright chord with a whoosh. */
  go: () => {
    [523, 784, 1047, 1319].forEach((f) => tone(f, f * 1.01, 0.42, 'square', 0.07));
    noise(0.35, 0.18, 2400);
  },
  /** End of a minigame: whistle and a thump. */
  finish: () => {
    tone(1900, 2100, 0.12, 'sine', 0.2);
    tone(2100, 1500, 0.5, 'sine', 0.2, 0.14);
    tone(110, 40, 0.35, 'sine', 0.45);
    noise(0.3, 0.3, 500);
  },
  /** A crowd-ish cheer made of filtered noise swells. */
  cheer: () => {
    for (let i = 0; i < 5; i++) setTimeout(() => noise(0.5, 0.12, 1400 + i * 300), i * 120);
  },
  /** Big win: a longer fanfare that climbs and holds. */
  victory: () => {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, f, i === notes.length - 1 ? 0.8 : 0.14, 'square', 0.12, i * 0.13));
    notes.forEach((f, i) => tone(f / 2, f / 2, i === notes.length - 1 ? 0.8 : 0.14, 'triangle', 0.1, i * 0.13));
  },
  /** A new turn: a rising brass stab and a whoosh. */
  turn: () => {
    noise(0.3, 0.14, 1800);
    [392, 523, 659].forEach((f, i) => tone(f, f * 1.005, i === 2 ? 0.32 : 0.1, 'square', 0.09, 0.05 + i * 0.07));
    tone(196, 196, 0.4, 'triangle', 0.12, 0.19);
  },
  /** Shanty Shuffle: one beat of the backing tune (a stomp and a squeezebox note from an original D-minor line). */
  shantyBeat: (i: number) => {
    const line = [294, 349, 440, 392, 349, 330, 294, 262, 294, 349, 440, 523, 494, 440, 392, 440];
    noise(0.07, i % 2 ? 0.12 : 0.22, 380);
    const f = line[i % line.length];
    tone(f, f, 0.18, 'square', 0.05);
    tone(f / 2, f / 2, 0.22, 'triangle', 0.08);
  },
  /** A rhythm-game hit or miss. */
  hit: (perfect: boolean) => play('pluck', 0.45, perfect ? 1.25 : 1, 0.02) || tone(perfect ? 988 : 784, perfect ? 1175 : 880, 0.07, 'triangle', 0.12),
  /** A bomb fuse tick (higher when it's nearly out). */
  tick: (urgency: number): void => tone(1100 + urgency * 700, 1000 + urgency * 700, 0.035, 'square', 0.06 + urgency * 0.05),
  miss: () => play('wood', 0.4, 0.7, 0.05) || tone(220, 160, 0.1, 'sawtooth', 0.08),
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, i === 3 ? 0.45 : 0.13, 'square', 0.13, i * 0.12));
  },
};
