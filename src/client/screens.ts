import { GAMES, getGame } from '../shared/games';
import { GRID_COLS, MAX_PLAYERS, OPTIONS, ROUND_OPTIONS, optionsOfKind, selectionLabel, standings, type PartyOption, type PartyState } from '../shared/party';
import { getBoard, recommendedBoard } from '../shared/board/boards';
import { crownIcon } from './boardHud';
import { playerById, roundRect, text } from '../shared/draw';
import { clamp01, controlChips, easeOut, ribbon, slam, springIn, sunburst, vignette } from './showtime';
import { burst } from './juice';
import { A, B, X, promptKind } from './prompts';

/** 2D overlays for the menu screens. The 3D party stage is drawn underneath by the menu view. */
export interface ScreenCtx {
  status: string;
  roomCode: string | null;
  online?: boolean;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.42): void {
  ctx.fillStyle = `rgba(20,10,50,${a})`;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
}

/** Where the lobby's board flyover is drawn (HUD coordinates). */
export const PREVIEW = { x: 724, y: 252, w: 532, h: 222 };

/** Frame, name, description and player count around the board flyover. */
function boardCard(ctx: CanvasRenderingContext2D, s: PartyState, id: string): void {
  const b = getBoard(id);
  const { x, y, w, h } = PREVIEW;
  const strip = 76;
  // white toy-like frame with a drop shadow; the 3D flyover shows through the hole
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x - 8, y - 2, w + 16, h + strip + 16, 22);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x - 8, y - 8, w + 16, h + strip + 16, 22);
  ctx.rect(x + w, y, -w, h); // cut the window out (reverse winding)
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ctx.restore();
  // description strip
  ctx.fillStyle = '#2a1b5e';
  ctx.fillRect(x, y + h, w, strip);
  ribbon(ctx, x + w / 2, y + 4, Math.min(w - 40, 90 + b.name.length * 15), 40, '#9a5bff', b.name, 22);
  text(ctx, truncate(b.tagline, 58), x + w / 2, y + h + 22, 17, { color: '#ffffff', weight: 700, outline: false });
  // recommended players chip
  const [lo, hi] = b.players;
  const fits = s.players.length >= lo && s.players.length <= hi;
  const label = `Recommended: ${lo}-${hi}${hi >= 10 ? '+' : ''} players`;
  ctx.font = '800 16px system-ui, sans-serif';
  const cw = ctx.measureText(label).width + 40;
  ctx.fillStyle = fits ? '#21c45a' : '#ffd23f';
  roundRect(ctx, x + w / 2 - cw / 2, y + h + 38, cw, 28, 14);
  ctx.fill();
  peopleIcon(ctx, x + w / 2 - cw / 2 + 16, y + h + 52, fits ? '#ffffff' : '#2a1b5e');
  text(ctx, label, x + w / 2 + 8, y + h + 53, 16, { color: fits ? '#ffffff' : '#2a1b5e', weight: 800, outline: false });
}

/** The same frame around a live preview of the picked minigame, played by CPU stand-ins. */
function gameCard(ctx: CanvasRenderingContext2D, s: PartyState, id: string): void {
  const g = getGame(id);
  const { x, y, w, h } = PREVIEW;
  const strip = 76;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x - 8, y - 2, w + 16, h + strip + 16, 22);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x - 8, y - 8, w + 16, h + strip + 16, 22);
  ctx.rect(x + w, y, -w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ctx.restore();
  ctx.fillStyle = '#2a1b5e';
  ctx.fillRect(x, y + h, w, strip);
  ribbon(ctx, x + w / 2, y + 4, Math.min(w - 40, 90 + g.name.length * 15), 40, MODE_COLOR[g.mode] ?? '#9a5bff', g.name, 22);
  text(ctx, truncate(g.blurb, 58), x + w / 2, y + h + 22, 17, { color: '#ffffff', weight: 700, outline: false });
  const fits = s.players.length >= g.minPlayers && s.players.length <= g.maxPlayers;
  const label = `${g.mode}  ·  ${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}-${g.maxPlayers}`} players`;
  ctx.font = '800 16px system-ui, sans-serif';
  const cw = ctx.measureText(label).width + 40;
  ctx.fillStyle = fits ? '#21c45a' : '#ffd23f';
  roundRect(ctx, x + w / 2 - cw / 2, y + h + 38, cw, 28, 14);
  ctx.fill();
  peopleIcon(ctx, x + w / 2 - cw / 2 + 16, y + h + 52, fits ? '#ffffff' : '#2a1b5e');
  text(ctx, label, x + w / 2 + 8, y + h + 53, 16, { color: fits ? '#ffffff' : '#2a1b5e', weight: 800, outline: false });
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
  boards: { color: '#ff4d5a', title: 'Party Boards', sub: 'Roll the dice, race the board, grab Choppy Crowns', deco: 'dice' },
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
export const GRID = { x: 228, y: 572, w: 824, tileH: 50, gap: 8 };
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
function mixCard(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const { x, y, w, h } = PREVIEW;
  windowFrame(ctx, PREVIEW, 76);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#173a8a');
  g.addColorStop(1, '#2f8cff');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // three reels spinning through the minigames
  const pool = GAMES.filter((q) => q.mode !== 'Duel');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 50, w, h - 60);
  ctx.clip();
  for (let r = 0; r < 3; r++) {
    const cx = x + w * (0.2 + r * 0.3);
    const speed = 1.6 + r * 0.5;
    const f = t * speed + r * 3.3;
    for (let k = -1; k <= 2; k++) {
      const idx = (((Math.floor(f) + k + r * 7) % pool.length) + pool.length) % pool.length;
      const yy = y + 130 + (k - (f % 1)) * 60;
      const q = pool[idx];
      ctx.fillStyle = MODE_COLOR[q.mode] ?? '#9a5bff';
      roundRect(ctx, cx - 78, yy - 22, 156, 44, 12);
      ctx.fill();
      text(ctx, truncate(q.name, 19), cx, yy, 14, { color: '#fff', weight: 800 });
    }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y + 108, w, 44);
  ribbon(ctx, x + w / 2, y + 4, 260, 40, '#2f8cff', 'Minigame Mix', 22);
  const count = (m: string) => GAMES.filter((q) => q.mode === m).length;
  text(ctx, `${pool.length} minigames shuffled in, never the same twice in a row`, x + w / 2, y + h + 22, 16, { color: '#ffffff', weight: 700, outline: false });
  const label = `${count('Free-for-all')} free-for-all  ·  ${count('Team')} team  ·  ${count('1-vs-many')} 1-vs-many`;
  text(ctx, label, x + w / 2, y + h + 52, 15, { color: '#bfe0ff', weight: 700, outline: false });
}

export function drawLobby(ctx: CanvasRenderingContext2D, s: PartyState, sc: ScreenCtx, t = 0): void {
  const lk = lobbyKind(s, !!sc.online);
  const th = LOBBY_THEME[lk];
  backdrop(ctx, lk, t);
  ribbon(ctx, 640, 64, Math.max(360, th.title.length * 30), 70, th.color, th.title, 46);
  if (sc.roomCode) {
    // the room code is the star of the online lobby
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 1010, 22, 250, 84, 18);
    ctx.fill();
    ctx.strokeStyle = th.color;
    ctx.lineWidth = 5;
    ctx.stroke();
    text(ctx, 'ROOM CODE', 1135, 42, 15, { color: '#6b4bb8', weight: 800, outline: false });
    text(ctx, sc.roomCode, 1135, 78, 46, { color: '#2a1b5e', outline: false });
  }
  text(ctx, lk === 'online' && !sc.roomCode ? sc.status : th.sub, 640, 128, 22, { color: '#ffffff', weight: 700 });
  const k = promptKind();
  if (s.players.length === 0) {
    text(ctx, k === 'mouse' ? 'Click Join, or press A on a controller' : `Press ${A()} to join!`, 640, 360, 40, { color: '#fff' });
    text(ctx, 'Controllers: A   ·   Keyboard: Space or Enter', 640, 408, 20, { weight: 600 });
  } else {
    const bots = s.players.filter((p) => p.bot).length;
    const keysHint = k === 'pad' ? `${A()}: join  ·  ${B()}: leave  ·  X: character  ·  Y: colour` : k === 'mouse' ? 'Click ☺ for a new character, the paint drop for a new colour' : `C: character  ·  V: colour  ·  1/2/3: add CPU  ·  0: remove  ·  Tab: 2nd keyboard`;
    text(ctx, `${s.players.length}/${MAX_PLAYERS} players${bots ? ` (${bots} CPU)` : ''}   ·   ${keysHint}`, 640, 166, 20, {
      color: '#ffe9f6',
      weight: 600,
    });
  }

  const o = OPTIONS[s.selection];
  const hostHint = (pick: string) =>
    s.players.length ? (k === 'mouse' ? `Host: ${pick.replace('{keys}', 'click')}, then START` : `Host: ${pick.replace('{keys}', k === 'pad' ? 'stick' : 'arrows')}, ${A()} to start`) : '';
  if (lk === 'online') {
    // mode tabs: the room can play any mode, Start switches between them
    const tabs: [PartyOption['kind'], string][] = [['board', 'Boards'], ['mix', 'Mix'], ['game', 'Free Play']];
    tabs.forEach(([kind, label], i) => {
      const on = o.kind === kind;
      const ty = 80 + i * 46;
      ctx.fillStyle = on ? '#ffffff' : 'rgba(20,10,50,0.5)';
      roundRect(ctx, 16, ty, 150, 40, 14);
      ctx.fill();
      text(ctx, (on ? '▸ ' : '') + label, 91, ty + 21, 18, { color: on ? '#6b2bd9' : '#ffffff', weight: 800, outline: false });
    });
    if (k !== 'mouse') text(ctx, k === 'pad' ? 'Start: switch mode' : 'P: switch mode', 91, 276, 15, { color: '#ffe14d', weight: 700 });
  }
  if (o.kind === 'board') {
    boardCard(ctx, s, o.id);
    panel(ctx, 220, 556, 840, 130);
    text(ctx, selectionLabel(s), 640, 598, 36, { color: '#fff' });
    const b = getBoard(o.id);
    const best = s.players.length > 0 && recommendedBoard(s.players.length).id === b.id;
    const sub = `Best for ${b.players[0]}-${b.players[1]}${b.players[1] >= 10 ? '+' : ''} players${best ? '  ★ Recommended for your group' : ''}`;
    text(ctx, truncate(sub, 92), 640, 634, 17, { color: '#ffe0e2', weight: 500, outline: false });
    // one pip per board
    const boards = optionsOfKind('board');
    boards.forEach((bi, i) => {
      ctx.fillStyle = bi === s.selection ? '#ffe14d' : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(640 + (i - (boards.length - 1) / 2) * 22, 566, bi === s.selection ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, hostHint('{keys} left/right for a board, up/down for turns'), 640, 664, 17, { color: '#ffd23f', weight: 700, outline: false });
  } else if (o.kind === 'mix') {
    mixCard(ctx, s, t);
    panel(ctx, 220, 556, 840, 130);
    text(ctx, 'HOW MANY ROUNDS?', 640, 576, 18, { color: '#bfe0ff', weight: 800, outline: false });
    ROUND_OPTIONS.forEach((n, i) => {
      const on = i === s.roundsIdx;
      const cx = 640 + (i - 1) * 150;
      const sz = on ? 1.12 + Math.sin(t * 6) * 0.03 : 1;
      ctx.save();
      ctx.translate(cx, 620);
      ctx.scale(sz, sz);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, -58 + 3, -26 + 6, 116, 52, 16);
      ctx.fill();
      ctx.fillStyle = on ? '#2f8cff' : 'rgba(255,255,255,0.18)';
      roundRect(ctx, -58, -26, 116, 52, 16);
      ctx.fill();
      ctx.lineWidth = on ? 5 : 2;
      ctx.strokeStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.5)';
      ctx.stroke();
      ctx.restore();
      text(ctx, `${n}`, cx - 22, 620, 30, { color: '#fff' });
      text(ctx, 'rounds', cx + 26, 622, 14, { color: '#fff', weight: 800, outline: false });
    });
    text(ctx, hostHint('{keys} to pick the rounds'), 640, 670, 17, { color: '#ffd23f', weight: 700, outline: false });
  } else {
    gameCard(ctx, s, o.id);
    freeGrid(ctx, s, t);
    text(ctx, hostHint('{keys} to pick a game'), 640, 706, 15, { color: '#ffd23f', weight: 700 });
  }
}

/** Free Play: every minigame as a coloured tile. Two rows show; it scrolls as you move. */
function freeGrid(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  panel(ctx, GRID.x - 10, GRID.y - 14, GRID.w + 20, 2 * GRID.tileH + GRID.gap + 26, 0.5);
  const list = optionsOfKind('game');
  const rows = Math.ceil(list.length / GRID_COLS);
  const pos = list.indexOf(s.selection);
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
    text(ctx, truncate(g.name, 18), tile.x + tile.w / 2, tile.y + tile.h / 2 + 1, 14, { color: '#fff', weight: 800 });
  }
  // scroll pips down the side
  const row = Math.floor(Math.max(0, pos) / GRID_COLS);
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r === row ? '#ffe14d' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(GRID.x - 30, GRID.y + 6 + (r * (2 * GRID.tileH)) / Math.max(1, rows - 1), r === row ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, `${pos + 1}/${list.length}`, GRID.x - 76, GRID.y + GRID.tileH + 2, 15, { color: '#fff', weight: 800 });
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + 255 * amt)) | 0;
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const MODE_COLOR: Record<string, string> = { 'Free-for-all': '#ff8a1f', Team: '#3fa9f5', '1-vs-many': '#b06cff', Duel: '#ff4d5a' };

/** Where the minigame intro's live preview is drawn (HUD coordinates). */
export const INTRO_PREVIEW = { x: 700, y: 196, w: 552, h: 288 };

/** White toy frame around a 3D window, with a dark strip of `strip` px under it. */
function windowFrame(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, strip: number): void {
  const { x, y, w, h } = r;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, x - 8, y - 2, w + 16, h + strip + 16, 22);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x - 8, y - 8, w + 16, h + strip + 16, 22);
  ctx.rect(x + w, y, -w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ctx.fillStyle = '#2a1b5e';
  ctx.fillRect(x, y + h, w, strip);
  ctx.restore();
}

export function drawIntro(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const g = getGame(s.gameId!);
  const age = s.phaseT;
  const color = s.boardEvent === 'duel' ? '#ff4d5a' : s.boardEvent === 'stew' ? '#3fa9f5' : MODE_COLOR[g.mode] ?? '#ff8a1f';
  vignette(ctx, 0.45);
  sunburst(ctx, 640, 100, 560, t, color, 0.28);
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
  ribbon(ctx, 640, 40, Math.min(700, 120 + head.length * 13), 46, color, head, 21);
  ctx.restore();
  slam(ctx, g.name, 640, 118, 80, age, '#ffd23f', 0.15);

  // the live preview, with the controls underneath
  const r = INTRO_PREVIEW;
  const k = springIn(clamp01((age - 0.2) / 0.5));
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(k, k);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  windowFrame(ctx, r, 64);
  ribbon(ctx, r.x + 96, r.y + 6, 160, 34, color, 'PREVIEW', 16);
  controlChips(ctx, g.controls, r.x + r.w / 2, r.y + r.h + 32);
  ctx.restore();

  if (s.boardEvent === 'stew' && s.gamePlayers) {
    for (const team of [0, 1]) {
      const names = s.gamePlayers.filter((p) => p.team === team).map((p) => p.name).join(', ');
      ribbon(ctx, 340, 190 + team * 50, 600, 40, team ? '#3fa9f5' : '#ff5a5f', `${team ? 'Blue' : 'Red'}: ${names}`, 18);
    }
  }

  // ready count and how to ready up
  const who = s.gamePlayers ?? s.players;
  const ready = who.filter((p) => s.ready.includes(p.id)).length;
  const all = ready === who.length;
  const pulse = all ? 1 : 1 + Math.sin(t * 5) * 0.03;
  const how = promptKind() === 'mouse' ? 'Hold the mouse button to ready up' : `Hold ${A()} for 1 second to ready up`;
  ctx.save();
  ctx.translate(r.x + r.w / 2, 622);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = all ? 'rgba(33,196,90,0.85)' : 'rgba(20,10,50,0.7)';
  roundRect(ctx, -260, -26, 520, 52, 26);
  ctx.fill();
  text(ctx, all ? "Everyone's ready!" : `${how}  ·  ${ready}/${who.length}`, 0, 1, 21, { color: '#fff', weight: 800 });
  ctx.restore();
  text(ctx, `Host: ${X()} to start right away`, r.x + r.w / 2, 668, 17, { color: '#ffd23f', weight: 700 });
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
  ribbon(ctx, 330, 50, 420, 50, '#9a5bff', s.boardEvent ? g.name : onBoard ? `${g.name}: keys won` : g.name, 22);
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
    const total = onBoard ? `${s.board!.players[pl.id]?.keys ?? 0} keys` : `${s.scores[pl.id] ?? 0} pts`;
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
      text(ctx, `${bp?.keys ?? 0} keys`, x0 + w - 20, cy, 18, { align: 'right', color: '#2a1b5e', outline: false });
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

