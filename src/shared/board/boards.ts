import type { BoardDef, SpaceType } from './types';
import { DEFAULT_PRESET } from './types';
import { Builder, between, ellipse, roundedRect, trail, type Pt, type Pt3 } from './layout';
import { groundAt } from './terrain';
import type { Hill } from './types';
import type { WeatherZone } from './weather';

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
const pt3 = (b: Builder, id: string): Pt3 => [b.nodes[id].x, b.nodes[id].z, b.nodes[id].y];

/** Nudge points in and out a little so a loop meanders instead of looking ruled. */
function wobble(pts: Pt[], amp: number): Pt[] {
  return pts.map(([x, z], i) => {
    const [px, pz] = pts[(i - 1 + pts.length) % pts.length];
    const [nx, nz] = pts[(i + 1) % pts.length];
    const tx = nx - px, tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1;
    const off = Math.sin(i * 0.9) * amp + Math.sin(i * 2.3 + 1) * amp * 0.4;
    return [x - (tz / l) * off, z + (tx / l) * off];
  });
}

/** A one-way trail between two existing spaces, spaced ~2 apart; returns its new space ids. */
function road(b: Builder, prefix: string, from: string, to: string, via: (Pt | Pt3)[], pattern: string, hills?: Hill[], gap = 2.05): string[] {
  const pts = trail([pt3(b, from), ...via, pt3(b, to)], gap, hills, { ends: false });
  const ids = b.chain(prefix, pts, pattern);
  b.link(from, ids[0]);
  b.link(ids[ids.length - 1], to);
  return ids;
}

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
 * Party-board space mix: lots of plain blue Key Spaces with the rest spread evenly between them,
 * roughly 12% red, 8% events, 5% item crates, 4% lucky stars and 6% hearts, plus two pass-by shops
 * on opposite sides of the main loop. Only plain spaces are re-dealt; map features stay put.
 */
const MIX: [SpaceType, number][] = [
  ['thorn', 0.12],
  ['event', 0.08],
  ['heart', 0.06],
  ['crate', 0.05],
  ['lucky', 0.04],
  ['chunk', 0.03],
];
function partyMix(b: Builder, chains: string[][], crownSpots: string[], keep: string[], shopsAt: number[]): void {
  const plain = new Set(['key', 'thorn', 'heart', 'crate', 'lucky', 'chunk']);
  const all = chains.flat();
  // shops first, on the main loop, never next to another special space
  for (const f of shopsAt) {
    const main = chains[0];
    for (let d = 0; d < main.length; d++) {
      const id = main[(Math.round(f * main.length) + d) % main.length];
      if (b.nodes[id].type === 'key' && !crownSpots.includes(id) && !keep.includes(id)) {
        b.set(id, 'shop');
        break;
      }
    }
  }
  const free = all.filter((id) => plain.has(b.nodes[id].type) && !crownSpots.includes(id) && !keep.includes(id));
  for (const id of free) b.set(id, 'key');
  const total = all.length;
  // deal each type at an even stride through the path, skipping spaces already taken
  let offset = 1;
  for (const [type, share] of MIX) {
    const want = Math.max(1, Math.round(total * share)) - all.filter((id) => b.nodes[id].type === type).length;
    if (want <= 0) continue;
    const stride = free.length / want;
    for (let k = 0; k < want; k++) {
      for (let d = 0; d < free.length; d++) {
        const id = free[(Math.floor(k * stride + offset) + d) % free.length];
        if (b.nodes[id].type === 'key') {
          b.set(id, type);
          break;
        }
      }
    }
    offset += 2;
  }
}

/**
 * LANTERN HOLLOW (4-6 players)
 * A compact haunted pumpkin village. Event spaces ring the town bell and swap day and night,
 * which opens either the Moon Bridge or the Root Cellar through the middle of town.
 * A Wisp at the top of the board will steal coins from the leader, for a price.
 */
function lanternHollow(): BoardDef {
  // the village sits on a hillside: the back of the loop is up on Lantern Hill by the manor
  const hills: Hill[] = [
    { x: 0, z: -12.5, r: 10, h: 3.2, top: 0.35, sx: 1.7 },
    { x: -24, z: -20, r: 12, h: 7, top: 0.1 },
    { x: 22, z: -22, r: 13, h: 8, top: 0.1 },
  ];
  const b = new Builder(hills);
  const loop = b.chain('h', wobble(roundedRect(26, 17, 4, 34), 0.55), 'BBHBRBCBBEBBHBLBRB', true);
  const left = nearest(b, loop, -13, 0);
  const right = nearest(b, loop, 13, 0);
  // the Moon Bridge arches over the pond; the Root Cellar path runs along the ground past it
  const arc = (pts: Pt[], lift: number): Pt3[] => pts.map(([x, z], i) => [x, z, groundAt(hills, x, z) + Math.sin(((i + 1) / (pts.length + 1)) * Math.PI) * lift]);
  const bridge = b.chain('hb', arc(between(pt(b, left), pt(b, right), 7, 2.9), 1.6), 'BLBHBLB');
  const cellar = b.chain('hc', arc(between(pt(b, left), pt(b, right), 7, -2.9), 0), 'BRBCBRB');
  b.link(bridge[bridge.length - 1], right);
  b.link(cellar[cellar.length - 1], right);
  const leftNext = b.nodes[left].next[0];
  b.nodes[left].gate = { day: [leftNext, bridge[0]], night: [leftNext, cellar[0]] };
  b.nodes[left].next = [leftNext, bridge[0], cellar[0]];
  b.set(left, 'key');
  b.set(right, 'key');
  // Chapel Path: a short climb over the hilltop, past the manor gate
  const chapel = road(b, 'hp', nearest(b, loop, -9.5, -8.8), nearest(b, loop, 9.5, -8.8), [[-6, -13.5], [0, -15.5], [6, -13.5]], 'BLBHB', hills);
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
  const crownSpots = chestSpots(b, [...loop, ...bridge, ...cellar, ...chapel], 17, [left, right, start]);
  partyMix(b, [loop, bridge, cellar, chapel], crownSpots, [left, right, start], [0.3, 0.78]);
  return {
    id: 'lantern-hollow',
    name: 'Lantern Hollow',
    players: [4, 6],
    tagline: 'A cozy haunted village on a hillside. Simple, quick, full of steals.',
    gimmick: 'The bell swaps day and night. At night a pine topples each round and Root Snares grab you in the cellar. Pay the Wisp to rob the leader.',
    theme: 'hollow',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    pines,
    hills,
    weather: [
      { kind: 'fog', name: 'Fog Marsh', area: 'the low lane by the pond', nodes: loop.filter((id) => b.nodes[id].z > 6.5 && id !== start) },
      { kind: 'wind', name: "Will-o'-Wind", area: 'the hilltop Chapel Path', nodes: chapel },
    ] satisfies WeatherZone[],
    preset: { ...DEFAULT_PRESET, chests: 1 },
  };
}

/**
 * COSMO JUNCTION (6-8 players)
 * A big space station ring with a Laser Lane straight through the middle. Every pass through
 * the lane gate counts the cannon down; at zero it sweeps the lane and blasts coins off anyone on it.
 * Warp pads on the ring fling you somewhere else entirely.
 */
/** Cosmo Junction is laid out small and then spread out by this much, so the spaces have room to breathe. */
export const COSMO_SPREAD = 1.4;

function cosmoJunction(): BoardDef {
  const b = new Builder();
  const flat = (pts: Pt[], y = 0): Pt3[] => pts.map(([x, z]) => [x, z, y]);
  // one big readable main loop around the deck, with the Command Core standing in the middle
  const ring = b.chain('c', flat(wobble(roundedRect(50, 32, 10, 56), 0.5)), 'B', true);
  const left = nearest(b, ring, -25, 0);
  const right = nearest(b, ring, 25, 0);
  // Laser Lane: the straight shortcut across the middle, right under the Command Core
  const lane = b.chain('cl', between(pt(b, left), pt(b, right), 17), 'B');
  for (const id of lane) b.nodes[id].lane = true;
  b.link(left, lane[0]);
  b.link(lane[lane.length - 1], right);
  // the Skywalk: a raised detour behind the Core, and the Docking Arm swinging out over space
  const sky = road(b, 'cs', nearest(b, ring, -14, -16), nearest(b, ring, 14, -16), [[-9, -11.8, 1.2], [0, -11.2, 1.8], [9, -11.8, 1.2]], 'B', undefined, 2.6);
  const dock = road(b, 'ck', nearest(b, ring, -24, 7), nearest(b, ring, -24, -7), [[-29.5, 9.5, 1], [-34.5, 5, 2.2], [-34.5, -5, 2.2], [-29.5, -9.5, 1]], 'B', undefined, 2.6);
  b.set(left, 'key');
  b.set(right, 'key');
  b.set(lane[0], 'counter');
  const start = ring[0];
  b.set(start, 'camp');
  sprinkle(b, ring, 'post', [0.12, 0.37, 0.62, 0.87]);
  sprinkle(b, ring, 'duel', [0.21, 0.71]);
  sprinkle(b, ring, 'stew', [0.46]);
  sprinkle(b, ring, 'vent', [0.16, 0.54, 0.79]);
  sprinkle(b, ring, 'spring', [0.04]);
  b.set(lane[8], 'stew');
  b.set(sky[2], 'event');
  b.set(dock[3], 'event');
  const crownSpots = chestSpots(b, [...ring, ...lane, ...sky, ...dock], 22, [left, right, start]);
  partyMix(b, [ring, lane, sky, dock], crownSpots, [start, left, right], [0.3, 0.8]);
  // glass domes along the ring keep you safe from solar flares
  const domes = [0.125, 0.375, 0.625, 0.875].flatMap((f) => {
    const i = Math.round(f * ring.length);
    return [ring[(i - 1 + ring.length) % ring.length], ring[i % ring.length], ring[(i + 1) % ring.length]];
  });
  const shelters = [...new Set([...domes, start])];
  return {
    id: 'cosmo-junction',
    name: 'Cosmo Junction',
    players: [6, 8],
    tagline: 'A space station loop with a laser shortcut, a skywalk and a docking arm.',
    gimmick: 'Every pass through the laser gate counts it down, and at zero it hits everyone in the lane for 15. Meteor targets show where rocks will land next round. Airlock vents blast you backward. Event spaces are warp pads.',
    theme: 'cosmo',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    weather: [
      { kind: 'flare', name: 'Solar Flare', area: 'the open outer ring', nodes: ring.filter((id) => !shelters.includes(id) && b.nodes[id].type !== 'shop'), shelters },
      { kind: 'lowgrav', name: 'Low Gravity', area: 'the Docking Arm', nodes: dock },
    ] satisfies WeatherZone[],
    preset: { ...DEFAULT_PRESET, chests: 1 },
  };
}

/**
 * GOLD RUSH GULCH (8+ players)
 * The biggest board: a frontier boomtown with two crowns out at once so nobody waits long for a shot.
 * A steam train loops between four stations; pay the fare to ride ahead. Event spaces are mine shafts.
 */
function goldRushGulch(): BoardDef {
  const hills: Hill[] = [
    // Bonanza Peak behind town, with the mine at the top
    { x: 0, z: -34, r: 18, h: 8.5, top: 0.18, sx: 1.3 },
    // a low mesa on the south side
    { x: 0, z: 22.5, r: 7.5, h: 2.4, top: 0.45, sx: 1.3 },
    // buttes out in the desert (scenery)
    { x: -48, z: -26, r: 13, h: 15, top: 0.62 },
    { x: 50, z: -20, r: 11, h: 12, top: 0.62 },
    { x: -54, z: 18, r: 10, h: 9, top: 0.6 },
    { x: 52, z: 24, r: 9, h: 8, top: 0.6 },
  ];
  const b = new Builder(hills);
  const loop = b.chain('g', wobble(roundedRect(44, 28, 6, 62), 0.5), 'BBHBRBCBBEBBLBHBRB', true);
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
  // the mountain trail: switchbacks up Bonanza Peak to the mine, and down the far side
  const trailUp = road(b, 'gm', nearest(b, loop, -14.5, -14), nearest(b, loop, 14.5, -14), [
    [-15, -18.5], [-7.5, -19.5], [-6.5, -22.5], [-18, -23.5], [-18.5, -27], [-8, -28], [-5, -32], [0, -34.5], [5, -32], [14.5, -29.5], [15.5, -26], [6.5, -25], [6.5, -21.5], [16, -20]
  ], 'BBLBHBCBEBBLBRBBHBB', hills);
  // a ledge across the mountain face cuts the climb short
  const ledge = road(b, 'gl', nearest(b, trailUp, -7, -21), nearest(b, trailUp, 6.5, -23), [[0, -22.6]], 'BR', hills);
  // the scenic route over the mesa
  const mesa = road(b, 'gs', nearest(b, loop, 10, 14), nearest(b, loop, -10, 14), [[8, 19], [0, 22.5], [-8, 19]], 'BLBHB', hills);
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
  put('dynamite', [0.17, 0.45, 0.62, 0.94]);
  put('cannon', [0.2, 0.53, 0.78]);
  b.set(west[3], 'dynamite');
  const crownSpots = chestSpots(b, [...loop, ...west, ...east, ...trailUp, ...ledge, ...mesa], 25, [...skip]);
  partyMix(b, [loop, west, east, trailUp, ledge, mesa], crownSpots, [...skip], [0.3, 0.8]);
  return {
    id: 'gold-rush-gulch',
    name: 'Gold Rush Gulch',
    players: [8, 10],
    tagline: 'A boomtown under Bonanza Peak, with a mine at the top.',
    gimmick: 'Two Chobglob Chests are out at once. Ride the steam train between stations, and anyone waiting at a station when it passes gets carried along. Watch for dynamite, cannons and boulders in the canyons.',
    theme: 'gulch',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    stations,
    hills,
    weather: [
      { kind: 'sandstorm', name: 'Sandstorm', area: 'the west dunes', nodes: loop.filter((id) => b.nodes[id].x < -16.5 && id !== start) },
      { kind: 'flood', name: 'Flash Flood', area: 'the east riverbed', nodes: loop.filter((id) => b.nodes[id].x > 16.5 && id !== start) },
      { kind: 'heat', name: 'Heatwave', area: 'the south salt flats', nodes: loop.filter((id) => b.nodes[id].z > 11 && Math.abs(b.nodes[id].x) < 16.5 && !mesa.includes(id) && loop.indexOf(id) > 4 && loop.indexOf(id) < loop.length - 4) },
    ] satisfies WeatherZone[],
    preset: { ...DEFAULT_PRESET, chests: 2 },
  };
}

/**
 * STEW COURT (4-8 players)
 * A basketball court floating in deep space. One big oval runs around the court, with the two hoops
 * at either end: the lit hoop is the Crown Chest, and it switches ends every time someone buys a crown.
 * Two one-way Half-Court Lanes cut straight across the middle (each skips one hoop), and the
 * Bleacher Run climbs through floating bleachers behind the far sideline.
 */
/** Stew Court is laid out small and then spread out by this much. */
export const COURT_SPREAD = 1.4;
/** Court size before spreading (the floor is a little bigger than the loop). */
export const COURT = { w: 50, h: 30, hoopX: 25 };

function stewCourt(): BoardDef {
  const b = new Builder();
  const flat = (pts: Pt[], y = 0): Pt3[] => pts.map(([x, z]) => [x, z, y]);
  // the oval: long sides along the sidelines, round ends wrapping under each hoop
  const loop = b.chain('s', flat(roundedRect(COURT.w, COURT.h, 13, 52)), 'B', true);
  const hoopW = nearest(b, loop, -COURT.hoopX, 0);
  const hoopE = nearest(b, loop, COURT.hoopX, 0);
  // Half-Court Lanes: two one-way cuts either side of the centre circle, running opposite ways
  const topW = nearest(b, loop, -5, -15);
  const botW = nearest(b, loop, -5, 15);
  const topE = nearest(b, loop, 5, -15);
  const botE = nearest(b, loop, 5, 15);
  const laneW = b.chain('sw', flat(between(pt(b, topW), pt(b, botW), 9, 0.6)), 'B');
  b.link(topW, laneW[0]);
  b.link(laneW[laneW.length - 1], botW);
  const laneE = b.chain('se', flat(between(pt(b, botE), pt(b, topE), 9, 0.6)), 'B');
  b.link(botE, laneE[0]);
  b.link(laneE[laneE.length - 1], topE);
  // Bleacher Run: up through the floating bleachers behind the far sideline and back down
  const bleach = road(b, 'sb', nearest(b, loop, -15, -15), nearest(b, loop, 15, -15), [[-12, -20, 1.4], [-5, -22, 2.4], [5, -22, 2.4], [12, -20, 1.4]], 'B', undefined, 2.6);
  const start = loop[0];
  b.set(start, 'camp');
  const forks = [topW, botW, topE, botE];
  for (const id of [...forks, hoopW, hoopE]) b.set(id, 'key');
  const skip = new Set([start, hoopW, hoopE, ...forks]);
  // keep the camp's neighbours calm, so a fresh respawn isn't walking straight into trouble
  for (let d = -2; d <= 2; d++) skip.add(loop[(d + loop.length) % loop.length]);
  const put = (type: SpaceType, at: number[]) =>
    at.forEach((f) => {
      let i = Math.round(f * loop.length) % loop.length;
      while (skip.has(loop[i])) i = (i + 1) % loop.length;
      b.set(loop[i], type);
      skip.add(loop[i]);
    });
  put('post', [0.13, 0.37, 0.63, 0.87]);
  put('duel', [0.2, 0.7]);
  put('stew', [0.5]);
  put('fountain', [0.43]);
  put('spring', [0.08, 0.58]);
  put('oop', [0.24, 0.76]);
  b.set(laneW[4], 'stew');
  b.set(laneE[4], 'duel');
  b.set(bleach[Math.floor(bleach.length / 2)], 'lucky');
  // the Chop Pit: a caged walkway floating off the east corner. Nothing leads in; Alley-Oop Pads in the
  // Choppy Verse throw you in. Three spaces in four hurt, and it lets out onto the bottom sideline
  // a closed ring: you go round and round until you roll your way out (see the Chop Pit rules in engine.ts)
  const pitPts = ellipse(4.6, 7, 14).map(([x, z]) => [x + 37, z + 12, 0] as Pt3);
  const pit = b.chain('sp', pitPts, 'RCRBDRBR', true);
  pit.forEach((id, i) => (i % 8 === 4 ? b.set(id, 'dynamite') : i % 8 === 1 ? b.set(id, 'chunk') : 0));
  // four Verse Flip spaces, one on each side of the oval, swap the Fucci Verse and the Choppy Verse
  const flips = [0.17, 0.4, 0.66, 0.9].map((f) => {
    let i = Math.round(f * loop.length) % loop.length;
    while (skip.has(loop[i])) i = (i + 1) % loop.length;
    b.set(loop[i], 'event');
    skip.add(loop[i]);
    return loop[i];
  });
  // the hoops are the Crown Chests
  const crownSpots = [hoopW, hoopE];
  partyMix(b, [loop, laneW, laneE, bleach], crownSpots, [...skip, ...laneW.slice(3, 6), ...laneE.slice(3, 6)], [0.3, 0.8]);
  // exactly four flips: any event spaces the mix dealt become lucky stars instead
  for (const id of [...loop, ...laneW, ...laneE, ...bleach]) if (b.nodes[id].type === 'event' && !flips.includes(id)) b.set(id, 'lucky');
  return {
    id: 'stew-court',
    name: 'Stew Court',
    players: [4, 8],
    tagline: 'A basketball court that flips between the Fucci Verse and the evil Choppy Verse.',
    gimmick: 'The glowing hoop holds the Chobglob, and it switches ends every time someone buys it. Four Verse Flip spaces swap the normal Fucci Verse for the Choppy Verse, a burning court floating in space, where Evil LeBron drops in at the end of every round to knock someone out.',
    theme: 'court',
    nodes: b.nodes,
    start,
    camp: start,
    crownSpots,
    pit,
    boss: { name: 'Evil LeBron', every: 1 },
    weather: [
      { kind: 'lowgrav', name: 'Hang Time', area: 'the floating Bleacher Run', nodes: bleach, tour: `The Bleacher Run floats in low gravity: Hang Time! Roll from up there and you get +2, but at every fork you float off down a random path.` },
      { kind: 'wind', name: 'Solar Wind', area: 'the far sideline', nodes: loop.filter((id) => b.nodes[id].z < -12 && Math.abs(b.nodes[id].x) < 13 && !forks.includes(id)), tour: 'A Solar Wind blows across the far sideline. At the end of each round it pushes everyone there 2 spaces, and it changes direction every round.' },
    ] satisfies WeatherZone[],
    preset: { ...DEFAULT_PRESET, chests: 1 },
  };
}

/** Blow a board up by k: every space, and the hills under them, k times further apart (and hills k times taller). */
function spread(def: BoardDef, k: number): BoardDef {
  for (const n of Object.values(def.nodes)) {
    n.x *= k;
    n.y *= k;
    n.z *= k;
  }
  def.hills = def.hills?.map((h) => ({ ...h, x: h.x * k, z: h.z * k, r: h.r * k, h: h.h * k }));
  def.spread = k;
  return def;
}

/** The board as it was laid out, before spreading (the scenery is built in these coordinates). */
export function unspread(def: BoardDef): BoardDef {
  const k = def.spread ?? 1;
  if (k === 1) return def;
  const nodes = Object.fromEntries(Object.entries(def.nodes).map(([id, n]) => [id, { ...n, x: n.x / k, y: n.y / k, z: n.z / k }]));
  const hills = def.hills?.map((h) => ({ ...h, x: h.x / k, z: h.z / k, r: h.r / k, h: h.h / k }));
  return { ...def, nodes, hills, spread: 1 };
}

export const BOARDS: BoardDef[] = [spread(lanternHollow(), 1.35), cosmoJunction(), spread(goldRushGulch(), 1.45), spread(stewCourt(), COURT_SPREAD)];

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
