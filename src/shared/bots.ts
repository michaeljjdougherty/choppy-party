/**
 * Computer players. Bots are ordinary party players whose controller input is made up every tick
 * from the game state, so they work the same in local play and on the room server.
 * Difficulty changes how fast they react, how well they aim, how hard they mash and how well they dodge.
 */
import type { Inputs, PlayerInfo, TickInput } from './types';
import { NO_INPUT, clamp } from './types';
import { rand, randRange, type Rng } from './rng';
import { getBoard } from './board/boards';
import { PROMPT_LOCK, currentPlayer, dieHigh, forwardDist, nearDist, slowFace } from './board/engine';
import type { BoardState, ItemId } from './board/types';
import { WISP_PRICE, TRAIN_PRICE } from './board/types';
import { ITEM_GRID, SHOP_PRICE } from './board/items';
import { type BotMem, type Mover, type Skill, dodgeJump, look, mash, nearest, newMem, notices, outside, press, pressB, remember, stick, toward } from './botkit';
import { getGame } from './games';
import type { CloudburstState } from './games/coinCloudburst';
import { ANVIL_HIT, AX0, AX1, AY0, AY1 } from './games/coinCloudburst';
import type { CrateGrabState } from './games/crateGrab';
import { BASE_W, CX0, CX1, CY0, CY1 } from './games/crateGrab';
import type { FuseState } from './games/fuseDraw';
import type { GraveyardState } from './games/graveyardShift';
import { GX0, GX1, GY0, GY1 } from './games/graveyardShift';
import type { MeteorState } from './games/meteorShower';
import { BLAST, MCX, MCY, MR } from './games/meteorShower';
import type { PaddleState } from './games/paddleClash';
import { PY0, PY1, PX0, PX1, PADDLE_H, BALL_R } from './games/paddleClash';
import type { PileState } from './games/presentPileUp';
import { swingX } from './games/presentPileUp';
import type { QuickDrawState } from './games/quickDrawCactus';
import type { RinkState } from './games/shrinkingRink';
import type { TrainState } from './games/trainHop';
import { TRACKS, TRACK_HALF, TX0, TX1, TY0, TY1, trainSpan } from './games/trainHop';

import type { PotatoState } from './games/hotPotato';
import type { KitchenState } from './games/kitchenRaid';
import { ISLAND } from './games/kitchenRaid';
import type { LanternState } from './games/lanternHunt';
import { CRYPT_Y, KEEPER, inBeam } from './games/lanternHunt';
import type { MemoryState } from './games/hauntedMemory';
import type { SnowState } from './games/snowballScramble';
import { fortAt } from './games/snowballScramble';
import type { LaserState } from './games/laserLimbo';

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
export const BOT_LABEL: Record<BotLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export const SKILL: Record<BotLevel, Skill> = {
  easy: { think: 0.42, wobble: 0.5, mash: 4.5, react: [0.4, 0.62], early: 0.12, sense: 0.35, aim: 26, paddle: 0.55, smart: 0.3 },
  normal: { think: 0.22, wobble: 0.2, mash: 7, react: [0.27, 0.4], early: 0.04, sense: 0.7, aim: 12, paddle: 0.8, smart: 0.7 },
  hard: { think: 0.1, wobble: 0.05, mash: 10, react: [0.18, 0.26], early: 0.01, sense: 1, aim: 3, paddle: 1, smart: 1 },
};

/** The slice of party state the bots need (keeps this file free of a circular import on party.ts). */
export interface BotView {
  phase: string;
  phaseT: number;
  players: PlayerInfo[];
  gamePlayers: PlayerInfo[] | null;
  gameId: string | null;
  game: unknown;
  board: BoardState | null;
  ready: string[];
  botMem: Record<string, BotMem>;
  botRng: Rng;
}

/** Fill in input for every bot in the party. Human input is left alone. */
export function addBotInputs(s: BotView, inputs: Inputs, dt: number): Inputs {
  const bots = s.players.filter((p) => p.bot || p.away);
  if (!bots.length) return inputs;
  const out: Inputs = { ...inputs };
  for (const p of bots) {
    const mem = (s.botMem[p.id] ??= newMem());
    mem.t += dt;
    mem.next -= dt;
    out[p.id] = think(s, p, SKILL[p.bot ?? 'normal'], mem, dt);
  }
  return out;
}

function think(s: BotView, p: PlayerInfo, sk: Skill, mem: BotMem, dt: number): TickInput {
  const r = s.botRng;
  // a CPU only drives the menus when no human is around (all left, or all dropped mid-game)
  const host = !s.players.some((q) => !q.bot && !q.away) && (s.players.find((q) => !q.bot) ?? s.players[0])?.id === p.id;
  switch (s.phase) {
    case 'intro': {
      remember(mem, `intro:${s.gameId}`, randRange(r, 0.6, 1.6));
      const playing = (s.gamePlayers ?? s.players).some((q) => q.id === p.id);
      return playing && !s.ready.includes(p.id) && mem.t > mem.wait ? press() : NO_INPUT;
    }
    case 'results':
    case 'final':
      // only matters when a bot ended up as host (everyone else left)
      return host && s.phaseT > (s.phase === 'final' ? 6 : 4.5) ? press() : NO_INPUT;
    case 'board':
      return s.board ? boardBot(s.board, p.id, sk, mem, r) : NO_INPUT;
    case 'play':
      return gameBot(s, p, sk, mem, dt);
    default:
      return NO_INPUT;
  }
}

/* ------------------------------------------------------------------ minigames */

function gameBot(s: BotView, p: PlayerInfo, sk: Skill, mem: BotMem, dt: number): TickInput {
  const r = s.botRng;
  switch (s.gameId) {
    case 'pancake-panic':
    case 'rope-pull':
      return mash(sk, mem, dt, r);
    case 'quick-draw-cactus': {
      const g = s.game as QuickDrawState;
      return drawGame(sk, mem, r, `${g.round}`, g.phase === 'wait', g.phase === 'bloom', g.phaseT, g.waitFor);
    }
    case 'fuse-draw': {
      const g = s.game as FuseState;
      const round = Object.values(g.scores).reduce((a, b) => a + b, 0);
      return drawGame(sk, mem, r, `${round}`, g.phase === 'fuse', g.phase === 'bang', g.phaseT, g.fuse);
    }
    case 'present-pile-up':
      return presentBot(s.game as PileState, p.id, sk, mem, r);
    case 'paddle-clash':
      return paddleBot(s.game as PaddleState, p.id, sk, mem, r);
    case 'shrinking-rink':
      return rinkBot(s.game as RinkState, p.id, sk, mem, r);
    case 'coin-cloudburst':
      return cloudBot(s.game as CloudburstState, p.id, sk, mem, r);
    case 'meteor-shower':
      return meteorBot(s.game as MeteorState, p.id, sk, mem, r);
    case 'graveyard-shift':
      return graveBot(s.game as GraveyardState, p.id, sk, mem, r);
    case 'train-hop':
      return trainBot(s.game as TrainState, p.id, sk, mem, r);
    case 'crate-grab':
      return crateBot(s.game as CrateGrabState, p.id, sk, mem, r);
    case 'hot-potato-bomb':
      return potatoBot(s.game as PotatoState, p.id, sk, mem, r);
    case 'kitchen-raid':
      return kitchenBot(s.game as KitchenState, p.id, sk, mem, r);
    case 'lantern-hunt':
      return lanternBot(s.game as LanternState, p.id, sk, mem, r);
    case 'haunted-memory':
      return memoryBot(s.game as MemoryState, p.id, sk, mem, r);
    case 'snowball-scramble':
      return snowBot(s.game as SnowState, p.id, sk, mem, r);
    case 'laser-limbo':
      return laserBot(s.game as LaserState, p.id, sk, mem, r);
    default: {
      const g = s.gameId ? getGame(s.gameId) : null;
      return g?.bot ? g.bot(s.game, p.id, { sk, mem, r, dt, level: p.bot ?? 'normal' }) : NO_INPUT;
    }
  }
}

/** Quick Draw Cactus and Fuse Draw: wait for the signal, then press after a human-ish reaction time. */
function drawGame(sk: Skill, mem: BotMem, r: Rng, round: string, waiting: boolean, go: boolean, phaseT: number, waitFor: number): TickInput {
  if (remember(mem, `draw:${round}`, randRange(r, sk.react[0], sk.react[1]))) {
    mem.early = rand(r) < sk.early ? randRange(r, 0.3, Math.max(0.4, waitFor * 0.9)) : -1;
  }
  if (waiting && mem.early >= 0 && phaseT > mem.early) {
    mem.early = -1;
    return press();
  }
  if (go && phaseT >= mem.wait) return press();
  return NO_INPUT;
}

function presentBot(g: PileState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const p = g.piles.find((q) => q.id === id);
  if (!p || p.dropT >= 0 || p.cool > 0) return NO_INPUT;
  const top = p.gifts.length ? p.gifts[p.gifts.length - 1] : 0;
  // each attempt has its own aiming error; press as the gift swings across that spot
  if (remember(mem, `gift:${p.gifts.length}:${p.tumbles}`, 0)) mem.m = (rand(r) * 2 - 1) * sk.aim * 1.6;
  const aim = clamp(top + mem.m, -76, 76);
  const diff = swingX(p) - aim;
  const crossed = mem.prev !== 0 && Math.sign(diff) !== Math.sign(mem.prev);
  mem.prev = diff;
  if (crossed || Math.abs(diff) < 2.5) {
    mem.prev = 0;
    return press();
  }
  return NO_INPUT;
}

function paddleBot(g: PaddleState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const i = g.ids.indexOf(id);
  if (i < 0) return NO_INPUT;
  const myX = i === 0 ? PX0 + 18 : PX1 - 18;
  const b = g.ball;
  const coming = i === 0 ? b.vx < 0 : b.vx > 0;
  // a new aiming error each time the ball is hit or served
  if (remember(mem, `pad:${g.hits}:${g.scores[g.ids[0]]}:${g.scores[g.ids[1]]}`, 0)) {
    // the faster the ball, the worse the read: even hard bots start missing in long rallies
    const sp = Math.hypot(b.vx, b.vy);
    mem.m = (rand(r) * 2 - 1) * (sk.aim * 2.2 + Math.max(0, sp - 520) * (0.16 - sk.smart * 0.08));
    mem.n = (rand(r) * 2 - 1) * PADDLE_H * 0.3; // hit off-centre to angle the return
  }
  let target = (PY0 + PY1) / 2;
  // a beat to react after each hit before moving
  if (coming && mem.t < sk.react[0] * 0.8) return NO_INPUT;
  if (coming && Math.abs(b.vx) > 1) {
    if (sk.paddle < 0.6) target = b.y; // easy: just follows the ball
    else target = predictY(b.y, b.vy, (myX - b.x) / b.vx);
    target += mem.m + (sk.smart >= 1 ? mem.n : 0);
  } else if (sk.paddle < 0.6) target = (b.y + (PY0 + PY1) / 2) / 2;
  const cur = g.paddles[i];
  const y = clamp((target - cur) / 36, -1, 1) * sk.paddle;
  return stick(0, Math.abs(target - cur) < 6 ? 0 : y);
}

/** Where a ball bouncing between the top and bottom walls will be after `t` seconds. */
function predictY(y: number, vy: number, t: number): number {
  const lo = PY0 + BALL_R;
  const hi = PY1 - BALL_R;
  const span = hi - lo;
  let p = (y - lo + vy * Math.max(0, t)) % (2 * span);
  if (p < 0) p += 2 * span;
  return lo + (p > span ? 2 * span - p : p);
}

function cloudBot(g: CloudburstState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.runners.find((q) => q.id === id);
  if (!me || me.stun > 0) return NO_INPUT;
  const anvils = g.drops.filter((d) => d.kind === 'anvil' && d.fall > 0 && notices(d.x, d.y, sk.sense));
  const loot = g.drops.filter((d) => d.kind !== 'anvil' && (d.fall <= 0 || d.fall < 0.6));
  const goal = nearest(me, loot, (d) => (d.kind === 'gem' ? -140 : 0));
  look(me, sk, mem, r, (x, y) => {
    if (outside(x, y, AX0, AX1, AY0, AY1)) return 1e6;
    let c = goal ? Math.hypot(goal.x - x, goal.y - y) : 0;
    for (const a of anvils) if (Math.hypot(a.x - x, a.y - y) < ANVIL_HIT + 30) c += 900;
    return c;
  });
  if (goal && Math.hypot(goal.x - me.x, goal.y - me.y) < 70 && !anvils.some((a) => Math.hypot(a.x - goal.x, a.y - goal.y) < ANVIL_HIT + 20)) {
    toward(me, goal.x, goal.y, mem);
  }
  const threat = anvils.some((a) => a.fall < 0.16 && Math.hypot(a.x - me.x, a.y - me.y) < ANVIL_HIT + 6);
  if (!threat) mem.early = -1;
  return stick(mem.sx, mem.sy, dodgeJump(mem, sk, r, threat, me.z <= 0.01));
}

function meteorBot(g: MeteorState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.astros.find((q) => q.id === id);
  if (!me || me.outAt >= 0) return NO_INPUT;
  // the storm wears CPUs down: later on they miss more of the incoming meteors
  const tired = Math.min(1, Math.max(0, g.t - 15) / 60);
  const meteors = g.meteors.filter((m) => notices(m.x, m.y, sk.sense * (1 - tired * 0.45)));
  look(me, sk, mem, r, (x, y) => {
    const fromC = Math.hypot(x - MCX, y - MCY);
    if (fromC > MR - 30) return 1e6;
    let c = fromC * 0.15;
    for (const m of meteors) if (Math.hypot(m.x - x, m.y - y) < BLAST + 28) c += m.fall < 0.8 ? 1000 : 500;
    for (const k of g.craters) if (Math.hypot(k.x - x, k.y - y) < 42) c += 40;
    return c;
  });
  const threat = meteors.some((m) => m.fall < 0.15 && Math.hypot(m.x - me.x, m.y - me.y) < BLAST + 4);
  if (!threat) mem.early = -1;
  return stick(mem.sx, mem.sy, dodgeJump(mem, sk, r, threat, me.z <= 0.01));
}

function graveBot(g: GraveyardState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.keepers.find((q) => q.id === id);
  if (!me || me.scared > 0) return NO_INPUT;
  const candles = g.candles.filter((c) => c.fly <= 0);
  const goal = nearest(me, candles);
  const ghosts = g.ghosts.filter((h) => h.rise > 0.6);
  look(me, sk, mem, r, (x, y) => {
    if (outside(x, y, GX0, GX1, GY0, GY1)) return 1e6;
    let c = goal ? Math.hypot(goal.x - x, goal.y - y) : 0;
    // ghost touches cost half your candles, so the more you carry, the wider the berth (empty-handed: barely care)
    const stake = 0.25 + Math.min(1, me.candles / 6);
    if (me.safe <= 0) for (const h of ghosts) c += Math.max(0, 110 - Math.hypot(h.x - x, h.y - y)) * 6 * sk.sense * stake;
    return c;
  });
  if (goal && Math.hypot(goal.x - me.x, goal.y - me.y) < 60) toward(me, goal.x, goal.y, mem);
  const threat = me.safe <= 0 && ghosts.some((h) => Math.hypot(h.x - me.x, h.y - me.y) < 52);
  if (!threat) mem.early = -1;
  return stick(mem.sx, mem.sy, dodgeJump(mem, sk, r, threat, me.z <= 0.01));
}

function trainBot(g: TrainState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.hoppers.find((q) => q.id === id);
  if (!me || me.outAt >= 0) return NO_INPUT;
  // a track is unsafe from the moment its signal flashes until the last car has gone by
  const hot = new Set<number>();
  for (const tr of g.trains) {
    const [a, b] = trainSpan(tr);
    const gone = tr.warn <= 0 && (tr.dir > 0 ? a > TX1 + 40 : b < TX0 - 40);
    // easy bots miss some of the signals
    if (!gone && notices(tr.track * 97 + tr.cars, Math.round(tr.dir * 13 + g.trains.indexOf(tr)), sk.sense)) hot.add(tr.track);
  }
  // the strips between tracks are always safe
  const onTrack = (y: number, t: number) => Math.abs(y - TRACKS[t]) < TRACK_HALF + 16;
  const gaps = [(TY0 + 22 + TRACKS[0] - TRACK_HALF - 11) / 2, ...TRACKS.slice(1).map((y, i) => (y + TRACKS[i]) / 2), TY1 - 22].filter(
    (y) => TRACKS.every((ty) => Math.abs(y - ty) > TRACK_HALF + 14),
  );
  const onHot = [...hot].find((t) => onTrack(me.y, t));
  if (onHot !== undefined) {
    // get off the shortest way, into a gap
    const gy = gaps.reduce((best, y) => (Math.abs(y - me.y) < Math.abs(best - me.y) ? y : best), gaps[0]);
    return stick(0, Math.abs(gy - me.y) < 4 ? 0 : Math.sign(gy - me.y));
  }
  const safe = g.coins.filter((c) => !hot.has(TRACKS.indexOf(c.y)));
  const goal = nearest(me, safe);
  if (mem.next <= 0) {
    mem.next = sk.think;
    if (goal) {
      // don't walk across a hot track to reach it
      const blocked = [...hot].some((t) => (TRACKS[t] - me.y) * (TRACKS[t] - goal.y) < 0 || onTrack(goal.y, t));
      if (blocked) {
        mem.sx = Math.sign(goal.x - me.x) * (Math.abs(goal.x - me.x) > 20 ? 1 : 0);
        mem.sy = 0;
      } else {
        toward(me, goal.x, goal.y, mem);
        const wob = (rand(r) * 2 - 1) * sk.wobble;
        const x = mem.sx;
        mem.sx = x * Math.cos(wob) - mem.sy * Math.sin(wob);
        mem.sy = x * Math.sin(wob) + mem.sy * Math.cos(wob);
      }
    } else {
      const gy = gaps.reduce((best, y) => (Math.abs(y - me.y) < Math.abs(best - me.y) ? y : best), gaps[0]);
      mem.sx = 0;
      mem.sy = Math.abs(gy - me.y) < 4 ? 0 : Math.sign(gy - me.y) * 0.6;
    }
  }
  // stepping toward a hot track: stop at its edge
  const ny = me.y + mem.sy * 30;
  if ([...hot].some((t) => onTrack(ny, t))) mem.sy = 0;
  return stick(mem.sx, mem.sy);
}

function crateBot(g: CrateGrabState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.grabbers.find((q) => q.id === id);
  if (!me || me.stun > 0) return NO_INPUT;
  const home = me.team === 0 ? CX0 + BASE_W / 2 : CX1 - BASE_W / 2;
  if (me.carrying) {
    if (mem.next <= 0) {
      mem.next = sk.think;
      toward(me, home, clamp(me.y, CY0 + 60, CY1 - 60), mem);
    }
    return stick(mem.sx, mem.sy);
  }
  // smart bots go after an enemy carrier when one is close
  const carrier = sk.smart >= 0.7 ? nearest(me, g.grabbers.filter((o) => o.team !== me.team && o.carrying)) : null;
  const crate = nearest(me, g.crates.filter((c) => c.fall < 0.5));
  let target: Mover | null = crate;
  if (carrier && (!crate || Math.hypot(carrier.x - me.x, carrier.y - me.y) < Math.hypot(crate.x - me.x, crate.y - me.y) * 0.8)) target = carrier;
  if (mem.next <= 0) {
    mem.next = sk.think;
    if (target) toward(me, target.x, target.y, mem);
    else toward(me, (CX0 + CX1) / 2, (CY0 + CY1) / 2, mem);
    const wob = (rand(r) * 2 - 1) * sk.wobble;
    const x = mem.sx;
    mem.sx = x * Math.cos(wob) - mem.sy * Math.sin(wob);
    mem.sy = x * Math.sin(wob) + mem.sy * Math.cos(wob);
  }
  const bumpIt = target === carrier && carrier && Math.hypot(carrier.x - me.x, carrier.y - me.y) < 70 && rand(r) < 0.1;
  return stick(mem.sx, mem.sy, !!bumpIt);
}

function rinkBot(g: RinkState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.skaters.find((q) => q.id === id);
  if (!me || !me.alive) return NO_INPUT;
  const CX = 640;
  const CY = 390;
  // look ahead along the current slide, since ice keeps you moving
  const ahead = 0.25 + 0.45 * sk.sense;
  const fromC = Math.hypot(me.x + me.vx * ahead - CX, me.y + me.vy * ahead - CY);
  const margin = 30 + 60 * sk.sense;
  let tx: number;
  let ty: number;
  let dash = false;
  if (fromC > g.rink - margin) {
    // too close to the edge: head back in
    tx = CX;
    ty = CY;
  } else {
    const foes = g.skaters.filter((o) => o.alive && o.id !== id);
    const v = nearest(me, foes);
    if (!v) {
      tx = CX;
      ty = CY;
    } else {
      // get between the centre and the victim, then dash them outward
      const vc = Math.hypot(v.x - CX, v.y - CY) || 1;
      const ox = (v.x - CX) / vc;
      const oy = (v.y - CY) / vc;
      tx = v.x - ox * 46;
      ty = v.y - oy * 46;
      const dx = v.x - me.x;
      const dy = v.y - me.y;
      const d = Math.hypot(dx, dy);
      const lined = (dx * ox + dy * oy) / (d || 1) > (sk.smart >= 1 ? 0.55 : 0.2);
      // don't dash if it would carry you off the edge too
      const landX = me.x + (dx / (d || 1)) * 170 - CX;
      const landY = me.y + (dy / (d || 1)) * 170 - CY;
      const safeDash = Math.hypot(landX, landY) < g.rink - 20 || sk.sense < 0.5;
      if (d < 120 && me.dashCd <= 0 && safeDash && (lined || rand(r) < 0.03) && rand(r) < 0.25 + 0.5 * sk.sense) {
        dash = true;
        tx = v.x;
        ty = v.y;
      }
    }
  }
  if (mem.next <= 0 || dash) {
    mem.next = sk.think;
    // on ice: steer toward a sensible speed, not flat out, so it can stop
    const dx = tx - me.x;
    const dy = ty - me.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = dash ? 400 : Math.min(260, d * 2.2);
    let ix = (dx / d) * want - me.vx * (0.4 + 0.5 * sk.sense);
    let iy = (dy / d) * want - me.vy * (0.4 + 0.5 * sk.sense);
    if (dash) {
      ix = dx;
      iy = dy;
    }
    const m = Math.hypot(ix, iy);
    const wob = (rand(r) * 2 - 1) * sk.wobble;
    const ux = m > 20 ? ix / m : 0;
    const uy = m > 20 ? iy / m : 0;
    mem.sx = ux * Math.cos(wob) - uy * Math.sin(wob);
    mem.sy = ux * Math.sin(wob) + uy * Math.cos(wob);
  }
  return stick(mem.sx, mem.sy, dash);
}

/* ------------------------------------------------------------------ board */

function boardBot(b: BoardState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  if (b.sub === 'orderRoll') {
    remember(mem, 'orderRoll', randRange(r, 0.8, 2.2));
    return !b.orderRolls[id] && mem.t > mem.wait ? press() : NO_INPUT;
  }
  if (b.sub === 'done' || b.sub === 'event' || currentPlayer(b) !== id) return NO_INPUT;
  const def = getBoard(b.boardId);
  const me = b.players[id];
  const pr = b.prompt;
  remember(mem, `${b.turn}:${b.cur}:${b.sub}:${b.rolls.length}:${pr?.kind ?? ''}:${pr && 'node' in pr ? pr.node : ''}`, randRange(r, 0.45, 0.95));
  const ready = mem.t > mem.wait && b.t > 0.35;
  const smart = () => rand(r) < sk.smart;

  if (b.sub === 'roll') {
    if (!ready) return NO_INPUT;
    if (mem.itemTurn !== b.turn && me.items.length && me.usedItemTurn !== b.turn) {
      mem.itemTurn = b.turn;
      const pick = pickItem(b, id, sk, r);
      if (pick >= 0) {
        mem.m = pick;
        return pressB();
      }
    }
    // Slow Roller: wait for the top face (sloppier bots stop it early)
    if (me.slowRoll && sk.smart >= 0.5 && b.t < 4 && slowFace(b, me) < dieHigh(me)) return NO_INPUT;
    return press();
  }

  if (b.sub === 'branch' && b.branch) {
    const here = def.nodes[me.node];
    if (mem.n < 0) {
      // smart bots head for the nearest Crown Chest; others pick at random
      let best = Math.floor(rand(r) * b.branch.options.length);
      if (smart() && b.crowns.length && !b.weather?.blind.includes(id)) {
        let bd = Infinity;
        b.branch.options.forEach((o, i) => {
          const fd = forwardDist(def, b, o, 60);
          const d = Math.min(...b.crowns.map((c) => fd.get(c) ?? 99));
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
      }
      mem.n = best;
    }
    const n = def.nodes[b.branch.options[mem.n]];
    const dx = n.x - here.x;
    const dz = n.z - here.z;
    const d = Math.hypot(dx, dz) || 1;
    return stick(dx / d, dz / d, ready && b.branch.sel === mem.n);
  }

  if (b.sub !== 'prompt' || !pr) return NO_INPUT;
  if (!ready) return NO_INPUT;
  switch (pr.kind) {
    case 'items':
      if (me.usedItemTurn === b.turn || !me.items.length) return pressB();
      return choose(pr.sel, Math.max(0, ITEM_GRID.indexOf(me.items[Math.min(Math.max(0, mem.m), me.items.length - 1)])), ITEM_GRID.length);
    case 'target': {
      if (mem.n < 0) mem.n = pickTarget(b, id, pr.options, pr.purpose, smart(), r);
      return choose(pr.sel, mem.n, pr.options.length);
    }
    case 'claim':
      // toll posts pay steadily; smart bots with low HP want sting posts to heal
      if (mem.n < 0) mem.n = me.hp < b.preset.maxHp * 0.5 && smart() ? 1 : 0;
      return pickTwo(b, pr.sel, mem.n === 0);
    case 'steal':
      return pickTwo(b, pr.sel, me.keys >= b.preset.postStealCost + (sk.smart >= 1 ? 12 : 0) && sk.smart > 0.5);
    case 'crown':
      return pickTwo(b, pr.sel, me.keys >= b.preset.crownPrice);
    case 'shop': {
      // buy something if it still leaves a little cushion of keys; otherwise walk on by
      if (mem.n < 0) {
        const ok = pr.stock.map((it, i) => [i, SHOP_PRICE[it]] as const).filter(([, c]) => c <= me.keys - (smart() ? 8 : 0));
        mem.n = ok.length && rand(r) < 0.75 ? ok[Math.floor(rand(r) * ok.length)][0] : pr.stock.length;
      }
      if (pr.sel === mem.n) return press();
      return stick(0, 1);
    }
    case 'wisp':
      if (mem.n < 0) mem.n = me.keys >= WISP_PRICE + 5 && smart() ? 0 : 1;
      return pickTwo(b, pr.sel, mem.n === 0);
    case 'train':
      if (mem.n < 0) mem.n = me.keys >= TRAIN_PRICE + 5 && smart() ? 0 : 1;
      return pickTwo(b, pr.sel, mem.n === 0);
  }
  return NO_INPUT;
}

/** A two-choice prompt: move the cursor to Yes (left) or No (right), then confirm once the prompt unlocks. */
function pickTwo(b: BoardState, sel: number | undefined, yes: boolean): TickInput {
  const want = yes ? 0 : 1;
  if ((sel ?? 0) !== want) return stick(yes ? -1 : 1, 0);
  return (b.promptAge ?? 1) > PROMPT_LOCK ? press() : NO_INPUT;
}

/** Step a menu cursor toward `want`, then confirm. */
function choose(sel: number, want: number, len: number): TickInput {
  if (len <= 0) return pressB();
  const w = Math.min(want, len - 1);
  if (sel === w) return press();
  return stick(1, 0);
}

function pickItem(b: BoardState, id: string, sk: Skill, r: Rng): number {
  if (sk.smart < 0.5 && rand(r) < 0.7) return -1; // easy bots mostly forget their items
  const me = b.players[id];
  const def = getBoard(b.boardId);
  const fd = forwardDist(def, b, me.node, 40);
  const chest = Math.min(99, ...b.crowns.map((c) => fd.get(c) ?? 99));
  const others = Object.values(b.players).filter((o) => o.id !== id);
  const near = nearDist(def, me.node, 2);
  const want = (it: ItemId): boolean => {
    switch (it) {
      case 'heart-snack':
        return me.hp <= b.preset.maxHp - 15;
      case 'knight-shield':
        return !me.shield;
      case 'spring-boots':
      case 'double-barrel':
      case 'high-roller':
      case 'slow-roller':
        return chest > 5 && chest < 99;
      case 'treasure-shovel':
        return others.some((o) => near.has(o.node) && o.keys > 0);
      case 'pirate-cannon': {
        return others.some((o) => (fd.get(o.node) ?? 99) <= 10);
      }
      case 'swap-pipe': {
        const best = Math.min(...others.map((o) => Math.min(99, ...b.crowns.map((c) => forwardDist(def, b, o.node, 30).get(c) ?? 99))));
        return best + 4 < chest;
      }
      case 'hunting-bow':
      case 'sticky-cube':
      case 'spike-trap':
        return others.length > 0;
    }
    return false;
  };
  const ok = me.items.map((it, i) => (want(it) ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return -1;
  return rand(r) < sk.smart ? ok[0] : ok[Math.floor(rand(r) * ok.length)];
}

function pickTarget(b: BoardState, id: string, options: string[], purpose: string, smart: boolean, r: Rng): number {
  if (!smart || !options.length) return Math.floor(rand(r) * options.length);
  const score = (o: string) => {
    const p = b.players[o];
    // aim at the leader; for damage, prefer someone it can knock out
    let v = p.crowns * 100 + p.keys;
    if (purpose !== 'duel' && p.hp <= 15) v += 60;
    if (p.shield) v -= 80;
    return v;
  };
  let best = 0;
  options.forEach((o, i) => {
    if (score(o) > score(options[best])) best = i;
  });
  return best;
}


/* ------------------------------------------------------------------ wave 3 */

function potatoBot(g: PotatoState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.sailors.find((q) => q.id === id);
  if (!me || me.outAt >= 0 || g.t < 3) return NO_INPUT;
  const others = g.sailors.filter((q) => q.outAt < 0 && q.id !== id);
  if (g.holder === id) {
    // chase the nearest sailor and dash into them
    const tgt = nearest(me, others);
    if (!tgt) return NO_INPUT;
    if (mem.next <= 0) {
      mem.next = sk.think;
      toward(me, tgt.x, tgt.y, mem);
      const wob = (rand(r) * 2 - 1) * sk.wobble * 0.6;
      [mem.sx, mem.sy] = [mem.sx * Math.cos(wob) - mem.sy * Math.sin(wob), mem.sx * Math.sin(wob) + mem.sy * Math.cos(wob)];
    }
    const d = Math.hypot(tgt.x - me.x, tgt.y - me.y);
    return stick(mem.sx, mem.sy, me.dashCd === 0 && d < 160 && rand(r) < 0.3 + sk.sense * 0.5);
  }
  const h = g.sailors.find((q) => q.id === g.holder);
  look(me, sk, mem, r, (x, y) => {
    if (x < 260 || x > 1020 || y < 180 || y > 610) return 1e6;
    let c = Math.hypot(x - 640, y - 395) * 0.1;
    if (h) c += Math.max(0, 420 - Math.hypot(h.x - x, h.y - y)) * 3 * (0.4 + sk.sense);
    return c;
  });
  const close = h && Math.hypot(h.x - me.x, h.y - me.y) < 110;
  return stick(mem.sx, mem.sy, !!close && me.dashCd === 0 && rand(r) < sk.sense * 0.25);
}

function kitchenBot(g: KitchenState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.cooks.find((q) => q.id === id);
  if (!me || me.stun > 0 || g.t < 3) return NO_INPUT;
  const chef = g.cooks.find((q) => q.chef)!;
  if (me.chef) {
    // go after carriers first, else whoever is closest to the island
    const raiders = g.cooks.filter((q) => !q.chef && q.stun === 0);
    const tgt = nearest(me, raiders, (q) => (q.carry >= 0 ? -150 : Math.hypot(q.x - ISLAND.x, q.y - ISLAND.y) * 0.3));
    if (!tgt) return NO_INPUT;
    if (mem.next <= 0) {
      mem.next = sk.think;
      toward(me, tgt.x + tgt.vx * 0.2, tgt.y + tgt.vy * 0.2, mem);
    }
    const d = Math.hypot(tgt.x - me.x, tgt.y - me.y);
    return stick(mem.sx, mem.sy, me.cd === 0 && d < 130 && rand(r) < 0.1 + sk.sense * 0.3);
  }
  // head for the goal, going round the island's corners when it's in the way, and shy away from the chef
  const hx = ISLAND.w / 2 + 40;
  const hy = ISLAND.h / 2 + 40;
  const blocked = (tx: number, ty: number) => {
    for (let k = 1; k < 12; k++) {
      const x = me.x + ((tx - me.x) * k) / 12;
      const y = me.y + ((ty - me.y) * k) / 12;
      if (Math.abs(x - ISLAND.x) < hx - 16 && Math.abs(y - ISLAND.y) < hy - 16) return true;
    }
    return false;
  };
  const go = (tx: number, ty: number, grab: boolean) => {
    if (blocked(tx, ty)) {
      const corners: [number, number][] = [[ISLAND.x - hx, ISLAND.y - hy], [ISLAND.x + hx, ISLAND.y - hy], [ISLAND.x - hx, ISLAND.y + hy], [ISLAND.x + hx, ISLAND.y + hy]];
      const c = corners.filter(([x, y]) => !blocked(x, y)).sort((a, b) => Math.hypot(a[0] - me.x, a[1] - me.y) + Math.hypot(tx - a[0], ty - a[1]) - (Math.hypot(b[0] - me.x, b[1] - me.y) + Math.hypot(tx - b[0], ty - b[1])))[0];
      if (c) [tx, ty] = c;
    }
    toward(me, tx, ty, mem);
    const cd = Math.hypot(chef.x - me.x, chef.y - me.y);
    if (cd < 170 && chef.cd < 0.8 && notices(chef.x, Math.floor(g.t), sk.sense)) {
      const k = ((170 - cd) / 170) * 1.6;
      mem.sx += ((me.x - chef.x) / cd) * k;
      mem.sy += ((me.y - chef.y) / cd) * k;
      const m = Math.hypot(mem.sx, mem.sy) || 1;
      mem.sx /= m;
      mem.sy /= m;
    }
    return stick(mem.sx, mem.sy, grab);
  };
  if (me.carry >= 0) return go(me.plateX, me.plateY, false);
  const snack = nearest(me, g.snacks);
  if (!snack) return go(ISLAND.x, ISLAND.y + hy + 40, false);
  // stand on the island's edge right next to the snack
  const ex = Math.max(ISLAND.x - hx + 14, Math.min(ISLAND.x + hx - 14, snack.x));
  const ey = snack.y < ISLAND.y ? ISLAND.y - hy + 14 : ISLAND.y + hy - 14;
  const near = Math.hypot(snack.x - me.x, snack.y - me.y) < 66;
  return go(ex, ey, near);
}

function lanternBot(g: LanternState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.folk.find((q) => q.id === id);
  if (!me || g.t < 3) return NO_INPUT;
  if (me.keeper) {
    // sweep toward the sneaker closest to the crypt, with a lazy wobble
    const tgt = nearest(me, g.folk.filter((f) => !f.keeper && f.inAt < 0 && f.caught === 0), (f) => (f.y - CRYPT_Y) * 0.5);
    if (mem.next <= 0) {
      mem.next = sk.think * 1.5;
      mem.m = (rand(r) * 2 - 1) * (1 - sk.sense) * 0.6;
    }
    const a = tgt ? Math.atan2(tgt.y - KEEPER.y, tgt.x - KEEPER.x) + mem.m : Math.PI / 2 + Math.sin(g.t) * 0.9;
    return stick(Math.cos(a), Math.sin(a));
  }
  if (me.inAt >= 0 || me.caught > 0) return NO_INPUT;
  look(me, sk, mem, r, (x, y) => {
    // stay out of where the light is pointing
    let da = Math.atan2(y - KEEPER.y, x - KEEPER.x) - g.angle;
    da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
    return Math.hypot(x - KEEPER.x, y - (CRYPT_Y - 10)) + Math.max(0, 0.7 - da) * 260 * sk.sense;
  }, 90);
  // freeze if the beam is on me or about to sweep over me
  const ahead = (da: number) => {
    const g2 = { ...g, angle: g.angle + da };
    return inBeam(g2, me.x, me.y) || inBeam(g2, me.x + mem.sx * 30, me.y + mem.sy * 30);
  };
  const m = 0.08 + (1 - sk.sense) * 0.12;
  const danger = inBeam(g, me.x + mem.sx * 20, me.y + mem.sy * 20) || ahead(m) || ahead(-m);
  if (danger) {
    if (mem.early < 0) mem.early = rand(r) < 0.1 + sk.sense * 0.9 ? 1 : 0;
    if (mem.early === 1) {
      if (me.breath > 0.4) return { ...NO_INPUT, b: true, bPressed: false };
      // out of breath: slip sideways out of the light instead
      const a = Math.atan2(me.y - KEEPER.y, me.x - KEEPER.x);
      const side = Math.sin(a - g.angle) > 0 ? 1 : -1;
      return stick(Math.cos(a + side * 1.4), Math.sin(a + side * 1.4));
    }
  } else mem.early = -1;
  return stick(mem.sx, mem.sy);
}

function memoryBot(g: MemoryState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.folk.find((q) => q.id === id);
  if (!me || me.outRound >= 0 || g.phase !== 'input' || me.doneAt >= 0) return NO_INPUT;
  if (remember(mem, `mem:${g.round}`, randRange(r, sk.react[0], sk.react[1]) + 0.3)) mem.prev = 0;
  if (mem.prev === 1) {
    mem.prev = 0; // let go of the stick between entries
    mem.wait = mem.t + randRange(r, sk.react[0] * 0.6, sk.react[1] * 0.8);
    return NO_INPUT;
  }
  if (mem.t < mem.wait) return NO_INPUT;
  const len = g.seq.length;
  const slip = sk.smart >= 1 ? 0.004 + 0.003 * len : sk.smart >= 0.7 ? 0.015 + 0.007 * len : 0.04 + 0.014 * len;
  let d = g.seq[me.pos];
  if (rand(r) < slip) d = (d + 1 + Math.floor(rand(r) * 3)) % 4;
  mem.prev = 1;
  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  return stick(dirs[d][0], dirs[d][1]);
}

function clearShot(ax: number, ay: number, bx: number, by: number): boolean {
  for (let k = 1; k < 10; k++) if (fortAt(ax + ((bx - ax) * k) / 10, ay + ((by - ay) * k) / 10, 4)) return false;
  return true;
}

function snowBot(g: SnowState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.folk.find((q) => q.id === id);
  if (!me || me.outAt >= 0 || g.t < 3) return NO_INPUT;
  const foes = g.folk.filter((f) => f.outAt < 0 && f.id !== id);
  const tgt = nearest(me, foes);
  // hop over an incoming snowball
  const incoming = g.balls.some((b) => b.by !== id && Math.hypot(b.x - me.x, b.y - me.y) < 90 && (me.x - b.x) * b.vx + (me.y - b.y) * b.vy > 0 && notices(b.x, b.y, sk.sense));
  // one call per incoming throw: dodge it or not (nobody dodges every single one)
  if (incoming && g.t > mem.prev) {
    mem.prev = g.t + 0.45;
    mem.m = rand(r) < 0.45 + sk.smart * 0.3 ? 1 : 0;
  }
  const jumpNow = incoming && mem.m === 1 && me.z <= 0.01 && rand(r) < 0.5;
  if (!tgt) return NO_INPUT;
  const d = Math.hypot(tgt.x - me.x, tgt.y - me.y);
  if (me.cd === 0 && d < 520 && clearShot(me.x, me.y, tgt.x, tgt.y) && rand(r) < 0.08 + sk.sense * 0.5) {
    const lead = d / 620;
    const err = (rand(r) * 2 - 1) * sk.wobble * 0.9;
    const a = Math.atan2(tgt.y + tgt.vy * lead * sk.sense - me.y, tgt.x + tgt.vx * lead - me.x) + err;
    return { ...stick(Math.cos(a), Math.sin(a), true), b: jumpNow, bPressed: jumpNow };
  }
  look(me, sk, mem, r, (x, y) => {
    if (fortAt(x, y, 26) || x < 150 || x > 1130 || y < 180 || y > 640) return 1e6;
    let c = Math.abs(Math.hypot(tgt.x - x, tgt.y - y) - 280);
    for (const b of g.balls) if (b.by !== id) c += Math.max(0, 70 - Math.hypot(b.x - x, b.y - y)) * 4 * sk.sense;
    return c;
  });
  return { ...stick(mem.sx, mem.sy), b: jumpNow, bPressed: jumpNow };
}

function laserBot(g: LaserState, id: string, sk: Skill, mem: BotMem, r: Rng): TickInput {
  const me = g.folk.find((q) => q.id === id);
  if (!me || me.outAt >= 0 || g.t < 3) return NO_INPUT;
  // the next beam coming down at me, and how long until it arrives (everyone runs on their own)
  let next = null as LaserState['beams'][number] | null;
  for (const b of g.beams) if (b.p >= me.p - 0.003 && (!next || b.p < next.p)) next = b;
  if (!next) return NO_INPUT;
  const tta = (next.p - me.p) / (next.speed + 0.0125);
  if (remember(mem, `beam:${next.id}`, 0)) {
    // each beam gets its own timing error, and sometimes goes unnoticed
    mem.m = (rand(r) * 2 - 1) * (sk.react[1] - sk.react[0]) * 1.2;
    mem.n = notices(next.id * 7.1, next.p, 0.45 + sk.sense * 0.55) ? 1 : 0;
    // nerves: as it speeds up, everyone starts fumbling now and then (so CPUs drop out one by one, not all together)
    if (rand(r) < g.level * (0.012 + (1 - sk.smart) * 0.01)) mem.n = 0;
  }
  if (!mem.n || me.duck || me.z > 0.01) return NO_INPUT;
  const k = Math.sqrt(Math.pow(1.13, g.level));
  const high = next.flipAt >= 0 && next.flipAt > me.p && tta < 0.5 ? !next.high : next.high;
  // duck or hop so the move is at its deepest/highest as the beam passes
  const at = (high ? 0.2 : 0.26) / k + mem.m * 0.5;
  if (tta < at && tta > at - 0.1) return high ? { ...NO_INPUT, b: true, bPressed: true } : { ...NO_INPUT, a: true, aPressed: true };
  return NO_INPUT;
}
