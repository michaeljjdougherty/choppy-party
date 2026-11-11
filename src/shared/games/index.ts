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
import { hotPotato } from './hotPotato';
import { kitchenRaid } from './kitchenRaid';
import { lanternHunt } from './lanternHunt';
import { hauntedMemory } from './hauntedMemory';
import { snowballScramble } from './snowballScramble';
import { laserLimbo } from './laserLimbo';
import { treasureDig } from './treasureDig';
import { cannonKing } from './cannonKing';
import { raftRowing } from './raftRowing';
import { burgerBuilder } from './burgerBuilder';
import { colorCraze } from './colorCraze';
import { stationRepair } from './stationRepair';
import { paintPlaza } from './paintPlaza';
import { alienCount } from './alienCount';
import { lightsOut } from './lightsOut';
import { pumpkinBowling } from './pumpkinBowling';
import { captureCrown } from './captureCrown';
import { lastSeat } from './lastSeat';
import { zombieTag } from './zombieTag';
import { chiliChallenge } from './chiliChallenge';
import { moonball } from './moonball';

/** Every playable minigame. Add new games here. */
export const GAMES: Minigame[] = [shrinkingRink, quickDrawCactus, pancakePanic, coinCloudburst, meteorShower, presentPileUp, graveyardShift, trainHop, fuseDraw, paddleClash, ropePull, crateGrab, hotPotato, kitchenRaid, lanternHunt, hauntedMemory, snowballScramble, laserLimbo, treasureDig, cannonKing, raftRowing, burgerBuilder, colorCraze, stationRepair, paintPlaza, alienCount, lightsOut, pumpkinBowling, captureCrown, lastSeat, zombieTag, chiliChallenge, moonball];

export function getGame(id: string): Minigame {
  const g = GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown minigame ${id}`);
  return g;
}
