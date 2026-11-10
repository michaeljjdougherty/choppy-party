import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawChoppy, drawTimer, playerById, text } from '../draw';

const READY = 3;
const MASH = 10;

export interface PancakeState {
  t: number;
  ids: string[];
  stacks: Record<string, number>;
  flip: Record<string, number>; // animation timer per player
}

export const pancakePanic: Minigame<PancakeState> = {
  id: 'pancake-panic',
  name: 'Pancake Panic',
  mode: 'Free-for-all',
  blurb: 'Mash A to flip pancakes onto your plate. Tallest stack after 10 seconds wins!',
  controls: 'Mash A',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[]): PancakeState {
    const s: PancakeState = { t: 0, ids: players.map((p) => p.id), stacks: {}, flip: {} };
    for (const id of s.ids) {
      s.stacks[id] = 0;
      s.flip[id] = 0;
    }
    return s;
  },

  step(s: PancakeState, inputs: Inputs, dt: number): void {
    s.t += dt;
    for (const id of s.ids) s.flip[id] = Math.max(0, s.flip[id] - dt);
    if (s.t < READY || s.t > READY + MASH) return;
    for (const id of s.ids) {
      const taps = (inputs[id] ?? NO_INPUT).aTaps;
      if (taps > 0) {
        s.stacks[id] += taps;
        s.flip[id] = 0.18;
      }
    }
  },

  isOver: (s) => s.t >= READY + MASH + 1.5,

  results(s: PancakeState): ResultRow[] {
    return s.ids
      .map((id) => ({ id, value: s.stacks[id], label: `${s.stacks[id]} pancakes` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    ctx.fillStyle = '#fbe3c2';
    ctx.fillRect(0, 0, 1280, 720);
    // checkered tablecloth
    for (let y = 520; y < 720; y += 40) {
      for (let x = 0; x < 1280; x += 40) {
        ctx.fillStyle = ((x + y) / 40) % 2 === 0 ? '#e34b4b' : '#fff5ec';
        ctx.fillRect(x, y, 40, 40);
      }
    }
    const n = s.ids.length;
    const gap = Math.min(124, 1200 / Math.max(1, n));
    const x0 = 640 - ((n - 1) * gap) / 2;
    const best = Math.max(1, ...s.ids.map((id) => s.stacks[id]));
    // stacks are drawn to a shared scale so a big lead is visible at a glance
    const unit = Math.min(8, 380 / Math.max(40, best));
    s.ids.forEach((id, i) => {
      const p = playerById(players, id);
      if (!p) return;
      const x = x0 + i * gap;
      // plate
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#c9c1b5';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, 500, gap * 0.42, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const h = s.stacks[id];
      for (let k = 0; k < h; k++) {
        const y = 490 - k * unit;
        ctx.fillStyle = k % 2 ? '#e8a54b' : '#f0b860';
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(k * 1.7) * 3, y, gap * 0.34, Math.max(3, unit * 0.7), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const topY = 490 - h * unit;
      if (h > 0) {
        ctx.fillStyle = '#ffe58a';
        ctx.fillRect(x - 8, topY - 6, 16, 8);
      }
      if (s.flip[id] > 0) {
        const f = s.flip[id] / 0.18;
        ctx.save();
        ctx.translate(x, topY - 30 - f * 50);
        ctx.rotate(f * Math.PI * 2);
        ctx.fillStyle = '#f0b860';
        ctx.beginPath();
        ctx.ellipse(0, 0, gap * 0.3, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawChoppy(ctx, x, 600, 28, p.color, { look: -Math.PI / 2, name: p.name });
      text(ctx, String(h), x, 670, 26, { color: '#fff' });
    });
    if (s.t < READY) text(ctx, String(Math.ceil(READY - s.t)), 640, 200, 120, { color: '#ff5a5f' });
    else if (s.t < READY + 0.8) text(ctx, 'MASH!', 640, 200, 110, { color: '#ff5a5f' });
    else if (s.t <= READY + MASH) drawTimer(ctx, READY + MASH - s.t);
    else text(ctx, 'Stop!', 640, 200, 100, { color: '#ff5a5f' });
  },
};
