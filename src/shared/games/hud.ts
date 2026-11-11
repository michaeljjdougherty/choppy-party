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

export const TEAM_HEX = ['#ff5a5f', '#3fa9f5'];
export const TEAM_NAME = ['Red', 'Blue'];

/** Two big team scores at the top centre. */
export function teamScores(ctx: CanvasRenderingContext2D, a: string, b: string, y = 96): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, 470, y - 26, 340, 52, 26);
  ctx.fill();
  ctx.restore();
  text(ctx, a, 580, y, 30, { color: TEAM_HEX[0] });
  text(ctx, 'vs', 640, y, 18, { color: '#ffffff' });
  text(ctx, b, 700, y, 30, { color: TEAM_HEX[1] });
}

/** Pick the 1-vs-many "one" player from the seed (same on every machine). */
export function pickOne(n: number, seed: number): number {
  const x = Math.sin(seed * 9.137 + 1.7) * 43758.5453;
  return Math.floor((x - Math.floor(x)) * n) % n;
}
