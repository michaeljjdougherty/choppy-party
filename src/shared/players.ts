/** The playable roster. Models are Kenney's CC0 Mini Characters and Platformer Kit characters. */
export interface Character {
  name: string;
  color: string; // ring, name tag and HUD colour
  model: string; // path under /models
}

export const CHARACTERS: Character[] = [
  { name: 'Oobi', color: '#b06cff', model: 'platformer/character-oobi.glb' },
  { name: 'Oodi', color: '#ff7bd5', model: 'platformer/character-oodi.glb' },
  { name: 'Ooli', color: '#ffd23f', model: 'platformer/character-ooli.glb' },
  { name: 'Oopi', color: '#2ee6d6', model: 'platformer/character-oopi.glb' },
  { name: 'Oozi', color: '#ff9f1c', model: 'platformer/character-oozi.glb' },
  { name: 'Zorp', color: '#4cd97b', model: 'chars/character-alien.glb' },
  { name: 'Bolt', color: '#3fa9f5', model: 'chars/character-robot.glb' },
  { name: 'Sir Clank', color: '#f4f1e8', model: 'chars/character-knight.glb' },
  { name: 'Moss', color: '#9a7b5f', model: 'chars/character-zombie.glb' },
  { name: 'Rosa', color: '#ff5a5f', model: 'chars/character-female-a.glb' },
];

export const PLAYER_COLORS = CHARACTERS.map((c) => c.color);
export const DEFAULT_NAMES = CHARACTERS.map((c) => c.name);
