import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT, clamp } from '../types';
import { drawTimer, playerById, popText, text } from '../draw';
import { rand, type Rng } from '../rng';

/**
 * Paddle Clash (duel): a 2-player paddle-and-ball game on a dock. Score 3, or have the
 * higher score at the buzzer. Level at the buzzer means the next point wins.
 */
export const PY0 = 140, PY1 = 640, PX0 = 120, PX1 = 1160;
export const PADDLE_H = 120;
export const BALL_R = 14;
const PADDLE_SPEED = 560;
const SERVE_SPEED = 470;
const WIN = 3;
const TIME = 60;
const HARD_CAP = 85;

export interface PaddleState {
  t: number;
  rng: Rng;
  ids: string[];
  paddles: number[]; // y centre of the left and right paddles
  ball: { x: number; y: number; vx: number; vy: number };
  serve: number; // seconds until the ball is in play
  scores: Record<string, number>;
  hits: number;
}

function reset(s: PaddleState, toward: number) {
  const a = (rand(s.rng) - 0.5) * 0.9;
  s.ball = { x: 640, y: (PY0 + PY1) / 2, vx: Math.cos(a) * SERVE_SPEED * toward, vy: Math.sin(a) * SERVE_SPEED };
  s.serve = 1.1;
  s.hits = 0;
}

const done = (s: PaddleState) => {
  const sc = s.ids.slice(0, 2).map((id) => s.scores[id]);
  if (Math.max(...sc) >= WIN) return true;
  if (s.t >= TIME && sc[0] !== sc[1]) return true;
  return s.t >= HARD_CAP;
};

export const paddleClash: Minigame<PaddleState> = {
  id: 'paddle-clash',
  name: 'Paddle Clash',
  mode: 'Duel',
  blurb: 'Bat the cannonball past your rival. First to 3, or the higher score when time is up!',
  controls: 'Stick up/down: move paddle',
  minPlayers: 2,
  maxPlayers: 2,

  setup(players: PlayerInfo[], seed: number): PaddleState {
    const s: PaddleState = {
      t: 0,
      rng: { seed },
      ids: players.map((p) => p.id),
      paddles: [(PY0 + PY1) / 2, (PY0 + PY1) / 2],
      ball: { x: 640, y: 390, vx: 0, vy: 0 },
      serve: 0,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      hits: 0,
    };
    reset(s, rand(s.rng) < 0.5 ? -1 : 1);
    s.serve = 2;
    return s;
  },

  step(s: PaddleState, inputs: Inputs, dt: number): void {
    s.t += dt;
    if (done(s)) return;
    for (let i = 0; i < 2; i++) {
      const inp = inputs[s.ids[i]] ?? NO_INPUT;
      s.paddles[i] = clamp(s.paddles[i] + inp.y * PADDLE_SPEED * dt, PY0 + PADDLE_H / 2, PY1 - PADDLE_H / 2);
    }
    if (s.serve > 0) {
      s.serve -= dt;
      return;
    }
    const b = s.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < PY0 + BALL_R) {
      b.y = PY0 + BALL_R;
      b.vy = Math.abs(b.vy);
    }
    if (b.y > PY1 - BALL_R) {
      b.y = PY1 - BALL_R;
      b.vy = -Math.abs(b.vy);
    }
    // paddles: where the ball hits the paddle sets the angle, and every hit is a little faster
    const hit = (i: number, px: number, dir: number) => {
      const py = s.paddles[i];
      if (Math.abs(b.y - py) > PADDLE_H / 2 + BALL_R) return;
      const off = (b.y - py) / (PADDLE_H / 2);
      const speed = Math.min(1000, Math.hypot(b.vx, b.vy) * 1.06);
      const a = off * 0.9;
      b.vx = Math.cos(a) * speed * dir;
      b.vy = Math.sin(a) * speed;
      b.x = px + dir * BALL_R;
      s.hits++;
    };
    if (b.vx < 0 && b.x - BALL_R < PX0 + 18 && b.x > PX0 - 20) hit(0, PX0 + 18, 1);
    if (b.vx > 0 && b.x + BALL_R > PX1 - 18 && b.x < PX1 + 20) hit(1, PX1 - 18, -1);
    if (b.x < PX0 - 60) {
      s.scores[s.ids[1]]++;
      reset(s, -1);
    } else if (b.x > PX1 + 60) {
      s.scores[s.ids[0]]++;
      reset(s, 1);
    }
  },

  isOver: done,

  results(s): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: s.scores[id], label: `${s.scores[id]} ${s.scores[id] === 1 ? 'point' : 'points'}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, Math.max(0, TIME - s.t));
    s.ids.slice(0, 2).forEach((id, i) => {
      const p = playerById(players, id);
      if (!p) return;
      const x = i === 0 ? 300 : 980;
      text(ctx, p.name, x, 44, 26, { color: p.color });
      popText(ctx, `pc:${id}`, s.scores[id], x, 92, 52, { color: '#ffffff' });
    });
    if (s.t >= TIME && !done(s)) text(ctx, 'Sudden death: next point wins!', 640, 680, 34, { color: '#ff9f1c' });
  },
};
