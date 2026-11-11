/**
 * Synthesized instruments for the music engine. Every sound is built from WebAudio oscillators,
 * filters and one shared noise buffer, so the soundtrack ships with no audio files at all.
 */

export type Voice =
  // leads and melodic voices
  | 'square' | 'pulse' | 'tri' | 'sine' | 'saw' | 'synth' | 'brass' | 'strings' | 'organ' | 'calliope'
  | 'bell' | 'musicbox' | 'marimba' | 'pluck' | 'banjo' | 'koto' | 'harpsi' | 'guitar' | 'steel'
  | 'accordion' | 'whistle' | 'flute' | 'theremin' | 'choir' | 'piano'
  // basses
  | 'bass' | 'tuba' | 'synthbass' | 'upright' | 'sub';

export type Drum =
  | 'kick' | 'snare' | 'hat' | 'ohat' | 'clap' | 'shaker' | 'wood' | 'rim' | 'tom' | 'ltom'
  | 'cow' | 'crash' | 'tamb' | 'timp' | 'brush' | 'sleigh';

export interface VoiceState {
  /** Last frequency played on this track (theremin glides from it). */
  last?: number;
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(ac: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}

/** Gain node with an attack / hold / release envelope. Returns the node; it is freed when sources stop. */
function env(ac: BaseAudioContext, out: AudioNode, t: number, peak: number, a: number, hold: number, r: number, sustain = 1): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (sustain < 1) g.gain.setTargetAtTime(peak * sustain, t + a, Math.max(0.02, hold / 3));
  g.gain.setValueAtTime(peak * (sustain < 1 ? sustain : 1), t + a + hold);
  g.gain.setTargetAtTime(0.0001, t + a + hold, r / 4);
  g.connect(out);
  return g;
}

/** Exponential pluck envelope (no sustain). */
function decay(ac: BaseAudioContext, out: AudioNode, t: number, peak: number, d: number, a = 0.004): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(0.0001, t + a, d / 4);
  g.connect(out);
  return g;
}

function osc(ac: BaseAudioContext, type: OscillatorType, f: number, t: number, stop: number, dest: AudioNode, detune = 0): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

function lp(ac: BaseAudioContext, dest: AudioNode, f: number, q = 0.7): BiquadFilterNode {
  const b = ac.createBiquadFilter();
  b.type = 'lowpass';
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}

function vibrato(ac: BaseAudioContext, o: OscillatorNode, t: number, stop: number, cents: number, rate = 5.5, delay = 0.15): void {
  const l = ac.createOscillator();
  const g = ac.createGain();
  l.frequency.value = rate;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(cents, t + delay + 0.2);
  l.connect(g).connect(o.detune);
  l.start(t);
  l.stop(stop);
}

let pulseWave: PeriodicWave | null = null;
function pulse(ac: BaseAudioContext): PeriodicWave {
  if (pulseWave) return pulseWave;
  // 25% duty pulse from its Fourier series
  const n = 32;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  pulseWave = ac.createPeriodicWave(re, im);
  return pulseWave;
}

/**
 * Play one note. `dur` is the written length in seconds; voices with a natural decay may ring past it.
 */
export function playNote(ac: BaseAudioContext, out: AudioNode, v: Voice, t: number, midi: number, dur: number, vel: number, st: VoiceState): void {
  const f = mtof(midi);
  const end = t + dur;
  switch (v) {
    case 'square':
    case 'pulse': {
      const g = env(ac, lp(ac, out, 4200), t, 0.16 * vel, 0.006, Math.max(0.02, dur - 0.03), 0.06, 0.75);
      const o = ac.createOscillator();
      if (v === 'pulse') o.setPeriodicWave(pulse(ac));
      else o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      vibrato(ac, o, t, end + 0.2, 12, 6, 0.18);
      o.start(t);
      o.stop(end + 0.2);
      break;
    }
    case 'tri':
    case 'sine': {
      const g = env(ac, out, t, (v === 'tri' ? 0.32 : 0.3) * vel, 0.008, Math.max(0.02, dur - 0.03), 0.08, 0.85);
      const o = osc(ac, v === 'tri' ? 'triangle' : 'sine', f, t, end + 0.25, g);
      vibrato(ac, o, t, end + 0.25, 10);
      break;
    }
    case 'saw':
    case 'synth': {
      const filt = lp(ac, out, 1800, v === 'synth' ? 6 : 1);
      filt.frequency.setValueAtTime(v === 'synth' ? 4200 : 2600, t);
      filt.frequency.setTargetAtTime(v === 'synth' ? 1100 : 1600, t, 0.12);
      const g = env(ac, filt, t, 0.1 * vel, 0.01, Math.max(0.02, dur - 0.03), 0.12, 0.8);
      osc(ac, 'sawtooth', f, t, end + 0.3, g, -7);
      osc(ac, 'sawtooth', f, t, end + 0.3, g, 7);
      break;
    }
    case 'brass': {
      const filt = lp(ac, out, 700, 1.2);
      filt.frequency.setValueAtTime(500, t);
      filt.frequency.linearRampToValueAtTime(2800 + f, t + 0.06);
      filt.frequency.setTargetAtTime(1300 + f * 0.5, t + 0.08, 0.15);
      const g = env(ac, filt, t, 0.16 * vel, 0.03, Math.max(0.02, dur - 0.05), 0.08, 0.85);
      const o = osc(ac, 'sawtooth', f, t, end + 0.2, g);
      osc(ac, 'sawtooth', f, t, end + 0.2, g, 9);
      vibrato(ac, o, t, end + 0.2, 9, 5.5, 0.25);
      break;
    }
    case 'strings': {
      const filt = lp(ac, out, 2600);
      const g = env(ac, filt, t, 0.06 * vel, Math.min(0.18, dur * 0.4), Math.max(0.02, dur - 0.1), 0.45, 0.9);
      for (const d of [-11, 0, 12]) {
        const o = osc(ac, 'sawtooth', f, t, end + 0.6, g, d);
        vibrato(ac, o, t, end + 0.6, 8, 5 + d / 20, 0.2);
      }
      break;
    }
    case 'organ':
    case 'calliope': {
      const g = env(ac, out, t, 0.1 * vel, 0.01, Math.max(0.02, dur - 0.03), 0.07);
      const parts = v === 'organ' ? [1, 0.6, 2, 0.35, 3, 0.2, 4, 0.15] : [1, 0.7, 2, 0.4, 4, 0.12];
      for (let i = 0; i < parts.length; i += 2) {
        const gg = ac.createGain();
        gg.gain.value = parts[i + 1];
        gg.connect(g);
        const o = osc(ac, 'sine', f * parts[i], t, end + 0.2, gg);
        if (v === 'calliope') vibrato(ac, o, t, end + 0.2, 22, 6.5, 0.02);
      }
      break;
    }
    case 'bell':
    case 'musicbox': {
      const len = v === 'bell' ? 1.4 : 0.9;
      const g = decay(ac, out, t, (v === 'bell' ? 0.16 : 0.13) * vel, len, 0.002);
      const c = osc(ac, 'sine', f, t, t + len + 0.3, g);
      const m = ac.createOscillator();
      const mg = ac.createGain();
      m.frequency.value = f * (v === 'bell' ? 3.5 : 4);
      mg.gain.setValueAtTime(f * (v === 'bell' ? 2.2 : 1.2), t);
      mg.gain.setTargetAtTime(0, t, 0.2);
      m.connect(mg).connect(c.frequency);
      m.start(t);
      m.stop(t + len + 0.3);
      break;
    }
    case 'marimba': {
      const g = decay(ac, out, t, 0.3 * vel, 0.45);
      osc(ac, 'sine', f, t, t + 0.8, g);
      const g2 = decay(ac, out, t, 0.06 * vel, 0.08);
      osc(ac, 'sine', f * 4, t, t + 0.2, g2);
      break;
    }
    case 'steel': {
      const g = decay(ac, out, t, 0.18 * vel, 0.7, 0.003);
      const o = osc(ac, 'sine', f * 1.01, t, t + 1, g);
      o.frequency.setTargetAtTime(f, t, 0.02);
      const g2 = decay(ac, out, t, 0.08 * vel, 0.35);
      osc(ac, 'sine', f * 2, t, t + 0.6, g2);
      const g3 = decay(ac, out, t, 0.04 * vel, 0.2);
      osc(ac, 'sine', f * 3.02, t, t + 0.4, g3);
      break;
    }
    case 'pluck':
    case 'banjo':
    case 'koto':
    case 'harpsi':
    case 'guitar': {
      const len = { pluck: 0.35, banjo: 0.3, koto: 0.9, harpsi: 0.7, guitar: 0.9 }[v];
      const filt = lp(ac, out, 3000, v === 'koto' ? 3 : 1);
      filt.frequency.setValueAtTime(Math.min(12000, f * (v === 'guitar' ? 6 : 10)), t);
      filt.frequency.setTargetAtTime(f * 1.5, t, len / 3);
      const g = decay(ac, filt, t, (v === 'harpsi' ? 0.11 : 0.18) * vel, len);
      const type: OscillatorType = v === 'banjo' || v === 'harpsi' ? 'square' : v === 'pluck' ? 'triangle' : 'sawtooth';
      const o = osc(ac, type, f, t, t + len + 0.3, g);
      if (v === 'koto') o.frequency.setTargetAtTime(f, t, 0.01), o.frequency.setValueAtTime(f * 1.03, t);
      if (v === 'harpsi') osc(ac, 'sawtooth', f * 2, t, t + len + 0.3, g, 4);
      break;
    }
    case 'piano': {
      const filt = lp(ac, out, 3000);
      filt.frequency.setValueAtTime(Math.min(9000, f * 8), t);
      filt.frequency.setTargetAtTime(f * 2, t, 0.3);
      const g = decay(ac, filt, t, 0.2 * vel, Math.max(0.6, dur * 1.2), 0.003);
      osc(ac, 'triangle', f, t, end + 1, g);
      osc(ac, 'sawtooth', f, t, end + 1, lp(ac, g, f * 3), 5);
      break;
    }
    case 'accordion': {
      const filt = lp(ac, out, 2400);
      const g = env(ac, filt, t, 0.08 * vel, 0.025, Math.max(0.02, dur - 0.04), 0.06);
      osc(ac, 'square', f, t, end + 0.2, g, -6);
      osc(ac, 'square', f, t, end + 0.2, g, 6);
      osc(ac, 'sawtooth', f * 2, t, end + 0.2, g, 3);
      break;
    }
    case 'whistle':
    case 'flute': {
      const g = env(ac, out, t, (v === 'whistle' ? 0.22 : 0.2) * vel, v === 'whistle' ? 0.03 : 0.05, Math.max(0.02, dur - 0.05), 0.1, 0.9);
      const o = osc(ac, 'sine', f * (v === 'whistle' ? 2 : 1), t, end + 0.3, g);
      if (v === 'whistle') {
        o.frequency.setValueAtTime(f * 2 * 0.94, t);
        o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.05);
      }
      vibrato(ac, o, t, end + 0.3, v === 'whistle' ? 18 : 12, 5.2, 0.2);
      if (v === 'flute') {
        const b = ac.createBufferSource();
        b.buffer = noise(ac);
        const bf = ac.createBiquadFilter();
        bf.type = 'bandpass';
        bf.frequency.value = f * 2;
        bf.Q.value = 2;
        const bg = decay(ac, out, t, 0.04 * vel, 0.12);
        b.connect(bf).connect(bg);
        b.start(t);
        b.stop(t + 0.2);
      }
      break;
    }
    case 'theremin': {
      const g = env(ac, out, t, 0.22 * vel, 0.08, Math.max(0.02, dur - 0.06), 0.2, 0.9);
      const o = osc(ac, 'sine', st.last ?? f, t, end + 0.4, g);
      o.frequency.setTargetAtTime(f, t, 0.05);
      vibrato(ac, o, t, end + 0.4, 28, 6, 0.08);
      break;
    }
    case 'choir': {
      const g = env(ac, out, t, 0.12 * vel, Math.min(0.25, dur * 0.4), Math.max(0.02, dur - 0.15), 0.5);
      for (const [fq, q, gain] of [[500, 6, 1], [900, 7, 0.5], [2400, 8, 0.25]] as const) {
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fq;
        bp.Q.value = q;
        const gg = ac.createGain();
        gg.gain.value = gain * 3;
        bp.connect(gg).connect(g);
        for (const d of [-9, 9]) {
          const o = osc(ac, 'sawtooth', f, t, end + 0.6, bp, d);
          vibrato(ac, o, t, end + 0.6, 10, 4.8, 0.2);
        }
      }
      break;
    }
    case 'bass': {
      const g = env(ac, lp(ac, out, 700), t, 0.4 * vel, 0.006, Math.max(0.02, dur - 0.04), 0.05, 0.8);
      osc(ac, 'triangle', f, t, end + 0.15, g);
      osc(ac, 'square', f, t, end + 0.15, g).connect(lp(ac, g, 400));
      break;
    }
    case 'tuba': {
      const filt = lp(ac, out, 450, 1);
      filt.frequency.setValueAtTime(300, t);
      filt.frequency.linearRampToValueAtTime(900, t + 0.04);
      filt.frequency.setTargetAtTime(420, t + 0.05, 0.1);
      const g = env(ac, filt, t, 0.38 * vel, 0.02, Math.max(0.02, dur - 0.05), 0.06, 0.8);
      osc(ac, 'sawtooth', f, t, end + 0.15, g);
      break;
    }
    case 'synthbass': {
      const filt = lp(ac, out, 600, 8);
      filt.frequency.setValueAtTime(2200, t);
      filt.frequency.setTargetAtTime(280, t, 0.06);
      const g = env(ac, filt, t, 0.3 * vel, 0.004, Math.max(0.02, dur - 0.03), 0.04, 0.85);
      osc(ac, 'sawtooth', f, t, end + 0.1, g);
      osc(ac, 'square', f / 2, t, end + 0.1, g);
      break;
    }
    case 'upright': {
      const g = decay(ac, lp(ac, out, 900), t, 0.45 * vel, Math.max(0.35, dur), 0.006);
      osc(ac, 'sine', f, t, end + 0.6, g);
      break;
    }
    case 'sub': {
      const g = env(ac, out, t, 0.45 * vel, 0.01, Math.max(0.02, dur - 0.03), 0.08);
      osc(ac, 'sine', f, t, end + 0.2, g);
      break;
    }
  }
  st.last = f;
}

/** Play one drum hit. */
export function playDrum(ac: BaseAudioContext, out: AudioNode, d: Drum, t: number, vel: number): void {
  const nz = (dur: number, type: BiquadFilterType, fq: number, peak: number, q = 0.8, at = t): void => {
    const s = ac.createBufferSource();
    s.buffer = noise(ac);
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = fq;
    f.Q.value = q;
    const g = decay(ac, out, at, peak * vel, dur, 0.002);
    s.connect(f).connect(g);
    const off = Math.random() * 1.5;
    s.start(at, off);
    s.stop(at + dur + 0.1);
  };
  const tone = (f0: number, f1: number, sweep: number, dur: number, peak: number, type: OscillatorType = 'sine'): void => {
    const g = decay(ac, out, t, peak * vel, dur, 0.002);
    const o = osc(ac, type, f0, t, t + dur + 0.2, g);
    o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  };
  switch (d) {
    case 'kick':
      tone(160, 42, 0.1, 0.32, 0.9);
      break;
    case 'snare':
      nz(0.16, 'bandpass', 1900, 0.5, 0.7);
      tone(210, 160, 0.05, 0.08, 0.25, 'triangle');
      break;
    case 'brush':
      nz(0.12, 'bandpass', 3200, 0.22, 0.5);
      break;
    case 'hat':
      nz(0.035, 'highpass', 7500, 0.22);
      break;
    case 'ohat':
      nz(0.22, 'highpass', 7000, 0.18);
      break;
    case 'clap':
      for (let i = 0; i < 3; i++) nz(i === 2 ? 0.14 : 0.02, 'bandpass', 1300, 0.45, 1, t + i * 0.011);
      break;
    case 'shaker':
      nz(0.05, 'highpass', 5500, 0.13);
      break;
    case 'sleigh':
      for (let i = 0; i < 4; i++) nz(0.06, 'bandpass', 9000, 0.14, 4, t + i * 0.018);
      break;
    case 'tamb':
      for (let i = 0; i < 3; i++) nz(0.05, 'highpass', 8000, 0.16, 1, t + i * 0.015);
      break;
    case 'wood':
      tone(1100, 1000, 0.02, 0.05, 0.35);
      break;
    case 'rim':
      tone(1700, 1600, 0.01, 0.025, 0.2, 'square');
      nz(0.02, 'highpass', 3000, 0.2);
      break;
    case 'tom':
      tone(240, 150, 0.12, 0.25, 0.6);
      break;
    case 'ltom':
      tone(150, 90, 0.15, 0.32, 0.7);
      break;
    case 'cow': {
      const g = decay(ac, lp(ac, out, 3000), t, 0.12 * vel, 0.2);
      osc(ac, 'square', 545, t, t + 0.4, g);
      osc(ac, 'square', 815, t, t + 0.4, g);
      break;
    }
    case 'crash':
      nz(1.2, 'highpass', 4500, 0.2);
      break;
    case 'timp':
      tone(98, 88, 0.3, 0.9, 0.8);
      nz(0.08, 'lowpass', 400, 0.3);
      break;
  }
}
