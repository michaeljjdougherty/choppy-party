import type { PlayerInfo } from '../types';
import { playerById, roundRect, text } from '../draw';

/** A row of player chips along the top edge: colour dot plus a short status (hearts, score...). */
export function playerChips(
  ctx: CanvasRenderingContext2D,
  players: PlayerInfo[],
  rows: { id: string; label: string; out?: boolean; hot?: boolean }[],
): void {
  const n = rows.length;
  const half = Math.ceil(n / 2);
  rows.forEach((r, i) => {
    const p = playerById(players, r.id);
    if (!p) return;
    const x = i < half ? 40 + i * (500 / half) : 740 + (i - half) * (500 / Math.max(1, n - half));
    ctx.save();
    ctx.globalAlpha = r.out ? 0.45 : 1;
    ctx.fillStyle = r.hot ? 'rgba(220,40,40,0.75)' : 'rgba(0,0,0,0.42)';
    roundRect(ctx, x - 18, 20, 100, 36, 18);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, 38, 11, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, r.label, x + 18, 39, 18, { align: 'left', weight: 800, color: '#fff', outline: false });
    ctx.restore();
  });
}

export const hearts = (n: number) => '♥'.repeat(Math.max(0, n));
