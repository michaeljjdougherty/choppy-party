import { GAMES, getGame } from '../shared/games';
import { MAX_PLAYERS, ROUND_OPTIONS, selectionLabel, standings, type PartyState } from '../shared/party';
import { drawChoppy, playerById, roundRect, text } from '../shared/draw';
import { PLAYER_COLORS } from '../shared/players';

export interface ScreenCtx {
  status: string;
  roomCode: string | null;
  localIds: Set<string>;
}

function backdrop(ctx: CanvasRenderingContext2D, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 1280, 720);
  g.addColorStop(0, '#2a1b5e');
  g.addColorStop(1, '#0f3b5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 18; i++) {
    const x = ((i * 173 + t * 20) % 1400) - 60;
    const y = (i * 97) % 720;
    ctx.beginPath();
    ctx.arc(x, y, 30 + (i % 4) * 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
}

export function drawLobby(ctx: CanvasRenderingContext2D, s: PartyState, sc: ScreenCtx, wallT: number): void {
  backdrop(ctx, wallT);
  text(ctx, 'Choppy Party', 640, 78, 72, { color: '#ffd23f' });
  text(ctx, sc.roomCode ? `Room code: ${sc.roomCode}` : sc.status, 640, 132, 26, { color: '#cfe8ff', weight: 600 });

  // player slots
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 170 + col * 235;
    const y = 250 + row * 150;
    const p = s.players.find((q) => q.slot === i);
    ctx.fillStyle = p ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    roundRect(ctx, x - 100, y - 60, 200, 128, 16);
    ctx.fill();
    if (p) {
      drawChoppy(ctx, x, y - 6, 34, p.color, { look: Math.sin(wallT * 2 + i) * 0.6 + Math.PI / 2 });
      text(ctx, p.name, x, y + 46, 20);
      if (sc.localIds.has(p.id) && sc.roomCode) text(ctx, 'you', x + 70, y - 44, 13, { color: '#ffd23f', weight: 600 });
      if (s.players[0]?.id === p.id) text(ctx, 'HOST', x - 66, y - 44, 13, { color: '#ffd23f', weight: 700 });
    } else {
      ctx.strokeStyle = PLAYER_COLORS[i] + '55';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 6, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, 'Press A to join', x, y + 46, 15, { color: 'rgba(255,255,255,0.45)', weight: 500, outline: false });
    }
  }

  // game picker
  panel(ctx, 240, 540, 800, 120);
  text(ctx, `◀  ${selectionLabel(s)}  ▶`, 640, 580, 32, { color: '#fff' });
  const sub =
    s.selection === 0
      ? `Up/Down: ${ROUND_OPTIONS.join(' / ')} rounds  ·  ${GAMES.length} games in the mix`
      : `${getGame(GAMES[s.selection - 1].id).mode}  ·  ${GAMES[s.selection - 1].blurb}`;
  text(ctx, truncate(sub, 90), 640, 616, 16, { color: '#cfe8ff', weight: 500, outline: false });
  text(
    ctx,
    s.players.length ? 'Host: Left/Right to choose, A to start   ·   B to leave' : 'Pads: press A   ·   Keys: Space (WASD) or Enter (Arrows)',
    640,
    644,
    15,
    { color: '#ffd23f', weight: 600, outline: false },
  );
}

export function drawIntro(ctx: CanvasRenderingContext2D, s: PartyState, wallT: number): void {
  backdrop(ctx, wallT);
  const g = getGame(s.gameId!);
  text(ctx, `Round ${s.round + 1} of ${s.playlist.length}`, 640, 70, 26, { color: '#cfe8ff', weight: 600 });
  text(ctx, g.name, 640, 140, 72, { color: '#ffd23f' });
  text(ctx, g.mode, 640, 200, 24, { color: '#fff', weight: 600 });
  panel(ctx, 190, 240, 900, 200);
  wrapText(ctx, g.blurb, 640, 290, 820, 30, 28);
  text(ctx, g.controls, 640, 405, 24, { color: '#ffd23f', weight: 600, outline: false });

  const n = s.players.length;
  const gap = Math.min(116, 1100 / Math.max(1, n));
  const x0 = 640 - ((n - 1) * gap) / 2;
  s.players.forEach((p, i) => {
    const ready = s.ready.includes(p.id);
    const x = x0 + i * gap;
    drawChoppy(ctx, x, 540 - (ready ? 10 : 0), 30, p.color, { look: Math.PI / 2, ghost: !ready });
    text(ctx, ready ? 'Ready!' : p.name, x, 598, 16, { color: ready ? '#4cd97b' : '#fff' });
  });
  text(ctx, 'Press A when ready', 640, 660, 22, { color: '#fff', weight: 600 });
}

export function drawResults(ctx: CanvasRenderingContext2D, s: PartyState, wallT: number): void {
  backdrop(ctx, wallT);
  const g = getGame(s.gameId!);
  text(ctx, `${g.name}: results`, 640, 66, 44, { color: '#ffd23f' });
  const rows = s.placements;
  const rowH = Math.min(56, 560 / Math.max(1, rows.length));
  rows.forEach((pl, i) => {
    const p = playerById(s.players, pl.id);
    if (!p) return;
    const y = 130 + i * rowH + rowH / 2;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)';
    roundRect(ctx, 270, y - rowH / 2 + 3, 740, rowH - 6, 12);
    ctx.fill();
    text(ctx, ordinal(pl.place), 320, y, 26, { color: pl.place === 1 ? '#ffd23f' : '#fff' });
    drawChoppy(ctx, 390, y, Math.min(20, rowH * 0.36), p.color, { look: 0 });
    text(ctx, p.name, 430, y, 24, { align: 'left' });
    text(ctx, pl.label, 800, y, 20, { align: 'right', weight: 500, color: '#cfe8ff' });
    text(ctx, pl.points ? `+${pl.points}` : '', 880, y, 24, { color: '#4cd97b' });
    text(ctx, String(s.scores[pl.id] ?? 0), 960, y, 24, { color: '#fff' });
  });
  text(ctx, 'Host: A to continue', 640, 690, 18, { color: '#cfe8ff', weight: 600 });
}

export function drawFinal(ctx: CanvasRenderingContext2D, s: PartyState, wallT: number): void {
  backdrop(ctx, wallT);
  const st = standings(s);
  const winners = st.filter((r) => r.place === 1).map((r) => playerById(s.players, r.id)!).filter(Boolean);
  text(ctx, winners.length > 1 ? 'It’s a tie!' : `${winners[0]?.name ?? 'Nobody'} wins the party!`, 640, 80, 56, {
    color: '#ffd23f',
  });
  winners.forEach((p, i) => {
    const x = 640 + (i - (winners.length - 1) / 2) * 130;
    drawChoppy(ctx, x, 200 + Math.sin(wallT * 6 + i) * 10, 50, p.color, { look: Math.PI / 2 });
  });
  const rowH = Math.min(40, 380 / Math.max(1, st.length));
  st.forEach((r, i) => {
    const p = playerById(s.players, r.id);
    if (!p) return;
    const y = 300 + i * rowH;
    text(ctx, ordinal(r.place), 470, y, 22, { color: r.place === 1 ? '#ffd23f' : '#fff' });
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(530, y, 11, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name, 556, y, 22, { align: 'left' });
    text(ctx, `${r.score} pts`, 820, y, 22, { align: 'right' });
  });
  text(ctx, 'Host: A to return to the lobby', 640, 690, 18, { color: '#cfe8ff', weight: 600 });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function wrapText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, lineH: number, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  lines.forEach((l, i) => text(ctx, l, x, y + i * (lineH + 8), size, { weight: 600, outline: false }));
}
