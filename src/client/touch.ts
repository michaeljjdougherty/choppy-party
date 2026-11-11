import type { InputManager } from './input';

/**
 * On-screen controls for phones and tablets: a thumb stick on the left, A / B / X / Y on the right
 * (Xbox colours, so the prompts' glyphs match) and a pause button. They drive the kb1 device, the same
 * one a mouse click stands in for, so every menu, board and minigame works with no extra wiring.
 *
 * The pad only shows during a party (board, intro, minigames, results). Menus and the lobby are
 * tapped directly, like mouse clicks.
 */

export type TouchLayout = 'landscape' | 'portrait';

/** Touch screens: a coarse pointer, or touch points with no fine pointer (some tablets report both). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const fine = window.matchMedia?.('(any-pointer: fine)').matches;
  return !!coarse || (navigator.maxTouchPoints > 0 && !fine);
}

const CSS = `
#touchPad { position: fixed; inset: 0; pointer-events: none; z-index: 5; user-select: none; -webkit-user-select: none; display: none; }
#touchPad.on { display: block; }
#touchPad .tp { position: absolute; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
#touchPad .stick { border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(20,12,40,0.38) 70%);
  border: 3px solid rgba(255,255,255,0.45); box-sizing: border-box; }
#touchPad .knob { position: absolute; left: 50%; top: 50%; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #8a8fa8, #3a3d4a);
  border: 3px solid rgba(255,255,255,0.85); box-sizing: border-box; transform: translate(-50%, -50%); box-shadow: 0 4px 0 rgba(0,0,0,0.35); pointer-events: none; }
#touchPad .btn { border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff;
  font: 900 26px system-ui, sans-serif; border: 3px solid rgba(255,255,255,0.85); box-sizing: border-box; opacity: 0.72;
  box-shadow: 0 5px 0 rgba(0,0,0,0.35); text-shadow: 0 2px 0 rgba(0,0,0,0.35); transition: transform 60ms, opacity 60ms; }
#touchPad .btn.down { transform: translateY(3px) scale(0.94); opacity: 1; box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
#touchPad .a { background: #3fbf3f; } #touchPad .b { background: #e8333c; }
#touchPad .x { background: #2f7ff0; } #touchPad .y { background: #f2c218; }
#touchPad .start { border-radius: 14px; background: #2b2d36; font-size: 15px; letter-spacing: 1px; }
#touchPad .hint { position: absolute; left: 50%; transform: translateX(-50%); color: #fff; font: 700 14px system-ui, sans-serif;
  background: rgba(20,12,40,0.7); padding: 6px 12px; border-radius: 12px; white-space: nowrap; pointer-events: none; }
`;

interface Ctl {
  el: HTMLElement;
  btn: 'a' | 'b' | 'x' | 'y' | 'start';
  held: Set<number>;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private hint: HTMLDivElement;
  private buttons: Ctl[] = [];
  private stickId: number | null = null;
  private shown = false;
  layout: TouchLayout = 'landscape';

  constructor(private input: InputManager) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'touchPad';
    this.stick = document.createElement('div');
    this.stick.className = 'tp stick';
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);
    for (const b of ['y', 'x', 'b', 'a', 'start'] as const) {
      const el = document.createElement('div');
      el.className = `tp btn ${b}`;
      el.textContent = b === 'start' ? 'II' : b.toUpperCase();
      this.root.appendChild(el);
      const c: Ctl = { el, btn: b, held: new Set() };
      this.buttons.push(c);
      this.bindButton(c);
    }
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = 'Turn your phone sideways for a bigger view';
    this.root.appendChild(this.hint);
    document.body.appendChild(this.root);
    this.bindStick();
    // no long-press menus, text selection or double-tap zoom anywhere in the game
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Show or hide the pad (it only appears once the screen has been touched). */
  setVisible(on: boolean): void {
    const want = on && this.input.touchSeen;
    if (want === this.shown) return;
    this.shown = want;
    this.root.classList.toggle('on', want);
    if (!want) this.release();
  }

  get visible(): boolean {
    return this.shown;
  }

  /**
   * Lay the controls out for the screen. `game` is the canvas rectangle in CSS pixels; in portrait the
   * controls sit in the space under it, in landscape they float over its bottom corners.
   */
  place(vw: number, vh: number, game: { x: number; y: number; w: number; h: number }, safe: { t: number; l: number; r: number; b: number }): void {
    this.layout = vh > vw ? 'portrait' : 'landscape';
    const portrait = this.layout === 'portrait';
    const below = vh - (game.y + game.h);
    // size everything off the short side of the screen, so it suits a phone and a tablet
    const unit = Math.min(vw, vh);
    const stickD = Math.round(Math.max(110, Math.min(180, unit * (portrait ? 0.36 : 0.34))));
    const btnD = Math.round(stickD * 0.42);
    const pad = 14;
    const bottom = safe.b + pad;
    // landscape: hug the corners. portrait: centre the clusters in the space under the game
    const clusterH = stickD;
    const cy = portrait ? Math.min(vh - bottom - clusterH / 2, game.y + game.h + Math.max(clusterH / 2 + 50, below / 2)) : vh - bottom - clusterH / 2;
    const sx = safe.l + pad + stickD / 2 + (portrait ? 6 : 10);
    this.setBox(this.stick, sx - stickD / 2, cy - stickD / 2, stickD, stickD);
    const kd = Math.round(stickD * 0.44);
    this.knob.style.width = this.knob.style.height = `${kd}px`;
    // the face buttons: a diamond, A at the bottom like a real pad
    const ring = btnD * 0.95;
    const bx = vw - safe.r - pad - ring - btnD / 2 - 4;
    const at: Record<string, [number, number]> = { a: [bx, cy + ring], b: [bx + ring, cy], x: [bx - ring, cy], y: [bx, cy - ring] };
    for (const c of this.buttons) {
      if (c.btn === 'start') continue;
      const [x, y] = at[c.btn];
      const d = c.btn === 'a' ? Math.round(btnD * 1.12) : btnD;
      this.setBox(c.el, x - d / 2, y - d / 2, d, d);
      c.el.style.fontSize = `${Math.round(d * 0.42)}px`;
    }
    const st = this.buttons.find((c) => c.btn === 'start')!;
    const sw = 56, sh = 34;
    // top-right corner: over the game in landscape, in the free space above it when upright
    this.setBox(st.el, vw - safe.r - pad - sw, portrait ? Math.max(safe.t + 8, game.y - sh - 10) : Math.max(8, game.y + 8), sw, sh);
    // in portrait the game is small: suggest turning the phone (only while there's room for the note)
    this.hint.style.display = portrait && below > clusterH + 90 ? 'block' : 'none';
    this.hint.style.top = `${game.y + game.h + 12}px`;
  }

  private setBox(el: HTMLElement, x: number, y: number, w: number, h: number): void {
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.width = `${Math.round(w)}px`;
    el.style.height = `${Math.round(h)}px`;
  }

  private bindButton(c: Ctl): void {
    const { el, btn: b, held } = c;
    const up = (e: PointerEvent) => {
      if (!held.delete(e.pointerId)) return;
      if (held.size === 0) {
        el.classList.remove('down');
        this.input.touchButton(b, false);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const first = held.size === 0;
      held.add(e.pointerId);
      if (!first) return;
      el.classList.add('down');
      navigator.vibrate?.(8);
      this.input.touchButton(b, true);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private bindStick(): void {
    const el = this.stick;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      const r = el.getBoundingClientRect();
      const rad = r.width / 2;
      let dx = (e.clientX - (r.left + rad)) / rad;
      let dy = (e.clientY - (r.top + rad)) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      // a small dead zone, then full range, like the gamepad stick
      const dz = 0.18;
      const mm = Math.min(1, Math.hypot(dx, dy));
      const k = mm < dz ? 0 : (mm - dz) / (1 - dz) / (mm || 1);
      this.input.touchStick(dx * k, dy * k);
      this.knob.style.transform = `translate(calc(-50% + ${dx * rad * 0.62}px), calc(-50% + ${dy * rad * 0.62}px))`;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.touchStick(0, 0);
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      move(e);
    });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  /** Let go of everything (when the pad hides mid-press). */
  private release(): void {
    if (this.stickId !== null) {
      this.stickId = null;
      this.input.touchStick(0, 0);
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
    for (const c of this.buttons) {
      if (c.held.size) {
        c.held.clear();
        c.el.classList.remove('down');
        this.input.touchButton(c.btn, false);
      }
    }
  }
}

/** The screen's safe-area insets (notch, home bar) in CSS pixels. */
let probe: HTMLDivElement | null = null;
export function safeInsets(): { t: number; r: number; b: number; l: number } {
  if (typeof document === 'undefined') return { t: 0, r: 0, b: 0, l: 0 };
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const n = (v: string) => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
