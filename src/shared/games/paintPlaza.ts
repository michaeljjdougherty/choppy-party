import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer } from '../draw';
import { randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { look, outside, pressB, stick, type BotCtx } from '../botkit';

/**
 * Paint the Plaza (fantasy stone plaza in a forest clearing): walk over flagstones to paint them your
 * colour. B throws a splash that paints a 3x3 patch around you (it recharges). Most tiles when time
 * runs out wins. The plaza grows with the crowd, so a duel and a ten-player brawl both feel busy.
 */
const R = 20;
const SPEED = 290;
const READY = 3;
const TIME = 50;
const SPLASH_CD = 4;

export interface Painter extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  splashCd: number;
  splashed: number; // seconds of splash animation left
}
export interface PlazaState {
  t: number;
  rng: Rng;
  cols: number;
  rows: number;
  tile: number;
  x0: number;
  y0: number;
  /** Index into painters per tile, -1 = bare stone. */
  tiles: number[];
  painters: Painter[];
  splashes: { x: number; y: number; who: number }[]; // this tick, for the view
}

/** Plaza size for a crowd: 11x6 for two players, up to 20x10 for ten. */
export function plazaSize(n: number): { cols: number; rows: number; tile: number } {
  const cols = Math.min(20, 9 + n + Math.floor(n / 3));
  const rows = Math.min(10, 5 + Math.ceil(n / 2));
  const tile = Math.floor(Math.min(1080 / cols, 470 / rows));
  return { cols, rows, tile };
}

export const tileIndex = (s: PlazaState, x: number, y: number) => {
  const c = Math.floor((x - s.x0) / s.tile);
  const r = Math.floor((y - s.y0) / s.tile);
  return c < 0 || r < 0 || c >= s.cols || r >= s.rows ? -1 : r * s.cols + c;
};
export const tileCentre = (s: PlazaState, i: number): [number, number] => [s.x0 + ((i % s.cols) + 0.5) * s.tile, s.y0 + (Math.floor(i / s.cols) + 0.5) * s.tile];
const counts = (s: PlazaState) => s.painters.map((_, k) => s.tiles.filter((o) => o === k).length);

export const paintPlaza: Minigame<PlazaState> = {
  id: 'paint-the-plaza',
  name: 'Paint the Plaza',
  mode: 'Free-for-all',
  ready: READY,
  blurb: 'Walk over the flagstones to paint them your colour. Press B to throw a splash that paints the stones around you. Most tiles when time runs out wins!',
  controls: 'Stick: walk   B: splash',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): PlazaState {
    const { cols, rows, tile } = plazaSize(players.length);
    const x0 = 640 - (cols * tile) / 2;
    const y0 = 410 - (rows * tile) / 2;
    const n = players.length;
    return {
      t: 0,
      rng: { seed },
      cols,
      rows,
      tile,
      x0,
      y0,
      tiles: new Array(cols * rows).fill(-1),
      splashes: [],
      painters: players.map((p, i) => {
        const a = (i / n) * Math.PI * 2;
        return { id: p.id, x: 640 + Math.cos(a) * cols * tile * 0.32, y: 410 + Math.sin(a) * rows * tile * 0.32, face: a + Math.PI, splashCd: 1.5, splashed: 0, ...newBody() };
      }),
    };
  },

  step(s: PlazaState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.splashes = [];
    if (s.t < READY) return;
    const live = s.t <= READY + TIME;
    s.painters.forEach((p, k) => {
      const inp = inputs[p.id] ?? NO_INPUT;
      p.splashCd = Math.max(0, p.splashCd - dt);
      p.splashed = Math.max(0, p.splashed - dt);
      steer(p, live ? inp.x : 0, live ? inp.y : 0, SPEED, dt);
      stepVertical(p, dt);
      p.x = Math.max(s.x0 + R, Math.min(s.x0 + s.cols * s.tile - R, p.x + p.vx * dt));
      p.y = Math.max(s.y0 + R, Math.min(s.y0 + s.rows * s.tile - R, p.y + p.vy * dt));
      if (Math.hypot(inp.x, inp.y) > 0.3) p.face = Math.atan2(inp.y, inp.x);
      if (!live) return;
      const here = tileIndex(s, p.x, p.y);
      if (here >= 0) s.tiles[here] = k;
      if (inp.bPressed && p.splashCd <= 0) {
        p.splashCd = SPLASH_CD;
        p.splashed = 0.5;
        s.splashes.push({ x: p.x, y: p.y, who: k });
        const c = here % s.cols, r = Math.floor(here / s.cols);
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc, rr = r + dr;
            if (cc >= 0 && rr >= 0 && cc < s.cols && rr < s.rows) s.tiles[rr * s.cols + cc] = k;
          }
      }
    });
    for (let i = 0; i < s.painters.length; i++) for (let j = i + 1; j < s.painters.length; j++) bump(s.painters[i], s.painters[j], R);
  },

  isOver: (s) => s.t >= READY + TIME + 1.5,

  results(s): ResultRow[] {
    const c = counts(s);
    return s.painters.map((p, k) => ({ id: p.id, value: c[k], label: `${c[k]} tiles` })).sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    const c = counts(s);
    playerChips(ctx, players, s.painters.map((p, k) => ({ id: p.id, label: `${c[k]}` })));
  },

  bot(s, id, k: BotCtx) {
    const me = s.painters.find((p) => p.id === id);
    if (!me || s.t < READY) return NO_INPUT;
    const mine = s.painters.indexOf(me);
    const c = counts(s);
    const leader = c.indexOf(Math.max(...c.filter((_, i) => i !== mine), 0));
    // splash when it would paint plenty of stones that aren't ours yet
    const here = tileIndex(s, me.x, me.y);
    let gain = 0;
    const col = here % s.cols, row = Math.floor(here / s.cols);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const i = (row + dr) * s.cols + col + dc;
        if (col + dc >= 0 && col + dc < s.cols && row + dr >= 0 && row + dr < s.rows && s.tiles[i] !== mine) gain++;
      }
    if (me.splashCd <= 0 && gain >= 5 + Math.round((1 - k.sk.smart) * 3) && k.mem.t > 0.2) {
      k.mem.t = randRange(k.r, -0.3, 0);
      return pressB();
    }
    // the closest stone that isn't ours yet, so a bot standing in its own paint still has somewhere to go
    let tx = me.x, ty = me.y, td = Infinity;
    s.tiles.forEach((o, i) => {
      if (o === mine) return;
      const [cx, cy] = tileCentre(s, i);
      const d = Math.hypot(cx - me.x, cy - me.y);
      if (d < td) [td, tx, ty] = [d, cx, cy];
    });
    // wander toward stones that aren't ours; smart bots prefer stealing the leader's
    look(me, k.sk, k.mem, k.r, (x, y) => {
      if (outside(x, y, s.x0, s.x0 + s.cols * s.tile, s.y0, s.y0 + s.rows * s.tile, 20)) return 1e6;
      const i = tileIndex(s, x, y);
      const o = s.tiles[i];
      let cost = o === mine ? 40 : o === -1 ? 0 : o === leader ? -12 * k.sk.smart : 0;
      // look a little further: patches of unclaimed stone ahead are worth heading for
      const [ax, ay] = [x + (x - me.x), y + (y - me.y)];
      const j = tileIndex(s, ax, ay);
      if (j >= 0 && s.tiles[j] !== mine) cost -= 15;
      return cost + Math.hypot(x - tx, y - ty) * 0.08;
    }, Math.max(60, s.tile * 1.2));
    return stick(k.mem.sx, k.mem.sy);
  },
};
