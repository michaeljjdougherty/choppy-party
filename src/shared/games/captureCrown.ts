import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { look, outside, press, remember, stick, toward, type BotCtx } from '../botkit';

/**
 * Capture the Crown (Mini Forest camp, team): a crown sits on a stump in the middle of the camp.
 * Grab it and carry it home to your team's tent. The carrier is slower; anyone on the other team can
 * lunge (A) to tag them, and a tagged carrier drops the crown. First to 3 captures, or the most when
 * time runs out. The camp grows with the number of players.
 */
const R = 22;
const SPEED = 300;
const CARRY_SPEED = 215;
const RESPAWN = 2; // the crown takes a moment to reappear after a capture
const LUNGE = 640;
const LUNGE_CD = 1.4;
const STUN = 1.1;
const GRAB_SAFE = 0.8; // can't be tagged the moment you pick it up
const READY = 3;
const TIME = 60;
/** Captures to win: a small game plays to more, so it still lasts about a minute. */
export const winTarget = (n: number) => (n <= 4 ? 5 : n <= 6 ? 4 : 3);

export interface Camper extends Body {
  id: string;
  team: number;
  x: number;
  y: number;
  face: number;
  lungeCd: number;
  lunging: number;
  stun: number;
  caps: number;
  tags: number;
}
export interface CrownState {
  t: number;
  rng: Rng;
  w: number;
  h: number;
  /** Crown: carried by a camper id, or lying at (x, y). */
  carrier: string | null;
  cx: number;
  cy: number;
  safe: number;
  /** Seconds until a captured crown reappears in the middle. */
  respawn?: number;
  score: [number, number];
  /** When a team reached 3 (the scene holds a moment for the celebration). */
  wonAt?: number;
  campers: Camper[];
  events: { kind: 'grab' | 'tag' | 'score'; x: number; y: number; team: number }[];
}

export const campSize = (n: number) => ({ w: Math.min(1120, 720 + n * 44), h: Math.min(500, 360 + n * 16) });
export const bases = (s: CrownState): [number, number][] => [
  [640 - s.w / 2 + 70, 410],
  [640 + s.w / 2 - 70, 410],
];
const BASE_R = 70;

function reset(s: CrownState): void {
  s.carrier = null;
  s.respawn = RESPAWN;
  s.cx = 640;
  s.cy = 410;
}

export const captureCrown: Minigame<CrownState> = {
  id: 'capture-the-crown',
  name: 'Capture the Crown',
  mode: 'Team',
  ready: READY,
  blurb: 'Grab the crown from the middle of the camp and carry it home to your tent! Lunge with A to tag the carrier and make them drop it. First team to the target wins!',
  controls: 'Stick: run   A: lunge / tag',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): CrownState {
    const teams = teamsOf(players);
    const { w, h } = campSize(players.length);
    const count = [0, 0];
    const s: CrownState = {
      t: 0,
      rng: { seed },
      w,
      h,
      carrier: null,
      cx: 640,
      cy: 410,
      safe: 0,
      score: [0, 0],
      events: [],
      campers: [],
    };
    const [b0, b1] = bases(s);
    s.campers = players.map((p) => {
      const team = teams[p.id];
      const k = count[team]++;
      const [bx] = team === 0 ? b0 : b1;
      return { id: p.id, team, x: bx + (team === 0 ? 60 : -60), y: 410 + (k - 2) * 56, face: team === 0 ? 0 : Math.PI, lungeCd: 0, lunging: 0, stun: 0, caps: 0, tags: 0, ...newBody() };
    });
    return s;
  },

  step(s: CrownState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.events = [];
    if (s.t < READY) return;
    if (Math.max(...s.score) >= winTarget(s.campers.length)) s.wonAt ??= s.t;
    const live = s.t <= READY + TIME && s.wonAt === undefined;
    s.safe = Math.max(0, s.safe - dt);
    const x0 = 640 - s.w / 2, x1 = 640 + s.w / 2, y0 = 410 - s.h / 2, y1 = 410 + s.h / 2;
    for (const c of s.campers) {
      const inp = live && c.stun <= 0 ? inputs[c.id] ?? NO_INPUT : NO_INPUT;
      c.stun = Math.max(0, c.stun - dt);
      c.lungeCd = Math.max(0, c.lungeCd - dt);
      c.lunging = Math.max(0, c.lunging - dt);
      const carrying = s.carrier === c.id;
      if (c.lunging <= 0) steer(c, inp.x, inp.y, carrying ? CARRY_SPEED : SPEED, dt);
      if (inp.aPressed && c.lungeCd <= 0 && !carrying) {
        c.lungeCd = LUNGE_CD;
        c.lunging = 0.22;
        c.vx = Math.cos(c.face) * LUNGE;
        c.vy = Math.sin(c.face) * LUNGE;
        c.vz = 220;
      }
      stepVertical(c, dt);
      c.x = Math.max(x0 + R, Math.min(x1 - R, c.x + c.vx * dt));
      c.y = Math.max(y0 + R, Math.min(y1 - R, c.y + c.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) c.face = Math.atan2(inp.y, inp.x);
    }
    if (!live) return;
    // pick up a loose crown
    s.respawn = Math.max(0, (s.respawn ?? 0) - dt);
    if (!s.carrier && s.respawn <= 0) {
      // whoever is closest gets it; a dead heat is a coin flip
      const near = s.campers.filter((c) => c.stun <= 0 && Math.hypot(c.x - s.cx, c.y - s.cy) < R + 20);
      near.sort((a, b) => Math.hypot(a.x - s.cx, a.y - s.cy) - Math.hypot(b.x - s.cx, b.y - s.cy) || rand(s.rng) - 0.5);
      const by = near[0];
      if (by) {
        s.carrier = by.id;
        s.safe = GRAB_SAFE;
        s.events.push({ kind: 'grab', x: by.x, y: by.y, team: by.team });
      }
    }
    const car = s.campers.find((c) => c.id === s.carrier);
    if (car) {
      s.cx = car.x;
      s.cy = car.y;
      // tagged by a lunging (or just bumping) rival
      if (s.safe <= 0) {
        const tagger = s.campers.find((o) => o.team !== car.team && o.stun <= 0 && Math.hypot(o.x - car.x, o.y - car.y) < R * 2 + (o.lunging > 0 ? 14 : 0));
        if (tagger) {
          tagger.tags++;
          car.stun = STUN;
          car.vz = 360;
          s.carrier = null;
          // the crown pops a little way off toward the middle
          s.cx = car.x + (640 - car.x) * 0.15;
          s.cy = car.y + (410 - car.y) * 0.15;
          s.events.push({ kind: 'tag', x: car.x, y: car.y, team: tagger.team });
        }
      }
      // home!
      const [hx, hy] = bases(s)[car.team];
      if (s.carrier && Math.hypot(car.x - hx, car.y - hy) < BASE_R) {
        s.score[car.team]++;
        car.caps++;
        s.events.push({ kind: 'score', x: hx, y: hy, team: car.team });
        reset(s);
      }
    }
    const up = s.campers.filter((c) => c.stun <= 0);
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) bump(up[i], up[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5 || (s.wonAt !== undefined && s.t - s.wonAt > 1.8),

  results(s): ResultRow[] {
    const [a, b] = s.score;
    const win = a === b ? 2 : a > b ? 0 : 1;
    const teams = Object.fromEntries(s.campers.map((c) => [c.id, c.team]));
    const val = (id: string) => {
      const c = s.campers.find((q) => q.id === id)!;
      return c.caps * 3 + c.tags;
    };
    return teamResults(s.campers.map((c) => c.id), teams, win, val, (id) => {
      const c = s.campers.find((q) => q.id === id)!;
      return `${TEAM_NAME[c.team]}: ${c.caps} captures, ${c.tags} tags`;
    });
  },

  draw(ctx, s) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    teamScores(ctx, `${s.score[0]} / ${winTarget(s.campers.length)}`, `${s.score[1]} / ${winTarget(s.campers.length)}`);
    if (Math.max(...s.score) >= winTarget(s.campers.length)) text(ctx, `${TEAM_NAME[s.score[0] >= winTarget(s.campers.length) ? 0 : 1]} team wins!`, 640, 170, 48, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const me = s.campers.find((c) => c.id === id);
    if (!me || s.t < READY || me.stun > 0) return NO_INPUT;
    const x0 = 640 - s.w / 2, x1 = 640 + s.w / 2, y0 = 410 - s.h / 2, y1 = 410 + s.h / 2;
    const [hx, hy] = bases(s)[me.team];
    const car = s.campers.find((c) => c.id === s.carrier);
    const mates = s.campers.filter((c) => c.team === me.team);
    const foes = s.campers.filter((c) => c.team !== me.team);
    if (car?.id === id) {
      // run home, curving away from rivals
      look(me, k.sk, k.mem, k.r, (x, y) => {
        if (outside(x, y, x0, x1, y0, y1)) return 1e6;
        let c = Math.hypot(hx - x, hy - y);
        // only dodge rivals that are ahead, between the carrier and home
        for (const f of foes) if ((f.x - me.x) * (hx - me.x) > 0) c += Math.max(0, 90 - Math.hypot(f.x - x, f.y - y)) * 0.6 * k.sk.sense;
        return c;
      });
      return stick(k.mem.sx, k.mem.sy);
    }
    if (car && car.team !== me.team) {
      // chase the carrier and lunge when close and facing them (a slow bot follows where the carrier was)
      if (remember(k.mem, `cc:${Math.floor(s.t * 2)}`, 0)) k.mem.m = rand(k.r) < (1 - k.sk.smart) * 0.8 ? 1 : 0;
      if (k.mem.m === 1) return stick(k.mem.sx * 0.6, k.mem.sy * 0.6);
      toward(me, car.x + car.vx * 0.3 * k.sk.smart, car.y + car.vy * 0.3 * k.sk.smart, k.mem);
      const d = Math.hypot(car.x - me.x, car.y - me.y);
      const lunge = d < 60 + 40 * k.sk.smart && me.lungeCd <= 0 && Math.cos(me.face - Math.atan2(car.y - me.y, car.x - me.x)) > 0.8 && k.mem.t > 0.15 + (1 - k.sk.smart) * 0.5;
      if (lunge) k.mem.t = 0;
      return lunge ? press() : stick(k.mem.sx, k.mem.sy);
    }
    if (car && car.team === me.team) {
      // escort: get between the carrier and the closest rival
      const f = foes.reduce((a, b) => (Math.hypot(b.x - car.x, b.y - car.y) < Math.hypot(a.x - car.x, a.y - car.y) ? b : a), foes[0]);
      if (!f) return NO_INPUT;
      toward(me, (f.x + car.x) / 2, (f.y + car.y) / 2, k.mem);
      return stick(k.mem.sx, k.mem.sy);
    }
    // loose crown: the closest one or two teammates go for it, the rest hang back to defend
    const order = [...mates].sort((a, b) => Math.hypot(a.x - s.cx, a.y - s.cy) - Math.hypot(b.x - s.cx, b.y - s.cy));
    const rank = order.indexOf(me);
    // the rest guard the lane a rival carrier would run down, toward the other team's tent
    const [ex, ey] = bases(s)[1 - me.team];
    if (rank <= (k.sk.smart > 0.5 ? 1 : 3)) toward(me, s.cx, s.cy, k.mem);
    else toward(me, s.cx + (ex - s.cx) * 0.4, s.cy + (ey - s.cy) * 0.4 + (rank % 2 ? 50 : -50), k.mem);
    return stick(k.mem.sx, k.mem.sy);
  },
};

