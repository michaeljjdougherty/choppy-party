import type { BoardDef, BoardState, SpaceType } from './types';
import { WEATHER_TOUR } from './weather';

/**
 * Square Brian's board tour before the first roll: the camera flies to each feature, it glows,
 * Brian explains it, and nothing moves on until someone presses A. The host can skip it with X.
 */
export interface TourStep {
  title: string;
  text: string;
  /** Space to fly to and highlight; null = the whole board. */
  node: string | null;
  /** Extra spaces lit up with it (a hazard lane, a pair of pines). */
  also?: string[];
}

const TYPE_STEPS: [SpaceType, string, (d: BoardDef, s: BoardState) => string][] = [
  ['duel', 'Duel Shields', () => 'Shield spaces start a duel. Pick a rival; the winner jumps right behind a Chobglob Chest.'],
  ['stew', 'Stew Battles', () => 'The other shield is a Stew Battle: everyone splits into two teams and the winners share the pot.'],
  ['chunk', 'CHUNK SPACE', () => "Stay off the dark skull spaces. Land on one and Mister Chunk stomps in to spin his reel of nasty surprises: taxes, smashes, stolen items, even a stolen Chobglob."],
  ['cannon', 'Cannons', (_d, s) => `Octagon cannons let you fire at anyone within ${s.preset.cannonRange} spaces for ${s.preset.cannonDamage} damage.`],
  ['wisp', 'The Wisp', () => 'The Wisp, in the teardrop space, will rob the leader for you, for a price.'],
  ['snare', 'Root Snares', () => 'Down in the cellar the roots wake up at night. Get caught and your next roll is 1 to 3.'],
  ['vent', 'Airlock Vents', () => 'Hexagon vents blast you three spaces backward. Mind your step.'],
  ['counter', 'Laser Gate', (_d, s) => `Every pass through the laser gate counts it down. At zero it fires down the lane for ${s.preset.laserDamage}.`],
  ['dynamite', 'Dynamite', () => 'Burst spaces are dynamite: it hurts you and anyone next to you.'],
  ['station', 'Train Stations', () => 'Pay to ride the steam train between stations. Stand at one at round end and it carries you along.'],
];

const EVENT_TEXT: Record<BoardDef['theme'], [string, string]> = {
  hollow: ['The Bell', 'The diamond is the bell. Land there to swap day and night. Night opens the cellar and a pine falls on someone each round.'],
  cosmo: ['Warp Pads', 'Diamond spaces are warp pads. Step on one and you zap to another somewhere on the station.'],
  gulch: ['Gold Strikes', 'The gold question-mark spaces are gold strikes. Land on one and spin the reel: usually a pile of Pit Coin, sometimes a cave-in that costs you.'],
};

export function buildTour(def: BoardDef, s: BoardState): TourStep[] {
  // only what's special about this map, plus the battles: the everyday spaces explain themselves
  const steps: TourStep[] = [
    { title: def.name, text: `Welcome to ${def.name}. ${def.tagline} Bring ${s.preset.crownPrice} Pit Coin to a Chobglob Chest for a Chobglob. Here's what's special.`, node: null },
  ];
  const firstOf = (t: SpaceType) => Object.values(def.nodes).find((n) => n.type === t)?.id ?? null;
  const ev = firstOf('event');
  if (ev) steps.push({ title: EVENT_TEXT[def.theme][0], text: EVENT_TEXT[def.theme][1], node: ev });
  for (const [type, title, text] of TYPE_STEPS) {
    const n = firstOf(type);
    if (n) steps.push({ title, text: text(def, s), node: n });
  }
  // each map's own hazard
  if (def.theme === 'hollow' && def.pines?.length)
    steps.push({ title: 'Falling Pines', text: 'At night one of these pines topples at the end of every round. Anyone under it gets flattened.', node: def.pines[0][0], also: def.pines[0] });
  if (def.theme === 'cosmo' && s.hazards.meteors.length)
    steps.push({ title: 'Meteor Showers', text: 'Red rings mark where meteors land at the end of the round. Be anywhere else.', node: s.hazards.meteors[0], also: s.hazards.meteors });
  if (def.theme === 'gulch') {
    const lane = Object.values(def.nodes).filter((n) => n.canyon === s.hazards.boulderLane).map((n) => n.id);
    if (lane.length) steps.push({ title: 'Boulders', text: 'Every round a boulder rolls down one of the rocky canyons. The warning signs with the blinking light show which one.', node: lane[Math.floor(lane.length / 2)], also: lane });
  }
  // weather zones, each lit up end to end
  for (const z of def.weather ?? []) {
    const mid = z.nodes[Math.floor(z.nodes.length / 2)];
    if (mid) steps.push({ title: z.name, text: WEATHER_TOUR[z.kind], node: mid, also: z.nodes });
  }
  steps.push({ title: "Let's play!", text: 'That is everything. First, everyone rolls to see who goes first.', node: null });
  return steps;
}
