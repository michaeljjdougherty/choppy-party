import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { currentPlayer } from '../shared/board/engine';
import { CROWN_PRICE, TRAIN_PRICE, WISP_PRICE } from '../shared/board/types';
import { playerById, roundRect, text } from '../shared/draw';

export function drawBoardHud(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const b = s.board!;
  const def = getBoard(b.boardId);
  const cur = currentPlayer(b);
  const me = playerById(s.players, cur);

  // top-left: board and turn
  ctx.fillStyle = 'rgba(20,12,40,0.6)';
  roundRect(ctx, 16, 14, 300, 70, 18);
  ctx.fill();
  text(ctx, def.name, 32, 36, 22, { align: 'left', color: '#ffd23f' });
  let extra = '';
  if (def.theme === 'hollow') extra = b.night ? '  ·  Night' : '  ·  Day';
  if (def.theme === 'cosmo') extra = `  ·  Laser in ${b.counter}`;
  text(ctx, `Turn ${b.turn} / ${b.maxTurns}${extra}`, 32, 64, 18, { align: 'left', weight: 600 });

  // bottom: player cards in turn order
  const n = b.order.length;
  const w = Math.min(150, (1240 - (n - 1) * 8) / n);
  const x0 = 640 - (n * w + (n - 1) * 8) / 2;
  b.order.forEach((id, i) => {
    const p = playerById(s.players, id);
    const bp = b.players[id];
    if (!p || !bp) return;
    const x = x0 + i * (w + 8);
    const on = id === cur;
    const y = on ? 626 : 636;
    ctx.fillStyle = on ? 'rgba(255,225,77,0.95)' : 'rgba(20,12,40,0.7)';
    roundRect(ctx, x, y, w, 76, 16);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + 20, y + 22, 10, 0, Math.PI * 2);
    ctx.fill();
    const ink = on ? '#2a1b5e' : '#ffffff';
    text(ctx, p.name, x + 36, y + 22, w < 120 ? 14 : 17, { align: 'left', color: ink, outline: false });
    crownIcon(ctx, x + 18, y + 54);
    text(ctx, String(bp.crowns), x + 34, y + 55, 20, { align: 'left', color: ink, outline: false });
    coinIcon(ctx, x + w / 2 + 12, y + 54);
    text(ctx, String(bp.coins), x + w / 2 + 26, y + 55, 20, { align: 'left', color: ink, outline: false });
  });

  // centre callouts
  const name = me?.name ?? '';
  if (b.sub === 'turnIntro') {
    if (b.cur === 0) text(ctx, `Turn ${b.turn}`, 640, 220, 40, { color: '#ffffff' });
    text(ctx, `${name}'s turn!`, 640, 280, 64, { color: me?.color ?? '#fff' });
  } else if (b.sub === 'roll') {
    text(ctx, `${name}: press A to hit the dice block!`, 640, 110, 34, { color: '#ffffff' });
  } else if (b.sub === 'branch') {
    text(ctx, 'Pick a path: Stick to aim, A to go', 640, 110, 32, { color: '#ffffff' });
  } else if (b.sub === 'prompt' && b.prompt) {
    const q =
      b.prompt.kind === 'crown'
        ? `Buy the crown for ${CROWN_PRICE} coins?`
        : b.prompt.kind === 'wisp'
          ? `Pay the Wisp ${WISP_PRICE} coins to rob the leader?`
          : `Ride the train to the next station for ${TRAIN_PRICE} coins?`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 290, 120, 700, 150, 28);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.stroke();
    text(ctx, q, 640, 170, 30, { color: '#2a1b5e', outline: false });
    text(ctx, 'A: Yes      B: No', 640, 226, 28, { color: '#ff4d5a', outline: false });
  }
  if (b.banner) {
    const a = Math.min(1, b.banner.t * 3);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, b.banner.text, 640, 340 - (1 - a) * 20, 40, { color: b.banner.color });
    ctx.restore();
  }
  void t;
}

export function crownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#ffcc33';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, 8);
  ctx.lineTo(-12, -7);
  ctx.lineTo(-5, -1);
  ctx.lineTo(0, -10);
  ctx.lineTo(5, -1);
  ctx.lineTo(12, -7);
  ctx.lineTo(11, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffcb2f';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(x - 1.5, y - 5, 3, 10);
}
