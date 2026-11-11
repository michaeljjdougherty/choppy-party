/**
 * Presentation helpers for the big moments: sunbursts, ribbons, slam-in titles, count-ins,
 * Square Brian's speech bubble, and his lines.
 */
import { glyph } from './prompts';
import { roundRect, text } from '../shared/draw';
import { drawBrianBust, type BrianFace } from './three/brian';

/* ------------------------------------------------------------------ easing */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Overshooting spring from 0 to 1 (good for things slamming into place). */
export const springIn = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(11 * p));
export const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);

/* ------------------------------------------------------------------ backdrops */

/** Rotating candy-stripe rays behind a title. */
export function sunburst(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, color: string, alpha = 0.35, rays = 18): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.18);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a, a + Math.PI / rays);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Darken the edges so the middle of the screen pops. */
export function vignette(ctx: CanvasRenderingContext2D, strength = 0.45): void {
  const g = ctx.createRadialGradient(640, 360, 220, 640, 360, 820);
  g.addColorStop(0, 'rgba(10,4,30,0)');
  g.addColorStop(1, `rgba(10,4,30,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
}

/** A folded ribbon banner with text on it. */
export function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string, size = 24, textColor = '#fff'): void {
  ctx.save();
  const tail = h * 0.7;
  // tails behind
  ctx.fillStyle = shade(color, -0.35);
  for (const side of [-1, 1]) {
    const ex = x + (side * w) / 2;
    ctx.beginPath();
    ctx.moveTo(ex - side * 10, y - h / 2 + 10);
    ctx.lineTo(ex + side * tail, y - h / 2 + 10);
    ctx.lineTo(ex + side * tail * 0.6, y + 10);
    ctx.lineTo(ex + side * tail, y + h / 2 + 10);
    ctx.lineTo(ex - side * 10, y + h / 2 + 10);
    ctx.closePath();
    ctx.fill();
  }
  // main band with a soft shine
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x - w / 2 + 4, y - h / 2 + 7, w, h, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, shade(color, 0.25));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x, y + 1, size, { color: textColor });
}

/**
 * Big headline that slams in from huge, wobbles and settles. `age` is seconds since it appeared.
 * Returns the scale it was drawn at.
 */
export function slam(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, age: number, color = '#ffd23f', delay = 0): number {
  const p = clamp01((age - delay) / 0.55);
  if (p <= 0) return 0;
  const s = 2.4 - 1.4 * springIn(p);
  const rot = (1 - springIn(p)) * -0.12 + Math.sin(age * 2.2) * 0.012;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.globalAlpha = clamp01(p * 3);
  // chunky shadow layer, then the face
  ctx.save();
  ctx.translate(0, size * 0.09);
  text(ctx, label, 0, 0, size, { color: 'rgba(30,10,60,0.85)' });
  ctx.restore();
  text(ctx, label, 0, 0, size, { color });
  ctx.restore();
  return s;
}

/** 3, 2, 1, GO! for the start of a minigame. `t` counts from the start of the countdown. */
export function countIn(ctx: CanvasRenderingContext2D, t: number, readyFor: number, word = 'GO!'): void {
  if (t < 0 || t > readyFor + 0.9) return;
  if (t < readyFor) {
    const left = readyFor - t;
    if (left > 3) return;
    const n = Math.ceil(left);
    const age = 1 - (left - Math.floor(left) || 1) + 0.0001;
    const s = 1.8 - 0.8 * springIn(clamp01(age / 0.35));
    ctx.save();
    ctx.translate(640, 330);
    ctx.scale(s, s);
    ctx.globalAlpha = clamp01((1 - age) * 3);
    ringBurst(ctx, 0, 0, 90 + age * 80, n === 1 ? '#ff5a5f' : n === 2 ? '#ffd23f' : '#4cd97b', 1 - age);
    text(ctx, String(n), 0, 0, 170, { color: '#ffffff' });
    ctx.restore();
    return;
  }
  const age = t - readyFor;
  sunburst(ctx, 640, 330, 520, age * 4, '#ffd23f', 0.4 * clamp01(1 - age), 22);
  ctx.save();
  ctx.globalAlpha = clamp01((0.9 - age) * 4);
  slam(ctx, word, 640, 330, 150, age, '#ffd23f');
  ctx.restore();
}

/** "FINISH!" when a minigame ends, over the frozen last moment. */
export function finishBanner(ctx: CanvasRenderingContext2D, age: number, word = 'FINISH!'): void {
  ctx.save();
  ctx.fillStyle = `rgba(10,4,30,${0.35 * clamp01(age * 3)})`;
  ctx.fillRect(0, 0, 1280, 720);
  // two stripes sweep across behind the word
  const p = easeOut(age / 0.4);
  ctx.translate(640, 340);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#ff5a5f';
  ctx.fillRect(-640 * p - 40, -95, 1360 * p, 70);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(680 - 1360 * p, 25, 1360 * p, 70);
  ctx.restore();
  slam(ctx, word, 640, 340, 130, age, '#ffffff', 0.08);
}

function ringBurst(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  ctx.save();
  ctx.globalAlpha *= clamp01(a);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = withAlpha(color, 0.25);
  ctx.fill();
  ctx.restore();
}

/** Button glyph chips for a control line like "Stick: move   A: jump". */
export function controlChips(ctx: CanvasRenderingContext2D, controls: string, cx: number, y: number): void {
  const parts = controls.split(/\s{2,}/).map((p) => {
    const [k, ...rest] = p.split(':');
    return { key: k.trim(), what: rest.join(':').trim() };
  });
  ctx.save();
  ctx.font = '800 22px system-ui, sans-serif';
  const widths = parts.map((p) => 64 + ctx.measureText(p.what).width + 26);
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * 16;
  let x = cx - total / 2;
  parts.forEach((p, i) => {
    const w = widths[i];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, x + 2, y - 26 + 5, w, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y - 26, w, 52, 26);
    ctx.fill();
    const key = p.key.toLowerCase();
    const col = key.startsWith('a') || key.startsWith('mash a') ? '#21c45a' : key.startsWith('b') ? '#ff4d5a' : '#3a3f5c';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + 28, y, 20, 0, Math.PI * 2);
    ctx.fill();
    const g = key.startsWith('stick') ? glyph('stick') : key.startsWith('mash') ? glyph('mash') : key.startsWith('a') ? glyph('a') : key.startsWith('b') ? glyph('b') : p.key.charAt(0).toUpperCase();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${g.length > 3 ? 11 : g.length > 1 ? 14 : 20}px system-ui, sans-serif`;
    const glyphText = g;
    ctx.fillText(glyphText, x + 28, y + 1);
    ctx.fillStyle = '#2a1b5e';
    ctx.textAlign = 'left';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText(p.what || p.key, x + 58, y + 1);
    x += w + 16;
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ Square Brian talks */

/** Typewriter state: restarts whenever the line changes. */
export class HostLine {
  text = '';
  age = 0;
  mood: BrianFace = 'pout';

  say(line: string, mood: BrianFace = 'pout'): void {
    if (line === this.text) return;
    this.text = line;
    this.age = 0;
    this.mood = mood;
  }

  update(dt: number): void {
    this.age += dt;
  }

  /** Characters revealed so far. */
  shown(): string {
    return this.text.slice(0, Math.floor(this.age * 42));
  }

  get talking(): boolean {
    return this.age * 42 < this.text.length;
  }
}

/**
 * Speech bubble with Brian's name tab. (x, y) is the top-left corner. `tailTo` is where the
 * tail points (his head). Returns the bubble height.
 */
export function bubble(ctx: CanvasRenderingContext2D, line: HostLine, x: number, y: number, w: number, tailTo?: { x: number; y: number }, size = 23): number {
  if (!line.text) return 0;
  const pop = springIn(clamp01(line.age / 0.35));
  if (pop <= 0) return 0;
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const lines = wrap(ctx, line.text, w - 44);
  const lh = size * 1.3;
  const h = lines.length * lh + 46;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.translate(-cx, -cy);
  // shadow, tail, body
  ctx.fillStyle = 'rgba(20,8,50,0.3)';
  roundRect(ctx, x + 4, y + 8, w, h, 26);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a1b5e';
  ctx.lineWidth = 5;
  if (tailTo) {
    const bx = Math.max(x + 40, Math.min(x + w - 40, tailTo.x));
    const by = tailTo.y < y ? y : y + h;
    ctx.beginPath();
    ctx.moveTo(bx - 20, by);
    ctx.lineTo(tailTo.x, tailTo.y);
    ctx.lineTo(bx + 20, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  roundRect(ctx, x, y, w, h, 26);
  ctx.fill();
  ctx.stroke();
  if (tailTo) {
    // hide the tail's join line
    const bx = Math.max(x + 40, Math.min(x + w - 40, tailTo.x));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 17, tailTo.y < y ? y - 1 : y + h - 4, 34, 6);
  }
  // name tab
  ctx.fillStyle = '#2e2f35';
  roundRect(ctx, x + 22, y - 16, 178, 32, 16);
  ctx.fill();
  ctx.fillStyle = '#efe4cf';
  ctx.font = '900 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '2px';
  ctx.fillText('SQUARE BRIAN', x + 38, y + 1);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  // the words, typed out
  const shown = line.shown().length;
  let used = 0;
  ctx.fillStyle = '#2a1b5e';
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  lines.forEach((l, i) => {
    const part = l.slice(0, Math.max(0, shown - used));
    used += l.length + 1;
    ctx.fillText(part, x + 22, y + 30 + i * lh + lh / 2);
  });
  ctx.restore();
  return h;
}

/** Brian's head and shoulders in a corner, with his bubble beside him. */
export function hostCorner(ctx: CanvasRenderingContext2D, line: HostLine, t: number, corner: 'bl' | 'br' | 'tl' | 'tr' = 'bl', w = 420, lift = 0): void {
  if (!line.text) return;
  const enter = easeOut(line.age / 0.35);
  const left = corner === 'bl' || corner === 'tl';
  const top = corner === 'tl' || corner === 'tr';
  const hx = left ? 70 - (1 - enter) * 160 : 1210 + (1 - enter) * 160;
  const hy = (top ? 96 : 628) - lift;
  drawBrianBust(ctx, hx, hy, 74, t, { talking: line.talking, mood: line.mood });
  ctx.save();
  ctx.globalAlpha = enter;
  const bx = left ? 128 : 1152 - w;
  bubble(ctx, line, bx, top ? 24 : hy - 70, w, { x: left ? hx + 40 : hx - 40, y: hy - 10 }, 20);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/* ------------------------------------------------------------------ his lines */

/**
 * Placeholder lines, written in his calm, wise, deadpan voice. Michael will record the real
 * voice lines later, so keep these short and easy to swap.
 */
export const LINES = {
  title: ['Welcome. I am Square Brian. I have been expecting you.', 'Every great party begins with one button. That button is A.'],
  menu: [
    'Choose your path. Every path has a minigame at the end of it.',
    'The board rewards patience. And keys. Mostly keys.',
    'I have seen ten thousand parties. Make this one count.',
  ],
  lobby: ['Gather, friends. The party waits for no one.', 'More players, more chaos. That is the way.'],
  lobbyBots: ['Ah. Machines have joined us. They do not blink. I do, sometimes.'],
  intro: (blurb: string) => `${blurb} Watch the preview, then hold A to ready up.`,
  winner: (name: string) => [`${name}. The crown fits you well.`, `${name} has learned something today.`, `Well played, ${name}. I am not surprised.`],
  tie: ['A tie. Balance, as all things should be.'],
  last: (name: string) => [`${name}, there is always next round.`, `${name}. Even mountains start as pebbles.`],
  champion: (name: string) => [`${name}. Remember this day. I certainly will.`, `All hail ${name}, champion of the party.`],
};

export function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(Math.floor(seed)) % list.length];
}

/* ------------------------------------------------------------------ colour */

function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))) | 0;
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
