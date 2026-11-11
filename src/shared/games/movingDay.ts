import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, type Rng } from '../rng';
import { TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { stick, type BotCtx } from '../botkit';

/**
 * Moving Day (Furniture Kit, team): each team carries a couch from the moving truck into the house and
 * onto the rug in the den. Everyone holds a different spot on the couch: the ones on the ends steer
 * their end, the ones in the middle shove the whole thing. It pivots between you, so you have to work
 * together to get it round corners and through doors. Hold A to lift it over low tables (slower).
 * First team to land it on the rug wins.
 */
const READY = 3;
const TIME = 60;
export const LANE_W = 560;
export const LANE_H = 540;
export const COUCH_L = 112;
export const COUCH_W = 34;
const SPEED = 95;
const LIFT_SPEED = 0.6;
const SAMPLES = 7;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The house, in lane coordinates (0..LANE_W, 0..LANE_H). Both teams get the same one. */
export const WALLS: Rect[] = [
  { x: 0, y: 380, w: 400, h: 20 }, // front wall; the door is on the right
  { x: 540, y: 380, w: 20, h: 20 },
  { x: 160, y: 220, w: 400, h: 20 }, // upstairs landing; the gap is on the left
  { x: 330, y: 0, w: 20, h: 90 }, // den wall above its door
];
export const TABLES: Rect[] = [
  { x: 230, y: 280, w: 70, h: 40 }, // coffee table in the lounge
  { x: 30, y: 430, w: 70, h: 70 }, // packing crates by the truck
];
export const RUG: Rect = { x: 390, y: 40, w: 150, h: 130 };
export const DEN_X = 350;
export const TRUCK: Rect = { x: 380, y: 430, w: 180, h: 110 };
/** The route the front of the couch takes (for the bots and the arrows). */
export const ROUTE: [number, number][] = [
  [380, 480],
  [470, 440],
  [470, 330],
  [400, 300],
  [110, 300],
  [90, 170],
  [150, 150],
  [300, 150],
  [480, 110],
];

export interface Carrier {
  id: string;
  team: number;
  at: number; // 0 = front end, 1 = back end, between = the middle
  lifting: boolean;
}
export interface Crew {
  team: number;
  ox: number; // where this team's house sits in the arena
  oy: number;
  a: [number, number]; // front end (lane coords)
  b: [number, number];
  lifted: boolean;
  bonk: number; // seconds of "thunk" since the last wall hit
  doneAt: number; // seconds after GO (-1 = not yet)
  progress: number; // 0..1 along the route
}
export interface MovingState {
  t: number;
  rng: Rng;
  carriers: Carrier[];
  crews: Crew[];
  endAt?: number;
}

const inRect = (x: number, y: number, r: Rect, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
const couchPoints = (a: [number, number], b: [number, number]) =>
  Array.from({ length: SAMPLES }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (SAMPLES - 1), a[1] + ((b[1] - a[1]) * i) / (SAMPLES - 1)] as [number, number]);

function blocked(a: [number, number], b: [number, number], lifted: boolean): boolean {
  const pad = COUCH_W / 2 - 4;
  for (const [x, y] of couchPoints(a, b)) {
    if (x < pad || x > LANE_W - pad || y < pad || y > LANE_H - pad) return true;
    if (WALLS.some((w) => inRect(x, y, w, pad))) return true;
    if (!lifted && TABLES.some((w) => inRect(x, y, w, pad - 4))) return true;
  }
  return false;
}

/** Distance along the route of the point on it closest to (x, y). */
function routeS(x: number, y: number): number {
  let best = Infinity;
  let bs = 0;
  let acc = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [x0, y0] = ROUTE[i];
    const [x1, y1] = ROUTE[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (L * L)));
    const d = Math.hypot(x0 + (x1 - x0) * t - x, y0 + (y1 - y0) * t - y);
    if (d < best) {
      best = d;
      bs = acc + t * L;
    }
    acc += L;
  }
  return bs;
}
const ROUTE_LEN = ROUTE.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]), 0);
function routeAt(s: number): [number, number] {
  let acc = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [x0, y0] = ROUTE[i];
    const [x1, y1] = ROUTE[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (s <= acc + L) {
      const t = Math.max(0, (s - acc) / L);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    acc += L;
  }
  return ROUTE[ROUTE.length - 1];
}

const crew1 = (s: MovingState, team: number) => s.carriers.filter((q) => q.team === team).length === 1;

const delivered = (c: Crew) => {
  const pts = couchPoints(c.a, c.b);
  const m = pts[(SAMPLES - 1) / 2];
  return pts.every(([x]) => x > DEN_X) && inRect(m[0], m[1], RUG, 10);
};

export const movingDay: Minigame<MovingState> = {
  id: 'moving-day',
  name: 'Moving Day',
  mode: 'Team',
  ready: READY,
  goWord: 'LIFT!',
  blurb: 'Carry your team’s couch from the truck to the rug in the den! Each of you holds a different spot, and the couch pivots between you, so steer together round the corners. Hold A to lift it over low tables (slower).',
  controls: 'Stick: carry your end   A (hold): lift over tables',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): MovingState {
    const teams = teamsOf(players);
    const carriers: Carrier[] = [];
    for (const team of [0, 1]) {
      const mine = players.filter((p) => teams[p.id] === team);
      // front and back ends first, then spread the rest along the middle
      const spots = mine.length === 1 ? [0] : mine.map((_, i) => (i === 0 ? 0 : i === 1 ? 1 : (i - 1) / (mine.length - 1)));
      mine.forEach((p, i) => carriers.push({ id: p.id, team, at: spots[i], lifting: false }));
    }
    const crews: Crew[] = [0, 1].map((team) => ({
      team,
      ox: team === 0 ? 640 - LANE_W - 20 : 640 + 20,
      oy: 150,
      a: [ROUTE[0][0], ROUTE[0][1]],
      b: [ROUTE[0][0] - COUCH_L, ROUTE[0][1]],
      lifted: false,
      bonk: 0,
      doneAt: -1,
      progress: 0,
    }));
    return { t: 0, rng: { seed }, carriers, crews };
  },

  step(s: MovingState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (s.t < READY || s.endAt !== undefined) return;
    for (const c of s.crews) {
      c.bonk = Math.max(0, c.bonk - dt);
      if (c.doneAt >= 0) continue;
      const crew = s.carriers.filter((q) => q.team === c.team);
      if (!crew.length) continue;
      // each carrier pushes the spot they hold; the ends move by how much of the couch each hand is near
      const va = [0, 0], vb = [0, 0];
      let wa = 0, wb = 0;
      c.lifted = false;
      for (const q of crew) {
        const inp = inputs[q.id] ?? NO_INPUT;
        q.lifting = inp.a;
        if (inp.a) c.lifted = true;
        const mag = Math.min(1, Math.hypot(inp.x, inp.y));
        const ix = mag > 0.15 ? inp.x : 0, iy = mag > 0.15 ? inp.y : 0;
        va[0] += ix * (1 - q.at);
        va[1] += iy * (1 - q.at);
        vb[0] += ix * q.at;
        vb[1] += iy * q.at;
        wa += 1 - q.at;
        wb += q.at;
      }
      const sp = SPEED * (c.lifted ? LIFT_SPEED : 1) * dt;
      if (crew.length === 1) {
        // carrying it alone: you hold the middle, and the couch slowly swings round to the way you walk
        const inp = inputs[crew[0].id] ?? NO_INPUT;
        const mag = Math.min(1, Math.hypot(inp.x, inp.y));
        if (mag > 0.15) {
          const mx = (c.a[0] + c.b[0]) / 2 + (inp.x / Math.max(mag, 1)) * sp, my = (c.a[1] + c.b[1]) / 2 + (inp.y / Math.max(mag, 1)) * sp;
          let ang = Math.atan2(c.a[1] - c.b[1], c.a[0] - c.b[0]);
          const want = Math.atan2(inp.y, inp.x);
          let diff = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
          if (Math.abs(diff) > Math.PI / 2) diff -= Math.sign(diff) * Math.PI; // either end can lead
          const turn = Math.sign(diff) * Math.min(Math.abs(diff), 2.2 * dt);
          const tryMove = (cx: number, cy: number, a: number) => {
            const na: [number, number] = [cx + (Math.cos(a) * COUCH_L) / 2, cy + (Math.sin(a) * COUCH_L) / 2];
            const nb: [number, number] = [cx - (Math.cos(a) * COUCH_L) / 2, cy - (Math.sin(a) * COUCH_L) / 2];
            if (blocked(na, nb, c.lifted)) return false;
            c.a = na;
            c.b = nb;
            return true;
          };
          const cx = (c.a[0] + c.b[0]) / 2, cy = (c.a[1] + c.b[1]) / 2;
          if (!tryMove(mx, my, ang + turn) && !tryMove(mx, my, ang) && !tryMove(cx, cy, ang + turn) && c.bonk <= 0) c.bonk = 0.3;
          ang += turn;
        }
      }
      const na: [number, number] = wa > 0 ? [c.a[0] + (va[0] / wa) * sp, c.a[1] + (va[1] / wa) * sp] : [...c.a];
      const nb: [number, number] = wb > 0 ? [c.b[0] + (vb[0] / wb) * sp, c.b[1] + (vb[1] / wb) * sp] : [...c.b];
      // keep the couch its own length: an end nobody holds just trails behind
      const dx = nb[0] - na[0], dy = nb[1] - na[1], d = Math.hypot(dx, dy) || 1;
      const fix = (d - COUCH_L) / d;
      if (wa > 0 && wb > 0) {
        na[0] += (dx * fix) / 2;
        na[1] += (dy * fix) / 2;
        nb[0] -= (dx * fix) / 2;
        nb[1] -= (dy * fix) / 2;
      } else if (wa > 0) {
        nb[0] -= dx * fix;
        nb[1] -= dy * fix;
      } else {
        na[0] += dx * fix;
        na[1] += dy * fix;
      }
      if (crew.length === 1) {
        // handled above
      } else if (!blocked(na, nb, c.lifted)) {
        c.a = na;
        c.b = nb;
      } else {
        // thunk: try each end on its own (so one end can slide along a wall), else bounce back a bit
        const onlyA: [number, number] = [na[0], na[1]];
        if (!blocked(onlyA, c.b, c.lifted) && Math.abs(Math.hypot(c.b[0] - onlyA[0], c.b[1] - onlyA[1]) - COUCH_L) < 6) c.a = onlyA;
        else if (!blocked(c.a, nb, c.lifted) && Math.abs(Math.hypot(nb[0] - c.a[0], nb[1] - c.a[1]) - COUCH_L) < 6) c.b = nb;
        else if (c.bonk <= 0) {
          c.bonk = 0.3;
          const ba: [number, number] = [c.a[0] - (na[0] - c.a[0]) * 3, c.a[1] - (na[1] - c.a[1]) * 3];
          const bb: [number, number] = [c.b[0] - (nb[0] - c.b[0]) * 3, c.b[1] - (nb[1] - c.b[1]) * 3];
          if (!blocked(ba, bb, c.lifted)) {
            c.a = ba;
            c.b = bb;
          }
        }
      }
      const mid: [number, number] = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2];
      c.progress = Math.max(c.progress, Math.min(1, routeS(mid[0], mid[1]) / ROUTE_LEN));
      if (delivered(c)) {
        c.doneAt = s.t - READY;
        c.progress = 1;
        s.endAt = s.t;
      }
    }
    if (s.t >= READY + TIME) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 2,

  results(s): ResultRow[] {
    const [r, b] = s.crews;
    const score = (c: Crew) => (c.doneAt >= 0 ? 2 - c.doneAt / 1000 : c.progress);
    const win = Math.abs(score(r) - score(b)) < 0.005 ? 2 : score(r) > score(b) ? 0 : 1;
    const teams = Object.fromEntries(s.carriers.map((q) => [q.id, q.team]));
    return teamResults(s.carriers.map((q) => q.id), teams, win, () => 0, (id) => {
      const q = s.carriers.find((x) => x.id === id)!;
      const c = s.crews[q.team];
      return `${TEAM_NAME[q.team]}: ${c.doneAt >= 0 ? `delivered in ${c.doneAt.toFixed(1)}s` : `${Math.round(c.progress * 100)}% of the way`}`;
    });
  },

  draw(ctx, s) {
    if (s.t >= READY && s.endAt === undefined) drawTimer(ctx, READY + TIME - s.t);
    teamScores(ctx, `${Math.round(s.crews[0].progress * 100)}%`, `${Math.round(s.crews[1].progress * 100)}%`);
    const done = s.crews.find((c) => c.doneAt >= 0);
    if (done) text(ctx, `${TEAM_NAME[done.team]} team delivered it!`, 640, 170, 46, { color: '#ffd23f' });
    else if (s.endAt !== undefined) text(ctx, "Time's up!", 640, 170, 52, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const q = s.carriers.find((x) => x.id === id);
    if (!q || s.t < READY) return NO_INPUT;
    const c = s.crews[q.team];
    if (c.doneAt >= 0) return NO_INPUT;
    // follow the route: the front of the couch leads, everyone else aims for their spot behind it
    const here: [number, number] = crew1(s, q.team) ? [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2] : [c.a[0] + (c.b[0] - c.a[0]) * q.at, c.a[1] + (c.b[1] - c.a[1]) * q.at];
    const look = 40 + 20 * k.sk.smart;
    const want = routeAt(Math.min(ROUTE_LEN, routeS(here[0], here[1]) + look));
    // at the start the couch points the wrong way: the back swings round first
    let tx = want[0] - here[0], ty = want[1] - here[1];
    const m = Math.hypot(tx, ty);
    if (m < 4) return NO_INPUT;
    tx /= m;
    ty /= m;
    if (k.level !== 'hard') {
      // wobbly hands: easy bots drift off line, and now and then push the wrong way
      const wob = Math.sin(s.t * (2 + id.length) + q.at * 5) * (k.level === 'easy' ? 0.9 : 0.4);
      [tx, ty] = [tx * Math.cos(wob) - ty * Math.sin(wob), tx * Math.sin(wob) + ty * Math.cos(wob)];
      if (k.level === 'easy' && rand(k.r) < 0.15) return NO_INPUT;
    }
    const nearTable = couchPoints(c.a, c.b).some(([x, y]) => TABLES.some((t) => inRect(x, y, t, COUCH_W)));
    const sp = Math.min(1, m / 30);
    return stick(tx * sp, ty * sp, nearTable);
  },
};
