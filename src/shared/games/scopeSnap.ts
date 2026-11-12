import type { Minigame, PlayerInfo, Inputs, ResultRow, TickInput } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, playerById, roundRect, text } from '../draw';
import { TEAM_HEX, TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { rand, type Rng } from '../rng';
import type { BotCtx } from '../botkit';

/**
 * Scope Snap (first person, free-for-all): everyone has the same toy Snap Rifle that fires foam darts,
 * and one hit pops you into confetti. Holding scope zooms in for at most 1 second, then the scope snaps
 * off and needs 1.5 seconds to come back, so quick scoping is the skill. Hip fire sprays wide.
 * Scoped hit +1, quick scope (fired within 0.3 s of scoping in) +2, no scope +3. A knife lunge takes a
 * point off the victim and gives the knifer nothing. 60 seconds, highest score wins.
 *
 * The world is flat: x across, z down the map (metres), walls are boxes. Shots are 2D rays.
 */
export const READY = 3;
export const LIMIT = 60;
export const EYE = 1.5;
export const BODY_R = 0.5;
const RADIUS = 0.42;
const SPEED = 6.4;
const SCOPED_SPEED = 3.2;
const GRAVITY = 20;
const JUMP_V = 7;
export const SCOPE_MAX = 1;
export const SCOPE_CD = 1.5;
/** Seconds after scoping in before the zoom is fully steady. */
export const ZOOM_IN = 0.12;
export const QUICK = 0.3;
const HIP_SPREAD = 0.17;
const FIRE_CD = 0.85;
const KNIFE_CD = 0.9;
const KNIFE_RANGE = 2.1;
const RESPAWN = 2;
const SHIELD = 2;
const RANGE = 70;

export interface Wall {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height in metres (looks only: every wall blocks shots). */
  h: number;
  kind: 'wall' | 'crate' | 'pillar';
}

export interface Sniper {
  id: string;
  /** Team games: 0 or 1. Free-for-all: -1. */
  team: number;
  x: number;
  z: number;
  /** Facing in the x-z plane: forward = (cos yaw, sin yaw). */
  yaw: number;
  /** Looking up / down (looks only). */
  pitch: number;
  y: number;
  vy: number;
  vx: number;
  vz: number;
  alive: boolean;
  respawn: number;
  shield: number;
  score: number;
  pops: number;
  deaths: number;
  /** Seconds scoped in, or -1 when not scoped. */
  scopeT: number;
  scopeCd: number;
  fireCd: number;
  knifeCd: number;
  /** Knife lunge time left. */
  lunge: number;
  streak: number;
  /** Seconds since the last step taken (for the walk animation). */
  moving: number;
}

export interface Tracer {
  t: number;
  by: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  hit: boolean;
}

export interface Play {
  t: number;
  kind: 'scope' | 'quick' | 'noscope' | 'knife';
  by: string;
  victim: string;
  pts: number;
}

export interface SnapRules {
  teams: boolean;
  /** First to this many points (a player's own, or the team's) wins early. */
  target: number | null;
  limit: number;
}

export interface SnapState {
  t: number;
  rules: SnapRules;
  teamScore: [number, number];
  rng: Rng;
  walls: Wall[];
  spawns: [number, number][];
  /** Half sizes of the floor. */
  hw: number;
  hd: number;
  players: Sniper[];
  tracers: Tracer[];
  feed: Play[];
  /** Pops this game, for the view's confetti. */
  popsAt: { t: number; id: string; x: number; z: number }[];
  endAt?: number;
}

/** Local viewports the HUD draws crosshairs for (set by the client view each frame). */
export const SNAP_HUD = { views: [] as { id: string; x: number; y: number; w: number; h: number }[] };

/** Orbital Dock: a mirrored station deck. The side wings close off in small games. */
export function buildMap(n: number): { walls: Wall[]; spawns: [number, number][]; hw: number; hd: number } {
  const small = n <= 4;
  const hw = small ? 11 : 18, hd = 12;
  const walls: Wall[] = [];
  const box = (cx: number, cz: number, w: number, d: number, h: number, kind: Wall['kind']) =>
    walls.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h, kind });
  // outer hull
  box(0, -hd - 0.4, hw * 2 + 1.6, 0.8, 3.4, 'wall');
  box(0, hd + 0.4, hw * 2 + 1.6, 0.8, 3.4, 'wall');
  box(-hw - 0.4, 0, 0.8, hd * 2, 3.4, 'wall');
  box(hw + 0.4, 0, 0.8, hd * 2, 3.4, 'wall');
  // the atrium: two big pillars, a crate pile in the middle, cover either side
  for (const sz of [-1, 1]) box(0, sz * 5.5, 2.4, 2.4, 3.4, 'pillar');
  box(0, 0, 1.4, 1.4, 1.3, 'crate');
  for (const sx of [-1, 1]) {
    box(sx * 5, 0, 1, 3.4, 2.2, 'wall');
    for (const sz of [-1, 1]) {
      box(sx * 6.5, sz * 8.5, 3.2, 1, 2.2, 'wall');
      box(sx * 3, sz * 9.6, 1.2, 1.2, 1.3, 'crate');
      box(sx * 8.4, sz * 3.6, 1.2, 1.2, 1.3, 'crate');
    }
    if (!small) {
      // wing bulkheads with a doorway in the middle and the corridors behind them
      box(sx * 11, -7.5, 0.6, 9, 3.4, 'wall');
      box(sx * 11, 7.5, 0.6, 9, 3.4, 'wall');
      box(sx * 14.5, 0, 1.2, 5, 2.2, 'wall');
      for (const sz of [-1, 1]) box(sx * 15, sz * 7.5, 1.4, 1.4, 1.3, 'crate');
    }
  }
  const spawns: [number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      spawns.push([sx * (small ? 9 : 8.6), sz * 10.6], [sx * 2.6, sz * 11]);
      if (!small) spawns.push([sx * 16.5, sz * 10.5], [sx * 16.5, sz * 3.5]);
    }
    spawns.push([sx * (small ? 9.6 : 8.2), 0]);
  }
  return { walls, spawns, hw, hd };
}

const fwd = (yaw: number) => ({ x: Math.cos(yaw), z: Math.sin(yaw) });
/** Can a hurt b? Everyone in free-for-all; only the other team in team games. */
export const rivals = (a: Sniper, b: Sniper) => a !== b && (a.team < 0 || a.team !== b.team);

/** Distance along a ray to the first wall (or Infinity). */
export function rayWall(walls: Wall[], x: number, z: number, dx: number, dz: number, max = RANGE): number {
  let best = max;
  for (const w of walls) {
    let t0 = 0, t1 = best;
    for (const [o, d, lo, hi] of [
      [x, dx, w.x0, w.x1],
      [z, dz, w.z0, w.z1],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          t0 = Infinity;
          break;
        }
      } else {
        let a = (lo - o) / d, b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
    }
    if (t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

/** Can a see b (no wall between)? */
export function canSee(s: SnapState, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return rayWall(s.walls, ax, az, dx / d, dz / d, d) >= d - 0.01;
}

function collide(s: SnapState, p: Sniper): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of s.walls) {
      const cx = clamp(p.x, w.x0, w.x1), cz = clamp(p.z, w.z0, w.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= RADIUS) continue;
      if (d > 1e-6) {
        p.x = cx + (dx / d) * RADIUS;
        p.z = cz + (dz / d) * RADIUS;
      } else {
        // inside: push out the nearest side
        const opts = [
          [w.x0 - RADIUS - p.x, 0],
          [w.x1 + RADIUS - p.x, 0],
          [0, w.z0 - RADIUS - p.z],
          [0, w.z1 + RADIUS - p.z],
        ];
        opts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
        p.x += opts[0][0];
        p.z += opts[0][1];
      }
    }
  }
  p.x = clamp(p.x, -s.hw + RADIUS, s.hw - RADIUS);
  p.z = clamp(p.z, -s.hd + RADIUS, s.hd - RADIUS);
}

/** The spawn point furthest from every living rival (same idea as the Chobglob chest). */
function bestSpawn(s: SnapState, me: Sniper): [number, number] {
  let best = s.spawns[0], score = -1;
  for (const sp of spawnsFor(s.spawns, me.team)) {
    let near = 99;
    for (const q of s.players) if (rivals(me, q) && q.alive) near = Math.min(near, Math.hypot(q.x - sp[0], q.z - sp[1]));
    const v = near + rand(s.rng) * 1.5;
    if (v > score) {
      score = v;
      best = sp;
    }
  }
  return best;
}

/** Spawn facing: down the longest clear line, leaning toward the middle (never nose to a wall). */
function faceOpen(walls: Wall[], x: number, z: number): number {
  const mid = Math.atan2(-z, -x);
  let best = mid, score = -1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const v = Math.min(18, rayWall(walls, x, z, Math.cos(a), Math.sin(a), 30)) + 4 * Math.cos(a - mid);
    if (v > score) {
      score = v;
      best = a;
    }
  }
  return Math.atan2(Math.sin(best), Math.cos(best));
}

/** Team games spawn each team on its own half (red on the left, blue on the right). */
function spawnsFor(spawns: [number, number][], team: number): [number, number][] {
  if (team < 0) return spawns;
  const side = spawns.filter(([x]) => (team === 0 ? x < 0 : x > 0));
  return side.length ? side : spawns;
}

function pop(s: SnapState, victim: Sniper): void {
  victim.alive = false;
  victim.respawn = RESPAWN;
  victim.deaths++;
  victim.streak = 0;
  victim.scopeT = -1;
  s.popsAt.push({ t: s.t, id: victim.id, x: victim.x, z: victim.z });
  if (s.popsAt.length > 12) s.popsAt.shift();
}

function addPlay(s: SnapState, p: Play): void {
  s.feed.push(p);
  if (s.feed.length > 6) s.feed.shift();
}

function shoot(s: SnapState, p: Sniper): void {
  const scoped = p.scopeT >= 0;
  // spread: wide from the hip, tightening to nothing as the zoom settles
  const k = scoped ? Math.max(0, 1 - p.scopeT / ZOOM_IN) : 1;
  const spread = scoped ? HIP_SPREAD * 0.4 * k + 0.002 : HIP_SPREAD;
  const a = p.yaw + (rand(s.rng) * 2 - 1) * spread;
  const d = fwd(a);
  let end = rayWall(s.walls, p.x, p.z, d.x, d.z);
  let victim: Sniper | null = null;
  for (const q of s.players) {
    if (!rivals(p, q) || !q.alive || q.shield > 0) continue;
    // ray against a circle (teammates' darts pass through)
    const ox = q.x - p.x, oz = q.z - p.z;
    const along = ox * d.x + oz * d.z;
    if (along <= 0 || along > end) continue;
    const off = Math.abs(ox * d.z - oz * d.x);
    if (off > BODY_R) continue;
    const hitAt = along - Math.sqrt(BODY_R * BODY_R - off * off);
    if (hitAt < end) {
      end = hitAt;
      victim = q;
    }
  }
  s.tracers.push({ t: s.t, by: p.id, x0: p.x, z0: p.z, x1: p.x + d.x * end, z1: p.z + d.z * end, hit: !!victim });
  if (s.tracers.length > 24) s.tracers.shift();
  if (victim) {
    const kind: Play['kind'] = !scoped ? 'noscope' : p.scopeT <= QUICK ? 'quick' : 'scope';
    const pts = kind === 'noscope' ? 3 : kind === 'quick' ? 2 : 1;
    p.score += pts;
    if (p.team >= 0) s.teamScore[p.team] += pts;
    p.pops++;
    p.streak++;
    pop(s, victim);
    addPlay(s, { t: s.t, kind, by: p.id, victim: victim.id, pts });
  }
  // the bolt has to be worked: firing drops the scope
  if (scoped) {
    p.scopeT = -1;
    p.scopeCd = 0.35;
  }
  p.fireCd = FIRE_CD;
  p.shield = 0;
}

function knife(s: SnapState, p: Sniper): void {
  p.knifeCd = KNIFE_CD;
  p.lunge = 0.16;
  p.shield = 0;
  const f = fwd(p.yaw);
  let best: Sniper | null = null, bd = KNIFE_RANGE;
  for (const q of s.players) {
    if (!rivals(p, q) || !q.alive || q.shield > 0) continue;
    const dx = q.x - p.x, dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > bd || d < 1e-6) continue;
    if ((dx * f.x + dz * f.z) / d < 0.45) continue;
    if (!canSee(s, p.x, p.z, q.x, q.z)) continue;
    best = q;
    bd = d;
  }
  if (!best) return;
  best.score = Math.max(0, best.score - 1);
  if (best.team >= 0) s.teamScore[best.team] = Math.max(0, s.teamScore[best.team] - 1);
  pop(s, best);
  addPlay(s, { t: s.t, kind: 'knife', by: p.id, victim: best.id, pts: -1 });
}

const CONTROLS = 'Stick: move · Mouse / right stick / arrows: aim · Right click / LT / K: scope · Left click / RT / J: fire · B / F: knife · A: jump';

interface SnapDef {
  id: string;
  name: string;
  mode: Minigame['mode'];
  blurb: string;
  min: number;
  max: number;
  rules: SnapRules;
}

function makeSnap(def: SnapDef): Minigame<SnapState> {
  return {
  id: def.id,
  name: def.name,
  mode: def.mode,
  ready: READY,
  goWord: 'SNAP!',
  blurb: def.blurb,
  controls: CONTROLS,
  minPlayers: def.min,
  maxPlayers: def.max,

  setup(players: PlayerInfo[], seed: number): SnapState {
    const rng = { seed };
    const map = buildMap(players.length);
    const s: SnapState = { t: 0, rng, rules: def.rules, teamScore: [0, 0], ...map, players: [], tracers: [], feed: [], popsAt: [] };
    const teams = def.rules.teams ? teamsOf(players) : null;
    // spread everyone over the spawn points (each team on its own half), facing open space
    const order = map.spawns.map((sp) => ({ sp, k: rand(rng) }));
    order.sort((a, b) => a.k - b.k);
    const used = [0, 0, 0];
    players.forEach((p, i) => {
      const team = teams ? teams[p.id] : -1;
      const mine = teams ? order.filter((o) => (team === 0 ? o.sp[0] < 0 : o.sp[0] > 0)) : order;
      const k = used[team + 1]++;
      const [x, z] = mine[k % mine.length].sp;
      const jitter = k >= mine.length ? 1.2 : 0;
      void i;
      s.players.push({
        id: p.id,
        team,
        x: x + jitter,
        z,
        yaw: faceOpen(map.walls, x, z),
        pitch: 0,
        y: 0,
        vy: 0,
        vx: 0,
        vz: 0,
        alive: true,
        respawn: 0,
        shield: SHIELD,
        score: 0,
        pops: 0,
        deaths: 0,
        scopeT: -1,
        scopeCd: 0,
        fireCd: 0,
        knifeCd: 0,
        lunge: 0,
        streak: 0,
        moving: 0,
      });
    });
    return s;
  },

  step(s: SnapState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.endAt !== undefined) return;
    const live = s.t >= READY;
    for (const p of s.players) {
      const inp = inputs[p.id] ?? NO_INPUT;
      // looking around works in the countdown too, so you can get your bearings
      const sens = p.scopeT >= 0 ? 0.38 : 1;
      p.yaw += clamp(inp.lookX ?? 0, -1.5, 1.5) * sens;
      if (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
      if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
      p.pitch = clamp(p.pitch - clamp(inp.lookY ?? 0, -1, 1) * sens, -0.35, 0.35);
      if (!live) continue;
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.knifeCd = Math.max(0, p.knifeCd - dt);
      p.scopeCd = Math.max(0, p.scopeCd - dt);
      p.shield = Math.max(0, p.shield - dt);
      if (!p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          const [x, z] = bestSpawn(s, p);
          p.x = x;
          p.z = z;
          p.y = p.vy = p.vx = p.vz = 0;
          p.yaw = faceOpen(s.walls, x, z);
          p.pitch = 0;
          p.alive = true;
          p.shield = SHIELD;
          p.scopeT = -1;
        }
        continue;
      }
      // the scope: hold to zoom, at most 1 second, then it snaps off
      if (p.scopeT >= 0) {
        p.scopeT += dt;
        if (!inp.scope) {
          p.scopeT = -1;
          p.scopeCd = Math.max(p.scopeCd, 0.2);
        } else if (p.scopeT >= SCOPE_MAX) {
          p.scopeT = -1;
          p.scopeCd = SCOPE_CD;
        }
      } else if (inp.scope && p.scopeCd <= 0) p.scopeT = 0;
      // move: stick y forward / back, x strafes
      const f = fwd(p.yaw);
      const r = { x: -f.z, z: f.x };
      let mx = f.x * -inp.y + r.x * inp.x, mz = f.z * -inp.y + r.z * inp.x;
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      const speed = p.scopeT >= 0 ? SCOPED_SPEED : SPEED;
      const k = Math.min(1, dt * (p.y > 0 ? 4 : 14));
      p.vx += (mx * speed - p.vx) * k;
      p.vz += (mz * speed - p.vz) * k;
      if (p.lunge > 0) {
        p.lunge -= dt;
        p.vx = f.x * 11;
        p.vz = f.z * 11;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      collide(s, p);
      p.moving = Math.hypot(p.vx, p.vz) > 0.6 ? p.moving + dt : 0;
      // the house bounce
      if (inp.aPressed && p.y <= 0) p.vy = JUMP_V;
      if (p.y > 0 || p.vy > 0) {
        p.vy -= GRAVITY * dt;
        p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y <= 0) p.vy = 0;
      }
      if (inp.bPressed && p.knifeCd <= 0) knife(s, p);
      else if (inp.firePressed && p.fireCd <= 0) shoot(s, p);
    }
    const r = s.rules;
    const reached = r.target !== null && (r.teams ? s.teamScore.some((v) => v >= r.target!) : s.players.some((p) => p.score >= r.target!));
    if (live && (s.t - READY >= r.limit || reached)) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2.5,

  results(s): ResultRow[] {
    if (s.rules.teams) {
      const [a, b] = s.teamScore;
      const teams = Object.fromEntries(s.players.map((p) => [p.id, p.team]));
      const label = (id: string) => {
        const p = s.players.find((q) => q.id === id)!;
        return `${TEAM_NAME[p.team]} ${s.teamScore[p.team]} · ${p.pops} ${p.pops === 1 ? 'pop' : 'pops'}`;
      };
      return teamResults(s.players.map((p) => p.id), teams, a === b ? 2 : a > b ? 0 : 1, (id) => s.players.find((p) => p.id === id)!.score, label);
    }
    return s.players
      .map((p) => ({ id: p.id, value: p.score * 10000 + p.pops * 100 - p.deaths, label: `${p.score} ${p.score === 1 ? 'point' : 'points'} · ${p.pops} ${p.pops === 1 ? 'pop' : 'pops'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    const views = SNAP_HUD.views;
    for (const v of views) drawViewHud(ctx, s, players, v);
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + s.rules.limit - s.t);
    if (s.rules.teams) teamScores(ctx, String(s.teamScore[0]), String(s.teamScore[1]), 100);
    else if (s.rules.target !== null && s.t < READY + 4) text(ctx, `First to ${s.rules.target}!`, 640, 100, 26, { color: '#ffd23f' });
    drawBoard(ctx, s, players, views.length > 1);
    drawFeed(ctx, s, players);
    if (s.t < READY && views.length) text(ctx, 'Look around! Scope in, then fire fast.', 640, 690, 24, { color: '#ffd23f' });
    if (s.endAt !== undefined) {
      const won = s.rules.teams ? (s.teamScore[0] === s.teamScore[1] ? -1 : s.teamScore[0] > s.teamScore[1] ? 0 : 1) : null;
      text(ctx, won === null ? 'TIME!' : won < 0 ? 'DRAW!' : `${TEAM_NAME[won].toUpperCase()} WINS!`, 640, 330, 84, { color: won === null || won < 0 ? '#ffd23f' : TEAM_HEX[won] });
    }
  },

  bot: snapBot,
  };
}

export const scopeSnap = makeSnap({
  id: 'scope-snap',
  name: 'Scope Snap',
  mode: 'Free-for-all',
  min: 2,
  max: 10,
  rules: { teams: false, target: null, limit: LIMIT },
  blurb: 'First person! Foam-dart snipers, one hit pops you. Your scope only holds for 1 second, so snap in and fire fast. Scoped hit +1, quick scope +2, no scope +3. Knife someone up close to take a point off them. Highest score in 60 seconds wins!',
});

export const scopeSquad = makeSnap({
  id: 'scope-squad',
  name: 'Scope Squad',
  mode: 'Team',
  min: 2,
  max: 10,
  rules: { teams: true, target: 15, limit: 75 },
  blurb: 'Team Scope Snap! Red vs Blue foam-dart snipers, and your darts pass through teammates. Every pop scores for your team (quick scope +2, no scope +3); a knife takes a point off theirs. First team to 15, or the higher score after 75 seconds, wins!',
});

export const dartDuel = makeSnap({
  id: 'dart-duel',
  name: 'Dart Duel',
  mode: 'Duel',
  min: 2,
  max: 2,
  rules: { teams: false, target: 5, limit: 60 },
  blurb: 'One-on-one Scope Snap on a tight deck. 1-second scope, one hit pops. Scoped +1, quick scope +2, no scope +3, and a knife takes a point off them. First to 5 points wins!',
});

const PLAY_WORD: Record<Play['kind'], string> = { scope: 'POP!', quick: 'QUICK SCOPE!', noscope: 'NO SCOPE!', knife: 'KNIFED!' };
const PLAY_COLOR: Record<Play['kind'], string> = { scope: '#ffffff', quick: '#7cf0ff', noscope: '#ffd23f', knife: '#ff7a7a' };

function drawBoard(ctx: CanvasRenderingContext2D, s: SnapState, players: PlayerInfo[], compact: boolean): void {
  const rows = [...s.players].sort((a, b) => b.score - a.score);
  const x = 18, y0 = compact ? 300 : 70, rh = compact ? 22 : 28;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,30,0.5)';
  roundRect(ctx, x - 6, y0 - 20, compact ? 150 : 190, rows.length * rh + 14, 12);
  ctx.fill();
  rows.forEach((p, i) => {
    const pi = playerById(players, p.id);
    const yy = y0 + i * rh;
    ctx.globalAlpha = p.alive ? 1 : 0.5;
    ctx.fillStyle = pi?.color ?? '#fff';
    ctx.beginPath();
    ctx.arc(x + 10, yy - 2, compact ? 6 : 8, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, (pi?.name ?? '?').slice(0, 10), x + 24, yy, compact ? 14 : 17, { align: 'left', weight: 800, outline: false });
    text(ctx, String(p.score), x + (compact ? 136 : 174), yy, compact ? 16 : 20, { align: 'right', color: '#ffd23f', outline: false });
  });
  ctx.restore();
}

function drawFeed(ctx: CanvasRenderingContext2D, s: SnapState, players: PlayerInfo[]): void {
  const recent = s.feed.filter((f) => s.t - f.t < 5).slice(-4);
  recent.forEach((f, i) => {
    const by = playerById(players, f.by), vi = playerById(players, f.victim);
    const y = 110 + i * 30;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (5 - (s.t - f.t)) * 2);
    ctx.fillStyle = 'rgba(8,10,30,0.55)';
    roundRect(ctx, 870, y - 13, 392, 26, 13);
    ctx.fill();
    text(ctx, by?.name ?? '?', 1000, y, 16, { align: 'right', color: by?.color ?? '#fff', outline: false });
    text(ctx, f.kind === 'knife' ? 'knifed' : f.kind === 'noscope' ? 'no-scoped' : f.kind === 'quick' ? 'quick-scoped' : 'popped', 1066, y, 14, { color: PLAY_COLOR[f.kind], outline: false });
    text(ctx, vi?.name ?? '?', 1132, y, 16, { align: 'left', color: vi?.color ?? '#fff', outline: false });
    text(ctx, f.pts > 0 ? `+${f.pts}` : '-1', 1250, y, 15, { align: 'right', color: f.pts > 0 ? '#9dff8a' : '#ff7a7a', outline: false });
    ctx.restore();
  });
}

function drawViewHud(ctx: CanvasRenderingContext2D, s: SnapState, players: PlayerInfo[], v: { id: string; x: number; y: number; w: number; h: number }): void {
  const me = s.players.find((p) => p.id === v.id);
  if (!me) return;
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const unit = Math.min(v.w, v.h) / 720;
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x, v.y, v.w, v.h);
  ctx.clip();
  if (!me.alive) {
    ctx.fillStyle = 'rgba(30,10,40,0.45)';
    ctx.fillRect(v.x, v.y, v.w, v.h);
    text(ctx, 'POPPED!', cx, cy - 20 * unit, 64 * unit, { color: '#ff7a7a' });
    text(ctx, `Back in ${Math.max(0, me.respawn).toFixed(1)}`, cx, cy + 40 * unit, 28 * unit);
    ctx.restore();
    return;
  }
  const zoom = me.scopeT >= 0 ? Math.min(1, me.scopeT / ZOOM_IN) : 0;
  if (zoom > 0) {
    // the scope: a ring of dark round a clear circle, a fine reticle, and the 1-second fuse draining
    const r = Math.min(v.w, v.h) * 0.42;
    ctx.fillStyle = `rgba(4,6,18,${0.92 * zoom})`;
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(20,20,30,0.9)';
    ctx.lineWidth = 6 * unit;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    const left = 1 - me.scopeT / SCOPE_MAX;
    ctx.strokeStyle = me.scopeT <= QUICK ? '#7cf0ff' : left < 0.35 ? '#ff7a3d' : '#ffd23f';
    ctx.lineWidth = 8 * unit;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 16 * unit, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    if (me.scopeT <= QUICK) text(ctx, 'QUICK!', cx, cy + r * 0.55, 22 * unit, { color: '#7cf0ff' });
  } else {
    // hip fire: a wide, bouncy crosshair that shows how far darts can stray
    const gap = 26 * unit, len = 14 * unit;
    ctx.strokeStyle = me.fireCd > 0 ? 'rgba(255,255,255,0.45)' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(cx + dx * gap, cy + dy * gap);
      ctx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len));
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    // scope recharging after a snap
    if (me.scopeCd > 0.4) {
      const k = 1 - me.scopeCd / SCOPE_CD;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 5 * unit;
      ctx.beginPath();
      ctx.arc(cx, cy, 44 * unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ff7a3d';
      ctx.beginPath();
      ctx.arc(cx, cy, 44 * unit, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
      text(ctx, 'SCOPE RECHARGING', cx, cy + 70 * unit, 15 * unit, { color: '#ffb27a' });
    }
  }
  if (me.shield > 0) text(ctx, 'SPAWN SHIELD', cx, v.y + v.h - 50 * unit, 18 * unit, { color: '#7cf0ff' });
  // your own plays, big in the middle of your view
  const mine = s.feed.filter((f) => f.by === v.id && s.t - f.t < 1.4).pop();
  if (mine) {
    const a = s.t - mine.t;
    const size = (mine.kind === 'scope' ? 40 : 56) * unit * (1 + Math.max(0, 0.25 - a) * 1.6);
    text(ctx, PLAY_WORD[mine.kind], cx, cy - 120 * unit, size, { color: PLAY_COLOR[mine.kind] });
    if (mine.pts !== 0) text(ctx, mine.kind === 'knife' ? `${playerById(players, mine.victim)?.name ?? ''} -1` : `+${mine.pts}`, cx, cy - 72 * unit, 28 * unit, { color: mine.kind === 'knife' ? '#ff7a7a' : '#9dff8a' });
  }
  const hurt = s.feed.filter((f) => f.victim === v.id && s.t - f.t < 1.2).pop();
  if (hurt && hurt.kind === 'knife') text(ctx, 'KNIFED! -1', cx, cy + 120 * unit, 30 * unit, { color: '#ff7a7a' });
  // name and score of your view in split screen
  if (SNAP_HUD.views.length > 1) {
    const pi = playerById(players, v.id);
    ctx.fillStyle = 'rgba(8,10,30,0.55)';
    roundRect(ctx, v.x + 10, v.y + v.h - 40, 180, 30, 15);
    ctx.fill();
    text(ctx, `${pi?.name ?? ''}  ${me.score}`, v.x + 24, v.y + v.h - 25, 17, { align: 'left', color: pi?.color ?? '#fff', outline: false });
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- bots */

const LEVEL = {
  easy: { turn: 2.4, err: 0.09, react: 0.5, hip: 0.08, see: 22 },
  normal: { turn: 3.6, err: 0.05, react: 0.36, hip: 0.04, see: 30 },
  hard: { turn: 5.2, err: 0.024, react: 0.22, hip: 0.02, see: 40 },
};

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function snapBot(s: SnapState, id: string, k: BotCtx): TickInput {
  const me = s.players.find((p) => p.id === id);
  if (!me || !me.alive || s.endAt !== undefined) return NO_INPUT;
  const L = LEVEL[k.level];
  const mem = k.mem;
  mem.t += k.dt;
  mem.next -= k.dt;
  // pick a target: the nearest rival in sight
  let tgt: Sniper | null = null, td = L.see;
  for (const q of s.players) {
    if (!rivals(me, q) || !q.alive) continue;
    const d = Math.hypot(q.x - me.x, q.z - me.z);
    if (d < td && canSee(s, me.x, me.z, q.x, q.z)) {
      tgt = q;
      td = d;
    }
  }
  const tIdx = tgt ? s.players.indexOf(tgt) : -1;
  if (tIdx !== mem.n) {
    mem.n = tIdx;
    mem.wait = 0;
    mem.m = (rand(k.r) * 2 - 1) * L.err * 3;
  }
  mem.wait += k.dt;
  const out: TickInput = { ...NO_INPUT, lookX: 0, lookY: 0 };
  if (s.t < READY) return out;
  let wantYaw = me.yaw;
  if (tgt) {
    // aim error shrinks while it tracks, but never quite to zero
    mem.m *= Math.pow(0.25, k.dt);
    const lead = 0.06;
    wantYaw = Math.atan2(tgt.z + tgt.vz * lead - me.z, tgt.x + tgt.vx * lead - me.x) + mem.m + (rand(k.r) * 2 - 1) * L.err * 0.4;
  } else {
    // nobody in sight: face where it's walking
    if (Math.hypot(me.vx, me.vz) > 1) wantYaw = Math.atan2(me.vz, me.vx);
  }
  const diff = wrap(wantYaw - me.yaw);
  const sens = me.scopeT >= 0 ? 0.38 : 1;
  out.lookX = clamp(diff, -L.turn * k.dt, L.turn * k.dt) / sens;
  // walk: toward a waypoint, the target, or away when too close (and not going for the knife)
  if (mem.next <= 0 || mem.early < 0) {
    mem.next = 2.5 + rand(k.r) * 3;
    mem.early = Math.floor(rand(k.r) * s.spawns.length);
  }
  let gx = s.spawns[mem.early][0], gz = s.spawns[mem.early][1];
  // hunting: some waypoints are where a rival was last heard
  const prey = s.players.filter((q) => rivals(me, q) && q.alive);
  if (!tgt && prey.length && mem.early % 3 !== 0) {
    const q = prey[mem.early % prey.length];
    gx = q.x;
    gz = q.z;
  }
  const knifey = k.level !== 'easy' && tgt && td < 4.5 && rand(k.r) < 0.9;
  if (tgt && (knifey || td > 14)) {
    gx = tgt.x;
    gz = tgt.z;
  } else if (tgt) {
    // strafe while lining up a shot
    const side = Math.sin(s.t * 1.3 + mem.early) > 0 ? 1 : -1;
    const a = Math.atan2(tgt.z - me.z, tgt.x - me.x) + (Math.PI / 2) * side;
    gx = me.x + Math.cos(a) * 3;
    gz = me.z + Math.sin(a) * 3;
  }
  let dx = gx - me.x, dz = gz - me.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) {
    mem.next = 0;
    dx = dz = 0;
  } else {
    dx /= dist;
    dz /= dist;
    // feel ahead for walls and turn along them
    for (let i = 0; i < 6; i++) {
      if (rayWall(s.walls, me.x, me.z, dx, dz, 1.4) >= 1.4) break;
      const a = Math.atan2(dz, dx) + (i % 2 ? -1 : 1) * (0.6 + 0.4 * i);
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
  }
  const f = fwd(me.yaw);
  out.x = dx * -f.z + dz * f.x;
  out.y = -(dx * f.x + dz * f.z);
  if (!tgt) return out;
  const onTarget = Math.abs(diff) < Math.atan2(BODY_R * 0.8, td);
  // knife when close and facing them
  if (td < KNIFE_RANGE * 0.9 && Math.abs(diff) < 0.5 && me.knifeCd <= 0 && mem.wait > L.react) {
    out.b = out.bPressed = true;
    out.bTaps = 1;
    return out;
  }
  // close up, sometimes it just hip fires
  if (td < 6 && me.fireCd <= 0 && onTarget && mem.wait > L.react && rand(k.r) < L.hip) {
    out.fire = out.firePressed = true;
    return out;
  }
  // otherwise: scope in when nearly on them, fire once it's steady and its reaction time has passed
  const wantScope = Math.abs(diff) < 0.35 && me.fireCd <= 0.2;
  out.scope = wantScope || me.scopeT >= 0;
  if (me.scopeT >= Math.max(ZOOM_IN, L.react) && onTarget && me.fireCd <= 0) {
    out.fire = out.firePressed = true;
  }
  // hold too long and the scope snaps: a sloppy bot just lets it
  if (me.scopeT > 0.85 && k.level === 'hard') out.scope = false;
  return out;
}
