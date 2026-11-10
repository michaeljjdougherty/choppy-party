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
  air: Record<string, boolean>;
  pops: Record<string, number>;
  stacks: Record<string, number>;
  stuns: Record<string, boolean>;
  bombs: number;
  alive: number;
  sel: string;
  /** Wave 2 games: a few counters per player and per game. */
  marks: Record<string, number>;
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
  const skaters = (s.phase === 'play' && Array.isArray(g?.skaters) ? g!.skaters : []) as { id: string; alive: boolean; z: number; vz: number }[];
  const stacks = (s.phase === 'play' && g?.stacks && typeof g.stacks === 'object' ? g.stacks : {}) as Record<string, number>;
  const drops = (s.phase === 'play' && Array.isArray(g?.drops) ? g!.drops : []) as { kind: string; fall: number }[];
  const now: Seen = {
    phase: s.phase,
    players: s.players.length,
    nodes: {},
    coins: {},
    crowns: {},
    sub: b?.sub ?? '',
    gameCoins: Object.fromEntries(runners.map((r) => [r.id, r.coins])),
    air: Object.fromEntries([...runners, ...skaters].map((r) => [r.id, ((r as { z?: number }).z ?? 0) > 1])),
    pops: Object.fromEntries(skaters.map((k) => [k.id, k.vz])),
    stacks: { ...stacks },
    stuns: Object.fromEntries(runners.map((r) => [r.id, r.stun > 0])),
    bombs: drops.filter((d) => d.kind === 'anvil' && d.fall <= 0).length,
    alive: skaters.filter((k) => k.alive).length,
    sel: `${s.selection}:${s.roundsIdx}:${s.turnsIdx}`,
    marks: s.phase === 'play' && g ? marks(g) : {},
  };
  if (b) for (const [id, p] of Object.entries(b.players)) {
    now.nodes[id] = p.node;
    now.coins[id] = p.keys;
    now.crowns[id] = p.crowns;
  }
  for (const list of ['astros', 'keepers', 'hoppers'] as const) {
    const arr = s.phase === 'play' && Array.isArray(g?.[list]) ? (g![list] as { id: string; z: number }[]) : [];
    for (const r of arr) now.air[r.id] = r.z > 1;
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
  if (now.phase === 'lobby' && now.players < was.players) sfx.leave();
  for (const id of Object.keys(now.air)) {
    if (was.air[id] && !now.air[id]) sfx.land();
  }
  for (const id of Object.keys(now.pops)) {
    if (now.pops[id] > 150 && (was.pops[id] ?? 0) <= 150) sfx.bump();
  }
  for (const id of Object.keys(now.stacks)) {
    if (now.stacks[id] > (was.stacks[id] ?? 0)) sfx.plate();
  }
  if (now.phase === 'lobby' && now.sel !== was.sel) sfx.move();

  if (b) {
    if (now.sub === 'rolled' && was.sub === 'roll') sfx.dice();
    for (const id of Object.keys(now.nodes)) {
      if (was.nodes[id] !== undefined && was.nodes[id] !== now.nodes[id]) sfx.step();
      if ((now.crowns[id] ?? 0) > (was.crowns[id] ?? 0)) {
        sfx.bell();
        sfx.fanfare();
        burst(60);
      } else if ((now.coins[id] ?? 0) > (was.coins[id] ?? 0)) sfx.coin();
      else if ((now.coins[id] ?? 0) < (was.coins[id] ?? 0)) sfx.lose();
    }
  }
  for (const id of Object.keys(now.gameCoins)) {
    const gain = now.gameCoins[id] - (was.gameCoins[id] ?? 0);
    if (gain >= 5) sfx.gem();
    else if (gain > 0) sfx.coin();
    if (now.stuns[id] && !was.stuns[id]) sfx.boing();
  }
  if (now.bombs > was.bombs) sfx.boom();
  const m = now.marks;
  const pm = was.marks;
  const up = (k: string) => (m[k] ?? 0) > (pm[k] ?? 0) && k in pm;
  for (const k of Object.keys(m)) {
    if (!up(k)) continue;
    if (k === 'booms') sfx.boom();
    else if (k === 'trains') sfx.horn();
    else if (k.startsWith('hurt:') || k.startsWith('scared:')) sfx.boing();
    else if (k.startsWith('out:')) {
      sfx.boing();
      sfx.lose();
    } else if (k.startsWith('candles:') || k.startsWith('coins:')) sfx.coin();
    else if (k.startsWith('gifts:')) sfx.plate();
    else if (k.startsWith('tumbles:')) sfx.lose();
  }
  if (now.alive < was.alive && now.phase === 'play' && was.phase === 'play') sfx.lose();
}

/** Counters that only go up when something worth a sound happens in a wave 2 game. */
function marks(g: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const list = <T>(k: string) => (Array.isArray(g[k]) ? (g[k] as T[]) : []);
  // every impact leaves a crater, so a rising crater count means a meteor just hit
  if (Array.isArray(g.craters)) out.booms = (g.craters as unknown[]).length;
  for (const a of list<{ id: string; hearts: number; outAt: number }>('astros')) {
    out[`hurt:${a.id}`] = 3 - a.hearts;
    out[`out:${a.id}`] = a.outAt >= 0 ? 1 : 0;
  }
  for (const k of list<{ id: string; candles: number; scared: number }>('keepers')) {
    out[`candles:${k.id}`] = k.candles;
    // rises by one each time a ghost gets you (scared jumps back to full)
    out[`scared:${k.id}`] = k.scared > 1.05 ? 1 : 0;
  }
  for (const p of list<{ id: string; gifts: number[]; tumbles: number }>('piles')) {
    out[`gifts:${p.id}`] = p.gifts.length;
    out[`tumbles:${p.id}`] = p.tumbles;
  }
  for (const h of list<{ id: string; coins: number; outAt: number }>('hoppers')) {
    out[`coins:${h.id}`] = h.coins;
    out[`out:${h.id}`] = h.outAt >= 0 ? 1 : 0;
  }
  if (Array.isArray(g.trains)) out.trains = (g.trains as { warn: number }[]).filter((t) => t.warn <= 0).length;
  return out;
}
