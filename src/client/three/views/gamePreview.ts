import type * as THREE from 'three';
import { getGame } from '../../../shared/games';
import { addBotInputs, type BotView } from '../../../shared/bots';
import { DT, type PlayerInfo } from '../../../shared/types';
import type { View } from '../stage';
import { disposeTree } from '../kit';
import { GAME_VIEWS } from './index';

/**
 * The "how it plays" window on a minigame's intro screen: the real game, played by CPU stand-ins
 * of the actual players, running on a loop in a little window. Client-only; nothing is synced.
 */
let live: { key: string; view: View; party: BotView; acc: number; restart: () => void } | null = null;

export function gamePreview(env: THREE.Texture, key: string, gameId: string, players: PlayerInfo[]): View | null {
  if (live?.key !== key) {
    clearGamePreview();
    const make = GAME_VIEWS[gameId];
    if (!make) return null;
    const g = getGame(gameId);
    const who = players.slice(0, g.maxPlayers).map((p) => ({ ...p, bot: p.bot ?? ('hard' as const), away: false }));
    const party: BotView = {
      phase: 'play',
      phaseT: 0,
      players: who,
      gamePlayers: who,
      gameId,
      game: g.setup(who, 1234),
      board: null,
      ready: [],
      botMem: {},
      botRng: { seed: 99 },
    };
    const view = make(env, party.game, who);
    let seed = 1234;
    live = {
      key,
      view,
      party,
      acc: 0,
      restart: () => {
        // a fresh round each loop, with a fresh scene (views can keep per-round bits)
        party.game = g.setup(who, ++seed);
        party.botMem = {};
        disposeTree(live!.view.scene);
        live!.view = make(env, party.game, who);
      },
    };
  }
  const L = live!;
  const g = getGame(gameId);
  return {
    get scene() {
      return L.view.scene;
    },
    get camera() {
      return L.view.camera;
    },
    update(_s, _ps, t, dt) {
      L.acc = Math.min(L.acc + dt, DT * 4);
      while (L.acc >= DT) {
        L.acc -= DT;
        g.step(L.party.game, addBotInputs(L.party, {}, DT), DT);
        if (g.isOver(L.party.game)) L.restart();
      }
      L.view.update(L.party.game, L.party.players, t, dt);
    },
    tags: () => [],
  };
}

export function clearGamePreview(): void {
  if (live) disposeTree(live.view.scene);
  live = null;
}
