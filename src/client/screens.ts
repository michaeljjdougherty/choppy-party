import { GAMES, getGame } from '../shared/games';
import { GRID_COLS, MAX_PLAYERS, MIX_MODES, OPTIONS, ROUND_OPTIONS, TURN_OPTIONS, mixPool, optionsOfKind, standings, type PartyOption, type PartyState } from '../shared/party';
import { getBoard, recommendedBoard } from '../shared/board/boards';
import { crownIcon } from './boardHud';
import { playerById, roundRect, text } from '../shared/draw';
import { clamp01, controlChips, easeOut, ribbon, slam, springIn, sunburst, vignette } from './showtime';
import { burst } from './juice';
import { A, B, X, isTouch, promptKind, tapWord } from './prompts';

/** 2D overlays for the menu screens. The 3D party stage is drawn underneath by the menu view. */
export interface ScreenCtx {
  status: string;
  roomCode: string | null;
  online?: boolean;
}

/**
 * Lobby layout (HUD coordinates, 1280x720). The left half is the party stage with everyone's
 * characters and the player controls; the right half is a big live preview with the picker under it.
 */
export const PREVIEW = { x: 624, y: 84, w: 640, h: 360 };
/** Dark caption strip under the preview window. */
const STRIP = 46;
/** Left column: the stage, the title and the player controls. */
export const LEFT = { x: 16, w: 584, cx: 336 };
/** The picker row right under the preview: ◀ name ▶ for boards, mode tabs for the mix. */
export const PICK = { y: 504, h: 56, prev: { x: 624, w: 60 }, next: { x: 1204, w: 60 } };
/** Turns / rounds stepper, bottom left of the right column. */
export const STEP = { minus: { x: 624, y: 630, w: 60, h: 56 }, plus: { x: 868, y: 630, w: 60, h: 56 }, cx: 776, cy: 658 };
export const START_BTN = { x: 1064, y: 618, w: 200, h: 86 };
/** Player hints and the CPU buttons, bottom of the left column. */
export const CPU_ROW = { y: 644, h: 46 };

function windowFrame(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, strip: number): void {
  const { x, y, w, h } = r;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x - 8, y - 2, w + 16, h + strip + 16, 22);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x - 8, y - 8, w + 16, h + strip + 16, 22);
  ctx.rect(x + w, y, -w, h); // cut the window out (reverse winding)
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ctx.fillStyle = '#2a1b5e';
  ctx.fillRect(x, y + h, w, strip);
  ctx.restore();
}

/** One line of text, cut with an ellipsis so it fits `maxW`. */
function fitLine(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, maxW: number, color = '#ffffff'): void {
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  let out = s;
  while (out.length > 4 && ctx.measureText(out).width > maxW) out = out.slice(0, -2).trimEnd() + '…';
  ctx.restore();
  text(ctx, out, x, y, size, { color, weight: 700, outline: false });
}

/** A small pill in the preview's top-left corner (player counts and the like). */
function cornerChip(ctx: CanvasRenderingContext2D, label: string, good: boolean): void {
  const { x, y } = PREVIEW;
  ctx.save();
  ctx.font = '800 15px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 44;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x + 12, y + 15, w, 30, 15);
  ctx.fill();
  ctx.fillStyle = good ? '#21c45a' : '#ffd23f';
  roundRect(ctx, x + 12, y + 12, w, 30, 15);
  ctx.fill();
  ctx.restore();
  peopleIcon(ctx, x + 30, y + 27, good ? '#ffffff' : '#2a1b5e');
  text(ctx, label, x + 12 + w / 2 + 9, y + 28, 15, { color: good ? '#ffffff' : '#2a1b5e', weight: 800, outline: false });
}

/** Frame, description and player count around the board flyover. */
function boardCard(ctx: CanvasRenderingContext2D, s: PartyState, id: string): void {
  const b = getBoard(id);
  const { x, y, w, h } = PREVIEW;
  windowFrame(ctx, PREVIEW, STRIP);
  fitLine(ctx, b.tagline, x + w / 2, y + h + STRIP / 2 + 1, 17, w - 40);
  const [lo, hi] = b.players;
  const best = s.players.length > 0 && recommendedBoard(s.players.length).id === b.id;
  cornerChip(ctx, best ? 'Best board for your group' : `Best for ${lo}-${hi}${hi >= 10 ? '+' : ''} players`, best);
}

/** The same frame around a live preview of the picked minigame, played by CPU stand-ins. */
function gameCard(ctx: CanvasRenderingContext2D, s: PartyState, id: string): void {
  const g = getGame(id);
  const { x, y, w, h } = PREVIEW;
  windowFrame(ctx, PREVIEW, STRIP);
  ribbon(ctx, x + w / 2, y + 2, Math.min(w - 120, 110 + g.name.length * 16), 42, MODE_COLOR[g.mode] ?? '#9a5bff', g.name, 22);
  fitLine(ctx, g.blurb, x + w / 2, y + h + STRIP / 2 + 1, 17, w - 40);
  const fits = s.players.length >= g.minPlayers && s.players.length <= g.maxPlayers;
  cornerChip(ctx, `${g.mode}  ·  ${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}-${g.maxPlayers}`} players`, fits);
}

function peopleIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  for (const [dx, r] of [[-3, 1], [4, 0.85]] as const) {
    ctx.beginPath();
    ctx.arc(x + dx, y - 4 * r, 3.2 * r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + dx, y + 5 * r, 5 * r, 4 * r, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

export type LobbyKind = 'boards' | 'mix' | 'free' | 'online';

/** Each lobby has its own colour, title and backdrop pattern, so the modes feel like different places. */
export const LOBBY_THEME: Record<LobbyKind, { color: string; title: string; sub: string; deco: 'dice' | 'stars' | 'tiles' | 'waves' }> = {
  boards: { color: '#ff4d5a', title: 'Party Boards', sub: 'Roll the dice, race the board, grab Chobglobs', deco: 'dice' },
  mix: { color: '#2f8cff', title: 'Minigame Mix', sub: 'Back-to-back minigames. Most points wins', deco: 'stars' },
  free: { color: '#21c45a', title: 'Free Play', sub: 'Pick any minigame and play it right now', deco: 'tiles' },
  online: { color: '#9a5bff', title: 'Play Online', sub: 'Friends join with the room code', deco: 'waves' },
};

export function lobbyKind(s: PartyState, online: boolean): LobbyKind {
  if (online) return 'online';
  const k = OPTIONS[s.selection].kind;
  return k === 'board' ? 'boards' : k === 'mix' ? 'mix' : 'free';
}

/** Free Play's tile grid (HUD coordinates): only two rows show at a time and it scrolls with the pick. */
export const GRID = { x: 652, y: 500, w: 612, tileH: 50, gap: 8 };
export function gridTiles(s: PartyState): { opt: number; x: number; y: number; w: number; h: number }[] {
  const list = optionsOfKind('game');
  const pos = Math.max(0, list.indexOf(s.selection));
  const rows = Math.ceil(list.length / GRID_COLS);
  const row = Math.floor(pos / GRID_COLS);
  const first = Math.max(0, Math.min(rows - 2, row));
  const tw = (GRID.w - (GRID_COLS - 1) * GRID.gap) / GRID_COLS;
  const out: { opt: number; x: number; y: number; w: number; h: number }[] = [];
  for (let r = first; r < Math.min(rows, first + 2); r++)
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      if (i >= list.length) break;
      out.push({ opt: list[i], x: GRID.x + c * (tw + GRID.gap), y: GRID.y + (r - first) * (GRID.tileH + GRID.gap), w: tw, h: GRID.tileH });
    }
  return out;
}

/** Online lobby mode tabs (main.ts makes them clickable). */
export const ONLINE_TABS: { kind: PartyOption['kind']; label: string; x: number; y: number; w: number; h: number }[] = (
  [['board', 'Boards'], ['mix', 'Mix'], ['game', 'Free Play']] as const
).map(([kind, label], i) => ({ kind, label, x: LEFT.cx - 175 + i * 120, y: 146, w: 110, h: 36 }));

/** Tinted bands top and bottom with the lobby's own pattern drifting through them. */
function backdrop(ctx: CanvasRenderingContext2D, kind: LobbyKind, t: number): void {
  const th = LOBBY_THEME[kind];
  ctx.save();
  const top = ctx.createLinearGradient(0, 0, 0, 250);
  top.addColorStop(0, hexA(th.color, 0.85));
  top.addColorStop(1, hexA(th.color, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, 1280, 250);
  const bot = ctx.createLinearGradient(0, 520, 0, 720);
  bot.addColorStop(0, hexA(th.color, 0));
  bot.addColorStop(1, hexA(th.color, 0.7));
  ctx.fillStyle = bot;
  ctx.fillRect(0, 520, 1280, 200);
  // the pattern, only in the top band
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  for (let i = 0; i < 18; i++) {
    const x = ((i * 151 + t * 22) % 1400) - 60;
    const y = 24 + ((i * 53) % 120);
    const sz = 14 + ((i * 7) % 10);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.4 + i);
    if (th.deco === 'dice') {
      roundRect(ctx, -sz, -sz, sz * 2, sz * 2, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (th.deco === 'stars') {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? sz * 0.45 : sz;
        const a = (k / 10) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.fill();
    } else if (th.deco === 'tiles') {
      ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, sz, 0, Math.PI * 2);
      ctx.moveTo(sz * 0.5, 0);
      ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The Minigame Mix card: a slot-machine reel of game names and what's in the pot. */
/** The Minigame Mix card: a slot-machine reel of game names and what's in the pot. */
function mixCard(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const { x, y, w, h } = PREVIEW;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#173a8a');
  g.addColorStop(1, '#2f8cff');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // three reels spinning through the minigames this mode deals
  const mode = s.mixMode ?? 0;
  const ids = mixPool(mode, Math.max(2, s.players.length));
  const pool = GAMES.filter((q) => ids.includes(q.id));
  const mid = y + h / 2 + 14;
  const rowH = 70;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 52, w, h - 52);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, mid - rowH / 2, w, rowH);
  for (let r = 0; r < 3 && pool.length; r++) {
    const cx = x + w * (0.18 + r * 0.32);
    const speed = 1.6 + r * 0.5;
    const f = t * speed + r * 3.3;
    for (let k = -3; k <= 3; k++) {
      const idx = (((Math.floor(f) + k + r * 7) % pool.length) + pool.length) % pool.length;
      const yy = mid + (k - (f % 1)) * rowH;
      const q = pool[idx];
      ctx.fillStyle = MODE_COLOR[q.mode] ?? '#9a5bff';
      roundRect(ctx, cx - 92, yy - 26, 184, 52, 14);
      ctx.fill();
      text(ctx, truncate(q.name, 20), cx, yy, 16, { color: '#fff', weight: 800 });
    }
  }
  ctx.restore();
  windowFrame(ctx, PREVIEW, STRIP);
  ribbon(ctx, x + w / 2, y + 2, 300, 42, MIX_COLOR[mode], `Mix: ${MIX_MODES[mode]}`, 22);
  const count = (m: string) => pool.filter((q) => q.mode === m).length;
  const label =
    mode === 1
      ? 'Two players face off each round, taking turns so everyone duels'
      : mode === 2
        ? 'Two even teams every round (odd numbers take turns sitting out)'
        : `${count('Free-for-all')} free-for-all  ·  ${count('Team')} team  ·  ${count('1-vs-many')} 1-vs-many, never the same twice in a row`;
  fitLine(ctx, label, x + w / 2, y + h + STRIP / 2 + 1, 16, w - 40, '#bfe0ff');
  cornerChip(ctx, `${pool.length} minigames`, pool.length > 0);
}

export function drawLobby(ctx: CanvasRenderingContext2D, s: PartyState, sc: ScreenCtx, t = 0): void {
  const lk = lobbyKind(s, !!sc.online);
  const th = LOBBY_THEME[lk];
  const cx = LEFT.cx;
  backdrop(ctx, lk, t);
  ribbon(ctx, cx + 30, 44, Math.max(300, th.title.length * 24), 56, th.color, th.title, 34);
  const k = promptKind();
  const o = OPTIONS[s.selection];
  if (lk === 'online') {
    // the room code is the star of the online lobby
    if (sc.roomCode) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, cx - 120, 84, 240, 50, 16);
      ctx.fill();
      ctx.strokeStyle = th.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      text(ctx, 'CODE', cx - 78, 110, 15, { color: '#6b4bb8', weight: 800, outline: false });
      text(ctx, sc.roomCode, cx + 30, 110, 36, { color: '#2a1b5e', outline: false });
    } else text(ctx, sc.status, cx, 108, 18, { color: '#ffffff', weight: 700 });
    // mode tabs: the room can play any mode, Start (or a click) switches between them
    for (const tab of ONLINE_TABS) {
      const on = o.kind === tab.kind;
      ctx.fillStyle = on ? '#ffffff' : 'rgba(20,10,50,0.5)';
      roundRect(ctx, tab.x, tab.y, tab.w, tab.h, 14);
      ctx.fill();
      text(ctx, tab.label, tab.x + tab.w / 2, tab.y + tab.h / 2 + 1, 16, { color: on ? '#6b2bd9' : '#ffffff', weight: 800, outline: false });
    }
  } else text(ctx, th.sub, cx, 98, 18, { color: '#ffffff', weight: 700 });

  if (s.players.length === 0) {
    text(ctx, k === 'mouse' ? `${tapWord()} Join to play` : `Press ${A()} to join!`, cx, 340, 36, { color: '#fff' });
    text(ctx, 'Controllers: A   ·   Keyboard: Space or Enter', cx, 386, 18, { weight: 600 });
  } else {
    const bots = s.players.filter((p) => p.bot).length;
    text(ctx, `${s.players.length}/${MAX_PLAYERS} players${bots ? `  ·  ${bots} CPU` : ''}`, cx, lk === 'online' ? 202 : 132, 18, { color: '#ffe9f6', weight: 700 });
    // keyboard and controller players get one short line of buttons; mouse and touch just use the buttons
    const keysHint =
      k === 'pad'
        ? `${A()} join  ·  ${B()} leave  ·  X character  ·  Y colour  ·  LB/RB name`
        : k === 'keys'
          ? 'C character  ·  V colour  ·  N name  ·  1/2/3 add CPU  ·  0 remove  ·  Tab 2nd keyboard'
          : '';
    if (keysHint) text(ctx, keysHint, cx, CPU_ROW.y - 22, 15, { color: '#ffffff', weight: 600 });
  }

  const stick = k === 'pad' ? 'Stick' : 'Arrows';
  const hostLine = (what: string) => (k !== 'mouse' && s.players.length ? `Host: ${what}  ·  ${A()} start` : '');
  if (o.kind === 'board') {
    boardCard(ctx, s, o.id);
    const b = getBoard(o.id);
    text(ctx, b.name, PREVIEW.x + PREVIEW.w / 2, PICK.y + 24, 30, { color: '#fff' });
    const boards = optionsOfKind('board');
    boards.forEach((bi, i) => {
      ctx.fillStyle = bi === s.selection ? '#ffe14d' : 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(PREVIEW.x + PREVIEW.w / 2 + (i - (boards.length - 1) / 2) * 20, PICK.y + 52, bi === s.selection ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    stepper(ctx, `${TURN_OPTIONS[s.turnsIdx]}`, 'turns', s.turnsIdx > 0, s.turnsIdx < TURN_OPTIONS.length - 1);
    const hl = hostLine(`${stick} ◀▶ board, ▲▼ turns`);
    if (hl) text(ctx, hl, START_BTN.x - 132, 708, 14, { color: '#ffd23f', weight: 700, outline: true });
  } else if (o.kind === 'mix') {
    mixCard(ctx, s, t);
    // the mode switch: Classic, Duel or Stew Battle
    MIX_MODES.forEach((m, i) => {
      const on = i === (s.mixMode ?? 0);
      const r = MIX_TABS[i];
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, r.x + 2, r.y + 5, r.w, r.h, 16);
      ctx.fill();
      ctx.fillStyle = on ? MIX_COLOR[i] : 'rgba(20,10,50,0.55)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.lineWidth = on ? 4 : 2;
      ctx.strokeStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.45)';
      ctx.stroke();
      text(ctx, m, r.x + r.w / 2, r.y + r.h / 2 + 1, 20, { color: '#fff', weight: 900 });
    });
    stepper(ctx, `${ROUND_OPTIONS[s.roundsIdx]}`, 'rounds', s.roundsIdx > 0, s.roundsIdx < ROUND_OPTIONS.length - 1);
    const hl = hostLine(`${stick} ▲▼ mode, ◀▶ rounds`);
    if (hl) text(ctx, hl, START_BTN.x - 132, 708, 14, { color: '#ffd23f', weight: 700, outline: true });
  } else {
    gameCard(ctx, s, o.id);
    freeGrid(ctx, s, t);
    const hl = hostLine(`${stick} to pick a game`);
    if (hl) text(ctx, hl, (PREVIEW.x + START_BTN.x - 12) / 2, 664, 15, { color: '#ffd23f', weight: 700 });
  }
}

/** The turns / rounds count between its − and + buttons (main.ts draws the buttons). */
function stepper(ctx: CanvasRenderingContext2D, n: string, unit: string, _less: boolean, _more: boolean): void {
  const { minus, plus, cx, cy } = STEP;
  ctx.fillStyle = 'rgba(20,10,50,0.55)';
  roundRect(ctx, minus.x + minus.w / 2, minus.y + 4, plus.x + plus.w / 2 - (minus.x + minus.w / 2), minus.h - 8, 18);
  ctx.fill();
  text(ctx, n, cx - 30, cy, 34, { color: '#fff' });
  text(ctx, unit, cx + 22, cy + 3, 18, { color: '#fff', weight: 800, align: 'left' });
}

/** Free Play: every minigame as a coloured tile. Two rows show; it scrolls as you move. */
function freeGrid(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const list = optionsOfKind('game');
  const rows = Math.ceil(list.length / GRID_COLS);
  const pos = list.indexOf(s.selection);
  ctx.fillStyle = 'rgba(20,10,50,0.5)';
  roundRect(ctx, PREVIEW.x - 8, GRID.y - 12, PREVIEW.w + 16, 2 * GRID.tileH + GRID.gap + 24, 18);
  ctx.fill();
  for (const tile of gridTiles(s)) {
    const o = OPTIONS[tile.opt];
    if (o.kind !== 'game') continue;
    const g = getGame(o.id);
    const on = tile.opt === s.selection;
    const col = MODE_COLOR[g.mode] ?? '#9a5bff';
    ctx.save();
    if (on) {
      const b = 1.06 + Math.sin(t * 7) * 0.02;
      ctx.translate(tile.x + tile.w / 2, tile.y + tile.h / 2);
      ctx.scale(b, b);
      ctx.translate(-(tile.x + tile.w / 2), -(tile.y + tile.h / 2));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, tile.x + 2, tile.y + 5, tile.w, tile.h, 12);
    ctx.fill();
    const gr = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.h);
    gr.addColorStop(0, shadeHex(col, 0.22));
    gr.addColorStop(1, col);
    ctx.fillStyle = gr;
    roundRect(ctx, tile.x, tile.y, tile.w, tile.h, 12);
    ctx.fill();
    ctx.lineWidth = on ? 5 : 2;
    ctx.strokeStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.7)';
    ctx.stroke();
    ctx.restore();
    // names wrap onto two lines so nothing is cut off
    const lines = twoLines(ctx, g.name, tile.w - 10, 13);
    lines.forEach((l, i) => text(ctx, l, tile.x + tile.w / 2, tile.y + tile.h / 2 + 1 + (i - (lines.length - 1) / 2) * 15, 13, { color: '#fff', weight: 800 }));
  }
  // scroll pips down the side
  const row = Math.floor(Math.max(0, pos) / GRID_COLS);
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r === row ? '#ffe14d' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(PREVIEW.x + 12, GRID.y + 4 + (r * (2 * GRID.tileH)) / Math.max(1, rows - 1), r === row ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function twoLines(ctx: CanvasRenderingContext2D, s: string, maxW: number, size: number): string[] {
  ctx.save();
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const fits = (x: string) => ctx.measureText(x).width <= maxW;
  let out = [s];
  if (!fits(s)) {
    const words = s.split(' ');
    let best: string[] | null = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      if (fits(a) && fits(b)) {
        best = [a, b];
        break;
      }
    }
    out = best ?? [truncate(s, 16)];
  }
  ctx.restore();
  return out;
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + 255 * amt)) | 0;
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const MIX_COLOR = ['#2f8cff', '#ff4d5a', '#ff9f1c'];
/** Where the Mix mode tabs sit, right under the preview (main.ts makes them clickable). */
export const MIX_TABS = [0, 1, 2].map((i) => ({ x: PREVIEW.x + i * ((PREVIEW.w + 12) / 3), y: PICK.y, w: (PREVIEW.w - 24) / 3, h: PICK.h - 4 }));
const MODE_COLOR: Record<string, string> = { 'Free-for-all': '#ff8a1f', Team: '#3fa9f5', '1-vs-many': '#b06cff', Duel: '#ff4d5a' };

/** Where the minigame intro's live preview is drawn (HUD coordinates): big, on the right. */
export const INTRO_PREVIEW = { x: 548, y: 158, w: 716, h: 402 };
/** The intro's ready pill and the host's Start now button, under the preview. */
export const INTRO_READY = { cx: 880, y: 658 };
export const INTRO_START = { x: 1132, y: 634, w: 132, h: 48 };

export function drawIntro(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const g = getGame(s.gameId!);
  const age = s.phaseT;
  const color = s.boardEvent === 'duel' ? '#ff4d5a' : s.boardEvent === 'stew' ? '#3fa9f5' : MODE_COLOR[g.mode] ?? '#ff8a1f';
  vignette(ctx, 0.45);
  sunburst(ctx, 640, 90, 520, t, color, 0.28);
  const head =
    s.boardEvent === 'duel'
      ? `DUEL!  ${s.gamePlayers?.map((p) => p.name).join('  vs  ')}`
      : s.boardEvent === 'stew'
        ? 'STEW BATTLE!  Red team vs Blue team'
        : s.board
          ? `Turn ${s.board.turn} minigame  ·  ${g.mode}`
          : `Round ${s.round + 1} of ${s.playlist.length}  ·  ${g.mode}`;
  const rib = easeOut(age / 0.4);
  ctx.save();
  ctx.translate(0, (1 - rib) * -90);
  ribbon(ctx, 640, 34, Math.min(700, 120 + head.length * 12), 42, color, head, 19);
  ctx.restore();
  slam(ctx, g.name, 640, 104, 68, age, '#ffd23f', 0.15);

  // the live preview, with the controls underneath
  const r = INTRO_PREVIEW;
  const strip = 64;
  const k = springIn(clamp01((age - 0.2) / 0.5));
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(k, k);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  windowFrame(ctx, r, strip);
  ribbon(ctx, r.x + 96, r.y + 4, 160, 34, color, 'PREVIEW', 16);
  controlChips(ctx, g.controls, r.x + r.w / 2, r.y + r.h + strip / 2);
  ctx.restore();

  if (s.boardEvent === 'stew' && s.gamePlayers) {
    for (const team of [0, 1]) {
      const names = s.gamePlayers.filter((p) => p.team === team).map((p) => p.name).join(', ');
      ribbon(ctx, 272, 186 + team * 48, 470, 38, team ? '#3fa9f5' : '#ff5a5f', truncate(`${team ? 'Blue' : 'Red'}: ${names}`, 46), 17);
    }
  }

  // ready count and how to ready up
  const who = s.gamePlayers ?? s.players;
  const ready = who.filter((p) => s.ready.includes(p.id)).length;
  const all = ready === who.length;
  const pulse = all ? 1 : 1 + Math.sin(t * 5) * 0.03;
  const how = promptKind() === 'mouse' ? (isTouch() ? 'Hold your finger down to ready up' : 'Hold the mouse button to ready up') : `Hold ${A()} to ready up`;
  ctx.save();
  ctx.translate(INTRO_READY.cx, INTRO_READY.y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = all ? 'rgba(33,196,90,0.9)' : 'rgba(20,10,50,0.75)';
  roundRect(ctx, -236, -25, 472, 50, 25);
  ctx.fill();
  text(ctx, all ? "Everyone's ready!" : `${how}  ·  ${ready}/${who.length}`, 0, 1, 19, { color: '#fff', weight: 800 });
  ctx.restore();
  if (promptKind() !== 'mouse') text(ctx, `Host: ${X()} to start right away`, INTRO_READY.cx, 702, 15, { color: '#ffd23f', weight: 700 });
}


const MEDAL = ['#ffcf3a', '#d5dbe6', '#e09a5a'];

/** `age` counts from the moment the results are revealed (after the FINISH! freeze). */
export function drawResults(ctx: CanvasRenderingContext2D, s: PartyState, age: number, t: number): void {
  const g = getGame(s.gameId!);
  const onBoard = !!s.board;
  vignette(ctx, 0.35);
  const rows = s.placements;
  const top = rows.filter((r) => r.place === 1).map((r) => playerById(s.players, r.id)!).filter(Boolean);
  // winner spotlight over the podium
  sunburst(ctx, 330, 360, 420, t, top[0]?.color ?? '#ffd23f', 0.3 * clamp01(age * 2));
  ribbon(ctx, 330, 50, 420, 50, '#9a5bff', s.boardEvent ? g.name : onBoard ? `${g.name}: Pit Coin won` : g.name, 22);
  const headline = top.length > 1 ? 'IT\'S A TIE!' : `${top[0]?.name ?? ''} WINS!`;
  slam(ctx, headline, 330, 124, top.length > 1 ? 58 : Math.min(64, 900 / Math.max(6, headline.length)), age, top[0]?.color ?? '#ffd23f', 0.1);

  // rows land from the bottom up: last place first, the winner last
  const n = rows.length;
  const rowH = Math.min(62, 520 / Math.max(1, n));
  const x0 = 690;
  const w = 560;
  const y0 = Math.max(90, 380 - (rowH * n) / 2);
  rows.forEach((pl, i) => {
    const p = playerById(s.players, pl.id);
    if (!p) return;
    const delay = 0.25 + (n - 1 - i) * 0.16 + (i === 0 ? 0.25 : 0);
    const k = springIn(clamp01((age - delay) / 0.45));
    if (k <= 0) return;
    const y = y0 + i * rowH;
    ctx.save();
    ctx.translate((1 - k) * 700, 0);
    const big = pl.place === 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, x0 + 3, y + 6, w, rowH - 8, (rowH - 8) / 2);
    ctx.fill();
    ctx.fillStyle = big ? '#fff6d6' : '#ffffff';
    roundRect(ctx, x0, y, w, rowH - 8, (rowH - 8) / 2);
    ctx.fill();
    ctx.lineWidth = big ? 5 : 3;
    ctx.strokeStyle = big ? '#ffcf3a' : p.color;
    ctx.stroke();
    const cy = y + (rowH - 8) / 2;
    // medal or place
    const r = (rowH - 8) / 2 - 5;
    ctx.fillStyle = MEDAL[pl.place - 1] ?? '#5a4b8a';
    ctx.beginPath();
    ctx.arc(x0 + r + 6, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, String(pl.place), x0 + r + 6, cy + 1, Math.min(26, r * 1.2), { color: pl.place <= 3 ? '#3a2a10' : '#fff', outline: false });
    // colour dot and name
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x0 + r * 2 + 30, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name, x0 + r * 2 + 48, cy, Math.min(26, rowH * 0.42), { align: 'left', color: '#2a1b5e', outline: false, weight: 800 });
    text(ctx, pl.label, x0 + w - 150, cy, 17, { align: 'right', weight: 600, color: '#6b5d99', outline: false });
    // points pop in after the row lands
    const pk = springIn(clamp01((age - delay - 0.35) / 0.35));
    if (pl.points && pk > 0) {
      ctx.save();
      ctx.translate(x0 + w - 104, cy);
      ctx.scale(pk, pk);
      text(ctx, `+${pl.points}`, 0, 0, 24, { color: onBoard ? '#e0a800' : '#21a64a', outline: false, weight: 900 });
      ctx.restore();
    }
    const total = onBoard ? `${s.board!.players[pl.id]?.keys ?? 0} Pit Coin` : `${s.scores[pl.id] ?? 0} pts`;
    text(ctx, total, x0 + w - 22, cy, 18, { align: 'right', color: '#2a1b5e', outline: false, weight: 800 });
    ctx.restore();
  });
  if (s.boardEvent && s.eventLine && age > 1.2) ribbon(ctx, 970, y0 + n * rowH + 30, 560, 44, '#ff8a1f', s.eventLine, 18);
  const more = onBoard && (s.boardEvent || s.board!.turn < s.board!.maxTurns) ? `Host: ${A()} to go back to the board` : `Host: ${A()} to continue`;
  if (age > 1.4) {
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
    text(ctx, more, 970, 694, 20, { weight: 800 });
    ctx.restore();
  }
}

let lastFireworks = 0;

export function drawFinal(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const age = s.phaseT;
  const st = standings(s);
  const winners = st.filter((r) => r.place === 1).map((r) => playerById(s.players, r.id)!).filter(Boolean);
  const champ = winners[0];
  vignette(ctx, 0.45);
  sunburst(ctx, 330, 330, 560, t * 1.4, champ?.color ?? '#ffd23f', 0.42);
  sunburst(ctx, 330, 330, 380, -t, '#ffd23f', 0.25, 12);
  // fireworks every couple of seconds for a while
  if (age < 14 && Math.floor(age / 1.7) !== lastFireworks) {
    lastFireworks = Math.floor(age / 1.7);
    burst(45);
  }
  ribbon(ctx, 330, 46, 380, 52, '#ffcf3a', s.board ? 'PARTY CHAMPION' : 'MINIGAME CHAMPION', 22, '#3a2a10');
  if (winners.length > 1) slam(ctx, 'IT\'S A TIE!', 330, 130, 70, age, '#ffd23f', 0.2);
  else if (champ) {
    const k = springIn(clamp01((age - 0.15) / 0.5));
    ctx.save();
    ctx.translate(330, 104 - (1 - k) * 60);
    ctx.rotate(Math.sin(t * 2) * 0.08);
    crownIcon(ctx, 0, 0, 2.6 * k);
    ctx.restore();
    slam(ctx, champ.name, 330, 160, Math.min(78, 1000 / Math.max(5, champ.name.length)), age, champ.color, 0.3);
  }
  const rowH = Math.min(50, 500 / Math.max(1, st.length));
  const x0 = 720;
  const w = 500;
  const y0 = Math.max(80, 370 - (rowH * st.length) / 2);
  st.forEach((r, i) => {
    const p = playerById(s.players, r.id);
    if (!p) return;
    const k = springIn(clamp01((age - 0.6 - i * 0.1) / 0.45));
    if (k <= 0) return;
    const y = y0 + i * rowH;
    const cy = y + (rowH - 8) / 2;
    ctx.save();
    ctx.translate((1 - k) * 600, 0);
    ctx.fillStyle = r.place === 1 ? '#fff6d6' : 'rgba(255,255,255,0.92)';
    roundRect(ctx, x0, y, w, rowH - 8, (rowH - 8) / 2);
    ctx.fill();
    ctx.lineWidth = r.place === 1 ? 5 : 3;
    ctx.strokeStyle = r.place === 1 ? '#ffcf3a' : p.color;
    ctx.stroke();
    const rr = (rowH - 8) / 2 - 5;
    ctx.fillStyle = MEDAL[r.place - 1] ?? '#5a4b8a';
    ctx.beginPath();
    ctx.arc(x0 + rr + 6, cy, rr, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(r.place), x0 + rr + 6, cy + 1, Math.min(22, rr * 1.2), { color: r.place <= 3 ? '#3a2a10' : '#fff', outline: false });
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x0 + rr * 2 + 28, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name, x0 + rr * 2 + 44, cy, Math.min(24, rowH * 0.44), { align: 'left', color: '#2a1b5e', outline: false, weight: 800 });
    if (s.board) {
      const bp = s.board.players[r.id];
      crownIcon(ctx, x0 + w - 150, cy, 1.1);
      text(ctx, String(bp?.crowns ?? 0), x0 + w - 130, cy, 22, { align: 'left', color: '#2a1b5e', outline: false });
      text(ctx, `${bp?.keys ?? 0} Pit Coin`, x0 + w - 20, cy, 18, { align: 'right', color: '#2a1b5e', outline: false });
    } else text(ctx, `${r.score} pts`, x0 + w - 20, cy, 20, { align: 'right', color: '#2a1b5e', outline: false });
    ctx.restore();
  });
  if (age > 2) {
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
    text(ctx, `Host: ${A()} to return to the lobby`, 970, 694, 20, { weight: 800 });
    ctx.restore();
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

