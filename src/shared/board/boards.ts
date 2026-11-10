import type { BoardDef, SpaceType } from './types';
import { DEFAULT_PRESET } from './types';
import { Builder, between, ellipse, roundedRect, type Pt } from './layout';

function nearest(b: Builder, ids: string[], x: number, z: number): string {
  let best = ids[0];
  let bd = Infinity;
  for (const id of ids) {
    const n = b.nodes[id];
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

const pt = (b: Builder, id: string): Pt => [b.nodes[id].x, b.nodes[id].z];

/** Put special spaces at fractions of the way around a loop. */
function sprinkle(b: Builder, ids: string[], type: SpaceType, at: number[]): string[] {
  return at.map((f) => {
    const id = ids[Math.round(f * ids.length) % ids.length];
    b.set(id, type);
    return id;
  });
}

/** Every plain Key Space on these chains (minus a few) can hold a Crown Chest, up to `max`. */
function chestSpots(b: Builder, ids: string[], max: number, avoid: string[]): string[] {
  const keys = ids.filter((id) => b.nodes[id].type === 'key' && !avoid.includes(id));
  const step = Math.max(1, keys.length / max);
  const out: string[] = [];
  for (let i = 0; i < keys.length && out.length < max; i += step) out.push(keys[Math.floor(i)]);
  return [...new Set(out)];
}

/**
 * LANTERN HOLLOW (4-6 players)
 * A compact haunted pumpkin village. Event spaces ring the town bell and swap day and night,
 * which opens either the Moon Bridge or the Root Cellar through the middle of town.
 * A Wisp at the top of the board will steal coins from the leader, for a price.
 */
function lanternHollow(): BoardDef {
  const b = new Builder();
  const loop = b.chain('h', roundedRect(26, 17, 4, 34), 'BBHBRBCBBEBBHBLBRB', true);
  const left = nearest(b, loop, -13, 0);
  const right = nearest(b, loop, 13, 0);
  const bridge = b.chain('hb', between(pt(b, left), pt(b, right), 5, 2.6), 'BLBHB');
  const cellar = b.chain('hc', between(pt(b, left), pt(b, right), 5, -2.6), 'BRBCB');
  b.link(bridge[bridge.length - 1], right);
  b.link(cellar[cellar.length - 1], right);
  const leftNext = b.nodes[left].next[0];
  b.nodes[left].gate = { day: [leftNext, bridge[0]], night: [leftNext, cellar[0]] };
  b.nodes[left].next = [leftNext, bridge[0], cellar[0]];
  b.set(left, 'key');
  b.set(right, 'key');
  const start = loop[0];
  b.set(start, 'camp');
  b.set(nearest(b, loop, 0, -8.5), 'wisp');
  sprinkle(b, loop, 'post', [0.12, 0.38, 0.62, 0.88]);
  sprinkle(b, loop, 'duel', [0.25, 0.75]);
  sprinkle(b, loop, 'stew', [0.5]);
  sprinkle(b, loop, 'fountain', [0.45]);
  sprinkle(b, loop, 'spring', [0.06, 0.56]);
  // the Root Cellar is overgrown: snares grab you there at night
  b.set(cellar[1], 'snare');
  b.set(cellar[3], 'snare');
  const pines = [[loop[7], loop[8]], [loop[16], loop[17]], [loop[24], loop[25]], [loop[31], loop[32]]];
  const crownSpots = chestSpots(b, [...loop, ...bridge, ...cellar], 16, [left, right, start]);
  return {
    id: 'lantern-hollow',
    name: 'Lantern Hollow',
    players: [4, 6],
    tagline: 'A cozy haunted village. Tight, tricky and full of steals.',
    gimmick: 'The bell swaps day and night. At night a pine topples each round and Root Snares grab you in the cellar. Pay the Wisp to rob the leader.',
    theme: 'hollow',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    pines,
    preset: { ...DEFAULT_PRESET, chests: 1 },
  };
}

/**
 * COSMO JUNCTION (6-8 players)
 * A big space station ring with a Laser Lane straight through the middle. Every pass through
 * the lane gate counts the cannon down; at zero it sweeps the lane and blasts coins off anyone on it.
 * Warp pads on the ring fling you somewhere else entirely.
 */
function cosmoJunction(): BoardDef {
  const b = new Builder();
  const ring = b.chain('c', ellipse(18, 11.5, 46), 'BBHBRBCBBEBLBBHBRB', true);
  const left = nearest(b, ring, -18, 0);
  const right = nearest(b, ring, 18, 0);
  const lane = b.chain('cl', between(pt(b, left), pt(b, right), 11), 'BBLBHBCBLBB');
  for (const id of lane) b.nodes[id].lane = true;
  b.link(left, lane[0]);
  b.link(lane[lane.length - 1], right);
  b.set(left, 'key');
  b.set(right, 'key');
  b.set(lane[0], 'counter');
  const start = ring[0];
  b.set(start, 'camp');
  sprinkle(b, ring, 'post', [0.1, 0.3, 0.55, 0.72, 0.9]);
  sprinkle(b, ring, 'duel', [0.2, 0.65]);
  sprinkle(b, ring, 'stew', [0.42, 0.82]);
  sprinkle(b, ring, 'vent', [0.15, 0.47, 0.78]);
  sprinkle(b, ring, 'spring', [0.05, 0.6]);
  b.set(lane[5], 'stew');
  const crownSpots = chestSpots(b, [...ring, ...lane], 20, [left, right, start]);
  return {
    id: 'cosmo-junction',
    name: 'Cosmo Junction',
    players: [6, 8],
    tagline: 'A sprawling space station with routes everywhere.',
    gimmick: 'Every pass through the laser gate counts it down, and at zero it hits everyone in the lane for 15. Meteor targets show where rocks will land next round. Airlock vents blast you backward. Event spaces are warp pads.',
    theme: 'cosmo',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    preset: { ...DEFAULT_PRESET, chests: 1 },
  };
}

/**
 * GOLD RUSH GULCH (8+ players)
 * The biggest board: a frontier boomtown with two crowns out at once so nobody waits long for a shot.
 * A steam train loops between four stations; pay the fare to ride ahead. Event spaces are mine shafts.
 */
function goldRushGulch(): BoardDef {
  const b = new Builder();
  const loop = b.chain('g', roundedRect(44, 28, 6, 62), 'BBHBRBCBBEBBLBHBRB', true);
  const topW = nearest(b, loop, -8, -14);
  const botW = nearest(b, loop, -8, 14);
  const topE = nearest(b, loop, 8, -14);
  const botE = nearest(b, loop, 8, 14);
  // two canyon cut-throughs that run in opposite directions; a boulder rolls down one each round
  const west = b.chain('gw', between(pt(b, topW), pt(b, botW), 7, 1.5), 'BLBCBHB');
  b.link(topW, west[0]);
  b.link(west[west.length - 1], botW);
  const east = b.chain('ge', between(pt(b, botE), pt(b, topE), 7, 1.5), 'BHBCBLB');
  b.link(botE, east[0]);
  b.link(east[east.length - 1], topE);
  for (const id of west) b.nodes[id].canyon = 0;
  for (const id of east) b.nodes[id].canyon = 1;
  for (const id of [topW, botW, topE, botE]) b.set(id, 'key');
  const stations = [nearest(b, loop, -22, 14), nearest(b, loop, -22, -14), nearest(b, loop, 22, -14), nearest(b, loop, 22, 14)];
  for (const st of stations) b.set(st, 'station');
  const start = loop[0];
  b.set(start, 'camp');
  const skip = new Set([...stations, start, topW, botW, topE, botE]);
  const put = (type: SpaceType, at: number[]) =>
    at.forEach((f) => {
      let i = Math.round(f * loop.length) % loop.length;
      while (skip.has(loop[i])) i = (i + 1) % loop.length;
      b.set(loop[i], type);
      skip.add(loop[i]);
    });
  put('post', [0.08, 0.24, 0.4, 0.56, 0.72, 0.88]);
  put('duel', [0.16, 0.5, 0.82]);
  put('stew', [0.33, 0.66]);
  put('dynamite', [0.12, 0.45, 0.62, 0.94]);
  put('cannon', [0.2, 0.53, 0.78]);
  b.set(west[3], 'dynamite');
  const crownSpots = chestSpots(b, [...loop, ...west, ...east], 24, [...skip]);
  return {
    id: 'gold-rush-gulch',
    name: 'Gold Rush Gulch',
    players: [8, 10],
    tagline: 'A huge frontier boomtown built for a crowd.',
    gimmick: 'Two Crown Chests are out at once. Ride the steam train between stations, and anyone waiting at a station when it passes gets carried along. Watch for dynamite, cannons and boulders in the canyons.',
    theme: 'gulch',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    stations,
    preset: { ...DEFAULT_PRESET, chests: 2 },
  };
}

export const BOARDS: BoardDef[] = [lanternHollow(), cosmoJunction(), goldRushGulch()];

export function getBoard(id: string): BoardDef {
  const b = BOARDS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown board ${id}`);
  return b;
}

/**
 * Best board for a player count. The ranges overlap at the edges (4-6, 6-8, 8+), so the
 * pick is: up to 5 players Lantern Hollow, 6-7 Cosmo Junction, 8 or more Gold Rush Gulch.
 */
export function recommendedBoard(players: number): BoardDef {
  if (players >= 8) return BOARDS[2];
  if (players >= 6) return BOARDS[1];
  return BOARDS[0];
}
