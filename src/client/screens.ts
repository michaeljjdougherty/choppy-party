import { GAMES, getGame } from '../shared/games';
import { MAX_PLAYERS, OPTIONS, ROUND_OPTIONS, selectionLabel, standings, type PartyState } from '../shared/party';
import { getBoard, recommendedBoard } from '../shared/board/boards';
import { crownIcon } from './boardHud';
import { playerById, roundRect, text } from '../shared/draw';
import { clamp01, controlChips, easeOut, ribbon, slam, springIn, sunburst, vignette } from './showtime';
import { burst } from './juice';

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
    text(ctx, 'Add bots with keys 1 / 2 / 3 (Easy / Normal / Hard) or the buttons up top', 640, 420, 20, { weight: 600, color: '#ffd23f' });
    text(ctx, 'Pads: bottom face button   ·   Keys: Space (WASD) or Enter (Arrows)', 640, 384, 20, { weight: 600 });
  } else {
    const bots = s.players.filter((p) => p.bot).length;
    text(ctx, `${s.players.length}/${MAX_PLAYERS} players${bots ? ` (${bots} ${bots === 1 ? 'bot' : 'bots'})` : ''}  ·  A to join, B to leave  ·  Keys 1/2/3 add an Easy/Normal/Hard bot, 0 removes one`, 640, 176, 20, {
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

const MODE_COLOR: Record<string, string> = { 'Free-for-all': '#ff8a1f', Team: '#3fa9f5', '1-vs-many': '#b06cff', Duel: '#ff4d5a' };

export function drawIntro(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const g = getGame(s.gameId!);
  const age = s.phaseT;
  const color = s.boardEvent === 'duel' ? '#ff4d5a' : s.boardEvent === 'stew' ? '#3fa9f5' : MODE_COLOR[g.mode] ?? '#ff8a1f';
  vignette(ctx, 0.5);
  sunburst(ctx, 640, 150, 620, t, color, 0.32);
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
  ribbon(ctx, 640, 52, Math.min(700, 120 + head.length * 13), 50, color, head, 22);
  ctx.restore();
  slam(ctx, g.name, 640, 150, 92, age, '#ffd23f', 0.15);
  // controls as button chips
  ctx.save();
  ctx.globalAlpha = clamp01((age - 0.6) * 3);
  controlChips(ctx, g.controls, 640, 236);
  ctx.restore();
  if (s.boardEvent === 'stew' && s.gamePlayers) {
    for (const team of [0, 1]) {
      const names = s.gamePlayers.filter((p) => p.team === team).map((p) => p.name).join(', ');
      ribbon(ctx, 640, 470 + team * 58, 640, 44, team ? '#3fa9f5' : '#ff5a5f', `${team ? 'Blue' : 'Red'}: ${names}`, 20);
    }
  }
  // who's ready
  const who = s.gamePlayers ?? s.players;
  const ready = who.filter((p) => s.ready.includes(p.id)).length;
  const pulse = 1 + Math.sin(t * 5) * 0.04;
  ctx.save();
  ctx.translate(640, 604);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(20,10,50,0.6)';
  roundRect(ctx, -210, -24, 420, 48, 24);
  ctx.fill();
  text(ctx, `Press A when ready  ·  ${ready}/${who.length}`, 0, 0, 22, { color: '#fff', weight: 800 });
  ctx.restore();
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
  const more = onBoard && (s.boardEvent || s.board!.turn < s.board!.maxTurns) ? 'Host: A to go back to the board' : 'Host: A to continue';
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
    text(ctx, 'Host: A to return to the lobby', 970, 694, 20, { weight: 800 });
    ctx.restore();
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

