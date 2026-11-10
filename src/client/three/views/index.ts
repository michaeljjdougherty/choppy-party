import type * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import type { View } from '../stage';
import { rinkView } from './rink';
import { quickDrawView } from './quickdraw';
import { pancakeView } from './pancake';
import { coinsView } from './coins';
import { meteorView } from './meteor';
import { presentView } from './presents';
import { graveyardView } from './graveyard';
import { trainView } from './train';
import { fuseView, paddleView } from './duels';
import { crateView, ropeView } from './teams';

type Factory = (env: THREE.Texture, state: any, players: PlayerInfo[]) => View;

/** 3D view for each minigame id. */
export const GAME_VIEWS: Record<string, Factory> = {
  'shrinking-rink': rinkView,
  'quick-draw-cactus': quickDrawView,
  'pancake-panic': pancakeView,
  'coin-cloudburst': coinsView,
  'meteor-shower': meteorView,
  'present-pile-up': presentView,
  'graveyard-shift': graveyardView,
  'train-hop': trainView,
  'fuse-draw': fuseView,
  'paddle-clash': paddleView,
  'rope-pull': ropeView,
  'crate-grab': crateView,
};

export { menuView } from './menu';
export { mainMenuView } from './mainMenu';
export { boardView } from './board';
