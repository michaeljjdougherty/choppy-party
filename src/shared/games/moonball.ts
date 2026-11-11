import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, type Rng } from '../rng';
import { bump, newBody, steer, type Body } from '../physics';
import { TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { pressB, stick, type BotCtx } from '../botkit';

/**
 * Moonball (Space Kit, team): low-gravity soccer on the moon with a giant bouncy ball. Red attacks the
 * crater goal on the right, Blue the one on the left. A jumps (floaty!), B kicks; kick while you're in
 * the air for a header. Most goals wins; level at the whistle means next goal wins.
 */
const R = 22;
export const BALL_R = 34;
const SPEED = 290;
const P_GRAV = 900;
const JUMP = 520;
const B_GRAV = 420;
const KICK = 640;
const KICK_CD = 0.45;
const READY = 3;
const TIME = 50;
const GOLDEN = 20;
const RESET = 2.2;

export interface Astro extends Body {
  id: string;
  team: number;
  x: number;
  y: number;
  face: number;
  cd: number;
  kicked: number; // seconds of kick pose left
  goals: number;
  touches: number;
}
export interface MoonState {
  t: number;
  rng: Rng;
  w: number;
  h: number;
  mouth: number; // goal half-width (in y)
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; last: string | null };
  astros: Astro[];
  score: [number, number];
  goalAt: number; // when the last goal went in (-1 = play on)
  goalBy: number; // which team scored
  kicks: { id: string; header: boolean }[]; // this tick, for the view
  endAt?: number;
}

export const pitchSize = (n: number) => ({ w: Math.min(1160, 780 + n * 38), h: Math.min(560, 380 + n * 18) });
const X0 = (s: MoonState) => 640 - s.w / 2;
const X1 = (s: MoonState) => 640 + s.w / 2;
const Y0 = (s: MoonState) => 400 - s.h / 2;
const Y1 = (s: MoonState) => 400 + s.h / 2;
/** The goal a team attacks: Red (0) shoots right, Blue (1) left. */
export const goalX = (s: MoonState, team: number) => (team === 0 ? X1(s) : X0(s));

function kickoff(s: MoonState): void {
  s.ball = { x: 640, y: 400, z: 120, vx: 0, vy: 0, vz: 0, spin: 0, last: null };
  const per: [number, number] = [0, 0];
  const size = [s.astros.filter((a) => a.team === 0).length, s.astros.filter((a) => a.team === 1).length];
  for (const a of s.astros) {
    const i = per[a.team]++;
    const k = size[a.team];
    const side = a.team === 0 ? -1 : 1;
    a.x = 640 + side * (s.w * 0.12 + (i % 2) * s.w * 0.14);
    a.y = 400 + ((i + 0.5) / k - 0.5) * s.h * 0.75;
    a.face = a.team === 0 ? 0 : Math.PI;
    a.vx = a.vy = a.vz = a.z = 0;
  }
}

export const moonball: Minigame<MoonState> = {
  id: 'moonball',
  name: 'Moonball',
  mode: 'Team',
  ready: READY,
  goWord: 'KICK OFF!',
  blurb: 'Soccer on the moon! Kick the giant ball into the other team’s crater goal. A jumps (it’s floaty up here), B kicks. Kick in mid-air for a header. Most goals wins!',
  controls: 'Stick: move   A: jump   B: kick (in the air: header)',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): MoonState {
    const teams = teamsOf(players);
    const { w, h } = pitchSize(players.length);
    const s: MoonState = {
      t: 0,
      rng: { seed },
      w,
      h,
      mouth: h * 0.2,
      ball: { x: 640, y: 400, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, last: null },
      astros: players.map((p) => ({ id: p.id, team: teams[p.id], x: 0, y: 0, face: 0, cd: 0, kicked: 0, goals: 0, touches: 0, ...newBody() })),
      score: [0, 0],
      goalAt: -1,
      goalBy: 0,
      kicks: [],
    };
    kickoff(s);
    return s;
  },

  step(s: MoonState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.kicks = [];
    if (s.t < READY || s.endAt !== undefined) return;
    if (s.goalAt >= 0) {
      if (s.t - s.goalAt > RESET) {
        s.goalAt = -1;
        // golden goal: the first goal after the whistle ends it
        if (s.t >= READY + TIME && s.score[0] !== s.score[1]) s.endAt = s.t;
        else kickoff(s);
      }
      // the ball keeps bouncing in the net for show
    }
    const live = s.goalAt < 0;
    const b = s.ball;
    for (const a of s.astros) {
      const inp = live ? inputs[a.id] ?? NO_INPUT : NO_INPUT;
      a.cd = Math.max(0, a.cd - dt);
      a.kicked = Math.max(0, a.kicked - dt);
      a.land = Math.max(0, a.land - dt);
      steer(a, inp.x, inp.y, SPEED, dt);
      if (Math.hypot(inp.x, inp.y) > 0.3) a.face = Math.atan2(inp.y, inp.x);
      if (inp.aPressed && a.z <= 0) a.vz = JUMP;
      if (a.z > 0 || a.vz > 0) {
        a.vz -= P_GRAV * dt;
        a.z += a.vz * dt;
        if (a.z <= 0) {
          a.z = 0;
          a.vz = 0;
          a.land = 0.2;
        }
      }
      a.x = Math.max(X0(s) + R, Math.min(X1(s) - R, a.x + a.vx * dt));
      a.y = Math.max(Y0(s) + R, Math.min(Y1(s) - R, a.y + a.vy * dt));
      // kick (or header) when the ball is in reach
      if (inp.bPressed && a.cd <= 0) {
        a.cd = KICK_CD;
        a.kicked = 0.25;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const dz = b.z - a.z;
        if (d < R + BALL_R + 26 && dz > -40 && dz < 90) {
          // the kick goes mostly where you face, nudged by where you struck the ball
          let kx = Math.cos(a.face) * 0.65 + (dx / Math.max(1, d)) * 0.35;
          let ky = Math.sin(a.face) * 0.65 + (dy / Math.max(1, d)) * 0.35;
          const m = Math.hypot(kx, ky) || 1;
          kx /= m;
          ky /= m;
          const header = a.z > 30;
          b.vx = kx * KICK * (header ? 0.85 : 1);
          b.vy = ky * KICK * (header ? 0.85 : 1);
          b.vz = header ? 140 : 330;
          b.spin = (rand(s.rng) - 0.5) * 8;
          b.last = a.id;
          a.touches++;
          s.kicks.push({ id: a.id, header });
        }
      }
      // running into the ball dribbles it
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < R + BALL_R && d > 0.01 && Math.abs(b.z - a.z) < BALL_R + 20) {
        const nx = dx / d, ny = dy / d;
        b.x = a.x + nx * (R + BALL_R);
        b.y = a.y + ny * (R + BALL_R);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          b.vx += nx * rel * 1.1;
          b.vy += ny * rel * 1.1;
          b.last = a.id;
        }
      }
    }
    // the ball: floaty bounces, rolling friction, walls (except the goal mouths)
    b.vz -= B_GRAV * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = Math.abs(b.vz) > 60 ? -b.vz * 0.72 : 0;
      b.vx *= 0.94;
      b.vy *= 0.94;
    }
    if (b.z <= 0) {
      const f = Math.max(0, 1 - 0.7 * dt);
      b.vx *= f;
      b.vy *= f;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin *= 1 - dt;
    if (b.y < Y0(s) + BALL_R) {
      b.y = Y0(s) + BALL_R;
      b.vy = Math.abs(b.vy) * 0.8;
    }
    if (b.y > Y1(s) - BALL_R) {
      b.y = Y1(s) - BALL_R;
      b.vy = -Math.abs(b.vy) * 0.8;
    }
    const inMouth = Math.abs(b.y - 400) < s.mouth && b.z < 140;
    for (const side of [-1, 1]) {
      const edge = side < 0 ? X0(s) : X1(s);
      const past = side < 0 ? b.x < edge + BALL_R * 0.2 : b.x > edge - BALL_R * 0.2;
      if (!past) continue;
      if (inMouth && live) {
        // GOAL: the right-hand crater belongs to Blue, so Red scores there
        const team = side > 0 ? 0 : 1;
        s.score[team]++;
        s.goalAt = s.t;
        s.goalBy = team;
        const scorer = s.astros.find((a) => a.id === b.last);
        if (scorer && scorer.team === team) scorer.goals++;
        b.vx *= 0.3;
        b.vy *= 0.3;
      } else if (!inMouth || !live) {
        const lim = edge - side * BALL_R;
        if (live || !inMouth) {
          b.x = side < 0 ? Math.max(b.x, lim) : Math.min(b.x, lim);
          b.vx = -side * Math.abs(b.vx) * 0.8;
        }
      }
    }
    if (s.goalAt >= 0) {
      // in the net: keep it behind the line
      const edge = s.goalBy === 0 ? X1(s) : X0(s);
      const side = s.goalBy === 0 ? 1 : -1;
      b.x = side > 0 ? Math.min(Math.max(b.x, edge + 10), edge + 70) : Math.max(Math.min(b.x, edge - 10), edge - 70);
    }
    const all = s.astros;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) bump(all[i], all[j], R);
    if (live && s.t >= READY + TIME && s.score[0] !== s.score[1]) s.endAt = s.t;
    if (s.t >= READY + TIME + GOLDEN && live) s.endAt = s.t;
  },

  isOver: (s) => s.endAt !== undefined && s.t - s.endAt > 1.5,

  results(s): ResultRow[] {
    const win = s.score[0] === s.score[1] ? 2 : s.score[0] > s.score[1] ? 0 : 1;
    const teams = Object.fromEntries(s.astros.map((a) => [a.id, a.team]));
    return teamResults(s.astros.map((a) => a.id), teams, win, (id) => {
      const a = s.astros.find((q) => q.id === id)!;
      return a.goals * 10 + a.touches;
    }, (id) => {
      const a = s.astros.find((q) => q.id === id)!;
      return `${TEAM_NAME[a.team]}: ${a.goals} goals, ${a.touches} kicks`;
    });
  },

  draw(ctx, s) {
    const left = READY + TIME - s.t;
    if (s.t >= READY && left > 0) drawTimer(ctx, left);
    teamScores(ctx, `${s.score[0]}`, `${s.score[1]}`);
    if (s.goalAt >= 0 && s.t - s.goalAt < RESET) text(ctx, 'GOAL!', 640, 200, 90, { color: s.goalBy === 0 ? '#ff5a5f' : '#3fa9f5' });
    else if (s.endAt !== undefined) text(ctx, s.score[0] === s.score[1] ? 'A draw!' : `${TEAM_NAME[s.score[0] > s.score[1] ? 0 : 1]} team wins!`, 640, 200, 52, { color: '#ffd23f' });
    else if (left <= 0) text(ctx, 'Next goal wins!', 640, 160, 36, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const me = s.astros.find((a) => a.id === id);
    if (!me || s.t < READY || s.goalAt >= 0) return NO_INPUT;
    const b = s.ball;
    // where the ball will come down (good bots read the bounce)
    const tAir = b.z > 5 ? (b.vz + Math.sqrt(b.vz * b.vz + 2 * B_GRAV * b.z)) / B_GRAV : 0;
    const look = Math.min(1.2, tAir) * k.sk.smart;
    const bx = b.x + b.vx * look, by = b.y + b.vy * look;
    const gx = goalX(s, me.team), gy = 400;
    const own = goalX(s, 1 - me.team);
    // hard bots: the teammate closest to our goal hangs back when the ball's on our half
    const mates = s.astros.filter((a) => a.team === me.team);
    const keeper = mates.reduce((a, c) => (Math.abs(c.x - own) < Math.abs(a.x - own) ? c : a), mates[0]);
    const ourHalf = Math.sign(bx - 640) === Math.sign(own - 640);
    if (k.level === 'hard' && mates.length > 1 && keeper.id === me.id && !ourHalf) {
      const tx = own + Math.sign(640 - own) * 90, ty = 400 + (by - 400) * 0.5;
      const d = Math.hypot(tx - me.x, ty - me.y);
      return d < 12 ? NO_INPUT : stick((tx - me.x) / d, (ty - me.y) / d);
    }
    // get behind the ball, lined up with their goal
    const ax = gx - bx, ay = gy - by, am = Math.hypot(ax, ay) || 1;
    const behind = R + BALL_R + 8;
    const px = bx - (ax / am) * behind, py = by - (ay / am) * behind;
    const toBall = Math.hypot(b.x - me.x, b.y - me.y);
    const lined = ((me.x - b.x) * ax + (me.y - b.y) * ay) / am < -BALL_R * 0.3; // we're on the far side from their goal
    let tx = lined ? b.x : px, ty = lined ? b.y : py;
    if (!lined && toBall < behind + 30) {
      // in front of the ball: swing round it rather than pushing it the wrong way
      const side = (me.y - b.y) * ax - (me.x - b.x) * ay > 0 ? 1 : -1;
      tx = b.x - (ay / am) * side * (behind + 30) - (ax / am) * 30;
      ty = b.y + (ax / am) * side * (behind + 30) - (ay / am) * 30;
    }
    let sx = tx - me.x, sy = ty - me.y;
    const m = Math.hypot(sx, sy) || 1;
    sx /= m;
    sy /= m;
    if (k.level === 'easy') {
      const wob = Math.sin(s.t * 3 + id.length) * 0.6;
      [sx, sy] = [sx * Math.cos(wob) - sy * Math.sin(wob), sx * Math.sin(wob) + sy * Math.cos(wob)];
    }
    // kick when the ball's close and we're facing their goal
    const facing = Math.cos(me.face - Math.atan2(ay, ax));
    const near = toBall < R + BALL_R + 22 && b.z < 80;
    if (near && me.cd <= 0 && (facing > 0.5 || rand(k.r) < 0.04 * (1 - k.sk.smart))) {
      if (rand(k.r) < 0.6 + 0.4 * k.sk.smart) return { ...pressB(), x: ax / am, y: ay / am };
    }
    // jump for a header when a high ball drops in
    if (b.z > 60 && b.z < 140 && toBall < 70 && me.z <= 0 && rand(k.r) < 0.15 * k.sk.smart) return { ...stick(sx, sy, true) };
    return stick(sx, sy);
  },
};
