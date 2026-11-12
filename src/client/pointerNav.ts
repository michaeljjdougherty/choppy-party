import * as THREE from 'three';
import type { InputManager } from './input';
import type { PartyState } from '../shared/party';
import { PAUSE_OPTIONS } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { PROMPT_LOCK, currentPlayer } from '../shared/board/engine';
import { ITEM_COLS, ITEM_GRID } from '../shared/board/items';
import { richWidth, roundRect, text } from '../shared/draw';
import { button, clicked, inside, pointerAt, takeStrayClick } from './ui';
import { B } from './prompts';
import { sfx } from './sfx';

/**
 * Mouse and touch for the board menus and the pause menu. The game itself only understands a stick
 * and buttons (so it works the same online), so a click on a menu row "walks" the highlight there
 * with short stick nudges, one step at a time, and then presses A (or B) for that player.
 *
 * Hit areas match the boxes boardHud.ts and main.ts draw; keep them in step if those layouts move.
 */

interface Goal {
  dev: string;
  /** The highlight right now, or null when the menu is gone. */
  read: () => number | null;
  want: number;
  /** Stick direction for one step from `cur` towards `want`. */
  dir: (cur: number, want: number) => [number, number];
  /** Button to press on arrival ('a' confirms, null just moves the highlight). */
  then: 'a' | 'b' | null;
  /** Wait for this before pressing (menus ignore presses for a moment after they open). */
  ready?: () => boolean;
  until: number;
  nextAt: number;
  last: number | null;
}

let goal: Goal | null = null;

/** Walk a menu's highlight to `want`, then press. Replaces any walk already going. */
function seek(input: InputManager, g: Omit<Goal, 'until' | 'nextAt' | 'last'>): void {
  goal = { ...g, until: performance.now() + 5000, nextAt: 0, last: null };
  stepSeek(input);
}

/** Call once a frame (after the session has updated). */
export function stepSeek(input: InputManager): void {
  const g = goal;
  if (!g) return;
  const now = performance.now();
  const cur = g.read();
  if (cur === null || now > g.until) {
    goal = null;
    return;
  }
  if (cur === g.want) {
    if (g.ready && !g.ready()) return;
    if (g.then) input.tap(g.dev, g.then);
    goal = null;
    return;
  }
  // one step at a time, waiting to see the highlight move (online, that takes a round trip)
  if (now < g.nextAt && cur === g.last) return;
  if (now < g.nextAt - 120) return;
  const [x, y] = g.dir(cur, g.want);
  input.nudge(g.dev, x, y, 0.1);
  g.last = cur;
  g.nextAt = now + 260;
}

export function seeking(): boolean {
  return !!goal;
}

const linear = (axis: 'x' | 'y') => (cur: number, want: number): [number, number] => {
  const d = Math.sign(want - cur);
  return axis === 'x' ? [d, 0] : [0, d];
};

function deviceOf(id: string): string {
  return id.slice(id.lastIndexOf('.') + 1);
}

/* ------------------------------------------------------------------ board */

const v3 = new THREE.Vector3();

/**
 * Clickable board menus for the local player whose turn it is: the two-choice prompts, the shop,
 * the item bag, item targets, path choice at forks and Square Brian's tour. Draws the few extra
 * buttons a mouse needs (arrows, Use, Close) and returns true when it used this frame's click.
 */
export function boardPointer(
  ctx: CanvasRenderingContext2D,
  s: PartyState,
  input: InputManager,
  localIds: Set<string>,
  project: (v: THREE.Vector3) => { x: number; y: number; visible: boolean },
  mapOpen: boolean,
): void {
  const b = s.board;
  if (!b || s.pause || mapOpen) return;
  const cur = currentPlayer(b);
  const human = (id: string) => localIds.has(id) && !s.players.find((p) => p.id === id)?.bot;
  const hostLocal = [...localIds].find((id) => human(id));

  // Brian's tour: anyone local can page it; the host can skip it
  if (b.sub === 'tour' && b.tour && hostLocal) {
    const dev = deviceOf(hostLocal);
    if (b.tour.i > 0 && button(ctx, '◀ Back', 290, 594, 150, 44, { color: '#6b6f86', size: 18 })) input.tap(dev, 'b');
    if (button(ctx, 'Next ▶', 460, 594, 150, 44, { color: '#21c45a', size: 18 })) input.tap(dev, 'a');
    if (button(ctx, 'Skip tour', 630, 594, 160, 44, { color: '#ff8a1f', size: 18 })) {
      // X skips, but only for the host: tap X for every local player so whichever is host counts
      for (const id of localIds) if (human(id)) input.tap(deviceOf(id), 'x');
    }
    return;
  }
  // Evil LeBron's dance party: the host can skip it (X), like the tour
  if (b.sub === 'boss' && b.boss?.dance && hostLocal) {
    if (button(ctx, 'Skip dance', 560, 618, 160, 44, { color: '#ff3b4e', size: 18 })) {
      for (const id of localIds) if (human(id)) input.tap(deviceOf(id), 'x');
    }
    return;
  }
  if (!human(cur)) return;
  const dev = deviceOf(cur);
  const me = b.players[cur];

  // B: Items chip under the board (the bag opens before the first die)
  if (b.sub === 'roll' && b.rolls.length === 0 && me) {
    const label = `${B()}: Items (${me.items.length})`;
    ctx.font = `800 18px system-ui, sans-serif`;
    const w = richWidth(ctx, label, 18) + 36;
    if (clicked(640 - w / 2, 670, w, 36)) {
      sfx.select();
      input.tap(dev, 'b');
    }
    return;
  }

  if (b.sub === 'branch' && b.branch) {
    branchPointer(ctx, s, input, dev, project);
    return;
  }

  if (b.sub !== 'prompt' || !b.prompt) return;
  const pm = b.prompt as { kind: string; sel: number; stock?: unknown[]; options?: string[]; purpose?: string };
  const readSel = () => {
    const p = s.board?.prompt as { kind: string; sel?: number } | null;
    return s.board?.sub === 'prompt' && p?.kind === pm.kind ? (p.sel ?? 0) : null;
  };
  // menus ignore presses for a moment after they open (engine PROMPT_LOCK)
  const live = () => (s.board?.promptAge ?? 1) > PROMPT_LOCK + 0.05;

  if (pm.kind === 'crown' || pm.kind === 'wisp' || pm.kind === 'train' || pm.kind === 'claim' || pm.kind === 'steal') {
    // the two big buttons, side by side at y 236
    for (const i of [0, 1]) {
      const x = 640 + (i === 0 ? -170 : 170);
      const h = pm.kind === 'claim' ? 74 : 58;
      if (clicked(x - 140, 236 - h / 2, 280, h)) {
        sfx.select();
        seek(input, { dev, read: readSel, want: i, dir: (c, w) => [w > c ? 1 : -1, 0], then: 'a', ready: live });
      }
    }
    // anywhere else on the screen does nothing (a stray click must never say yes)
    takeStrayClick();
    return;
  }

  if (pm.kind === 'shop' && pm.stock) {
    const x0 = 360, w = 560, y0 = 96;
    pm.stock.forEach((_, k) => {
      const y = y0 + 84 + k * 58;
      if (clicked(x0 + 16, y - 26, w - 32, 52)) seek(input, { dev, read: readSel, want: k, dir: linear('y'), then: 'a', ready: live });
    });
    const ly = y0 + 84 + pm.stock.length * 58;
    if (clicked(x0 + 16, ly - 22, w - 32, 44)) {
      goal = null;
      input.tap(dev, 'b');
    }
    takeStrayClick();
    return;
  }

  if (pm.kind === 'items') {
    const cols = ITEM_COLS, cell = 64, gap = 8;
    const rows = Math.ceil(ITEM_GRID.length / cols);
    const gw = cols * cell + (cols - 1) * gap;
    const x0 = 640 - gw / 2;
    const y0 = 704 - rows * cell - (rows - 1) * gap;
    const step = (c: number, w: number): [number, number] => {
      const dr = Math.floor(w / cols) - Math.floor(c / cols);
      return dr ? [0, Math.sign(dr)] : [Math.sign(w - c), 0];
    };
    ITEM_GRID.forEach((id, k) => {
      const x = x0 + (k % cols) * (cell + gap);
      const y = y0 + Math.floor(k / cols) * (cell + gap);
      if (!clicked(x, y, cell, cell)) return;
      // first click shows what it does; clicking the highlighted item again uses it
      const owned = me?.items.includes(id);
      if (pm.sel === k && owned) input.tap(dev, 'a');
      else seek(input, { dev, read: readSel, want: k, dir: step, then: null });
      sfx.move();
    });
    // Use / Close beside the tooltip
    const tw = 540, th = 104;
    const ty = y0 - 44 - th - 10;
    const owned = !!me?.items.includes(ITEM_GRID[pm.sel]);
    if (button(ctx, 'Use', 640 + tw / 2 + 14, ty + 4, 120, 46, { color: '#21c45a', size: 20, disabled: !owned || seeking() })) input.tap(dev, 'a');
    if (button(ctx, 'Close', 640 + tw / 2 + 14, ty + 58, 120, 46, { color: '#ff4d5a', size: 20 })) {
      goal = null;
      input.tap(dev, 'b');
    }
    takeStrayClick();
    return;
  }

  if (pm.kind === 'target' && pm.options) {
    const n = pm.options.length;
    if (button(ctx, '◀', 330, 196, 64, 56, { color: '#9a5bff', size: 26 })) seek(input, { dev, read: readSel, want: (pm.sel - 1 + n) % n, dir: () => [-1, 0], then: null });
    if (button(ctx, '▶', 886, 196, 64, 56, { color: '#9a5bff', size: 26 })) seek(input, { dev, read: readSel, want: (pm.sel + 1) % n, dir: () => [1, 0], then: null });
    // clicking the name picks them
    if (clicked(430, 196, 420, 60) || button(ctx, 'Pick', 560, 316, 160, 50, { color: '#21c45a', size: 22, disabled: seeking() })) {
      if (live()) input.tap(dev, 'a');
    }
    if (pm.purpose === 'item' && button(ctx, 'Back', 740, 316, 140, 50, { color: '#6b6f86', size: 20 })) input.tap(dev, 'b');
    takeStrayClick();
  }
}

/** Forks: a big tappable marker on each way out; a tap anywhere picks the way that points closest to it. */
function branchPointer(
  ctx: CanvasRenderingContext2D,
  s: PartyState,
  input: InputManager,
  dev: string,
  project: (v: THREE.Vector3) => { x: number; y: number; visible: boolean },
): void {
  const b = s.board!;
  const br = b.branch!;
  const def = getBoard(b.boardId);
  const here = def.nodes[b.players[currentPlayer(b)].node];
  if (!here) return;
  const me = project(v3.set(here.x, here.y + 0.6, here.z));
  const marks = br.options.map((o) => {
    const n = def.nodes[o];
    // a little way down the path, so the marker sits on the arrow rather than on the next space
    const p = project(v3.set(here.x + (n.x - here.x) * 0.75, n.y + 1.1, here.z + (n.z - here.z) * 0.75));
    return { n, p };
  });
  const ptr = pointerAt();
  let pick = -1;
  marks.forEach((m, i) => {
    if (!m.p.visible) return;
    const r = 34;
    const on = i === br.sel;
    const over = inside(ptr, m.p.x - r, m.p.y - r, r * 2, r * 2);
    ctx.save();
    ctx.globalAlpha = on || over ? 0.95 : 0.7;
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(m.p.x, m.p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2a1b5e';
    ctx.stroke();
    ctx.restore();
    text(ctx, on ? 'GO' : '▶', m.p.x, m.p.y + 1, on ? 22 : 24, { color: '#2a1b5e', outline: false, weight: 900 });
    if (clicked(m.p.x - r - 8, m.p.y - r - 8, (r + 8) * 2, (r + 8) * 2)) pick = i;
  });
  const stray = pick < 0 ? takeStrayClick() : null;
  if (stray && me.visible) {
    // tap anywhere: the way out whose screen direction best matches the tap
    const ax = stray.x - me.x, ay = stray.y - me.y;
    let best = -Infinity;
    marks.forEach((m, i) => {
      const bx = m.p.x - me.x, by = m.p.y - me.y;
      const dot = (ax * bx + ay * by) / ((Math.hypot(ax, ay) || 1) * (Math.hypot(bx, by) || 1));
      if (dot > best) {
        best = dot;
        pick = i;
      }
    });
  }
  if (pick < 0) return;
  sfx.select();
  const target = br.options[pick];
  const n = def.nodes[target];
  const dx = n.x - here.x, dz = n.z - here.z;
  const len = Math.hypot(dx, dz) || 1;
  seek(input, {
    dev,
    read: () => (s.board?.sub === 'branch' && s.board.branch ? s.board.branch.sel : null),
    want: pick,
    // the engine picks the exit the stick points at (in world x / z)
    dir: () => [dx / len, dz / len],
    then: 'a',
    ready: () => (s.board?.t ?? 0) > PROMPT_LOCK + 0.05,
  });
}

/* ------------------------------------------------------------------ pause menu */

/** Pause menu rows (main.ts pauseLayer draws them at the same spots). */
export const PAUSE_ROW_Y = 252;
export const PAUSE_ROW_H = 60;

/** Clickable pause menu rows (drawn by main.ts pauseLayer); a click on the help page goes back. */
export function pausePointer(s: PartyState, input: InputManager, mine: boolean): void {
  const p = s.pause;
  if (!p || !mine) return;
  const dev = deviceOf(p.by);
  if (p.help) {
    if (takeStrayClick()) input.tap(dev, 'a');
    return;
  }
  PAUSE_OPTIONS.forEach((_, i) => {
    const y = PAUSE_ROW_Y + i * PAUSE_ROW_H;
    if (clicked(450, y - 24, 380, 48)) {
      seek(input, {
        dev,
        read: () => (s.pause && !s.pause.help ? s.pause.sel : null),
        want: i,
        dir: linear('y'),
        then: 'a',
        ready: () => (s.pause?.cool ?? 0) < 0.15,
      });
    }
  });
}

/** Rounded highlight behind a pause row under the pointer (mouse only). */
export function pauseHover(ctx: CanvasRenderingContext2D, s: PartyState): void {
  if (!s.pause || s.pause.help) return;
  const ptr = pointerAt();
  PAUSE_OPTIONS.forEach((_, i) => {
    const y = PAUSE_ROW_Y + i * PAUSE_ROW_H;
    if (!inside(ptr, 450, y - 24, 380, 48)) return;
    ctx.save();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    roundRect(ctx, 450, y - 24, 380, 48, 16);
    ctx.stroke();
    ctx.restore();
  });
}
