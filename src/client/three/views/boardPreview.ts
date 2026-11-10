import * as THREE from 'three';
import { createBoard } from '../../../shared/board/engine';
import { getBoard } from '../../../shared/board/boards';
import type { PartyState } from '../../../shared/party';
import type { View } from '../stage';
import { boardView } from './board';
import { disposeTree } from '../kit';

/**
 * Aerial flyover of a board for the lobby: the real board scene with nobody on it, seen from a
 * slow, high orbit. One per board, built the first time it's picked.
 */
const cache = new Map<string, { view: View; fake: PartyState; center: THREE.Vector3; span: number }>();

export function boardPreview(env: THREE.Texture, boardId: string): View {
  let e = cache.get(boardId);
  if (!e) {
    const fake = { board: createBoard(boardId, [], 10, 1) } as unknown as PartyState;
    const view = boardView(env, fake, []);
    const nodes = Object.values(getBoard(boardId).nodes);
    const xs = nodes.map((n) => n.x);
    const zs = nodes.map((n) => n.z);
    const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    e = { view, fake, center, span };
    cache.set(boardId, e);
  }
  const { view, fake, center, span } = e;
  return {
    scene: view.scene,
    camera: view.camera,
    update(_s, _ps, t, dt) {
      view.update(fake, [], t, dt);
      // slow orbit, high enough to read the whole loop
      const a = t * 0.12;
      const r = span * 0.62;
      const cam = view.camera;
      cam.position.set(center.x + Math.sin(a) * r, span * 1.35, center.z + Math.cos(a) * r);
      cam.lookAt(center.x, 0, center.z);
    },
    tags: () => [],
  };
}

/** Free the preview scenes once the lobby is left. */
export function clearBoardPreviews(): void {
  for (const e of cache.values()) disposeTree(e.view.scene);
  cache.clear();
}
