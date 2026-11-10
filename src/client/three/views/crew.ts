import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { ChoppyModel } from '../choppy';
import { prop } from '../assets';
import type { Fx } from '../fx';
import { PX, wx, wz, yaw } from '../kit';
import type { Tag } from '../stage';

/** Something the sim moves around: a player's arena position, facing and hop height. */
export interface Mover {
  id: string;
  x: number;
  y: number;
  face: number;
  z?: number;
}
export interface Pose {
  stunned?: boolean;
  happy?: boolean;
  hidden?: boolean;
}

/** The players' Choppy models for an arena game: positions, walk speed, hops and landing dust. */
export function crew(scene: THREE.Scene, players: PlayerInfo[], list: Mover[], fx?: Fx, scale = 0.8) {
  const models = new Map<string, ChoppyModel>();
  const last = new Map<string, [number, number, number]>();
  for (const r of list) {
    const p = players.find((q) => q.id === r.id);
    const m = new ChoppyModel(p?.color ?? '#fff', scale);
    models.set(r.id, m);
    scene.add(m.group);
  }
  return {
    models,
    update(list: Mover[], dt: number, pose: (r: Mover) => Pose = () => ({})) {
      for (const r of list) {
        const m = models.get(r.id);
        if (!m) continue;
        const o = pose(r);
        m.group.visible = !o.hidden;
        const [px, py, pz] = last.get(r.id) ?? [r.x, r.y, 0];
        const z = r.z ?? 0;
        const speed = Math.min(1, Math.hypot(r.x - px, r.y - py) / Math.max(1e-3, dt) / 300);
        if (fx && pz > 4 && z <= 0.01 && !o.hidden) fx.dust(new THREE.Vector3(wx(r.x), 0.15, wz(r.y)), 0.7);
        last.set(r.id, [r.x, r.y, z]);
        m.group.position.set(wx(r.x), 0, wz(r.y));
        m.group.rotation.y = yaw(r.face);
        m.update(dt, { speed: o.stunned ? 0 : speed, stunned: o.stunned, happy: o.happy, jump: (z * PX) / 0.8 });
      }
    },
    tags(list: Mover[], h = 2.35, sub?: (r: Mover) => string | undefined, skip?: (r: Mover) => boolean): Tag[] {
      return list
        .filter((r) => !skip?.(r))
        .map((r) => {
          const p = players.find((q) => q.id === r.id);
          return { pos: new THREE.Vector3(wx(r.x), h + (r.z ?? 0) * PX, wz(r.y)), text: p?.name ?? '', color: p?.color, sub: sub?.(r) };
        });
    },
  };
}

/** A prop scaled so its largest footprint side (x or z) is `size` world units. */
export function fitProp(name: string, size: number, axis: 'x' | 'y' | 'z' | 'xz' = 'xz'): THREE.Object3D {
  const o = prop(name, 1);
  const b = new THREE.Box3().setFromObject(o);
  const d = b.getSize(new THREE.Vector3());
  const ref = axis === 'xz' ? Math.max(d.x, d.z) : d[axis];
  if (ref > 0) o.scale.setScalar(size / ref);
  return o;
}

/** Grow-on-demand object pools: hide everything, then take() what this frame needs. */
export function pool<T extends THREE.Object3D>(parent: THREE.Object3D, make: () => T) {
  const items: T[] = [];
  let used = 0;
  return {
    items,
    begin() {
      used = 0;
      for (const o of items) o.visible = false;
    },
    take(): T {
      if (used >= items.length) {
        const o = make();
        parent.add(o);
        items.push(o);
      }
      const o = items[used++];
      o.visible = true;
      return o;
    },
  };
}
