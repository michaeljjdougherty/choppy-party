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
}

/** Starter set from the items doc. The rest of the 27 (and the shop) come in the next build. */
export const ITEMS: Record<ItemId, ItemDef> = {
  'spring-boots': { id: 'spring-boots', name: 'Spring Boots', desc: 'Add 5 to your roll', target: false, model: 'platformer/spring', color: '#4cd97b' },
  'double-barrel': { id: 'double-barrel', name: 'Double Barrel', desc: 'Roll 2 dice and move the total', target: false, model: 'pirate/barrel', color: '#c98a4b' },
  'heart-snack': { id: 'heart-snack', name: 'Heart Snack', desc: 'Heal 20 HP', target: false, model: 'platformer/heart', color: '#ff5a6e' },
  'hunting-bow': { id: 'hunting-bow', name: 'Hunting Bow', desc: '10 damage to any player', target: true, model: 'forest/weapon-bow', color: '#a8743c' },
  'pirate-cannon': { id: 'pirate-cannon', name: 'Pirate Cannon', desc: '15 damage to the first player up to 10 spaces ahead', target: false, model: 'pirate/cannon', color: '#555b6e' },
  'treasure-shovel': { id: 'treasure-shovel', name: 'Treasure Shovel', desc: 'Dig 5 keys from everyone within 2 spaces', target: false, model: 'pirate/tool-shovel', color: '#d9b26a' },
  'spike-trap': { id: 'spike-trap', name: 'Spike Trap', desc: 'Hide spikes here: the next player to land takes 10', target: false, model: 'platformer/trap-spikes', color: '#9aa3b5' },
  'knight-shield': { id: 'knight-shield', name: 'Knight Shield', desc: 'Block the next hit, steal or swap', target: false, model: 'proto/weapon-shield', color: '#3fa9f5' },
  'swap-pipe': { id: 'swap-pipe', name: 'Swap Pipe', desc: 'Swap places with a player. Your turn ends', target: true, model: 'platformer/pipe', color: '#2ecc71' },
  'sticky-cube': { id: 'sticky-cube', name: 'Sticky Cube', desc: "A player's next roll is 1 to 3", target: true, model: 'proto/figurine-cube-detailed', color: '#b06cff' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
