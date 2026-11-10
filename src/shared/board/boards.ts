import type { BoardDef } from './types';
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

/**
 * LANTERN HOLLOW (4-6 players)
 * A compact haunted pumpkin village. Event spaces ring the town bell and swap day and night,
 * which opens either the Moon Bridge or the Root Cellar through the middle of town.
 * A Wisp at the top of the board will steal coins from the leader, for a price.
 */
function lanternHollow(): BoardDef {
  const b = new Builder();
  const loop = b.chain('h', roundedRect(26, 17, 4, 34), 'BBRBEBBLBBRBBEB', true);
  const left = nearest(b, loop, -13, 0);
  const right = nearest(b, loop, 13, 0);
  const bridge = b.chain('hb', between(pt(b, left), pt(b, right), 5, 2.6), 'BLBEB');
  const cellar = b.chain('hc', between(pt(b, left), pt(b, right), 5, -2.6), 'BRBLB');
  b.link(bridge[bridge.length - 1], right);
  b.link(cellar[cellar.length - 1], right);
  const leftNext = b.nodes[left].next[0];
  b.nodes[left].gate = { day: [leftNext, bridge[0]], night: [leftNext, cellar[0]] };
  b.nodes[left].next = [leftNext, bridge[0], cellar[0]];
  b.set(left, 'blue');
  b.set(right, 'blue');
  const wisp = nearest(b, loop, 0, -8.5);
  b.set(wisp, 'wisp');
  const start = loop[0];
  b.set(start, 'blue');
  const crownSpots = [
    nearest(b, loop, -8, 8.5),
    nearest(b, loop, -13, -5),
    nearest(b, loop, 8, -8.5),
    nearest(b, loop, 13, 5),
    bridge[2],
    cellar[2],
  ];
  for (const c of crownSpots) b.set(c, 'blue');
  return {
    id: 'lantern-hollow',
    name: 'Lantern Hollow',
    players: [4, 6],
    tagline: 'A cozy haunted village. Tight, tricky and full of steals.',
    gimmick: 'Event spaces ring the bell and swap day and night, opening the Moon Bridge or the Root Cellar. Pay the Wisp to rob the leader.',
    theme: 'hollow',
    nodes: b.nodes,
    start,
    crownSpots,
    crownsActive: 1,
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
  const ring = b.chain('c', ellipse(18, 11.5, 46), 'BBRBBEBLBBRBBEBB', true);
  const left = nearest(b, ring, -18, 0);
  const right = nearest(b, ring, 18, 0);
  const lane = b.chain('cl', between(pt(b, left), pt(b, right), 11), 'BBLBBRBBLBB');
  for (const id of lane) b.nodes[id].lane = true;
  b.link(left, lane[0]);
  b.link(lane[lane.length - 1], right);
  b.set(lane[0], 'counter');
  const start = ring[0];
  b.set(start, 'blue');
  const crownSpots = [
    nearest(b, ring, -10, 10),
    nearest(b, ring, -17, -5),
    nearest(b, ring, -4, -11.5),
    nearest(b, ring, 10, -10),
    nearest(b, ring, 17, 5),
    nearest(b, ring, 6, 11.5),
    lane[5],
  ];
  for (const c of crownSpots) b.set(c, 'blue');
  return {
    id: 'cosmo-junction',
    name: 'Cosmo Junction',
    players: [6, 8],
    tagline: 'A sprawling space station with routes everywhere.',
    gimmick: 'The Laser Lane cuts through the middle: every pass counts the cannon down, and at zero it blasts half the coins off anyone in the lane. Event spaces are warp pads.',
    theme: 'cosmo',
    nodes: b.nodes,
    start,
    crownSpots,
    crownsActive: 1,
  };
}

/**
 * GOLD RUSH GULCH (8+ players)
 * The biggest board: a frontier boomtown with two crowns out at once so nobody waits long for a shot.
 * A steam train loops between four stations; pay the fare to ride ahead. Event spaces are mine shafts.
 */
function goldRushGulch(): BoardDef {
  const b = new Builder();
  const loop = b.chain('g', roundedRect(44, 28, 6, 62), 'BBRBBEBBLBBRBEBB', true);
  const topW = nearest(b, loop, -8, -14);
  const botW = nearest(b, loop, -8, 14);
  const topE = nearest(b, loop, 8, -14);
  const botE = nearest(b, loop, 8, 14);
  // two cut-throughs that run in opposite directions
  const west = b.chain('gw', between(pt(b, topW), pt(b, botW), 7, 1.5), 'BLBEBRB');
  b.link(topW, west[0]);
  b.link(west[west.length - 1], botW);
  const east = b.chain('ge', between(pt(b, botE), pt(b, topE), 7, 1.5), 'BRBEBLB');
  b.link(botE, east[0]);
  b.link(east[east.length - 1], topE);
  const stations = [nearest(b, loop, -22, 14), nearest(b, loop, -22, -14), nearest(b, loop, 22, -14), nearest(b, loop, 22, 14)];
  for (const s of stations) b.set(s, 'station');
  const start = loop[0];
  b.set(start, 'blue');
  const crownSpots = [
    nearest(b, loop, -15, 14),
    nearest(b, loop, -22, 0),
    nearest(b, loop, -15, -14),
    nearest(b, loop, 15, -14),
    nearest(b, loop, 22, 0),
    nearest(b, loop, 15, 14),
    west[3],
    east[3],
  ];
  for (const c of crownSpots) b.set(c, 'blue');
  return {
    id: 'gold-rush-gulch',
    name: 'Gold Rush Gulch',
    players: [8, 10],
    tagline: 'A huge frontier boomtown built for a crowd.',
    gimmick: 'Two crowns are out at once. Pay the fare at any station to ride the steam train to the next one. Event spaces are mine shafts: strike gold or hit dynamite.',
    theme: 'gulch',
    nodes: b.nodes,
    start,
    crownSpots,
    crownsActive: 2,
    stations,
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
