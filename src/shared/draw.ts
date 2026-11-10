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
  ctx.font = `${opts.weight ?? 700} ${size}px system-ui, sans-serif`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (opts.outline !== false) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.fillText(s, x, y);
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
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 590, 14, 100, 44, 22);
  ctx.fill();
  ctx.restore();
  text(ctx, String(s), 640, 37, 28, { color: s <= 5 ? '#ffd23f' : '#fff', outline: false });
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
