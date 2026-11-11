/**
 * Plays scores in real time: a look-ahead scheduler that queues notes slightly ahead of the audio
 * clock, loops each song forever, and crossfades from one song to the next.
 */
import { compose, type Score, type SongSpec } from './compose';
import { LEVELS } from './levels';
import { playDrum, playNote, type VoiceState } from './voices';

const LOOKAHEAD = 0.25; // seconds of notes queued ahead
const TICK_MS = 40;

interface Player {
  id: string;
  score: Score;
  out: GainNode;
  step: number;
  nextT: number;
  stopping: boolean;
  states: VoiceState[];
}

export class MusicEngine {
  ac: AudioContext | null = null;
  private master!: GainNode;
  private duckGain!: GainNode;
  private dry!: GainNode;
  private reverbIn!: GainNode;
  private echoIn!: GainNode;
  private players: Player[] = [];
  private scores = new Map<string, Score>();
  private file: { id: string; el: HTMLAudioElement; out: GainNode } | null = null;
  private fileOn = false;
  /** Called when a recorded track can't be loaded. */
  onFileError: ((id: string) => void) | null = null;
  volume = 0.7;
  tempo = 1;

  private ensure(): AudioContext | null {
    if (this.ac) return this.ac;
    try {
      const ac = new AudioContext();
      this.ac = ac;
      this.master = ac.createGain();
      this.master.gain.value = this.volume;
      this.duckGain = ac.createGain();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      this.duckGain.connect(this.master).connect(comp).connect(ac.destination);
      this.dry = ac.createGain();
      this.dry.connect(this.duckGain);
      // hall reverb from a generated impulse
      const conv = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 2.2);
      const imp = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = imp.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      }
      conv.buffer = imp;
      this.reverbIn = ac.createGain();
      this.reverbIn.connect(conv).connect(this.duckGain);
      // echo (dotted-eighth style feedback delay)
      const dl = ac.createDelay(1.5);
      dl.delayTime.value = 0.33;
      const fb = ac.createGain();
      fb.gain.value = 0.38;
      const tone = ac.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      this.echoIn = ac.createGain();
      this.echoIn.connect(dl).connect(tone).connect(fb).connect(dl);
      tone.connect(this.duckGain);
      setInterval(() => this.tick(), TICK_MS);
    } catch {
      this.ac = null;
    }
    return this.ac;
  }

  /** Browsers start audio suspended: call this from a key, click or pad press. */
  unlock(): void {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') void ac.resume();
    if (this.file?.el.paused) this.file.el.play().catch(() => {});
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ac) this.master.gain.setTargetAtTime(this.volume, this.ac.currentTime, 0.05);
  }

  /** A frequency analyser on the music output (for visualizers). */
  analyser(): AnalyserNode | null {
    const ac = this.ensure();
    if (!ac) return null;
    const an = ac.createAnalyser();
    an.fftSize = 256;
    this.master.connect(an);
    return an;
  }

  /** Lower the music (pause menus, Brian talking) without stopping it. */
  duck(level: number): void {
    if (this.ac) this.duckGain.gain.setTargetAtTime(level, this.ac.currentTime, 0.15);
  }

  current(): string | null {
    const live = this.players.find((p) => !p.stopping);
    return live?.id ?? (this.fileOn ? (this.file?.id ?? null) : null);
  }

  private scoreFor(spec: SongSpec): Score {
    let s = this.scores.get(spec.id);
    if (!s) this.scores.set(spec.id, (s = compose(spec)));
    return s;
  }

  /** Crossfade to a generated song. Calling again with the playing song does nothing. */
  playSong(spec: SongSpec, fade = 0.8): void {
    const ac = this.ensure();
    if (!ac) return;
    const live = this.players.find((p) => !p.stopping);
    if (live?.id === spec.id) return;
    this.stopAll(fade);
    const score = this.scoreFor(spec);
    const out = ac.createGain();
    const lvl = 0.9 * (spec.gain ?? 1) * (LEVELS[spec.id] ?? 1);
    out.gain.setValueAtTime(0.0001, ac.currentTime);
    out.gain.linearRampToValueAtTime(lvl, ac.currentTime + Math.max(0.05, fade * 0.6));
    out.connect(this.dry);
    const rv = ac.createGain();
    rv.gain.value = spec.reverb ?? 0.18;
    out.connect(rv).connect(this.reverbIn);
    if (spec.echo) {
      const ec = ac.createGain();
      ec.gain.value = spec.echo;
      out.connect(ec).connect(this.echoIn);
    }
    this.players.push({ id: spec.id, score, out, step: 0, nextT: ac.currentTime + 0.12, stopping: false, states: score.tracks.map(() => ({})) });
  }

  /** Crossfade to a recorded track (an mp3 / ogg file next to the game). */
  playFile(id: string, src: string, gain = 1, fade = 0.8): void {
    const ac = this.ensure();
    if (!ac) return;
    if (this.fileOn && this.file?.id === id) return;
    this.stopAll(fade);
    this.fileOn = true;
    if (!this.file || this.file.id !== id) {
      try {
        const el = new Audio(src);
        el.loop = true;
        el.addEventListener('error', () => {
          if (this.file?.el === el) (this.fileOn = false), (this.file = null);
          this.onFileError?.(id);
        });
        const out = ac.createGain();
        ac.createMediaElementSource(el).connect(out).connect(this.dry);
        this.file = { id, el, out };
      } catch {
        return;
      }
    }
    const f = this.file;
    f.out.gain.cancelScheduledValues(ac.currentTime);
    f.out.gain.setValueAtTime(0.0001, ac.currentTime);
    f.out.gain.linearRampToValueAtTime(0.6 * gain, ac.currentTime + fade);
    f.el.currentTime = 0;
    f.el.play().catch(() => {});
  }

  stopAll(fade = 0.8): void {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    for (const p of this.players) {
      if (p.stopping) continue;
      p.stopping = true;
      p.out.gain.cancelScheduledValues(now);
      p.out.gain.setValueAtTime(p.out.gain.value, now);
      p.out.gain.linearRampToValueAtTime(0.0001, now + fade);
      setTimeout(() => {
        p.out.disconnect();
        this.players = this.players.filter((x) => x !== p);
      }, (fade + LOOKAHEAD + 2) * 1000);
    }
    if (this.file && this.fileOn) {
      this.fileOn = false;
      const f = this.file;
      f.out.gain.cancelScheduledValues(now);
      f.out.gain.setValueAtTime(f.out.gain.value, now);
      f.out.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => {
        if (!this.fileOn) f.el.pause();
      }, fade * 1000 + 50);
    }
  }

  private tick(): void {
    const ac = this.ac;
    if (!ac || ac.state !== 'running') return;
    const horizon = ac.currentTime + LOOKAHEAD;
    for (const p of this.players) {
      if (p.stopping) continue;
      const sc = p.score;
      const sp = sc.spec;
      const stepDur = 60 / (sp.bpm * this.tempo) / 4;
      // after a stall (tab in the background) skip ahead instead of firing a burst of notes
      if (p.nextT < ac.currentTime - 0.2) p.nextT = ac.currentTime + 0.05;
      while (p.nextT < horizon) {
        const s = p.step % sc.totalSteps;
        const swing = sp.swing && s % 4 === 2 ? sp.swing * stepDur * 2 - stepDur : 0;
        const t = p.nextT + Math.max(0, swing);
        sc.tracks.forEach((tr, ti) => {
          for (const n of tr.notes) {
            if (n.step !== s) continue;
            playNote(ac, p.out, tr.voice, t, n.midi, n.len * stepDur * 0.95, n.vel * tr.gain, p.states[ti]);
          }
        });
        for (const d of sc.drums) if (d.step === s) playDrum(ac, p.out, d.drum, t, d.vel * 0.8);
        p.step++;
        p.nextT += stepDur;
      }
    }
  }

  /** Render a song offline (tests and the jukebox's waveform). */
  static async render(spec: SongSpec, seconds: number, rate = 22050): Promise<AudioBuffer> {
    const oc = new OfflineAudioContext(1, Math.floor(seconds * rate), rate);
    const sc = compose(spec);
    const out = oc.createGain();
    out.gain.value = 0.9 * (spec.gain ?? 1);
    out.connect(oc.destination);
    const stepDur = 60 / spec.bpm / 4;
    const states = sc.tracks.map(() => ({}));
    for (let k = 0; k * stepDur < seconds; k++) {
      const s = k % sc.totalSteps;
      const t = k * stepDur;
      sc.tracks.forEach((tr, ti) => tr.notes.forEach((n) => n.step === s && playNote(oc, out, tr.voice, t, n.midi, n.len * stepDur * 0.95, n.vel * tr.gain, states[ti])));
      for (const d of sc.drums) if (d.step === s) playDrum(oc, out, d.drum, t, d.vel * 0.8);
    }
    return oc.startRendering();
  }
}
