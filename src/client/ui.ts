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
}

/** Call after drawing: sets the cursor and drops a click nobody wanted. */
export function endUi(): void {
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
}

/** Chunky toy-style pill button. Returns true when clicked. */
export function button(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
  const over = !o.disabled && inside(pointer, x, y, w, h);
  const hit = !o.disabled && clicked(x, y, w, h);
  const color = o.color ?? '#2f8cff';
  const lift = over ? -3 : 0;
  ctx.save();
  ctx.globalAlpha = o.disabled ? 0.45 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, x + 2, y + 6, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y + lift, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, x + 8, y + lift + 4, w - 16, h * 0.38, h / 3);
  ctx.fill();
  ctx.lineWidth = over || o.selected ? 5 : 3;
  ctx.strokeStyle = over || o.selected ? '#ffe14d' : 'rgba(255,255,255,0.85)';
  roundRect(ctx, x, y + lift, w, h, h / 2);
  ctx.stroke();
  text(ctx, label, x + w / 2, y + lift + h / 2 + 1, o.size ?? Math.round(h * 0.42), { color: '#fff', weight: 800 });
  ctx.restore();
  return hit;
}
