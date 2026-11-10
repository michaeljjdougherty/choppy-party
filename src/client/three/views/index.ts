import type * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { View } from '../stage';
import { rinkView } from './rink';
import { quickDrawView } from './quickdraw';
import { pancakeView } from './pancake';
import { coinsView } from './coins';

type Factory = (env: THREE.Texture, state: any, players: PlayerInfo[]) => View;

/** 3D view for each minigame id. */
export const GAME_VIEWS: Record<string, Factory> = {
  'shrinking-rink': rinkView,
  'quick-draw-cactus': quickDrawView,
  'pancake-panic': pancakeView,
  'coin-cloudburst': coinsView,
};

export { menuView } from './menu';
