import type { Minigame } from '../types';
import { shrinkingRink } from './shrinkingRink';
import { quickDrawCactus } from './quickDrawCactus';
import { pancakePanic } from './pancakePanic';
import { coinCloudburst } from './coinCloudburst';
import { meteorShower } from './meteorShower';
import { presentPileUp } from './presentPileUp';
import { graveyardShift } from './graveyardShift';
import { trainHop } from './trainHop';
import { fuseDraw } from './fuseDraw';
import { paddleClash } from './paddleClash';
import { ropePull } from './ropePull';
import { crateGrab } from './crateGrab';

/** Every playable minigame. Add new games here. */
export const GAMES: Minigame[] = [shrinkingRink, quickDrawCactus, pancakePanic, coinCloudburst, meteorShower, presentPileUp, graveyardShift, trainHop, fuseDraw, paddleClash, ropePull, crateGrab];

export function getGame(id: string): Minigame {
  const g = GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown minigame ${id}`);
  return g;
}
