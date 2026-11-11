import type { GrabEvent, InputManager } from './input';
import { roundRect, text } from '../shared/draw';
import { button, clicked, inside, pointerAt, takeStrayClick } from './ui';
import { A, B, STICK, isTouch, promptKind } from './prompts';
import { COMPOSER, music, ostTracks, type OstTrack } from './soundtrack';
import { GAMES } from '../shared/games';
import { sfx } from './sfx';
import { sunburst } from './showtime';

/**
 * "Choppy Party - OST": a soundtrack player opened from the main menu. Every song in the game is
 * listed, Michael's recorded tracks first. Like Settings, it takes every controller, keyboard and
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
const COLORS = ['#ff4d5a', '#ff8a1f', '#ffd23f', '#21c45a', '#2f8cff', '#9a5bff'];

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
    this.tracks = ostTracks(GAMES);
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

  /** Draw the screen and handle mouse / touch. Call last, so it sits over everything. */
  draw(ctx: CanvasRenderingContext2D, t: number): void {
    if (!this.open) return;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const paused = music.paused();
    if (!paused) {
      this.elapsed += dt;
      this.spin += dt * 2.2;
    }
    const fresh = performance.now() - this.openedAt < 150;

    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#2a1b5e');
    g.addColorStop(1, '#120a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    sunburst(ctx, CARD.x + CARD.w / 2, 300, 420, t, '#9a5bff', 0.16, 16);

    // title
    text(ctx, 'CHOPPY PARTY - OST', 640, 52, 44, { color: '#ffe14d' });
    text(ctx, `Original Soundtrack  ·  Music by ${COMPOSER}`, 640, 96, 20, { color: '#d9ccff', weight: 700 });
    if (button(ctx, 'Back', 24, 22, 120, 52, { color: '#6b6f86', size: 22, sound: 'none' })) return this.close();

    this.nowPlaying(ctx, t, paused);
    this.list(ctx, t, paused, fresh);

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
    ctx.strokeStyle = '#2a1b5e';
    ctx.lineWidth = 3;
    roundRect(ctx, sx, sy, S, S, 14);
    ctx.stroke();

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
    text(ctx, `${this.tracks.length} tracks`, L.x + (L.w - 40) / 2, L.y + h + 26, 15, { color: '#bfb3ec', weight: 700 });
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
