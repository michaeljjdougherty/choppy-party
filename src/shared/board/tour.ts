import type { BoardDef, BoardState, SpaceType } from './types';

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
  ['key', 'Key Spaces', (_d, s) => `Blue round spaces give you ${s.preset.keySpace} Choppy Keys. Red spiky ones take ${s.preset.thornSpace}. Hearts heal ${s.preset.heartSpace} HP.`],
  ['lucky', 'Lucky Stars', () => 'Star spaces are lucky: a pile of keys, or once in a while a warp right next to a Crown Chest.'],
  ['crate', 'Item Crates', () => 'Square crates hand you a random item. You can use one item per turn, before you roll.'],
  ['post', 'Claim Posts', (_d, s) => `Land on a Claim Post to make it yours. A Toll Post charges visitors ${s.preset.postToll} keys, a Sting Post hits them for ${s.preset.postSting}.`],
  ['duel', 'Duel Shields', () => 'Shield spaces start a duel. Pick a rival; the winner jumps right behind a Crown Chest.'],
  ['stew', 'Stew Battles', () => 'The other shield is a Stew Battle: everyone splits into two teams and the winners share the pot.'],
  ['fountain', 'Heart Fountain', () => 'Walk past the Heart Fountain to heal. Stop on it and you are fully healed.'],
  ['spring', 'Springs', () => 'Flower springs bounce you up to five spaces further along.'],
  ['cannon', 'Cannons', (_d, s) => `Octagon cannons let you fire at anyone within ${s.preset.cannonRange} spaces for ${s.preset.cannonDamage} damage.`],
  ['wisp', 'The Wisp', () => 'The Wisp, in the teardrop space, will rob the leader for you, for a price.'],
  ['snare', 'Root Snares', () => 'Down in the cellar the roots wake up at night. Get caught and your next roll is 1 to 3.'],
  ['vent', 'Airlock Vents', () => 'Hexagon vents blast you three spaces backward. Mind your step.'],
  ['counter', 'Laser Gate', (_d, s) => `Every pass through the laser gate counts it down. At zero it fires down the lane for ${s.preset.laserDamage}.`],
  ['dynamite', 'Dynamite', () => 'Burst spaces are dynamite: it hurts you and anyone next to you.'],
  ['station', 'Train Stations', () => 'Pay to ride the steam train between stations. Stand at one at round end and it carries you along.'],
  ['camp', 'Respawn Camp', () => 'Run out of HP and you drop half your keys and rest here for a turn.'],
];

const EVENT_TEXT: Record<BoardDef['theme'], [string, string]> = {
  hollow: ['The Bell', 'The diamond is the bell. Land there to swap day and night. Night opens the cellar and a pine falls on someone each round.'],
  cosmo: ['Warp Pads', 'Diamond spaces are warp pads. Step on one and you zap to another somewhere on the station.'],
  gulch: ['Gold Strikes', 'Diamond spaces are gold strikes: usually a pile of keys, sometimes a cave-in that costs you some.'],
};

export function buildTour(def: BoardDef, s: BoardState): TourStep[] {
  const steps: TourStep[] = [{ title: def.name, text: `Welcome to ${def.name}. ${def.tagline} Let me show you around.`, node: null }];
  const firstOf = (t: SpaceType) => Object.values(def.nodes).find((n) => n.type === t)?.id ?? null;
  const chest = s.crowns[0] ?? null;
  if (chest)
    steps.push({
      title: 'Crown Chest',
      text: `That glowing chest holds a Choppy Crown. Reach it with ${s.preset.crownPrice} keys and it's yours. Most crowns at the end wins.${s.preset.chests > 1 ? ` This board has ${s.preset.chests} chests out at once.` : ''}`,
      node: chest,
      also: s.crowns.slice(1),
    });
  const ev = firstOf('event');
  if (ev) steps.push({ title: EVENT_TEXT[def.theme][0], text: EVENT_TEXT[def.theme][1], node: ev });
  for (const [type, title, text] of TYPE_STEPS) {
    const n = type === 'camp' ? def.camp : firstOf(type);
    if (n) steps.push({ title, text: text(def, s), node: n });
  }
  // each map's own hazard
  if (def.theme === 'hollow' && def.pines?.length)
    steps.push({ title: 'Falling Pines', text: 'At night one of these pines topples at the end of every round. Anyone under it gets flattened.', node: def.pines[0][0], also: def.pines[0] });
  if (def.theme === 'cosmo' && s.hazards.meteors.length)
    steps.push({ title: 'Meteor Showers', text: 'Red rings mark where meteors land at the end of the round. Be anywhere else.', node: s.hazards.meteors[0], also: s.hazards.meteors });
  if (def.theme === 'gulch') {
    const lane = Object.values(def.nodes).filter((n) => n.canyon === s.hazards.boulderLane).map((n) => n.id);
    if (lane.length) steps.push({ title: 'Boulders', text: 'Every round a boulder rolls down one canyon. The top-left panel tells you which.', node: lane[Math.floor(lane.length / 2)], also: lane });
  }
  steps.push({ title: "Let's play!", text: 'That is everything. First, everyone rolls to see who goes first.', node: null });
  return steps;
}
