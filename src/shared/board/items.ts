import type { ItemId } from './types';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** One line for the item menu. */
  desc: string;
  /** Needs a player picked as the target. */
  target: boolean;
  /** Kenney model shown on the board when it's used. */
  model: string;
  color: string;
  /** Close range: the target has to be within this many spaces (either way along the path). */
  range?: number;
  /** For the bag and the HUD: an attack, and whether it's close or long range. */
  attack?: 'close' | 'long';
}

/** Starter set from the items doc. The rest of the 27 (and the shop) come in the next build. */
export const ITEMS: Record<ItemId, ItemDef> = {
  'spring-boots': { id: 'spring-boots', name: 'Spring Boots', desc: 'Add 5 to your roll', target: false, model: 'platformer/spring', color: '#4cd97b' },
  'double-barrel': { id: 'double-barrel', name: 'Double Barrel', desc: 'Roll 3 dice this turn and move the total', target: false, model: 'pirate/barrel', color: '#c98a4b' },
  'heart-snack': { id: 'heart-snack', name: 'Heart Snack', desc: 'Heal 20 HP', target: false, model: 'platformer/heart', color: '#ff5a6e' },
  'hunting-bow': { id: 'hunting-bow', name: 'Hunting Bow', desc: 'Long range: 10 damage to any player, anywhere', target: true, model: 'forest/weapon-bow', color: '#a8743c', attack: 'long' },
  'pirate-cannon': { id: 'pirate-cannon', name: 'Pirate Cannon', desc: 'Long range: 15 damage to the first player up to 10 spaces ahead', target: false, model: 'pirate/cannon', color: '#555b6e', attack: 'long' },
  cutlass: { id: 'cutlass', name: 'Cutlass', desc: 'Close range: 15 damage to a player within 3 spaces', target: true, model: 'proto/weapon-sword', color: '#e8e8f0', range: 3, attack: 'close' },
  'fuse-bomb': { id: 'fuse-bomb', name: 'Fuse Bomb', desc: 'Close range: 10 damage to everyone within 2 spaces', target: false, model: 'platformer/bomb', color: '#ff5a3d', attack: 'close' },
  'treasure-shovel': { id: 'treasure-shovel', name: 'Treasure Shovel', desc: 'Dig 5 Pit Coin from everyone within 2 spaces', target: false, model: 'pirate/tool-shovel', color: '#d9b26a' },
  'spike-trap': { id: 'spike-trap', name: 'Spike Trap', desc: 'Hide spikes here: the next player to land takes 10', target: false, model: 'platformer/trap-spikes', color: '#9aa3b5' },
  'knight-shield': { id: 'knight-shield', name: 'Knight Shield', desc: 'Block the next hit, steal or swap', target: false, model: 'proto/weapon-shield', color: '#3fa9f5' },
  'swap-pipe': { id: 'swap-pipe', name: 'Swap Pipe', desc: 'Swap places with a player. Your turn ends', target: true, model: 'platformer/pipe', color: '#2ecc71' },
  'slow-roller': { id: 'slow-roller', name: 'Slow Roller', desc: 'Your dice spin in slow motion: stop them on the number you want', target: false, model: 'proto/number-3', color: '#7cf3ff' },
  'high-roller': { id: 'high-roller', name: 'High Roller', desc: 'Your dice only show 4, 5 and 6 this turn', target: false, model: 'proto/number-6', color: '#ffd23f' },
  'sticky-cube': { id: 'sticky-cube', name: 'Sticky Cube', desc: "A player's next roll is 1 to 3", target: true, model: 'proto/figurine-cube-detailed', color: '#b06cff' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Shop prices in Pit Coin: small helpers are cheap, big swings cost more. */
export const SHOP_PRICE: Record<ItemId, number> = {
  'spring-boots': 5,
  'high-roller': 4,
  'slow-roller': 6,
  'heart-snack': 5,
  'sticky-cube': 8,
  'spike-trap': 8,
  'knight-shield': 10,
  'hunting-bow': 10,
  'double-barrel': 12,
  'treasure-shovel': 12,
  'pirate-cannon': 15,
  'swap-pipe': 15,
  cutlass: 9,
  'fuse-bomb': 10,
};

/**
 * Minigame prizes: 1st, 2nd and 3rd each get a random item from their tier (Michael's tier system).
 * Attacks are in every tier, so there's always something to hurt people with.
 */
export const PRIZE_TIERS: ItemId[][] = [
  ['pirate-cannon', 'fuse-bomb', 'hunting-bow', 'cutlass', 'double-barrel', 'swap-pipe'],
  ['cutlass', 'hunting-bow', 'fuse-bomb', 'knight-shield', 'treasure-shovel', 'high-roller', 'spike-trap'],
  ['cutlass', 'spike-trap', 'spring-boots', 'heart-snack', 'sticky-cube', 'slow-roller'],
];
/** A full bag turns the prize into this much Pit Coin. */
export const PRIZE_COINS = 5;
/** How many items a shop has on the counter at once. */
export const SHOP_STOCK = 4;

/** The item bag's grid: every item in a fixed order, ITEM_COLS per row. */
export const ITEM_GRID = ITEM_IDS;
export const ITEM_COLS = 5;
