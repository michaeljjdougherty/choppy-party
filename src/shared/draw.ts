import type { PlayerInfo } from './types';

export function playerById(players: PlayerInfo[], id: string): PlayerInfo | undefined {
  return players.find((p) => p.id === id);
}

/** A "Choppy": a round blob with eyes and a little leaf on top. Original mascot for the game. */
export function drawChoppy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  opts: { look?: number; stunned?: boolean; ghost?: boolean; name?: string } = {},
): void {
  ctx.save();
  ctx.globalAlpha = opts.ghost ? 0.3 : 1;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // leaf
  ctx.fillStyle = '#5bd36a';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.25, y - r * 1.05, r * 0.35, r * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // eyes
  const look = opts.look ?? 0;
  const ex = Math.cos(look) * r * 0.12;
  const ey = Math.sin(look) * r * 0.12;
  for (const side of [-1, 1]) {
    const cx = x + side * r * 0.32;
    const cy = y - r * 0.15;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    if (opts.stunned) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy - r * 0.12);
      ctx.lineTo(cx + r * 0.12, cy + r * 0.12);
      ctx.moveTo(cx + r * 0.12, cy - r * 0.12);
      ctx.lineTo(cx - r * 0.12, cy + r * 0.12);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(cx + ex, cy + ey, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (opts.name) {
    ctx.globalAlpha = opts.ghost ? 0.5 : 1;
    ctx.font = `600 ${Math.max(12, r * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(opts.name, x, y - r * 1.35);
    ctx.fillText(opts.name, x, y - r * 1.35);
  }
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: { color?: string; align?: CanvasTextAlign; weight?: number; outline?: boolean } = {},
): void {
  ctx.save();
  // big headline text uses the chunky Kenney Future font (UI Pack); body text stays system-ui for readability
  const headline = size >= 30 && /[A-Za-z]/.test(s.replace(TOKEN_RE, ''));
  ctx.font = headline ? `${size}px 'Kenney Future Narrow', system-ui, sans-serif` : `${opts.weight ?? 700} ${size}px system-ui, sans-serif`;
  // the Kenney font is set wide; pull the letters in a little
  if (headline && 'letterSpacing' in ctx) {
    const c = ctx as unknown as { letterSpacing: string; wordSpacing: string };
    c.letterSpacing = `${-size * 0.06}px`;
    // the tighter letters swallow the gaps between words, so open those back up
    c.wordSpacing = `${size * 0.35}px`;
  }
  ctx.textBaseline = 'middle';
  const plain = (str: string, px: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    if (opts.outline !== false) {
      // a solid ink outline (not see-through black, which reads grey and cheap), and on headlines a
      // dropped ink layer underneath so the letters sit up off the screen like stickers
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size / 8);
      if (headline) {
        ctx.strokeStyle = 'rgba(22,10,46,0.9)';
        ctx.strokeText(str, px, y + Math.max(2, size * 0.07));
        ctx.fillStyle = 'rgba(22,10,46,0.9)';
        ctx.fillText(str, px, y + Math.max(2, size * 0.07));
      }
      ctx.strokeStyle = 'rgba(26,12,52,0.88)';
      ctx.strokeText(str, px, y);
    }
    ctx.fillStyle = opts.color ?? '#fff';
    ctx.fillText(str, px, y);
  };
  if (!s.includes('\u0001')) {
    plain(s, x, opts.align ?? 'center');
    ctx.restore();
    return;
  }
  // rich text: controller and key glyphs drawn inline between the words
  const parts = splitGlyphs(s);
  const gs = Math.max(14, size * 1.05);
  const widths = parts.map((p) => (typeof p === 'string' ? ctx.measureText(p).width : glyphWidth(ctx, p, gs) + size * 0.12));
  const total = widths.reduce((q, w) => q + w, 0);
  const align = opts.align ?? 'center';
  let cx = align === 'left' || align === 'start' ? x : align === 'right' || align === 'end' ? x - total : x - total / 2;
  parts.forEach((p, i) => {
    if (typeof p === 'string') plain(p, cx, 'left');
    else {
      const font = ctx.font;
      drawGlyph(ctx, p, cx + size * 0.06 + glyphWidth(ctx, p, gs) / 2, y, gs);
      ctx.font = font;
    }
    cx += widths[i];
  });
  ctx.restore();
}

// ---- controller and keyboard glyphs ------------------------------------------------------------
/**
 * Prompts carry glyph tokens: \u0001<style>:<button>\u0002. Style is x (Xbox), p (PlayStation),
 * n (Nintendo) or k (a keyboard key, where the button is the key's label).
 */
export interface Glyph {
  style: 'x' | 'p' | 'n' | 'k';
  btn: string;
}
const TOKEN_RE = /\u0001([xpnk]):([^\u0002]*)\u0002/g;
export const glyphToken = (style: Glyph['style'], btn: string) => `\u0001${style}:${btn}\u0002`;
/** The prompt with glyph tokens turned back into words (for logs and measuring). */
export const plainText = (s: string) => s.replace(TOKEN_RE, (_, st, b) => (st === 'k' ? b : b.toUpperCase()));

/** Width of a prompt in the current ctx.font, counting button glyphs at their drawn size. */
export function richWidth(ctx: CanvasRenderingContext2D, s: string, size: number): number {
  if (!s.includes('\u0001')) return ctx.measureText(s).width;
  const gs = Math.max(14, size * 1.05);
  return splitGlyphs(s).reduce((w, p) => w + (typeof p === 'string' ? ctx.measureText(p).width : glyphWidth(ctx, p, gs) + size * 0.12), 0);
}

function splitGlyphs(s: string): (string | Glyph)[] {
  const out: (string | Glyph)[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN_RE)) {
    if (m.index! > last) out.push(s.slice(last, m.index));
    out.push({ style: m[1] as Glyph['style'], btn: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function glyphWidth(ctx: CanvasRenderingContext2D, g: Glyph, size: number): number {
  if (g.style === 'k') {
    ctx.save();
    ctx.font = `800 ${Math.round(size * 0.52)}px system-ui, sans-serif`;
    const w = Math.max(size, ctx.measureText(g.btn).width + size * 0.6);
    ctx.restore();
    return w;
  }
  return g.btn === 'start' ? size * 1.5 : size;
}

const XBOX: Record<string, string> = { a: '#3fbf3f', b: '#e8333c', x: '#2f7ff0', y: '#f2c218' };
const PS: Record<string, string> = { a: '#7fa8ff', b: '#ff6b6b', x: '#f08ad8', y: '#3ad6a6' };
const NINTENDO_LABEL: Record<string, string> = { a: 'B', b: 'A', x: 'Y', y: 'X' };

/** One button glyph centred on (x, y), `size` px across. */
export function drawGlyph(ctx: CanvasRenderingContext2D, g: Glyph, x: number, y: number, size: number): void {
  const r = size / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (g.style === 'k') {
    // a white keycap with a darker base, like a real key
    const w = glyphWidth(ctx, g, size);
    ctx.fillStyle = '#9aa0b8';
    roundRect(ctx, x - w / 2, y - r + 3, w, size, size * 0.22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - w / 2, y - r, w, size - 3, size * 0.22);
    ctx.fill();
    ctx.fillStyle = '#2a1b5e';
    ctx.font = `800 ${Math.round(size * 0.52)}px system-ui, sans-serif`;
    ctx.fillText(g.btn, x, y - 1);
    ctx.restore();
    return;
  }
  const b = g.btn;
  if (b === 'start') {
    const w = size * 1.5;
    ctx.fillStyle = '#2b2d36';
    roundRect(ctx, x - w / 2, y - r * 0.75, w, size * 0.75, size * 0.37);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    if (g.style === 'p') {
      // Options: three short lines
      for (const d of [-0.22, 0, 0.22]) {
        ctx.beginPath();
        ctx.moveTo(x - size * 0.22, y + d * size);
        ctx.lineTo(x + size * 0.22, y + d * size);
        ctx.stroke();
      }
    } else if (g.style === 'n') {
      ctx.beginPath();
      ctx.moveTo(x - size * 0.18, y);
      ctx.lineTo(x + size * 0.18, y);
      ctx.moveTo(x, y - size * 0.18);
      ctx.lineTo(x, y + size * 0.18);
      ctx.stroke();
    } else {
      for (const d of [-0.16, 0, 0.16]) {
        ctx.beginPath();
        ctx.moveTo(x - size * 0.2, y + d * size);
        ctx.lineTo(x + size * 0.2, y + d * size);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }
  if (b === 'stick') {
    ctx.fillStyle = '#2b2d36';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a5e70';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * 0.42)}px system-ui, sans-serif`;
    ctx.fillText('L', x, y + 1);
    ctx.restore();
    return;
  }
  // face buttons
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y + size * 0.06, r, 0, Math.PI * 2);
  ctx.fill();
  if (g.style === 'x' || g.style === 'n') {
    const col = g.style === 'x' ? XBOX[b] ?? '#5a5e70' : '#3a3d4a';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * 0.62)}px system-ui, sans-serif`;
    ctx.fillText(g.style === 'n' ? NINTENDO_LABEL[b] ?? b.toUpperCase() : b.toUpperCase(), x, y + 1);
    ctx.restore();
    return;
  }
  // PlayStation: dark button with a coloured shape
  ctx.fillStyle = '#23252e';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.stroke();
  ctx.strokeStyle = PS[b] ?? '#ffffff';
  ctx.lineWidth = Math.max(2, size * 0.1);
  const k = r * 0.48;
  ctx.beginPath();
  if (b === 'a') {
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
  } else if (b === 'b') ctx.arc(x, y, k, 0, Math.PI * 2);
  else if (b === 'x') ctx.rect(x - k * 0.9, y - k * 0.9, k * 1.8, k * 1.8);
  else {
    ctx.moveTo(x, y - k * 1.05);
    ctx.lineTo(x + k, y + k * 0.75);
    ctx.lineTo(x - k, y + k * 0.75);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Countdown/timer pill at the top centre. */
export function drawTimer(ctx: CanvasRenderingContext2D, secondsLeft: number): void {
  const s = Math.max(0, Math.ceil(secondsLeft));
  // the last five seconds throb and turn red, with a boing on every tick
  const hurry = s <= 5 && s > 0;
  const k = hurry ? pop('timer', s) * (1 + (1 - (secondsLeft % 1)) * 0.08) : 1;
  ctx.save();
  ctx.translate(640, 36);
  ctx.scale(k * (hurry ? 1.25 : 1), k * (hurry ? 1.25 : 1));
  ctx.fillStyle = hurry ? 'rgba(200,30,50,0.85)' : 'rgba(0,0,0,0.45)';
  roundRect(ctx, -50, -22, 100, 44, 22);
  ctx.fill();
  if (hurry) {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  text(ctx, String(s), 0, 1, 28, { color: hurry ? '#ffffff' : '#fff', outline: false });
  ctx.restore();
}

// ---- bouncy HUD numbers ------------------------------------------------------------------------
const popSeen = new Map<string, { v: number; at: number }>();
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);

/**
 * Size multiplier for a HUD number that should "boing" when it changes: a quick overshoot to
 * about 1.5x that springs back to 1. `key` identifies the counter.
 */
export function pop(key: string, value: number): number {
  const now = nowSec();
  const seen = popSeen.get(key);
  if (!seen) {
    popSeen.set(key, { v: value, at: -10 });
    return 1;
  }
  if (seen.v !== value) {
    seen.v = value;
    seen.at = now;
  }
  const t = now - seen.at;
  if (t > 0.6) return 1;
  return 1 + Math.exp(-7 * t) * Math.cos(t * 18) * 0.5;
}

/** Text drawn with a bouncy scale around its anchor (left-aligned anchors grow to the right). */
export function popText(
  ctx: CanvasRenderingContext2D,
  key: string,
  value: number,
  x: number,
  y: number,
  size: number,
  opts: { color?: string; align?: CanvasTextAlign; weight?: number; outline?: boolean } = {},
): void {
  const k = pop(key, value);
  if (k === 1) return text(ctx, String(value), x, y, size, opts);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  text(ctx, String(value), 0, 0, size, opts);
  ctx.restore();
}

// ---- player portraits ---------------------------------------------------------------------------
/** The client plugs in its 3D head portraits here, so shared HUD code can show faces. */
let portraitFn: ((ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number) => void) | null = null;
export function setPortraitDrawer(fn: typeof portraitFn): void {
  portraitFn = fn;
}
/** A round face badge in the player's colour (a plain colour dot when portraits aren't available). */
export function faceBadge(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number): void {
  if (portraitFn) return portraitFn(ctx, color, x, y, r);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
