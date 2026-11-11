import { GAMES, getGame } from '../shared/games';
import { MAX_PLAYERS, OPTIONS, ROUND_OPTIONS, selectionLabel, standings, type PartyState } from '../shared/party';
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

export function drawLobby(ctx: CanvasRenderingContext2D, s: PartyState, sc: ScreenCtx): void {
  text(ctx, 'Choppy Party', 640, 74, 84, { color: '#ffd23f' });
  text(ctx, sc.roomCode ? `Room code: ${sc.roomCode}` : sc.status, 640, 136, 28, { color: '#ffffff', weight: 700 });
  const k = promptKind();
  if (s.players.length === 0) {
    text(ctx, k === 'mouse' ? 'Click Join, or press A on a controller' : `Press ${A()} to join!`, 640, 360, 40, { color: '#fff' });
    text(ctx, 'Controllers: A   ·   Keyboard: Space or Enter', 640, 408, 20, { weight: 600 });
  } else {
    const bots = s.players.filter((p) => p.bot).length;
    const keysHint = k === 'pad' ? `${A()}: join  ·  ${B()}: leave  ·  X: character  ·  Y: colour` : k === 'mouse' ? 'Click ☺ for a new character, the paint drop for a new colour' : `C: character  ·  V: colour  ·  1/2/3: add CPU  ·  0: remove  ·  Tab: 2nd keyboard`;
    text(ctx, `${s.players.length}/${MAX_PLAYERS} players${bots ? ` (${bots} CPU)` : ''}   ·   ${keysHint}`, 640, 172, 20, {
      color: '#ffe9f6',
      weight: 600,
    });
  }

  panel(ctx, 220, 556, 840, 130);
  text(ctx, selectionLabel(s), 640, 598, 36, { color: '#fff' });
  const o = OPTIONS[s.selection];
  let sub: string;
  if (o.kind === 'board') {
    boardCard(ctx, s, o.id);
    const b = getBoard(o.id);
    const best = s.players.length > 0 && recommendedBoard(s.players.length).id === b.id;
    sub = `Best for ${b.players[0]}-${b.players[1]}${b.players[1] >= 10 ? '+' : ''} players${best ? '  ★ Recommended for your group' : ''}  ·  Up/Down: turns`;
  } else if (o.kind === 'mix') {
    sub = `Up/Down: ${ROUND_OPTIONS.join(' / ')} rounds  ·  ${GAMES.length} games in the mix`;
  } else {
    const g = getGame(o.id);
    gameCard(ctx, s, o.id);
    sub = `${g.mode}  ·  ${g.blurb}`;
  }
  text(ctx, truncate(sub, 92), 640, 636, 17, { color: '#e8ddff', weight: 500, outline: false });
  if (s.players.length) {
    const hint = k === 'mouse' ? 'Host: click the arrows to choose, then START' : k === 'pad' ? 'Host: Left/Right to choose, A to start' : `Host: A/D or Left/Right to choose, ${A()} to start`;
    text(ctx, hint, 640, 664, 17, { color: '#ffd23f', weight: 700, outline: false });
  }
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

