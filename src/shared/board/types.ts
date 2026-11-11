import type { Rng } from '../rng';

/**
 * Board spaces. Key, Heart and Thorn are the everyday spaces (about 70% of every board).
 * The rest are special spaces from the board spec.
 */
export type SpaceType =
  | 'key' // +3 Choppy Keys
  | 'heart' // +6 HP
  | 'thorn' // -3 Choppy Keys
  | 'crate' // a random item
  | 'lucky' // +5 to 10 keys, or a rare warp to a Crown Chest
  | 'event' // the map's own gimmick
  | 'post' // Claim Post
  | 'duel' // 1v1 duel
  | 'stew' // Stew Battle (2 teams)
  | 'fountain' // Heart Fountain: heal 10 passing, full on landing
  | 'spring' // bounce 1 to 5 spaces ahead
  | 'cannon' // aim at a player within 6 spaces
  | 'vent' // Cosmo airlock vent: blasted 3 spaces back
  | 'dynamite' // Gulch: 15 damage to you and anyone within 1 space
  | 'snare' // Hollow root snare (only at night): next roll capped at 3
  | 'wisp' // Hollow: pay to rob the leader
  | 'station' // Gulch train station
  | 'counter' // Cosmo laser gate
  | 'camp' // Respawn Camp
  | 'shop'; // pass-by item shop: spend keys on items (doesn't use up a step)

export interface BoardNode {
  id: string;
  x: number; // world units
  z: number;
  /** Height above the ground plane (hills, decks, bridges). */
  y: number;
  type: SpaceType;
  next: string[];
  /** Lantern Hollow: different exits by day and by night. */
  gate?: { day: string[]; night: string[] };
  /** Laser Lane spaces on Cosmo Junction. */
  lane?: boolean;
  /** Gold Rush Gulch: which canyon lane a space is on (boulders roll down one lane each round). */
  canyon?: number;
}

/** Every number the board uses. Kept per map so a pre-game settings screen can change them later. */
export interface BoardPreset {
  startKeys: number;
  maxHp: number;
  crownPrice: number;
  chests: number;
  /** A new chest is never placed within this many spaces of a player. */
  chestMinDist: number;
  keySpace: number;
  heartSpace: number;
  thornSpace: number;
  /** Key and Heart Spaces pay double in this many final turns. */
  doubleTurns: number;
  postToll: number;
  postSting: number;
  postStingHeal: number;
  passToll: number;
  passSting: number;
  postStealCost: number;
  stewWin: number;
  stewLanderBonus: number;
  sitOutKeys: number;
  fountainPass: number;
  cannonDamage: number;
  cannonRange: number;
  hazardDamage: number;
  laserDamage: number;
  dynamiteDamage: number;
  maxItems: number;
  startItems: number;
}

export const DEFAULT_PRESET: BoardPreset = {
  startKeys: 10,
  maxHp: 30,
  crownPrice: 40,
  chests: 1,
  chestMinDist: 6,
  keySpace: 3,
  heartSpace: 6,
  thornSpace: 3,
  doubleTurns: 5,
  postToll: 5,
  postSting: 8,
  postStingHeal: 4,
  passToll: 1,
  passSting: 2,
  postStealCost: 10,
  stewWin: 10,
  stewLanderBonus: 5,
  sitOutKeys: 5,
  fountainPass: 10,
  cannonDamage: 15,
  cannonRange: 6,
  hazardDamage: 10,
  laserDamage: 15,
  dynamiteDamage: 15,
  maxItems: 3,
  startItems: 1,
};

export interface BoardDef {
  id: string;
  name: string;
  /** Recommended player range, shown in board select. */
  players: [number, number];
  tagline: string;
  gimmick: string;
  theme: 'hollow' | 'cosmo' | 'gulch';
  nodes: Record<string, BoardNode>;
  start: string;
  /** Where knocked-out players come back. */
  camp: string;
  /** Spots a Crown Chest can appear on (15 to 25 per map). */
  crownSpots: string[];
  /** Stations in train order (Gold Rush Gulch). */
  stations?: string[];
  /** Lantern Hollow: pairs of spaces a toppling pine can fall across. */
  pines?: string[][];
  preset: BoardPreset;
  /** Hills and mountains under the board. Spaces on terrain boards sit on this ground. */
  hills?: Hill[];
  /** The board was laid out small and blown up by this much (spaces, hills and scenery), so the spaces sit further apart. */
  spread?: number;
  /** Weather zones (see weather.ts). */
  weather?: import('./weather').WeatherZone[];
}

/** A smooth hill: flat top out to `top` (fraction of r), easing down to nothing at radius r. */
export interface Hill {
  x: number;
  z: number;
  r: number;
  h: number;
  top?: number;
  /** Stretch along x (1 = round). */
  sx?: number;
}

export type ItemId =
  | 'spring-boots'
  | 'double-barrel'
  | 'heart-snack'
  | 'hunting-bow'
  | 'pirate-cannon'
  | 'treasure-shovel'
  | 'spike-trap'
  | 'knight-shield'
  | 'swap-pipe'
  | 'sticky-cube';

export interface BoardPlayer {
  id: string;
  node: string;
  keys: number;
  crowns: number;
  hp: number;
  items: ItemId[];
  /** Knocked out: skips their next move, then plays on from the Respawn Camp. */
  ko: boolean;
  /** Next roll is capped (Sticky Cube, Root Snare). 0 = no cap. */
  rollCap: number;
  /** Extra steps or dice for the next roll (Spring Boots, Double Barrel). */
  rollBonus: number;
  dice: number;
  shield: boolean;
  /** Turn number when this player last used an item. */
  usedItemTurn: number;
  stats: { damageTaken: number; damageDealt: number; kos: number; spaces: number; sevens: number; wins: number; doubles?: number };
}

export interface ClaimPost {
  owner: string;
  mode: 'toll' | 'sting';
}

/** Something the current player is choosing. */
export type Prompt =
  | { kind: 'crown'; node: string }
  | { kind: 'wisp' }
  | { kind: 'train'; to: string }
  | { kind: 'claim'; node: string }
  | { kind: 'steal'; node: string }
  | { kind: 'items'; sel: number }
  | { kind: 'shop'; node: string; stock: ItemId[]; sel: number }
  | { kind: 'target'; purpose: 'item' | 'duel' | 'cannon'; item?: ItemId; options: string[]; sel: number };

/** A minigame the board starts in the middle of a turn. */
export interface BoardEvent {
  kind: 'duel' | 'stew';
  gameId: string;
  lander: string;
  /** Duel: the two players. Stew: everyone playing. */
  players: string[];
  /** Stew: team index (0 or 1) per player. */
  teams?: Record<string, number>;
  sitOut?: string | null;
  /** Stew: the two players the sit-out wheel picks between. */
  wheel?: string[];
}

export type BoardSub =
  | 'tour' // Square Brian shows the board off, one feature per press of A
  | 'orderRoll' // game start: everyone rolls at once for turn order
  | 'orderShow' // the turn order is shown before turn 1
  | 'turnIntro'
  | 'roll'
  | 'rolling' // the die spins for a moment of suspense
  | 'rolled' // the number flashes up
  | 'move'
  | 'branch'
  | 'prompt'
  | 'land'
  | 'wheel'
  | 'itemSpin' // an Item Crate spins a reel of items before giving one
  | 'gamble' // Gold Strike: a reel of payouts and cave-ins
  | 'event' // waiting for the party to run a duel or Stew Battle
  | 'roundEnd' // hazards go off after everyone has moved
  | 'done';

export interface Hazards {
  /** Cosmo: spaces meteors will hit at the end of this round. */
  meteors: string[];
  /** Hollow: the pine (pair of spaces) that falls at the end of this night round. */
  pine: string[];
  /** Gulch: canyon lane the next boulder rolls down. */
  boulderLane: number;
  /** Spike traps hidden on spaces, by owner. */
  spikes: Record<string, string>;
}

export interface BoardState {
  boardId: string;
  preset: BoardPreset;
  turn: number; // 1-based
  maxTurns: number;
  order: string[];
  /** Turn order from the opening roll; the minigame winner jumps ahead of it each turn. */
  baseOrder: string[];
  /** Opening roll per player on the 12-sided die (no two the same). Missing until they roll. */
  orderRolls: Record<string, number>;
  /** Board tour before the first roll (null once it's over or when skipped). */
  tour: { steps: import('./tour').TourStep[]; i: number } | null;
  /** Players who won the last minigame and so go first this turn. */
  wonFirst: string[];
  cur: number;
  sub: BoardSub;
  t: number;
  roll: number;
  /** Dice rolled so far this turn, one per A press. */
  rolls: number[];
  /** How many dice this roll has (2 normally, 3 with Double Barrel, 1 when snared). */
  diceN: number;
  /** The dice matched: +5 keys. */
  doubles: boolean;
  stepsLeft: number;
  hop: { from: string; to: string; t: number; back?: boolean } | null;
  /** Steps still to slide backward (airlock vents). */
  pushBack: number;
  /** A Spring Space already bounced this move (so springs don't chain forever). */
  bounced: boolean;
  branch: { options: string[]; sel: number } | null;
  prompt: Prompt | null;
  players: Record<string, BoardPlayer>;
  /** Spaces with a Crown Chest on them. */
  crowns: string[];
  lastChest: string[];
  posts: Record<string, ClaimPost>;
  hazards: Hazards;
  event: BoardEvent | null;
  /** After an event or hazards, where the board picks up again. */
  resume: BoardSub | null;
  night: boolean;
  weather: import('./weather').WeatherState;
  counter: number;
  banner: { text: string; color: string; t: number } | null;
  /** Item Crate reel: the items it scrolls through, ending on the one you get. */
  spin?: { reel: ItemId[]; at: number; pick: ItemId } | null;
  /** Gold Strike reel: key amounts (negative = cave-in), ending on the result. */
  gamble?: { reel: number[]; at: number; pick: number } | null;
  /** Short-lived effects for the 3D view: hits, heals, knockouts, item use. */
  fx: { n: number; kind: string; node: string; id?: string; amount?: number; t: number }[];
  fxSeq: number;
  log: string[];
  rng: Rng;
}

export const WISP_PRICE = 10;
export const TRAIN_PRICE = 5;
export const COUNTER_START = 8;
export const HOP_TIME = 0.42;
