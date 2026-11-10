import type { InputManager } from './input';
import { roundRect, text } from '../shared/draw';

export type MenuAction = 'boards' | 'mix' | 'free' | 'host' | 'join' | null;

interface Item {
  key: Exclude<MenuAction, null> | 'online' | 'back';
  title: string;
  sub: string;
  color: string;
  icon: 'dice' | 'stars' | 'pad' | 'globe' | 'home' | 'key' | 'back';
}

const MAIN: Item[] = [
  { key: 'boards', title: 'Party Boards', sub: 'Roll, race and grab crowns on 3 boards', color: '#ff4d5a', icon: 'dice' },
  { key: 'mix', title: 'Minigame Mix', sub: 'Back-to-back minigames for points', color: '#2f8cff', icon: 'stars' },
  { key: 'free', title: 'Free Play', sub: 'Pick any minigame', color: '#21c45a', icon: 'pad' },
  { key: 'online', title: 'Play Online', sub: 'Host a room or join friends', color: '#9a5bff', icon: 'globe' },
];
const ONLINE: Item[] = [
  { key: 'host', title: 'Host a Room', sub: 'Get a code to share with friends', color: '#ff8a1f', icon: 'home' },
  { key: 'join', title: 'Join a Room', sub: 'Type in a 4-letter code', color: '#2f8cff', icon: 'key' },
  { key: 'back', title: 'Back', sub: '', color: '#6b6f86', icon: 'back' },
];

/** Title screen and main menu. Any controller or keyboard can drive it. */
export class MainMenu {
  screen: 'title' | 'main' | 'online' = 'title';
  sel = 0;
  private bump = 0;
  private prev = new Map<string, { a: number; b: number; y: number }>();
  private navCd = 0;

  constructor(private input: InputManager) {}

  private items(): Item[] {
    return this.screen === 'online' ? ONLINE : MAIN;
  }

  /** Returns an action when the player picks something. */
  update(dt: number): MenuAction {
    this.navCd = Math.max(0, this.navCd - dt);
    this.bump = Math.max(0, this.bump - dt * 4);
    let a = false;
    let b = false;
    let dy = 0;
    for (const d of this.input.list()) {
      const p = this.prev.get(d.key);
      if (p) {
        if (d.raw.aCount > p.a) a = true;
        if (d.raw.bCount > p.b) b = true;
      }
      if (Math.abs(d.raw.y) > 0.6 && (!p || Math.abs(p.y) <= 0.6 || this.navCd === 0)) dy = Math.sign(d.raw.y);
      this.prev.set(d.key, { a: d.raw.aCount, b: d.raw.bCount, y: d.raw.y });
    }
    if (this.screen === 'title') {
      if (a) {
        this.screen = 'main';
        this.sel = 0;
      }
      return null;
    }
    const items = this.items();
    if (dy && this.navCd === 0) {
      this.sel = (this.sel + dy + items.length) % items.length;
      this.navCd = 0.2;
      this.bump = 1;
    }
    if (b) {
      if (this.screen === 'online') {
        this.screen = 'main';
        this.sel = 3;
      } else this.screen = 'title';
      return null;
    }
    if (a) {
      const it = items[this.sel];
      if (it.key === 'online') {
        this.screen = 'online';
        this.sel = 0;
        return null;
      }
      if (it.key === 'back') {
        this.screen = 'main';
        this.sel = 3;
        return null;
      }
      return it.key;
    }
    return null;
  }

  /** Lets mouse users pick too. Coordinates are in 1280x720 space. */
  click(x: number, y: number): MenuAction {
    if (this.screen === 'title') {
      this.screen = 'main';
      return null;
    }
    const items = this.items();
    for (let i = 0; i < items.length; i++) {
      const r = this.rect(i, items.length);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.sel = i;
        const it = items[i];
        if (it.key === 'online') {
          this.screen = 'online';
          this.sel = 0;
          return null;
        }
        if (it.key === 'back') {
          this.screen = 'main';
          return null;
        }
        return it.key;
      }
    }
    return null;
  }

  private rect(i: number, n: number) {
    const h = n > 3 ? 112 : 120;
    const gap = 18;
    const total = n * h + (n - 1) * gap;
    return { x: 700, y: 360 - total / 2 + i * (h + gap) + 30, w: 520, h };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.screen === 'title') {
      logo(ctx, 640, 150, 1.0, t);
      const pulse = 1 + Math.sin(t * 5) * 0.04;
      ctx.save();
      ctx.translate(640, 620);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(42,27,94,0.55)';
      roundRect(ctx, -230, -34, 460, 68, 34);
      ctx.fill();
      text(ctx, 'Press A to start', 0, 0, 40, { color: '#ffe14d' });
      ctx.restore();
      text(ctx, 'Pads: bottom face button  ·  Keys: Space or Enter', 640, 690, 18, { weight: 600 });
      return;
    }
    logo(ctx, 340, 140, 0.8, t);
    const items = this.items();
    if (this.screen === 'online') text(ctx, 'Play Online', 960, 70, 36, { color: '#fff' });
    items.forEach((it, i) => {
      const r = this.rect(i, items.length);
      const on = i === this.sel;
      const grow = on ? 1 + 0.03 + this.bump * 0.02 : 1;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(grow, grow);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      // tile with a chunky drop shadow, like a toy button
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, r.x + 4, r.y + 10, r.w, r.h, 30);
      ctx.fill();
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, shade(it.color, 0.25));
      g.addColorStop(1, it.color);
      ctx.fillStyle = g;
      roundRect(ctx, r.x, r.y, r.w, r.h, 30);
      ctx.fill();
      ctx.lineWidth = on ? 7 : 4;
      ctx.strokeStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      roundRect(ctx, r.x + 14, r.y + 8, r.w - 28, r.h * 0.36, 20);
      ctx.fill();
      icon(ctx, it.icon, r.x + 66, r.y + r.h / 2, t);
      text(ctx, it.title, r.x + 128, r.y + (it.sub ? r.h / 2 - 14 : r.h / 2), 38, { align: 'left' });
      if (it.sub) text(ctx, it.sub, r.x + 130, r.y + r.h / 2 + 26, 19, { align: 'left', weight: 600 });
      ctx.restore();
      if (on) {
        const bob = Math.sin(t * 8) * 6;
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath();
        ctx.moveTo(r.x - 40 + bob, r.y + r.h / 2 - 18);
        ctx.lineTo(r.x - 12 + bob, r.y + r.h / 2);
        ctx.lineTo(r.x - 40 + bob, r.y + r.h / 2 + 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
    text(ctx, 'Stick / Arrows: move   ·   A: choose   ·   B: back', 960, 694, 18, { weight: 600 });
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
  const b = Math.min(255, (n & 255) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Bubbly two-line wordmark. */
export function logo(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  const colors = ['#ff4d5a', '#ff8a1f', '#ffd23f', '#21c45a', '#2f8cff', '#9a5bff'];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(-0.04);
  const word = (w: string, yy: number, size: number) => {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    const widths = [...w].map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = -total / 2;
    [...w].forEach((c, i) => {
      const hop = Math.sin(t * 3 + i * 0.6) * 5;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#2a1b5e';
      ctx.strokeText(c, cx, yy + hop);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(c, cx, yy + hop);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillText(c, cx, yy + hop);
      cx += widths[i];
    });
  };
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  word('CHOPPY', -50, 120);
  word('PARTY!', 70, 110);
  ctx.restore();
}

function icon(ctx: CanvasRenderingContext2D, kind: Item['icon'], x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  if (kind === 'dice') {
    ctx.rotate(Math.sin(t * 2) * 0.15);
    roundRect(ctx, -32, -32, 64, 64, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff4d5a';
    for (const [dx, dy] of [[-14, -14], [14, 14], [0, 0], [14, -14], [-14, 14]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'stars') {
    star(ctx, -8, 4, 26, t);
    star(ctx, 20, -16, 14, -t);
  } else if (kind === 'pad') {
    roundRect(ctx, -36, -20, 72, 42, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#21c45a';
    ctx.fillRect(-24, -4, 18, 6);
    ctx.fillRect(-18, -10, 6, 18);
    ctx.beginPath();
    ctx.arc(16, 2, 5, 0, Math.PI * 2);
    ctx.arc(26, -6, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'globe' || kind === 'home' || kind === 'key') {
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = kind === 'globe' ? '#9a5bff' : kind === 'home' ? '#ff8a1f' : '#2f8cff';
    ctx.lineWidth = 5;
    if (kind === 'globe') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 30, 0, 0, Math.PI * 2);
      ctx.moveTo(-30, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
    } else if (kind === 'home') {
      ctx.beginPath();
      ctx.moveTo(-16, 2);
      ctx.lineTo(0, -14);
      ctx.lineTo(16, 2);
      ctx.moveTo(-11, 0);
      ctx.lineTo(-11, 16);
      ctx.lineTo(11, 16);
      ctx.lineTo(11, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-8, 0, 9, 0, Math.PI * 2);
      ctx.moveTo(1, 0);
      ctx.lineTo(20, 0);
      ctx.lineTo(20, 8);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(14, -18);
    ctx.lineTo(-14, 0);
    ctx.lineTo(14, 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.5);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffe14d';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
