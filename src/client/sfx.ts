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
      master.gain.value = 0.35;
      master.connect(ac.destination);
    } catch {
      return null;
    }
  }
  return ac;
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

export const sfx = {
  move: () => tone(520, 640, 0.06, 'triangle', 0.18),
  select: () => {
    tone(660, 990, 0.09, 'square', 0.15);
    tone(990, 1320, 0.1, 'square', 0.12, 0.07);
  },
  back: () => tone(500, 300, 0.1, 'triangle', 0.18),
  join: () => {
    tone(400, 800, 0.12, 'triangle', 0.22);
    tone(800, 1200, 0.1, 'triangle', 0.16, 0.08);
  },
  boing: () => tone(180, 520, 0.16, 'sine', 0.3),
  step: () => tone(300, 460, 0.07, 'sine', 0.2),
  dice: () => {
    for (let i = 0; i < 4; i++) tone(900 + i * 140, 700, 0.04, 'square', 0.08, i * 0.05);
  },
  coin: () => {
    tone(988, 988, 0.06, 'square', 0.12);
    tone(1319, 1319, 0.16, 'square', 0.12, 0.06);
  },
  lose: () => tone(420, 160, 0.3, 'sawtooth', 0.12),
  boom: () => {
    noise(0.45, 0.5, 700);
    tone(120, 40, 0.4, 'sine', 0.4);
  },
  whistle: () => {
    tone(1900, 2100, 0.12, 'sine', 0.18);
    tone(2100, 1900, 0.35, 'sine', 0.18, 0.14);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, i === 3 ? 0.45 : 0.13, 'square', 0.13, i * 0.12));
  },
};
