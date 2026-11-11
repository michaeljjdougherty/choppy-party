import type { GrabEvent, InputManager } from './input';
import { roundRect, text } from '../shared/draw';
import { button, clicked, inside, pointerAt, takeStrayClick } from './ui';
import { A, B, STICK, isTouch, promptKind } from './prompts';
import { QUALITY_NAMES, qualityName, setQuality, type QualityName } from './three/look/quality';
import { music } from './soundtrack';
import { setSfxVolume, sfx, sfxVolume } from './sfx';
import { setShakeEnabled, shakeEnabled } from './three/fx';

/**
 * Settings: a panel over whatever is on screen (opened from the main menu's corner button or the
 * pause menu). Everything here belongs to this screen only and is remembered in localStorage.
 * While it is open it takes every controller, keyboard and touch button (input.grab), so the game
 * underneath hears nothing. Mouse and touch click the controls directly.
 */
type Row = 'graphics' | 'music' | 'sfx' | 'shake' | 'fullscreen' | 'dev' | 'done';
const ROWS: Row[] = ['graphics', 'music', 'sfx', 'shake', 'fullscreen', 'dev', 'done'];
const LABEL: Record<Row, string> = {
  graphics: 'Graphics',
  music: 'Music',
  sfx: 'Sound effects',
  shake: 'Screen shake',
  fullscreen: 'Full screen',
  dev: 'Developer mode',
  done: 'Done',
};
const QUALITY_LABEL: Record<QualityName, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

const P = { x: 300, y: 56, w: 680, h: 608 };
const ROW_Y0 = P.y + 140;
const ROW_H = 64;
/** Where a row's value control sits. */
const CTRL = { x: P.x + 270, w: 370 };

export class Settings {
  open = false;
  private sel = 0;
  private bump = 0;
  private openedAt = 0;
  private onClose: (() => void) | null = null;
  /** The Developer mode row was pressed (main.ts closes Settings and asks for the code). */
  onDev: (() => void) | null = null;
  /** Whether developer mode is unlocked, for the row's label. */
  devUnlocked: () => boolean = () => false;

  constructor(private input: InputManager) {}

  show(onClose?: () => void): void {
    if (this.open) return;
    this.open = true;
    this.sel = 0;
    this.openedAt = performance.now();
    this.onClose = onClose ?? null;
    this.input.grab = (e) => this.handle(e);
    // a click that opened the panel must not also press something inside it
    takeStrayClick();
    sfx.select();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.input.grab = null;
    sfx.back();
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }

  private handle(e: GrabEvent): void {
    if (!this.open) return;
    if (e.kind === 'b') return this.close();
    const row = ROWS[this.sel];
    if (e.kind === 'move') {
      if (e.y) {
        this.sel = (this.sel + e.y + ROWS.length) % ROWS.length;
        this.bump = 1;
        sfx.move();
      } else if (e.x) this.change(row, e.x);
      return;
    }
    // A: toggles flip, Done closes, steppers go up one
    if (row === 'done') this.close();
    else this.change(row, 1, true);
  }

  /** Step a row's value left (-1) or right (+1). `wrap` cycles round (A presses). */
  private change(row: Row, dir: number, wrap = false): void {
    if (row === 'graphics') {
      const i = QUALITY_NAMES.indexOf(qualityName());
      let j = i + dir;
      if (wrap) j = (j + QUALITY_NAMES.length) % QUALITY_NAMES.length;
      j = Math.max(0, Math.min(QUALITY_NAMES.length - 1, j));
      if (j !== i) setQuality(QUALITY_NAMES[j]);
    } else if (row === 'music' || row === 'sfx') {
      const cur = Math.round((row === 'music' ? music.volume() : sfxVolume()) * 10);
      let n = cur + dir;
      if (wrap && n > 10) n = 0;
      n = Math.max(0, Math.min(10, n));
      if (row === 'music') music.setVolume(n / 10);
      else setSfxVolume(n / 10);
    } else if (row === 'shake') setShakeEnabled(!shakeEnabled());
    else if (row === 'fullscreen') toggleFullscreen();
    else if (row === 'dev') {
      // only a press opens it (not left / right)
      if (wrap) this.onDev?.();
      return;
    } else return;
    sfx.move();
  }

  /** Draw the panel and handle mouse / touch. Call last, so it sits over everything. */
  draw(ctx: CanvasRenderingContext2D, t: number): void {
    if (!this.open) return;
    this.bump = Math.max(0, this.bump - 0.08);
    ctx.fillStyle = 'rgba(14,8,32,0.66)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, P.x + 4, P.y + 10, P.w, P.h, 30);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, P.x, P.y, P.w, P.h, 30);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.stroke();
    gear(ctx, P.x + P.w / 2 - 152, P.y + 50, 20, t * 0.6, '#9a5bff');
    text(ctx, 'SETTINGS', P.x + P.w / 2 + 14, P.y + 50, 42, { color: '#2a1b5e', outline: false });
    text(ctx, 'Saved on this device', P.x + P.w / 2, P.y + 90, 15, { color: '#8a7fb8', outline: false, weight: 700 });

    const ptr = pointerAt();
    const fresh = performance.now() - this.openedAt < 150;
    ROWS.forEach((row, i) => {
      const y = ROW_Y0 + i * ROW_H;
      const on = i === this.sel;
      // hovering a row with the mouse moves the highlight there
      if (!fresh && inside(ptr, P.x + 30, y - 28, P.w - 60, 56) && promptKind() === 'mouse' && !isTouch() && this.sel !== i) this.sel = i;
      if (row === 'done') {
        if (button(ctx, 'Done', P.x + P.w / 2 - 110, y - 22, 220, 50, { color: '#21c45a', size: 22, selected: on, sound: 'none' })) this.close();
        return;
      }
      ctx.fillStyle = on ? '#fff3b8' : '#f3f0ff';
      roundRect(ctx, P.x + 30, y - 28, P.w - 60, 56, 18);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      text(ctx, LABEL[row], P.x + 56, y + 1, 22, { align: 'left', color: '#2a1b5e', outline: false, weight: 800 });
      if (row === 'dev') this.devButton(ctx, y);
      else if (row === 'graphics') this.segments(ctx, y);
      else if (row === 'music' || row === 'sfx') this.meter(ctx, row, y);
      else this.toggle(ctx, row as 'shake' | 'fullscreen', y);
    });

    const k = promptKind();
    const hint =
      k === 'pad'
        ? `${STICK()} choose and change   ·   ${A()} pick   ·   ${B()} close`
        : k === 'mouse'
          ? `${isTouch() ? 'Tap' : 'Click'} a setting to change it`
          : `Arrows or WASD: choose and change   ·   ${A()}: pick   ·   Esc: close`;
    text(ctx, hint, P.x + P.w / 2, P.y + P.h - 26, 16, { color: '#6b5aa8', outline: false, weight: 700 });
    // a click outside the panel closes it
    const stray = takeStrayClick();
    if (stray && !fresh && !inside(stray, P.x, P.y, P.w, P.h)) this.close();
  }

  private devButton(ctx: CanvasRenderingContext2D, y: number): void {
    const open = this.devUnlocked();
    const w = 200;
    if (button(ctx, open ? 'Open tools' : 'Enter code', CTRL.x + CTRL.w - w, y - 19, w, 38, { color: open ? '#21a35a' : '#6b2bd9', size: 17, sound: 'none' })) {
      this.sel = ROWS.indexOf('dev');
      this.onDev?.();
    }
    text(ctx, open ? 'Unlocked' : 'Locked', CTRL.x + 40, y + 1, 16, { color: open ? '#21a35a' : '#8a7fb8', outline: false, weight: 800 });
  }

  private segments(ctx: CanvasRenderingContext2D, y: number): void {
    const n = QUALITY_NAMES.length;
    const gap = 6;
    const w = (CTRL.w - gap * (n - 1)) / n;
    QUALITY_NAMES.forEach((q, j) => {
      const x = CTRL.x + j * (w + gap);
      const on = q === qualityName();
      ctx.fillStyle = on ? '#9a5bff' : '#ffffff';
      roundRect(ctx, x, y - 19, w, 38, 12);
      ctx.fill();
      ctx.strokeStyle = on ? '#6b2bd9' : '#d6cff2';
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, QUALITY_LABEL[q], x + w / 2, y + 1, 16, { color: on ? '#ffffff' : '#2a1b5e', outline: false, weight: 800 });
      if (!on && clicked(x, y - 19, w, 38)) {
        this.sel = 0;
        setQuality(q);
        sfx.move();
      }
    });
  }

  private meter(ctx: CanvasRenderingContext2D, row: 'music' | 'sfx', y: number): void {
    const v = Math.round((row === 'music' ? music.volume() : sfxVolume()) * 10);
    const idx = ROWS.indexOf(row);
    if (button(ctx, '−', CTRL.x, y - 19, 44, 38, { color: '#6b6f86', size: 24, sound: 'none' })) {
      this.sel = idx;
      this.change(row, -1);
    }
    if (button(ctx, '+', CTRL.x + CTRL.w - 44, y - 19, 44, 38, { color: '#2f8cff', size: 24, sound: 'none' })) {
      this.sel = idx;
      this.change(row, 1);
    }
    // ten pips; click one to jump there
    const x0 = CTRL.x + 56;
    const span = CTRL.w - 112 - 52;
    const pw = span / 10;
    for (let i = 0; i < 10; i++) {
      const x = x0 + i * pw;
      ctx.fillStyle = i < v ? (row === 'music' ? '#ff8a1f' : '#21c45a') : '#e2ddf5';
      roundRect(ctx, x + 2, y - 12, pw - 4, 24, 6);
      ctx.fill();
      if (clicked(x, y - 19, pw, 38)) {
        this.sel = idx;
        const n = v === i + 1 ? i : i + 1;
        if (row === 'music') music.setVolume(n / 10);
        else setSfxVolume(n / 10);
        sfx.move();
      }
    }
    text(ctx, v === 0 ? 'Off' : `${v * 10}%`, x0 + span + 26, y + 1, 16, { color: '#2a1b5e', outline: false, weight: 800 });
  }

  private toggle(ctx: CanvasRenderingContext2D, row: 'shake' | 'fullscreen', y: number): void {
    const on = row === 'shake' ? shakeEnabled() : isFullscreen();
    const w = 150;
    const x = CTRL.x + CTRL.w - w;
    ctx.fillStyle = '#e2ddf5';
    roundRect(ctx, x, y - 19, w, 38, 19);
    ctx.fill();
    ctx.fillStyle = on ? '#21c45a' : '#6b6f86';
    roundRect(ctx, on ? x + w / 2 : x, y - 19, w / 2, 38, 19);
    ctx.fill();
    text(ctx, 'Off', x + w / 4, y + 1, 16, { color: on ? '#8a7fb8' : '#ffffff', outline: false, weight: 800 });
    text(ctx, 'On', x + (w * 3) / 4, y + 1, 16, { color: on ? '#ffffff' : '#8a7fb8', outline: false, weight: 800 });
    if (clicked(x, y - 19, w, 38)) {
      this.sel = ROWS.indexOf(row);
      this.change(row, 1);
    }
  }
}

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}
function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  } catch {
    /* not allowed here (iPhone Safari, some embeds) */
  }
}

/** A little cog, used on the main menu's Settings button and the panel title. */
export function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, color = '#ffffff'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    ctx.arc(0, 0, rr, a0, a1);
  }
  ctx.closePath();
  ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}
