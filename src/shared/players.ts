/**
 * The playable roster: the Choppy crew (our own Square Brian-style people, built in
 * src/client/three/folks.ts) plus the aliens from Kenney's CC0 Platformer and Mini Characters kits.
 */
export interface Character {
  name: string;
  /** The character's own colour (aliens are palette-swapped away from it). */
  color: string;
  /** Kenney model path under /models (aliens). */
  model?: string;
  /** Crew id in folks.ts (our people). */
  folk?: string;
}

const crew = (folk: string, name: string): Character => ({ name, folk, color: '' });

export const CHARACTERS: Character[] = [
  crew('rik', 'Rik'),
  // two more Riks (Michael, 2026-11-12)
  crew('rik-creamy', 'Creamy Rik'),
  crew('rik-crispy', 'Crispy Rik'),
  crew('pete', 'Pete'),
  crew('fucci', 'Fucci'),
  crew('zach', 'Zach'),
  crew('johnny', 'Johnny John'),
  crew('kg', 'KG'),
  // Michael's call: four more KGs, each with his own starting outfit (see looks.ts)
  crew('kg-king', 'King KG'),
  crew('kg-evil', 'Evil KG'),
  crew('kg-space', 'Space KG'),
  crew('kg-chef', 'Chef KG'),
  crew('chops', 'Chops'),
  crew('maddog', 'Mad Dog'),
  crew('mm', 'MM'),
  // back by Michael's call (2026-11-12), rebranded
  crew('regs', 'Ass Kisser Regs'),
  crew('shmama', 'Shmama'),
  crew('aids', 'Aids'),
  crew('fick', 'Fick'),
  crew('abi', 'Abi Buell'),
  // new crew from Michael's photos (2026-11-12)
  crew('kearns', 'Kearns'),
  crew('luke', 'Luke'),
  crew('ryan', 'Ryan Downling'),
  crew('erin', 'Erin Bass'),
  { name: 'Oobi', color: '#b06cff', model: 'platformer/character-oobi.glb' },
  { name: 'Oodi', color: '#ff7bd5', model: 'platformer/character-oodi.glb' },
  { name: 'Ooli', color: '#ffd23f', model: 'platformer/character-ooli.glb' },
  { name: 'Oopi', color: '#2ee6d6', model: 'platformer/character-oopi.glb' },
  { name: 'Oozi', color: '#ff9f1c', model: 'platformer/character-oozi.glb' },
  { name: 'Zorp', color: '#4cd97b', model: 'chars/character-alien.glb' },
];

/** The 10 player colours (one per seat). Character choice is separate from colour. */
export const PLAYER_COLORS = ['#b06cff', '#ff7bd5', '#ffd23f', '#2ee6d6', '#ff9f1c', '#4cd97b', '#3fa9f5', '#f4f1e8', '#9a7b5f', '#ff5a5f'];
export const DEFAULT_NAMES = CHARACTERS.map((c) => c.name);
