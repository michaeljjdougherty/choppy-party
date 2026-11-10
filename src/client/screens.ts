import { GAMES, getGame } from '../shared/games';
import { MAX_PLAYERS, OPTIONS, ROUND_OPTIONS, selectionLabel, standings, type PartyState } from '../shared/party';
import { getBoard, recommendedBoard } from '../shared/board/boards';
import { crownIcon } from './boardHud';
import { playerById, roundRect, text } from '../shared/draw';

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

export function drawLobby(ctx: CanvasRenderingContext2D, s: PartyState, sc: ScreenCtx): void {
  text(ctx, 'Choppy Party', 640, 74, 84, { color: '#ffd23f' });
  text(ctx, sc.roomCode ? `Room code: ${sc.roomCode}` : sc.status, 640, 136, 28, { color: '#ffffff', weight: 700 });
  if (s.players.length === 0) {
    text(ctx, 'Press A to join!', 640, 330, 46, { color: '#fff' });
    text(ctx, 'Pads: bottom face button   ·   Keys: Space (WASD) or Enter (Arrows)', 640, 384, 20, { weight: 600 });
  } else {
    text(ctx, `${s.players.length}/${MAX_PLAYERS} players  ·  press A to join, B to leave`, 640, 176, 20, {
      color: '#ffe9f6',
      weight: 600,
    });
  }

  panel(ctx, 220, 556, 840, 130);
  text(ctx, `◀  ${selectionLabel(s)}  ▶`, 640, 598, 36, { color: '#fff' });
  const o = OPTIONS[s.selection];
  let sub: string;
  if (o.kind === 'board') {
    const b = getBoard(o.id);
    const best = s.players.length > 0 && recommendedBoard(s.players.length).id === b.id;
    sub = `Best for ${b.players[0]}-${b.players[1]}${b.players[1] >= 10 ? '+' : ''} players${best ? '  ★ Recommended for your group' : ''}  ·  Up/Down: turns`;
  } else if (o.kind === 'mix') {
    sub = `Up/Down: ${ROUND_OPTIONS.join(' / ')} rounds  ·  ${GAMES.length} games in the mix`;
  } else {
    const g = getGame(o.id);
    sub = `${g.mode}  ·  ${g.blurb}`;
  }
  text(ctx, truncate(sub, 92), 640, 636, 17, { color: '#e8ddff', weight: 500, outline: false });
  if (s.players.length) {
    text(ctx, 'Host: Left/Right to choose, A to start', 640, 664, 17, { color: '#ffd23f', weight: 700, outline: false });
  }
}

export function drawIntro(ctx: CanvasRenderingContext2D, s: PartyState): void {
  const g = getGame(s.gameId!);
  panel(ctx, 170, 24, 940, 380, 0.5);
  const head =
    s.boardEvent === 'duel'
      ? `DUEL!  ${s.gamePlayers?.map((p) => p.name).join('  vs  ')}`
      : s.boardEvent === 'stew'
        ? 'STEW BATTLE!  Red team vs Blue team'
        : s.board
          ? `Turn ${s.board.turn} minigame  ·  ${g.mode}`
          : `Round ${s.round + 1} of ${s.playlist.length}  ·  ${g.mode}`;
  text(ctx, head, 640, 66, 24, { color: s.boardEvent ? '#ff9f1c' : '#e8ddff', weight: 700 });
  text(ctx, g.name, 640, 132, 76, { color: '#ffd23f' });
  wrapText(ctx, g.blurb, 640, 214, 820, 32, 28);
  ctx.fillStyle = 'rgba(255,210,63,0.18)';
  roundRect(ctx, 360, 330, 560, 50, 25);
  ctx.fill();
  text(ctx, g.controls, 640, 355, 26, { color: '#ffd23f', weight: 700, outline: false });
  if (s.boardEvent === 'stew' && s.gamePlayers) {
    // show the teams
    for (const team of [0, 1]) {
      const names = s.gamePlayers.filter((p) => p.team === team).map((p) => p.name).join(', ');
      text(ctx, `${team ? 'Blue' : 'Red'}: ${names}`, 640, 440 + team * 36, 24, { color: team ? '#3fa9f5' : '#ff5a5f' });
    }
  }
  text(ctx, 'Press A when ready', 640, 690, 24, { color: '#fff', weight: 700 });
}

export function drawResults(ctx: CanvasRenderingContext2D, s: PartyState): void {
  const g = getGame(s.gameId!);
  const onBoard = !!s.board;
  text(ctx, s.boardEvent ? g.name : onBoard ? `${g.name}: keys won` : g.name, 940, 54, 40, { color: '#ffd23f' });
  if (s.boardEvent && s.eventLine) text(ctx, s.eventLine, 940, 690 - 36, 22, { color: '#ffd23f' });
  const rows = s.placements;
  const rowH = Math.min(54, 560 / Math.max(1, rows.length));
  panel(ctx, 640, 86, 600, rowH * rows.length + 24, 0.5);
  rows.forEach((pl, i) => {
    const p = playerById(s.players, pl.id);
    if (!p) return;
    const y = 98 + i * rowH + rowH / 2;
    text(ctx, ordinal(pl.place), 690, y, 24, { color: pl.place === 1 ? '#ffd23f' : '#fff' });
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(744, y, 11, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name, 766, y, 23, { align: 'left' });
    text(ctx, pl.label, 1070, y, 18, { align: 'right', weight: 500, color: '#e8ddff' });
    text(ctx, pl.points ? `+${pl.points}` : '', 1130, y, 22, { color: onBoard ? '#ffd23f' : '#4cd97b' });
    text(ctx, onBoard ? `${s.board!.players[pl.id]?.keys ?? 0}🔑` : String(s.scores[pl.id] ?? 0), 1205, y, 22, { color: '#fff' });
  });
  const more = onBoard && (s.boardEvent || s.board!.turn < s.board!.maxTurns) ? 'Host: A to go back to the board' : 'Host: A to continue';
  text(ctx, more, 940, 694, 18, { weight: 700 });
}

export function drawFinal(ctx: CanvasRenderingContext2D, s: PartyState): void {
  const st = standings(s);
  const winners = st.filter((r) => r.place === 1).map((r) => playerById(s.players, r.id)!).filter(Boolean);
  text(ctx, winners.length > 1 ? 'It’s a tie!' : `${winners[0]?.name ?? 'Nobody'} wins!`, 940, 64, 52, { color: '#ffd23f' });
  const rowH = Math.min(46, 500 / Math.max(1, st.length));
  panel(ctx, 700, 110, 480, rowH * st.length + 24, 0.5);
  st.forEach((r, i) => {
    const p = playerById(s.players, r.id);
    if (!p) return;
    const y = 122 + i * rowH + rowH / 2;
    text(ctx, ordinal(r.place), 750, y, 22, { color: r.place === 1 ? '#ffd23f' : '#fff' });
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(806, y, 11, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name, 830, y, 22, { align: 'left' });
    if (s.board) {
      const bp = s.board.players[r.id];
      crownIcon(ctx, 1030, y, 1.1);
      text(ctx, String(bp?.crowns ?? 0), 1050, y, 22, { align: 'left' });
      text(ctx, `${bp?.keys ?? 0} keys`, 1170, y, 22, { align: 'right' });
    } else text(ctx, `${r.score} pts`, 1150, y, 22, { align: 'right' });
  });
  text(ctx, 'Host: A to return to the lobby', 940, 694, 18, { weight: 700 });
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
  lines.forEach((l, i) => text(ctx, l, x, y + i * (lineH + 8), size, { weight: 600 }));
}
