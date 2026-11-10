import type { Minigame } from '../types';
import { shrinkingRink } from './shrinkingRink';
import { quickDrawCactus } from './quickDrawCactus';
import { pancakePanic } from './pancakePanic';
import { coinCloudburst } from './coinCloudburst';

/** Every playable minigame. Add new games here. */
export const GAMES: Minigame[] = [shrinkingRink, quickDrawCactus, pancakePanic, coinCloudburst];

export function getGame(id: string): Minigame {
  const g = GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown minigame ${id}`);
  return g;
}
