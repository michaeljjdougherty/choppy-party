import { NAME_MAX, cleanName } from '../shared/party';
import { roundRect, text } from '../shared/draw';
import { button } from './ui';
import { A, B, START, Y } from './prompts';
import { sfx } from './sfx';
import type { TypeEvent } from './input';

/**
 * Lobby name entry: a panel with the name being typed and an on-screen keyboard. On a real keyboard you
 * just type (Enter saves, Esc cancels); on a controller the stick walks the keys and A presses them;
 * with a mouse or touch you tap the keys. Names are capped at NAME_MAX letters so they fit everywhere.
 */
const ROWS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-!?.', '1234567890'];
const SPECIAL = ['Space', 'Del', 'aA', 'Save'] as const;
type Special = (typeof SPECIAL)[number];

export interface NameEntryOpen {
  device: string;
  playerId: string;
  color: string;
}

export class NameEntry {
  open: NameEntryOpen | null = null;
  textVal = '';
  private col = 0;
  private row = 0;
  private lower = false;
  private age = 0;
  /** Called when the name is saved. */
  onSave: (device: string, name: string) => void = () => {};
  /** Called whenever the panel opens or closes, so input knows who's typing. */
  onChange: (device: string | null) => void = () => {};

  start(o: NameEntryOpen, current: string): void {
    this.open = o;
    this.textVal = cleanName(current);
    this.col = 0;
    this.row = 0;
    this.lower = false;
    this.age = 0;
    sfx.select();
    this.onChange(o.device);
  }

  close(save: boolean): void {
    if (!this.open) return;
    const o = this.open;
    this.open = null;
    this.onChange(null);
    if (save) {
      this.onSave(o.device, cleanName(this.textVal));
      sfx.join();
    } else sfx.back();
  }

  private type(ch: string): void {
    const next = cleanName(this.textVal + ch);
    if (next.length > this.textVal.length || (ch === ' ' && this.textVal.length < NAME_MAX && this.textVal.length > 0)) {
      this.textVal = ch === ' ' ? this.textVal + ' ' : next;
      sfx.move();
    } else sfx.back();
  }

  private del(): void {
    if (this.textVal.length) {
      this.textVal = this.textVal.slice(0, -1);
      sfx.back();
    }
  }

  private special(k: Special): void {
    if (k === 'Space') this.type(' ');
    else if (k === 'Del') this.del();
    else if (k === 'aA') {
      this.lower = !this.lower;
      sfx.move();
    } else this.close(true);
  }

  private keyAt(row: number, col: number): string | Special {
    if (row < ROWS.length) {
      const ch = ROWS[row][col];
      return this.lower ? ch.toLowerCase() : ch;
    }
    return SPECIAL[Math.min(SPECIAL.length - 1, Math.floor(col / 2.5))];
  }

  handle(e: TypeEvent): void {
    if (!this.open) return;
    switch (e.kind) {
      case 'char':
        this.type(e.ch);
        break;
      case 'del':
        if (this.textVal) this.del();
        else this.close(false);
        break;
      case 'case':
        this.special('aA');
        break;
      case 'ok':
        this.close(true);
        break;
      case 'cancel':
        this.close(false);
        break;
      case 'move': {
        const rows = ROWS.length + 1;
        this.row = (this.row + e.y + rows) % rows;
        if (this.row === ROWS.length) {
          // the bottom row has four wide keys
          const k = Math.min(3, Math.floor(this.col / 2.5));
          const nk = e.x ? (k + e.x + 4) % 4 : k;
          this.col = Math.round(nk * 2.5);
        } else this.col = (this.col + e.x + 10) % 10;
        sfx.move();
        break;
      }
      case 'press': {
        const k = this.keyAt(this.row, this.col);
        if ((SPECIAL as readonly string[]).includes(k)) this.special(k as Special);
        else this.type(k);
        break;
      }
    }
  }

  /** Draw the panel (and handle clicks on it). Returns true while it's open. */
  draw(ctx: CanvasRenderingContext2D, dt: number, name: string, pad: boolean): boolean {
    if (!this.open) return false;
    this.age += dt;
    const o = this.open;
    const k = Math.min(1, this.age / 0.18);
    ctx.save();
    ctx.fillStyle = `rgba(10,4,30,${0.6 * k})`;
    ctx.fillRect(0, 0, 1280, 720);
    const W = 760, H = 470, x0 = 640 - W / 2, y0 = 130 + (1 - k) * 40;
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, x0 + 4, y0 + 10, W, H, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x0, y0, W, H, 28);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = o.color;
    roundRect(ctx, x0, y0, W, H, 28);
    ctx.stroke();
    text(ctx, name ? `${name}: type your name` : 'Type your name', 640, y0 + 38, 26, { color: '#2a1b5e', outline: false, weight: 900 });
    // the name: one box per letter, so the 8-letter limit is obvious
    const bw = 58, bg = 8;
    const bx = 640 - (NAME_MAX * bw + (NAME_MAX - 1) * bg) / 2;
    for (let i = 0; i < NAME_MAX; i++) {
      const cx = bx + i * (bw + bg);
      const cur = i === this.textVal.length;
      ctx.fillStyle = cur ? '#fff6c8' : '#f1ecff';
      roundRect(ctx, cx, y0 + 64, bw, 66, 12);
      ctx.fill();
      ctx.lineWidth = cur ? 4 : 2;
      ctx.strokeStyle = cur ? '#ffb300' : '#c9bdf5';
      roundRect(ctx, cx, y0 + 64, bw, 66, 12);
      ctx.stroke();
      const ch = this.textVal[i];
      if (ch) text(ctx, ch === ' ' ? '·' : ch, cx + bw / 2, y0 + 98, 36, { color: '#2a1b5e', outline: false, weight: 900 });
      else if (cur && Math.floor(this.age * 2.5) % 2 === 0) {
        ctx.fillStyle = '#2a1b5e';
        ctx.fillRect(cx + bw / 2 - 2, y0 + 78, 4, 38);
      }
    }
    if (button(ctx, '✕', x0 + W - 58, y0 + 14, 44, 40, { color: '#6b6f86', size: 20, sound: 'none' })) {
      this.close(false);
      ctx.restore();
      return false;
    }
    text(ctx, `${this.textVal.length} / ${NAME_MAX}`, x0 + W - 46, y0 + 148, 15, { color: '#8a7cc0', outline: false, weight: 800 });
    // the keyboard
    const kw = 64, kh = 50, kg = 6;
    const kx = 640 - (10 * kw + 9 * kg) / 2, ky = y0 + 168;
    ROWS.forEach((r, ri) =>
      [...r].forEach((_, ci) => {
        const ch = this.keyAt(ri, ci);
        const sel = pad && ri === this.row && ci === this.col;
        if (button(ctx, ch, kx + ci * (kw + kg), ky + ri * (kh + kg), kw, kh, { color: sel ? '#ff9f1c' : '#6b5aa8', size: 22, selected: sel, sound: 'none' })) {
          this.row = ri;
          this.col = ci;
          this.type(ch);
        }
      }),
    );
    const sw = (10 * kw + 9 * kg - 3 * 10) / 4;
    SPECIAL.forEach((sp, i) => {
      const sel = pad && this.row === ROWS.length && Math.min(3, Math.floor(this.col / 2.5)) === i;
      const color = sp === 'Save' ? '#21c45a' : sp === 'Del' ? '#ff5a5f' : '#2f8cff';
      const label = sp === 'aA' ? (this.lower ? 'ABC' : 'abc') : sp === 'Del' ? '⌫ Del' : sp === 'Save' ? '✔ Save' : sp;
      if (button(ctx, label, kx + i * (sw + 10), ky + ROWS.length * (kh + kg) + 4, sw, kh, { color, size: 20, selected: sel, sound: 'none' })) this.special(sp);
    });
    const help = pad
      ? `${A()} type   ${B()} delete   ${Y()} abc/ABC   ${START()} save`
      : 'Type on your keyboard   ·   Enter saves   ·   Esc cancels';
    ctx.fillStyle = 'rgba(20,10,50,0.85)';
    roundRect(ctx, 640 - 330, y0 + H + 12, 660, 38, 19);
    ctx.fill();
    text(ctx, help, 640, y0 + H + 31, 18, { color: '#ffffff', weight: 800 });
    ctx.restore();
    return true;
  }
}
