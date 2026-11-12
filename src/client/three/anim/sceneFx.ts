import * as THREE from 'three';
import { Fx } from '../fx';

/**
 * One shared particle layer per scene for the animation layer (footstep dust, hit stars, cheer sparkles),
 * so characters can kick up effects in any view without that view owning an Fx. Stage ticks it every
 * frame the scene is drawn; a scene that isn't being drawn (a thumbnail, a hidden preview) gets no new
 * particles, so nothing piles up frozen.
 */
interface Entry {
  fx: Fx;
  last: number;
}
const LIVE = new WeakMap<THREE.Object3D, Entry>();

function rootOf(o: THREE.Object3D): THREE.Object3D {
  let r = o;
  while (r.parent) r = r.parent;
  return r;
}

/** The particle layer for whatever scene `o` is in, or null when it isn't in a drawn scene right now. */
export function fxFor(o: THREE.Object3D): Fx | null {
  const root = rootOf(o);
  if (!(root as THREE.Scene).isScene) return null;
  let e = LIVE.get(root);
  const now = performance.now();
  if (!e) {
    e = { fx: new Fx(root), last: now };
    e.fx.group.name = 'anim-fx';
    LIVE.set(root, e);
  }
  return now - e.last < 500 ? e.fx : null;
}

/** Advance the scene's animation particles (called by Stage when it draws the scene). */
export function tickSceneFx(scene: THREE.Object3D, dt?: number): void {
  const e = LIVE.get(scene);
  if (!e) return;
  const now = performance.now();
  e.fx.update(dt ?? Math.min(0.1, (now - e.last) / 1000));
  e.last = now;
}
