import { Spring, card3d, sheen } from './uiDepth';
import { roundRect, text } from '../shared/draw';

/**
 * A tiny immediate-mode button layer for mouse players. Screens call `button()` while drawing;
 * it draws the button, lights it up on hover, and returns true on the frame it is clicked.
 * Clicks no button took fall through to `takeStrayClick()` (used as an A press).
 */
interface Pt {
  x: number;
  y: number;
}
let pointer: Pt | null = null;
let click: Pt | null = null;
let hot = false;
let canvasEl: HTMLCanvasElement | null = null;
/** Which button the pointer is over (by label and position), so hovering a new one can tick. */
let hoverKey = '';
let hoverSeen = false;
/** Sounds for mouse players: hovering onto a button, and pressing one (select or back). */
export const uiSound: { hover: () => void; press: (kind: 'select' | 'back') => void } = { hover: () => {}, press: () => {} };

export function attachUi(canvas: HTMLCanvasElement, w: number, h: number): void {
  canvasEl = canvas;
  const at = (e: MouseEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  canvas.addEventListener('pointermove', (e) => (pointer = at(e)));
  canvas.addEventListener('pointerleave', () => (pointer = null));
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) click = at(e);
  });
}

export function pointerAt(): Pt | null {
  return pointer;
}

export function inside(p: Pt | null, x: number, y: number, w: number, h: number): boolean {
  return !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
}

/** Call at the start of each frame's drawing. */
export function beginUi(): void {
  hot = false;
  hoverSeen = false;
}

/** Call after drawing: sets the cursor and drops a click nobody wanted. */
export function endUi(): void {
  if (!hoverSeen) hoverKey = '';
  if (canvasEl) canvasEl.style.cursor = hot ? 'pointer' : 'default';
}

/** The pending click, if it lands in the rect; consumes it. */
export function clicked(x: number, y: number, w: number, h: number): boolean {
  if (inside(pointer, x, y, w, h)) hot = true;
  if (click && inside(click, x, y, w, h)) {
    click = null;
    return true;
  }
  return false;
}

/** A click that no button used this frame (consumed). */
export function takeStrayClick(): Pt | null {
  const c = click;
  click = null;
  return c;
}

export interface ButtonOpts {
  color?: string;
  size?: number;
  disabled?: boolean;
  selected?: boolean;
  /** Press sound: 'back' for buttons that leave or close something, 'none' if the caller plays its own. */
  sound?: 'select' | 'back' | 'none';
}

const feel = new Map<string, { lift: Spring; tx: Spring; press: Spring; seen: number }>();
function shadeUi(hex: string, amt: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return 'rgba(0,0,0,0.35)';
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + 255 * amt)) | 0;
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Chunky toy-style pill button with depth. Returns true when clicked. */
export function button(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
  const over = !o.disabled && inside(pointer, x, y, w, h);
  const hit = !o.disabled && clicked(x, y, w, h);
  const color = o.color ?? '#2f8cff';
  if (over) {
    const key = `${label}@${x},${y}`;
    hoverSeen = true;
    if (key !== hoverKey) {
      hoverKey = key;
      uiSound.hover();
    }
  }
  if (hit && o.sound !== 'none') uiSound.press(o.sound ?? (/back|close|cancel|resume|leave|remove/i.test(label) ? 'back' : 'select'));
  // each button keeps its own springs, so it rises toward the pointer, leans after it and squashes when hit
  const key = `${label}@${x | 0},${y | 0}`;
  let st = feel.get(key);
  const now = performance.now() / 1000;
  if (!st) feel.set(key, (st = { lift: new Spring(0, 300, 18), tx: new Spring(0, 160, 16), press: new Spring(0, 600, 22), seen: now }));
  const dt = Math.min(0.05, Math.max(0, now - st.seen));
  st.seen = now;
  st.lift.target = over || o.selected ? 1 : 0;
  st.tx.target = over && pointer ? ((pointer.x - (x + w / 2)) / (w / 2)) * 0.6 : 0;
  if (hit) st.press.kick(-10);
  st.lift.step(dt);
  st.tx.step(dt);
  st.press.step(dt);
  if (feel.size > 300) for (const [k, v] of feel) if (now - v.seen > 2) feel.delete(k);
  ctx.save();
  ctx.globalAlpha = o.disabled ? 0.45 : 1;
  const r = h / 2;
  const lit = over || o.selected;
  card3d(
    ctx,
    { cx: x + w / 2, cy: y + h / 2, w, h, lift: st.lift.v * 0.5, tiltX: st.tx.v, tiltY: 0, scale: 1 + st.lift.v * 0.03 + st.press.v * 0.012, radius: r, depth: Math.min(7, h * 0.14) },
    shadeUi(color, -0.3),
    (pop) => {
      ctx.fillStyle = color;
      roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.save();
      roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.clip();
      sheen(ctx, w, h, st!.tx.v, 0, lit ? 0.3 : 0.12);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(ctx, -w / 2 + 8, -h / 2 + 4, w - 16, h * 0.38, h / 3);
      ctx.fill();
      ctx.lineWidth = lit ? 5 : 3;
      ctx.strokeStyle = lit ? '#ffe14d' : 'rgba(255,255,255,0.85)';
      roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.stroke();
      const q = pop(1);
      text(ctx, label, q.x, q.y + 1, o.size ?? Math.round(h * 0.42), { color: '#fff', weight: 800 });
    },
  );
  ctx.restore();
  return hit;
}

/** Put a click taken with takeStrayClick() back, so a panel drawn later in the frame can use it. */
export function putClick(p: Pt | null): void {
  click = p;
}
