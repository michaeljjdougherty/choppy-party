import type { PartyState } from '../shared/party';
import { sfx } from './sfx';

/**
 * Feedback layer: watches the party state from frame to frame and plays sounds, and draws
 * confetti on the results and winner screens. Works the same locally and online because it
 * only looks at snapshots.
 */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  c: string;
  w: number;
}
const COLORS = ['#ff5a5f', '#ffd23f', '#2ee6d6', '#b06cff', '#4cd97b', '#3fa9f5', '#ff9f1c', '#ff7bd5'];
let bits: Bit[] = [];

export function burst(n = 140): void {
  for (let i = 0; i < n; i++) {
    bits.push({
      x: 640 + (Math.random() - 0.5) * 900,
      y: -20 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 120,
      vy: 60 + Math.random() * 120,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 10,
      c: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 6,
    });
  }
}

export function drawConfetti(ctx: CanvasRenderingContext2D, dt: number, t: number): void {
  if (!bits.length) return;
  for (const b of bits) {
    // floaty paper: low gravity, flutter side to side
    b.vy = Math.min(170, b.vy + 90 * dt);
    b.x += (b.vx + Math.sin(t * 4 + b.w) * 40) * dt;
    b.y += b.vy * dt;
    b.r += b.vr * dt;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.r);
    ctx.scale(1, Math.abs(Math.cos(b.r * 1.7)) + 0.2);
    ctx.fillStyle = b.c;
    ctx.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2);
    ctx.restore();
  }
  bits = bits.filter((b) => b.y < 760);
}

interface Seen {
  phase: string;
  players: number;
  nodes: Record<string, string>;
  coins: Record<string, number>;
  crowns: Record<string, number>;
  sub: string;
  gameCoins: Record<string, number>;
  stuns: Record<string, boolean>;
  bombs: number;
  alive: number;
  sel: string;
}
let seen: Seen | null = null;

export function resetJuice(): void {
  seen = null;
  bits = [];
}

export function watch(s: PartyState): void {
  const b = s.board;
  const g = s.game as Record<string, unknown> | null;
  const runners = (s.phase === 'play' && Array.isArray(g?.runners) ? g!.runners : []) as {
    id: string;
    coins: number;
    stun: number;
  }[];
  const skaters = (s.phase === 'play' && Array.isArray(g?.skaters) ? g!.skaters : []) as { alive: boolean }[];
  const drops = (s.phase === 'play' && Array.isArray(g?.drops) ? g!.drops : []) as { kind: string; fall: number }[];
  const now: Seen = {
    phase: s.phase,
    players: s.players.length,
    nodes: {},
    coins: {},
    crowns: {},
    sub: b?.sub ?? '',
    gameCoins: Object.fromEntries(runners.map((r) => [r.id, r.coins])),
    stuns: Object.fromEntries(runners.map((r) => [r.id, r.stun > 0])),
    bombs: drops.filter((d) => d.kind === 'anvil' && d.fall <= 0).length,
    alive: skaters.filter((k) => k.alive).length,
    sel: `${s.selection}:${s.roundsIdx}:${s.turnsIdx}`,
  };
  if (b) for (const [id, p] of Object.entries(b.players)) {
    now.nodes[id] = p.node;
    now.coins[id] = p.coins;
    now.crowns[id] = p.crowns;
  }
  const was = seen;
  seen = now;
  if (!was) return;

  if (now.phase !== was.phase) {
    if (now.phase === 'play') sfx.whistle();
    if (now.phase === 'results') {
      sfx.fanfare();
      burst(90);
    }
    if (now.phase === 'final') {
      sfx.fanfare();
      burst(220);
    }
  }
  if (now.phase === 'lobby' && now.players > was.players) sfx.join();
  if (now.phase === 'lobby' && now.sel !== was.sel) sfx.move();

  if (b) {
    if (now.sub === 'rolled' && was.sub === 'roll') sfx.dice();
    for (const id of Object.keys(now.nodes)) {
      if (was.nodes[id] !== undefined && was.nodes[id] !== now.nodes[id]) sfx.step();
      if ((now.crowns[id] ?? 0) > (was.crowns[id] ?? 0)) {
        sfx.fanfare();
        burst(60);
      } else if ((now.coins[id] ?? 0) > (was.coins[id] ?? 0)) sfx.coin();
      else if ((now.coins[id] ?? 0) < (was.coins[id] ?? 0)) sfx.lose();
    }
  }
  for (const id of Object.keys(now.gameCoins)) {
    if (now.gameCoins[id] > (was.gameCoins[id] ?? 0)) sfx.coin();
    if (now.stuns[id] && !was.stuns[id]) sfx.boing();
  }
  if (now.bombs > was.bombs) sfx.boom();
  if (now.alive < was.alive && now.phase === 'play' && was.phase === 'play') sfx.lose();
}
