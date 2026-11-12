import * as THREE from 'three';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { text } from '../shared/draw';
import { sfx } from './sfx';

/**
 * Pit Coin you win or lose on the board doesn't just change a number: a big +3 pops up over the space,
 * then the coins fly one by one into (or out of) your total on the left, which counts up as each lands.
 */
interface Coin {
  id: string;
  heart?: boolean;
  from: { x: number; y: number };
  t: number; // seconds until it launches (negative once flying)
  sign: number;
}
interface Pop {
  x: number;
  y: number;
  label: string;
  color: string;
  age: number;
}
const FLY = 0.65;
const POP_HOLD = 0.55; // the +3 shows on its own for a moment before the coins go
let coins: Coin[] = [];
let pops: Pop[] = [];
const shown = new Map<string, number>();
const seen = new Set<number>();
/** Where each player's coin count is drawn on the standings (set by the HUD every frame). */
export const coinSlots = new Map<string, { x: number; y: number }>();
/** Where each player's HP bar is. */
export const hpSlots = new Map<string, { x: number; y: number }>();

/** The coin total to draw for a player: lags behind the real one while coins are in the air. */
export function shownCoins(id: string, real: number): number {
  const v = shown.get(id);
  if (v === undefined || !coins.some((c) => c.id === id && !c.heart)) {
    shown.set(id, real);
    return real;
  }
  return v;
}

export function resetCoinFly(): void {
  coins = [];
  pops = [];
  shown.clear();
  seen.clear();
}

/** Picks up new coin events from the board, moves everything along and draws it. */
export function drawCoinFly(ctx: CanvasRenderingContext2D, s: PartyState, dt: number, project: (v: THREE.Vector3) => { x: number; y: number }): void {
  const b = s.board;
  if (!b) {
    if (coins.length || pops.length) resetCoinFly();
    return;
  }
  const def = getBoard(b.boardId);
  for (const e of b.fx) {
    if (seen.has(e.n)) continue;
    seen.add(e.n);
    if (!e.id || !e.amount) continue;
    const n = def.nodes[e.node];
    if (!n) continue;
    const at = project(new THREE.Vector3(n.x, n.y + 1.6, n.z));
    if (e.kind === 'heal' || e.kind === 'hit') {
      const up = e.kind === 'heal';
      pops.push({ x: at.x, y: at.y - 30, label: `${up ? '+' : '−'}${Math.abs(e.amount)} HP`, color: up ? '#4cd97b' : '#ff5a5f', age: 0 });
      if (up) for (let i = 0; i < Math.min(6, Math.ceil(e.amount / 2)); i++) coins.push({ id: e.id, heart: true, from: at, t: POP_HOLD + i * 0.1, sign: 1 });
      continue;
    }
    if (e.kind !== 'keys') continue;
    const gain = e.amount > 0;
    pops.push({ x: at.x, y: at.y - 30, label: `${gain ? '+' : '−'}${Math.abs(e.amount)}`, color: gain ? '#ffd23f' : '#ff5a5f', age: 0 });
    // the total holds at its old value until the coins arrive
    if (!coins.some((c) => c.id === e.id && !c.heart)) shown.set(e.id, b.players[e.id].keys - e.amount);
    const count = Math.min(12, Math.abs(e.amount));
    const per = Math.abs(e.amount) / count;
    for (let i = 0; i < count; i++) coins.push({ id: e.id, from: at, t: POP_HOLD + i * 0.09, sign: gain ? per : -per });
  }
  if (seen.size > 600) for (const k of [...seen].slice(0, 300)) seen.delete(k);

  // the +3 pop: springs up big over the space, floats a little, fades
  pops = pops.filter((p) => (p.age += dt) < 1.6);
  for (const p of pops) {
    const k = Math.min(1, p.age / 0.18);
    const scale = k < 1 ? 0.4 + 1.1 * k : 1.5 - Math.min(0.5, (p.age - 0.18) * 2);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1.6 - p.age) / 0.35);
    ctx.translate(p.x, p.y - Math.min(30, p.age * 30));
    ctx.scale(scale, scale);
    text(ctx, p.label, 0, 0, 54, { color: p.color });
    ctx.restore();
  }

  // the coins themselves: an arc from the space to the total (or the other way when you lose them)
  const keep: Coin[] = [];
  for (const c of coins) {
    c.t -= dt;
    const slot = (c.heart ? hpSlots : coinSlots).get(c.id);
    if (!slot) continue;
    if (c.t > 0) {
      keep.push(c);
      continue;
    }
    const u = Math.min(1, -c.t / FLY);
    const a = c.sign > 0 ? c.from : slot;
    const z = c.sign > 0 ? slot : { x: c.from.x, y: c.from.y + 60 };
    const e = u * u * (3 - 2 * u);
    const x = a.x + (z.x - a.x) * e;
    const y = a.y + (z.y - a.y) * e - Math.sin(u * Math.PI) * 120;
    if (c.heart) {
      if (u >= 1) continue;
      keep.push(c);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 + Math.sin(u * Math.PI) * 0.4, 1 + Math.sin(u * Math.PI) * 0.4);
      text(ctx, '♥', 0, 0, 28, { color: '#4cd97b' });
      ctx.restore();
      continue;
    }
    if (c.sign < 0 && u < 0.02) shown.set(c.id, (shown.get(c.id) ?? 0) + c.sign);
    if (u >= 1) {
      if (c.sign > 0) {
        shown.set(c.id, (shown.get(c.id) ?? 0) + c.sign);
        sfx.coin();
      }
      continue;
    }
    keep.push(c);
    ctx.save();
    ctx.globalAlpha = c.sign < 0 ? 1 - u * 0.8 : 1;
    ctx.translate(x, y);
    ctx.scale(Math.abs(Math.cos(u * 9)) * 0.7 + 0.3, 1);
    ctx.fillStyle = c.sign > 0 ? '#ffcb2f' : '#c9a24a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(-3, -3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  coins = keep;
}
