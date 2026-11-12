import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { bump, newBody, steer, stepVertical, type Body } from '../physics';
import { playerChips } from './hud';
import { press, stick, type BotCtx } from '../botkit';

/**
 * Kitchen Raid (Food + Furniture Kits), 1-vs-many. Snacks keep appearing on the big kitchen island.
 * Raiders grab one (A) and carry it back to their own plate along the walls. The chef guards the
 * island and pounces (A); a pounced raider drops the snack and is dizzy for a moment.
 * Raiders score per snack delivered; the chef scores per pounce.
 */
export const KX0 = 120, KX1 = 1160, KY0 = 150, KY1 = 670;
export const ISLAND = { x: 640, y: 400, w: 260, h: 130 };
const R = 22;
const SPEED = 290;
const CARRY_SPEED = 0.82;
const CHEF_SPEED = 0.96;
const POUNCE = 760;
const POUNCE_CD = 2.2;
const STUN = 1.2;
const MAX_T = 55;
const MAX_SNACKS = 6;
const GRAB = 115;
export const SNACKS = ['food/apple', 'food/banana', 'food/cupcake', 'food/donut-sprinkles', 'food/croissant', 'food/cherries', 'food/pie', 'food/waffle'];

export interface Raider extends Body {
  id: string;
  x: number;
  y: number;
  face: number;
  chef: boolean;
  carry: number; // snack kind, -1 = empty-handed
  stun: number;
  /** Can't be pounced again for a moment after getting up. */
  safe: number;
  cd: number;
  score: number;
  plateX: number;
  plateY: number;
}
export interface Snack {
  x: number;
  y: number;
  kind: number;
}
export interface KitchenState {
  t: number;
  rng: Rng;
  spawn: number;
  snacks: Snack[];
  cooks: Raider[];
  pounces: { x: number; y: number }[];
  delivered: { x: number; y: number }[];
}

/** Plates sit around the walls, away from the island. */
function plateSpot(i: number, n: number): [number, number] {
  const per = Math.ceil(n / 2);
  const top = i < per;
  const k = top ? i : i - per;
  const cnt = top ? per : n - per;
  const x = KX0 + 90 + ((KX1 - KX0 - 180) * (k + 0.5)) / Math.max(1, cnt);
  return [x, top ? KY0 + 34 : KY1 - 34];
}

export const kitchenRaid: Minigame<KitchenState> = {
  id: 'kitchen-raid',
  name: 'Kitchen Raid',
  mode: '1-vs-many',
  blurb: 'Snacks keep popping up on the kitchen island. Grab one and run it back to your plate! The chef guards the island and pounces on raiders.',
  controls: 'Stick: move   A: grab / pounce',
  minPlayers: 3,
  maxPlayers: 10,
  ready: 3,

  setup(players: PlayerInfo[], seed: number): KitchenState {
    const rng = { seed };
    const chefIdx = Math.floor(rand(rng) * players.length);
    const raiders = players.filter((_, i) => i !== chefIdx);
    return {
      t: 0,
      rng,
      spawn: 0,
      snacks: [],
      pounces: [],
      delivered: [],
      cooks: players.map((p, i) => {
        const chef = i === chefIdx;
        const ri = raiders.findIndex((q) => q.id === p.id);
        const [px, py] = chef ? [ISLAND.x, ISLAND.y] : plateSpot(ri, raiders.length);
        return {
          id: p.id,
          x: chef ? ISLAND.x : px,
          y: chef ? ISLAND.y + ISLAND.h / 2 + 50 : py + (py < 400 ? 40 : -40),
          face: chef ? -Math.PI / 2 : py < 400 ? Math.PI / 2 : -Math.PI / 2,
          chef,
          carry: -1,
          stun: 0,
          safe: 0,
          cd: 0,
          score: 0,
          plateX: px,
          plateY: py,
          ...newBody(),
        };
      }),
    };
  },

  step(s: KitchenState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.pounces = [];
    s.delivered = [];
    if (s.t < 3) return;
    s.spawn -= dt;
    if (s.spawn <= 0 && s.snacks.length < MAX_SNACKS) {
      s.spawn = randRange(s.rng, 0.5, 1.1);
      s.snacks.push({
        x: ISLAND.x + randRange(s.rng, -ISLAND.w / 2 + 20, ISLAND.w / 2 - 20),
        y: ISLAND.y + randRange(s.rng, -ISLAND.h / 2 + 18, ISLAND.h / 2 - 18),
        kind: Math.floor(rand(s.rng) * SNACKS.length),
      });
    }
    for (const c of s.cooks) {
      const inp = inputs[c.id] ?? NO_INPUT;
      if (c.stun > 0 && c.stun - dt <= 0) c.safe = 1.5;
      c.stun = Math.max(0, c.stun - dt);
      c.safe = Math.max(0, c.safe - dt);
      c.cd = Math.max(0, c.cd - dt);
      const top = SPEED * (c.chef ? CHEF_SPEED : c.carry >= 0 ? CARRY_SPEED : 1);
      if (c.stun > 0) steer(c, 0, 0, top, dt);
      else if (Math.hypot(c.vx, c.vy) <= top * 1.05) steer(c, inp.x, inp.y, top, dt);
      else {
        c.vx *= 1 - Math.min(1, dt * 3);
        c.vy *= 1 - Math.min(1, dt * 3);
      }
      if (c.stun === 0 && inp.aPressed) {
        if (c.chef && c.cd === 0) {
          const m = Math.hypot(inp.x, inp.y);
          c.vx = (m > 0.2 ? inp.x / m : Math.cos(c.face)) * POUNCE;
          c.vy = (m > 0.2 ? inp.y / m : Math.sin(c.face)) * POUNCE;
          c.vz = 260;
          c.cd = POUNCE_CD;
        } else if (!c.chef && c.carry < 0) {
          // grab the nearest snack within reach of the island's edge
          // generous reach: from any side of the island you can get the snacks on your half (it was too tight to reach most)
          let best = -1;
          let bd = GRAB;
          s.snacks.forEach((sn, i) => {
            const d = Math.hypot(sn.x - c.x, sn.y - c.y);
            if (d < bd) (bd = d), (best = i);
          });
          if (best >= 0) c.carry = s.snacks.splice(best, 1)[0].kind;
        }
      }
      stepVertical(c, dt);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      // the island is solid for everyone but reachable from its edges
      const hx = ISLAND.w / 2 + R;
      const hy = ISLAND.h / 2 + R;
      const dx = c.x - ISLAND.x;
      const dy = c.y - ISLAND.y;
      if (Math.abs(dx) < hx && Math.abs(dy) < hy) {
        if (hx - Math.abs(dx) < hy - Math.abs(dy)) (c.x = ISLAND.x + Math.sign(dx || 1) * hx), (c.vx = 0);
        else (c.y = ISLAND.y + Math.sign(dy || 1) * hy), (c.vy = 0);
      }
      c.x = Math.max(KX0 + R, Math.min(KX1 - R, c.x));
      c.y = Math.max(KY0 + R, Math.min(KY1 - R, c.y));
      if (Math.hypot(c.vx, c.vy) > 30) c.face = Math.atan2(c.vy, c.vx);
      // deliver
      if (!c.chef && c.carry >= 0 && Math.hypot(c.x - c.plateX, c.y - c.plateY) < 64) {
        c.carry = -1;
        c.score++;
        s.delivered.push({ x: c.plateX, y: c.plateY });
      }
    }
    const chef = s.cooks.find((c) => c.chef)!;
    for (const c of s.cooks) {
      if (c.chef) continue;
      const d = Math.hypot(c.x - chef.x, c.y - chef.y);
      // only a pounce (a fast chef) catches; walking into a raider just bumps
      if (d < R * 2 + 6 && c.stun === 0 && c.safe === 0 && Math.hypot(chef.vx, chef.vy) > SPEED * 1.25) {
        c.stun = STUN;
        c.vx = ((c.x - chef.x) / Math.max(1, d)) * 420;
        c.vy = ((c.y - chef.y) / Math.max(1, d)) * 420;
        c.vz = 380;
        chef.score++;
        s.pounces.push({ x: c.x, y: c.y });
        if (c.carry >= 0) {
          // the snack flies back onto the island
          s.snacks.push({ x: ISLAND.x + randRange(s.rng, -90, 90), y: ISLAND.y + randRange(s.rng, -40, 40), kind: c.carry });
          c.carry = -1;
        }
      }
    }
    for (let i = 0; i < s.cooks.length; i++)
      for (let j = i + 1; j < s.cooks.length; j++) if (!s.cooks[i].chef && !s.cooks[j].chef) bump(s.cooks[i], s.cooks[j], R);
  },

  isOver(s) {
    return s.t >= MAX_T + 3;
  },

  results(s): ResultRow[] {
    // the chef's pounces count a little more than a delivery: one chef against everyone
    // one chef against everyone: pounces are worth less the more raiders there are
    const raiders = Math.max(1, s.cooks.length - 1);
    return s.cooks
      .map((c) => ({
        id: c.id,
        value: c.chef ? (c.score * 1.5) / raiders : c.score,
        label: c.chef ? `Chef: ${c.score} ${c.score === 1 ? 'pounce' : 'pounces'}` : `${c.score} ${c.score === 1 ? 'snack' : 'snacks'}`,
      }))
      .sort((a, b) => b.value - a.value);
  },

  bot(s, id, k: BotCtx): import('../types').TickInput {
    const me = s.cooks.find((c) => c.id === id);
    if (!me || s.t < 3 || me.stun > 0) return NO_INPUT;
    const err = 1 - k.sk.smart;
    const go = (tx: number, ty: number, a = false) => {
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy) || 1;
      return stick(dx / d, dy / d, a);
    };
    if (me.chef) {
      // hunt the nearest raider, carriers first; pounce when close
      let best: Raider | null = null;
      let bd = Infinity;
      for (const c of s.cooks) {
        if (c.chef || c.stun > 0 || c.safe > 0) continue;
        const d = Math.hypot(c.x - me.x, c.y - me.y) * (c.carry >= 0 ? 0.6 : 1);
        if (d < bd) (bd = d), (best = c);
      }
      if (!best) return go(ISLAND.x, ISLAND.y + ISLAND.h / 2 + 60);
      const d = Math.hypot(best.x - me.x, best.y - me.y);
      const lead = 0.18 + err * 0.2;
      return go(best.x + best.vx * lead, best.y + best.vy * lead, me.cd === 0 && d < 150 - err * 40 && rand(k.r) < 0.25 + k.sk.smart * 0.4);
    }
    if (me.carry >= 0) return go(me.plateX, me.plateY);
    // empty-handed: walk to the island edge beside the nearest snack, grab when in reach
    const chef = s.cooks.find((c) => c.chef)!;
    const scared = Math.hypot(chef.x - me.x, chef.y - me.y) < 110 && chef.cd === 0 && rand(k.r) < 0.6 * k.sk.smart;
    if (scared) return go(me.x + (me.x - chef.x), me.y + (me.y - chef.y));
    let sn: Snack | null = null;
    let sd = Infinity;
    for (const q of s.snacks) {
      const d = Math.hypot(q.x - me.x, q.y - me.y);
      if (d < sd) (sd = d), (sn = q);
    }
    if (!sn) return go(ISLAND.x + (me.plateX < ISLAND.x ? -1 : 1) * 60, me.plateY < ISLAND.y ? ISLAND.y - ISLAND.h / 2 - 60 : ISLAND.y + ISLAND.h / 2 + 60);
    if (sd < GRAB - 10 - err * 20) return press();
    // the edge spot nearest the snack
    const top = me.y < ISLAND.y;
    return go(sn.x, top ? ISLAND.y - ISLAND.h / 2 - R : ISLAND.y + ISLAND.h / 2 + R);
  },

  draw(ctx, s, players) {
    drawTimer(ctx, MAX_T + 3 - s.t);
    playerChips(
      ctx,
      players,
      s.cooks.map((c) => ({ id: c.id, label: c.chef ? `CHEF ${c.score}` : `${c.score}`, hot: c.chef })),
    );
    if (s.t < 5) {
      const chef = players.find((p) => p.id === s.cooks.find((c) => c.chef)?.id);
      text(ctx, `${chef?.name ?? ''} is the chef!`, 640, 104, 30, { color: '#ffd23f' });
    }
  },
};
