import type { GrabEvent, InputManager } from './input';
import { roundRect, text } from '../shared/draw';
import { button, clicked, inside, pointerAt, takeStrayClick } from './ui';
import { A, B, STICK, isTouch, promptKind } from './prompts';
import { COMPOSER, music, ostTracks, type OstTrack } from './soundtrack';
import { sfx } from './sfx';
import { sunburst } from './showtime';

/**
 * "Choppy Party - OST": DJ Tuna's jukebox, opened from the main menu. Only Michael's recorded
 * songs are listed. The cover thumps on the bass, the glow behind it flares on each beat and
 * confetti flies, so the screen dances to whatever is on. Like Settings, it takes every controller, keyboard and
 * touch button while open (input.grab); mouse and touch click rows and buttons directly.
 *
 *   up / down   pick a track        A   play it (A on the one playing pauses / carries on)
 *   left/right  previous / next     B   back to the menu
 */
const LIST = { x: 560, y: 150, w: 660, rowH: 50, rows: 9 };
const CARD = { x: 60, y: 130, w: 460, h: 520 };
/** Michael's album cover (DJ Tuna at the decks). */
const cover = new Image();
cover.src = 'ost-cover.jpg';
const NEON = ['#ff3ea5', '#ffe14d', '#3ef0ff', '#9a5bff', '#5dff6a', '#ff8a1f'];
const COLORS = ['#ff4d5a', '#ff8a1f', '#ffd23f', '#21c45a', '#2f8cff', '#9a5bff'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  color: string;
  note: boolean;
}

export class OstScreen {
  open = false;
  private tracks: OstTrack[] = [];
  private sel = 0;
  private playing = 0;
  private top = 0;
  private openedAt = 0;
  /** Seconds a generated song has played (they loop, so there is no length to show). */
  private elapsed = 0;
  private spin = 0;
  private lastT = 0;
  private onClose: (() => void) | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  /** Smoothed loudness of the bass, the mids and everything (0..1). */
  private bass = 0;
  private mid = 0;
  private level = 0;
  /** Running average of the bass, so a beat is a jump above it. */
  private bassAvg = 0;
  /** 1 on a beat, fading to 0. */
  private kick = 0;
  private sinceKick = 0;
  /** Beats so far: the glow changes colour on each one. */
  private beats = 0;
  private bits: Bit[] = [];

  constructor(private input: InputManager) {
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.open) return;
        this.scroll(Math.sign(e.deltaY) * 2);
      },
      { passive: true },
    );
  }

  show(onClose?: () => void): void {
    if (this.open) return;
    this.tracks = ostTracks();
    this.bits = [];
    this.open = true;
    this.openedAt = performance.now();
    this.onClose = onClose ?? null;
    // start on whatever the menu is playing (the main theme), so nothing cuts out
    const now = this.tracks.findIndex((x) => x.id === (music.current() ?? 'menu'));
    this.playing = this.sel = Math.max(0, now);
    this.top = 0;
    this.elapsed = 0;
    music.override(this.tracks[this.playing].id);
    this.input.grab = (e) => this.handle(e);
    takeStrayClick();
    sfx.select();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.input.grab = null;
    music.setPaused(false);
    music.override(null);
    sfx.back();
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }

  private handle(e: GrabEvent): void {
    if (!this.open) return;
    if (e.kind === 'b') return this.close();
    if (e.kind === 'move') {
      if (e.y) {
        this.sel = (this.sel + e.y + this.tracks.length) % this.tracks.length;
        this.keepInView();
        sfx.move();
      } else if (e.x) this.skip(e.x);
      return;
    }
    if (this.sel === this.playing) this.togglePause();
    else this.play(this.sel);
  }

  private play(i: number): void {
    this.playing = i;
    this.elapsed = 0;
    music.override(this.tracks[i].id);
    this.burst(CARD.x + CARD.w / 2, CARD.y + 140, 40);
    sfx.move();
  }

  private skip(dir: number): void {
    this.sel = (this.playing + dir + this.tracks.length) % this.tracks.length;
    this.keepInView();
    this.play(this.sel);
  }

  private togglePause(): void {
    music.setPaused(!music.paused());
    sfx.move();
  }

  private scroll(n: number): void {
    this.top = Math.max(0, Math.min(this.tracks.length - LIST.rows, this.top + n));
  }

  private keepInView(): void {
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + LIST.rows) this.top = this.sel - LIST.rows + 1;
  }

  /** Read the music: bass, mids, overall level, and whether a beat just hit. */
  private listen(dt: number, paused: boolean): void {
    const an = paused ? null : music.analyser();
    let bass = 0;
    let mid = 0;
    let all = 0;
    if (an) {
      if (!this.freq || this.freq.length !== an.frequencyBinCount) this.freq = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
      an.getByteFrequencyData(this.freq);
      const f = this.freq;
      const avg = (a: number, b: number) => {
        let s = 0;
        for (let i = a; i < b; i++) s += f[i];
        return s / ((b - a) * 255);
      };
      bass = avg(1, 6);
      mid = avg(8, 40);
      all = avg(1, 80);
    }
    const ease = (cur: number, want: number, up: number, down: number) => cur + (want - cur) * Math.min(1, dt * (want > cur ? up : down));
    this.bass = ease(this.bass, bass, 30, 8);
    this.mid = ease(this.mid, mid, 20, 6);
    this.level = ease(this.level, all, 20, 4);
    this.bassAvg += (bass - this.bassAvg) * Math.min(1, dt * 1.5);
    this.sinceKick += dt;
    this.kick = Math.max(0, this.kick - dt * 3.5);
    if (bass > 0.3 && bass > this.bassAvg * 1.18 && this.sinceKick > 0.28) {
      this.kick = 1;
      this.sinceKick = 0;
      this.beats++;
      if (this.beats % 2 === 0) this.burst(CARD.x + CARD.w / 2, CARD.y + 140, 10);
    }
  }

  /** Throw confetti and music notes out from a point. */
  private burst(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 150 + Math.random() * 380;
      this.bits.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 160,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        life: 1.4 + Math.random() * 0.8,
        color: NEON[i % NEON.length],
        note: Math.random() < 0.25,
      });
    }
    if (this.bits.length > 260) this.bits.splice(0, this.bits.length - 260);
  }

  private confetti(ctx: CanvasRenderingContext2D, dt: number): void {
    for (const b of this.bits) {
      b.vy += 520 * dt;
      b.vx *= 1 - dt * 0.8;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0 && b.y < 760);
    for (const b of this.bits) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life * 1.5);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      if (b.note) {
        text(ctx, '♪', 0, 0, 26, { color: b.color, outline: false, weight: 900 });
      } else {
        ctx.fillStyle = b.color;
        ctx.fillRect(-6, -3, 12, 6);
      }
      ctx.restore();
    }
  }

  /** Draw the screen and handle mouse / touch. Call last, so it sits over everything. */
  draw(ctx: CanvasRenderingContext2D, t: number): void {
    if (!this.open) return;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const paused = music.paused();
    this.listen(dt, paused);
    if (!paused) {
      this.elapsed += dt;
      this.spin += dt * (2 + this.level * 3);
    }
    const fresh = performance.now() - this.openedAt < 150;

    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#2a1b5e');
    g.addColorStop(1, '#120a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    // a glow behind the card that swells with the bass and changes colour on each beat
    const hue = NEON[this.beats % NEON.length];
    const gr = 360 + this.bass * 140 + this.kick * 60;
    const rg = ctx.createRadialGradient(CARD.x + CARD.w / 2, 300, 20, CARD.x + CARD.w / 2, 300, gr);
    rg.addColorStop(0, withAlpha(hue, 0.35 + this.kick * 0.3));
    rg.addColorStop(1, withAlpha(hue, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 1280, 720);
    sunburst(ctx, CARD.x + CARD.w / 2, 300, 420 + this.bass * 80, t, '#9a5bff', 0.16 + this.kick * 0.12, 16);

    // title
    text(ctx, 'CHOPPY PARTY - OST', 640, 52, 44, { color: '#ffe14d' });
    text(ctx, `Original Soundtrack  ·  Music by ${COMPOSER}`, 640, 96, 20, { color: '#d9ccff', weight: 700 });
    if (button(ctx, 'Back', 24, 22, 120, 52, { color: '#6b6f86', size: 22, sound: 'none' })) return this.close();

    this.nowPlaying(ctx, t, paused);
    this.list(ctx, t, paused, fresh);
    this.confetti(ctx, dt);

    const k = promptKind();
    const hint =
      k === 'pad'
        ? `${STICK()} up/down pick  ·  left/right skip   ·   ${A()} play / pause   ·   ${B()} back`
        : k === 'mouse'
          ? `${isTouch() ? 'Tap' : 'Click'} a track to play it`
          : `Up/Down: pick   ·   Left/Right: skip   ·   ${A()}: play / pause   ·   Esc: back`;
    text(ctx, hint, 640, 694, 17, { color: '#bfb3ec', weight: 700 });
    takeStrayClick();
  }

  private nowPlaying(ctx: CanvasRenderingContext2D, t: number, paused: boolean): void {
    const tr = this.tracks[this.playing];
    const c = CARD;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, c.x + 4, c.y + 10, c.w, c.h, 30);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, c.x, c.y, c.w, c.h, 30);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.stroke();

    // the album cover, with a record sliding out of the sleeve and spinning
    const cx = c.x + c.w / 2;
    const S = 224;
    const sx = cx - S / 2 - 50;
    const sy = c.y + 30;
    const col = COLORS[this.playing % COLORS.length];
    this.record(ctx, sx + S - 10 + (paused ? -30 : 0), sy + S / 2, S * 0.46, col);
    // the cover thumps on the bass
    const thump = 1 + this.bass * 0.04 + this.kick * 0.04;
    ctx.save();
    ctx.translate(sx + S / 2, sy + S / 2);
    ctx.rotate(paused ? 0 : Math.sin(t * 2.2) * 0.02);
    ctx.scale(thump, thump);
    ctx.translate(-(sx + S / 2), -(sy + S / 2));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, sx + 4, sy + 8, S, S, 14);
    ctx.fill();
    ctx.save();
    roundRect(ctx, sx, sy, S, S, 14);
    ctx.clip();
    if (cover.complete && cover.naturalWidth > 0) ctx.drawImage(cover, sx, sy, S, S);
    else {
      ctx.fillStyle = '#9a5bff';
      ctx.fillRect(sx, sy, S, S);
    }
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${this.kick * 0.15})`;
    roundRect(ctx, sx, sy, S, S, 14);
    ctx.fill();
    ctx.strokeStyle = '#2a1b5e';
    ctx.lineWidth = 3;
    roundRect(ctx, sx, sy, S, S, 14);
    ctx.stroke();
    ctx.restore();

    text(ctx, fit(ctx, tr.title, 26, c.w - 50), cx, c.y + 284, 26, { color: '#2a1b5e', outline: false, weight: 900 });
    text(ctx, tr.where, cx, c.y + 318, 18, { color: '#8a7fb8', outline: false, weight: 800 });
    text(ctx, `Composer: ${COMPOSER}`, cx, c.y + 348, 17, { color: '#9a5bff', outline: false, weight: 800 });

    this.bars(ctx, c.x + 40, c.y + 372, c.w - 80, 40, col, t, paused);

    // progress: a bar you can click for recorded tracks, a running clock for generated loops
    const pr = music.progress();
    const bx = c.x + 40;
    const bw = c.w - 80;
    const by = c.y + 428;
    ctx.fillStyle = '#e2ddf5';
    roundRect(ctx, bx, by, bw, 10, 5);
    ctx.fill();
    if (pr) {
      ctx.fillStyle = col;
      roundRect(ctx, bx, by, Math.max(10, (bw * pr.t) / pr.dur), 10, 5);
      ctx.fill();
      if (clicked(bx, by - 10, bw, 30)) {
        const p = pointerAt();
        if (p) music.seek((p.x - bx) / bw);
      }
      text(ctx, clock(pr.t), bx, by + 26, 15, { align: 'left', color: '#6b5aa8', outline: false, weight: 800 });
      text(ctx, clock(pr.dur), bx + bw, by + 26, 15, { align: 'right', color: '#6b5aa8', outline: false, weight: 800 });
    } else {
      text(ctx, clock(this.elapsed), bx, by + 26, 15, { align: 'left', color: '#6b5aa8', outline: false, weight: 800 });
      text(ctx, 'loops', bx + bw, by + 26, 15, { align: 'right', color: '#6b5aa8', outline: false, weight: 800 });
    }

    // transport
    const y = c.y + c.h - 66;
    if (button(ctx, '◀◀', cx - 150, y, 90, 50, { color: '#6b6f86', size: 20, sound: 'none' })) this.skip(-1);
    if (button(ctx, paused ? '▶' : '❚❚', cx - 50, y, 100, 50, { color: '#21c45a', size: 22, sound: 'none' })) this.togglePause();
    if (button(ctx, '▶▶', cx + 60, y, 90, 50, { color: '#6b6f86', size: 20, sound: 'none' })) this.skip(1);
  }

  /** A vinyl record, its label in the track's colour, turning while the music plays. */
  private record(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.spin);
    ctx.fillStyle = '#1b1430';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let rr = r * 0.48; rr < r * 0.96; rr += r * 0.09) {
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-r * 0.25, -r * 0.05, r * 0.5, r * 0.1);
    ctx.fillStyle = '#1b1430';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.77, -0.5, 0.3);
    ctx.stroke();
    ctx.restore();
  }

  /** Little equalizer bars that move with the music. */
  private bars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, t: number, paused: boolean): void {
    const an = music.analyser();
    const n = 24;
    if (an && (!this.freq || this.freq.length !== an.frequencyBinCount)) this.freq = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
    if (an && this.freq) an.getByteFrequencyData(this.freq);
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (this.freq && this.freq.length) v = this.freq[Math.min(this.freq.length - 1, Math.floor(Math.pow(i / n, 1.6) * this.freq.length * 0.7))] / 255;
      else if (!paused) v = 0.3 + 0.3 * Math.sin(t * 6 + i);
      const bh = Math.max(4, v * h);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35 + v * 0.65;
      roundRect(ctx, x + i * bw + 2, y + h - bh, bw - 4, bh, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private list(ctx: CanvasRenderingContext2D, t: number, paused: boolean, fresh: boolean): void {
    const L = LIST;
    const ptr = pointerAt();
    const h = L.rows * L.rowH;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, L.x - 12, L.y - 12, L.w + 24, h + 24, 24);
    ctx.fill();
    for (let r = 0; r < L.rows; r++) {
      const i = this.top + r;
      const tr = this.tracks[i];
      if (!tr) break;
      const y = L.y + r * L.rowH;
      const on = i === this.sel;
      const live = i === this.playing;
      if (!fresh && inside(ptr, L.x, y, L.w - 40, L.rowH - 6) && promptKind() === 'mouse' && !isTouch()) this.sel = i;
      ctx.fillStyle = on ? '#fff3b8' : live ? '#ffffff' : 'rgba(255,255,255,0.86)';
      roundRect(ctx, L.x, y, L.w - 40, L.rowH - 6, 14);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      const mid = y + (L.rowH - 6) / 2;
      // track number, or dancing bars on the one playing
      if (live && !paused) {
        ctx.fillStyle = COLORS[i % COLORS.length];
        for (let b = 0; b < 3; b++) {
          const bh = 8 + Math.abs(Math.sin(t * 7 + b * 1.9)) * 14;
          ctx.fillRect(L.x + 20 + b * 8, mid + 11 - bh, 5, bh);
        }
      } else text(ctx, String(i + 1), L.x + 32, mid + 1, 18, { color: live ? '#21c45a' : '#8a7fb8', outline: false, weight: 900 });
      text(ctx, fit(ctx, tr.title, 20, 330), L.x + 64, mid + 1, 20, { align: 'left', color: '#2a1b5e', outline: false, weight: 800 });
      text(ctx, fit(ctx, tr.where, 15, 220), L.x + L.w - 60, mid + 1, 15, { align: 'right', color: '#6b5aa8', outline: false, weight: 700 });
      if (clicked(L.x, y, L.w - 40, L.rowH - 6)) {
        this.sel = i;
        if (i === this.playing) this.togglePause();
        else this.play(i);
      }
    }
    // scroll buttons and a thumb showing where you are in the list
    const sx = L.x + L.w - 30;
    if (button(ctx, '▲', sx, L.y, 34, 40, { color: '#6b6f86', size: 14, sound: 'none', disabled: this.top === 0 })) this.scroll(-L.rows);
    if (button(ctx, '▼', sx, L.y + h - 46, 34, 40, { color: '#6b6f86', size: 14, sound: 'none', disabled: this.top >= this.tracks.length - L.rows })) this.scroll(L.rows);
    const trackH = h - 100;
    const thumbH = Math.max(30, (trackH * L.rows) / this.tracks.length);
    const max = Math.max(1, this.tracks.length - L.rows);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, sx + 12, L.y + 50, 10, trackH, 5);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    roundRect(ctx, sx + 12, L.y + 50 + ((trackH - thumbH) * this.top) / max, 10, thumbH, 5);
    ctx.fill();
    text(ctx, `${this.tracks.length} tracks  ·  all by ${COMPOSER}`, L.x + (L.w - 40) / 2, L.y + h + 26, 15, { color: '#bfb3ec', weight: 700 });
  }
}

function clock(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}

/** Trim a label with an ellipsis so it fits in `w` pixels at `size`. */
function fit(ctx: CanvasRenderingContext2D, s: string, size: number, w: number): string {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  if (ctx.measureText(s).width <= w) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + '…').width > w) out = out.slice(0, -1);
  return out + '…';
}

/** '#rrggbb' with an alpha. */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
