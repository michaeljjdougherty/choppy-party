import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawChoppy, playerById, text } from '../draw';
import { randRange, type Rng } from '../rng';

const ROUNDS = 3;
const MAX_WAIT_MS = 1500; // no press after bloom counts as this
const EARLY_PENALTY_MS = 1000;
const REVEAL_TIME = 2;

export interface QuickDrawState {
  t: number;
  rng: Rng;
  round: number;
  phase: 'wait' | 'bloom' | 'reveal' | 'done';
  phaseT: number;
  waitFor: number;
  /** ms reaction this round; -1 = jumped early; null = not yet */
  reaction: Record<string, number | null>;
  totals: Record<string, number>;
  ids: string[];
}

export const quickDrawCactus: Minigame<QuickDrawState> = {
  id: 'quick-draw-cactus',
  name: 'Quick Draw Cactus',
  mode: 'Free-for-all',
  blurb: 'Wait for the cactus to bloom, then press A as fast as you can. Press early and you get a penalty! Best of 3.',
  controls: 'A: draw!',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): QuickDrawState {
    const rng = { seed };
    const s: QuickDrawState = {
      t: 0,
      rng,
      round: 0,
      phase: 'wait',
      phaseT: 0,
      waitFor: randRange(rng, 1.8, 4.5),
      reaction: {},
      totals: {},
      ids: players.map((p) => p.id),
    };
    for (const id of s.ids) {
      s.reaction[id] = null;
      s.totals[id] = 0;
    }
    return s;
  },

  step(s: QuickDrawState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.phaseT += dt;
    if (s.phase === 'wait') {
      for (const id of s.ids) {
        if ((inputs[id] ?? NO_INPUT).aPressed && s.reaction[id] === null) s.reaction[id] = -1;
      }
      if (s.phaseT >= s.waitFor) {
        s.phase = 'bloom';
        s.phaseT = 0;
      }
    } else if (s.phase === 'bloom') {
      for (const id of s.ids) {
        if ((inputs[id] ?? NO_INPUT).aPressed && s.reaction[id] === null) {
          // the press happened somewhere inside this tick; credit the middle of it
          s.reaction[id] = Math.max(1, Math.round((s.phaseT - dt / 2) * 1000));
        }
      }
      const allIn = s.ids.every((id) => s.reaction[id] !== null);
      if (allIn || s.phaseT * 1000 >= MAX_WAIT_MS) {
        for (const id of s.ids) {
          const r = s.reaction[id];
          if (r === null) s.reaction[id] = MAX_WAIT_MS;
          s.totals[id] += r === -1 ? EARLY_PENALTY_MS : (s.reaction[id] as number);
        }
        s.phase = 'reveal';
        s.phaseT = 0;
      }
    } else if (s.phase === 'reveal') {
      if (s.phaseT >= REVEAL_TIME) {
        s.round++;
        if (s.round >= ROUNDS) {
          s.phase = 'done';
          return;
        }
        s.phase = 'wait';
        s.phaseT = 0;
        s.waitFor = randRange(s.rng, 1.8, 4.5);
        for (const id of s.ids) s.reaction[id] = null;
      }
    }
  },

  isOver: (s) => s.phase === 'done',

  results(s: QuickDrawState): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: -s.totals[id], label: `${(s.totals[id] / 1000).toFixed(3)}s total` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    // sky and desert
    const sky = ctx.createLinearGradient(0, 0, 0, 480);
    sky.addColorStop(0, '#ff9a5a');
    sky.addColorStop(1, '#ffd59a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(1050, 150, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0a25c';
    ctx.beginPath();
    ctx.moveTo(0, 470);
    for (let x = 0; x <= 1280; x += 80) ctx.lineTo(x, 460 + Math.sin(x / 140) * 18);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.fill();

    // the cactus
    const bloom = s.phase === 'bloom' || (s.phase === 'reveal' && s.ids.some((id) => (s.reaction[id] ?? 0) > 0));
    const cx = 640;
    ctx.fillStyle = '#3f9b4f';
    ctx.strokeStyle = '#21602c';
    ctx.lineWidth = 5;
    const arm = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, w / 2);
      ctx.fill();
      ctx.stroke();
    };
    arm(cx - 40, 160, 80, 330);
    arm(cx - 130, 250, 50, 120);
    arm(cx - 130, 330, 110, 45);
    arm(cx + 80, 210, 50, 120);
    arm(cx + 20, 290, 110, 45);
    if (bloom) {
      const pulse = 1 + Math.sin(s.t * 12) * 0.06;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + s.t;
        ctx.fillStyle = '#ff4fa3';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 30 * pulse, 150 + Math.sin(a) * 30 * pulse, 26, 14, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(cx, 150, 18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2f7a3b';
      ctx.beginPath();
      ctx.arc(cx, 160, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.phase === 'bloom') text(ctx, 'DRAW!', 640, 80, 72, { color: '#ff2f6d' });
    else if (s.phase === 'wait') text(ctx, 'Wait for it...', 640, 80, 44);
    text(ctx, `Round ${Math.min(s.round + 1, ROUNDS)} of ${ROUNDS}`, 30, 36, 26, { align: 'left' });

    // players in a row
    const n = s.ids.length;
    const gap = Math.min(120, 1180 / Math.max(1, n));
    const x0 = 640 - ((n - 1) * gap) / 2;
    s.ids.forEach((id, i) => {
      const p = playerById(players, id);
      if (!p) return;
      const x = x0 + i * gap;
      const r = s.reaction[id];
      const jump = r !== null && r > 0 && s.phase !== 'wait' ? -14 : 0;
      drawChoppy(ctx, x, 590 + jump, 30, p.color, { look: -Math.PI / 2, stunned: r === -1, name: p.name });
      let label = '';
      let color = '#fff';
      if (r === -1) {
        label = 'Too early!';
        color = '#ff5a5f';
      } else if (r !== null && s.phase !== 'wait') {
        label = r >= MAX_WAIT_MS ? 'Asleep...' : `${r} ms`;
        color = '#ffd23f';
      }
      if (label) text(ctx, label, x, 650, 18, { color });
      text(ctx, `${(s.totals[id] / 1000).toFixed(2)}s`, x, 680, 15, { color: '#fff', weight: 500 });
    });
  },
};
