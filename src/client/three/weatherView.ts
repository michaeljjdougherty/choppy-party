import * as THREE from 'three';
import type { BoardDef, BoardState } from '../../shared/board/types';
import { WEATHER_COLOR, zoneActive, type WeatherZone } from '../../shared/board/weather';
import type { Fx } from './fx';
import { shake } from './fx';
import { toy } from './kit';

/**
 * The look of the weather zones: a tinted band under the zone's spaces, its own particles
 * (fog banks, gusts, rain, sand, heat shimmer, floating rocks), glass domes on Cosmo's ring,
 * and the big moments when a flare, storm or flood hits at round end.
 */
export function buildWeather(scene: THREE.Scene, def: BoardDef, fx: Fx) {
  const zones = def.weather ?? [];
  const tints: { z: WeatherZone; mat: THREE.MeshBasicMaterial }[] = [];
  const disc = new THREE.CircleGeometry(1.45, 28);
  for (const z of zones) {
    const mat = new THREE.MeshBasicMaterial({ color: WEATHER_COLOR[z.kind], transparent: true, opacity: 0.3, depthWrite: false });
    for (const id of z.nodes) {
      const n = def.nodes[id];
      const m = new THREE.Mesh(disc, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(n.x, n.y + 0.03, n.z);
      m.renderOrder = 1;
      scene.add(m);
    }
    tints.push({ z, mat });
  }

  // The Fog Marsh is a marsh even by day: cattails along the lane, murky puddles and a sign, so you can tell where it is
  const reedStem = toy('#6f8f3a', 0.8), reedHead = toy('#6b4423', 0.9), murk = new THREE.MeshBasicMaterial({ color: '#4d6b5a', transparent: true, opacity: 0.45, depthWrite: false });
  for (const z of zones.filter((q) => q.kind === 'fog')) {
    z.nodes.forEach((id, i) => {
      const n = def.nodes[id];
      const to = def.nodes[n.next[0]] ?? n;
      const dx = to.x - n.x, dz = to.z - n.z, l = Math.hypot(dx, dz) || 1;
      const px = -dz / l, pz = dx / l;
      for (const side of [-1, 1]) {
        if ((i + (side > 0 ? 1 : 0)) % 2) continue;
        const cx = n.x + px * side * 1.9, cz = n.z + pz * side * 1.9;
        const pud = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), murk);
        pud.rotation.x = -Math.PI / 2;
        pud.position.set(cx, n.y + 0.02, cz);
        scene.add(pud);
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + i, r = 0.35 + (k % 2) * 0.3, h = 0.8 + ((k * 37 + i * 13) % 5) * 0.12;
          const g = new THREE.Group();
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, h, 5), reedStem);
          stem.position.y = h / 2;
          const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 3, 6), reedHead);
          head.position.y = h + 0.08;
          g.add(stem, head);
          g.position.set(cx + Math.cos(a) * r, n.y, cz + Math.sin(a) * r);
          g.rotation.z = Math.sin(a) * 0.12;
          scene.add(g);
        }
      }
    });
    // a sign at the marsh's first space
    const first = def.nodes[z.nodes[0]];
    if (first) {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 80;
      const c2 = cv.getContext('2d')!;
      c2.fillStyle = '#4a3220';
      c2.fillRect(0, 0, 256, 80);
      c2.fillStyle = '#e8eef8';
      c2.font = '900 40px system-ui, sans-serif';
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.fillText(z.name.toUpperCase(), 128, 42);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), toy('#6b4423', 0.9));
      post.position.y = 0.8;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.06), [toy('#4a3220'), toy('#4a3220'), toy('#4a3220'), toy('#4a3220'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })]);
      board.position.y = 1.5;
      board.userData.noDetail = true;
      sign.add(post, board);
      const to = def.nodes[first.next[0]] ?? first;
      const dx = to.x - first.x, dz = to.z - first.z, l = Math.hypot(dx, dz) || 1;
      sign.position.set(first.x + (dz / l) * 1.6, first.y, first.z - (dx / l) * 1.6);
      sign.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      scene.add(sign);
    }
  }

  // Will-o'-Wind: glowing chevrons painted down the path showing which way it blows this round
  const chevShape = new THREE.Shape();
  chevShape.moveTo(-0.28, -0.42);
  chevShape.lineTo(0.12, 0);
  chevShape.lineTo(-0.28, 0.42);
  chevShape.lineTo(-0.08, 0.42);
  chevShape.lineTo(0.32, 0);
  chevShape.lineTo(-0.08, -0.42);
  chevShape.closePath();
  const chevGeo = new THREE.ShapeGeometry(chevShape);
  const chevs: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; ang: number; k: number }[] = [];
  for (const z of zones.filter((q) => q.kind === 'wind')) {
    z.nodes.forEach((id, i) => {
      const n = def.nodes[id];
      const to = def.nodes[n.next[0]];
      if (!to || !z.nodes.includes(to.id)) return;
      for (let j = 0; j < 3; j++) {
        const f = 0.3 + j * 0.2;
        const mat = new THREE.MeshBasicMaterial({ color: '#19d3ff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
        const m = new THREE.Mesh(chevGeo, mat);
        m.position.set(n.x + (to.x - n.x) * f, n.y + (to.y - n.y) * f + 0.32, n.z + (to.z - n.z) * f);
        m.scale.setScalar(2.1);
        m.renderOrder = 2;
        scene.add(m);
        chevs.push({ m, mat, ang: Math.atan2(to.z - n.z, to.x - n.x), k: i * 3 + j });
      }
    });
  }

  // Solar Flare shelters: glass domes over the safe spaces
  const domeMat = new THREE.MeshStandardMaterial({ color: '#bff3ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const domeRim = toy('#d7dde8', 0.3);
  for (const z of zones) {
    for (const id of z.shelters ?? []) {
      const n = def.nodes[id];
      const g = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 6, 28), domeRim);
      rim.rotation.x = Math.PI / 2;
      g.add(dome, rim);
      g.position.set(n.x, n.y + 0.05, n.z);
      scene.add(g);
    }
  }

  // Low Gravity: little asteroids bobbing over the Command Core
  const rocks: { o: THREE.Mesh; base: THREE.Vector3; k: number }[] = [];
  const rockMat = toy('#8f84a8', 0.8);
  for (const z of zones.filter((q) => q.kind === 'lowgrav')) {
    z.nodes.forEach((id, i) => {
      if (i % 2) return;
      const n = def.nodes[id];
      const o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 3) * 0.08, 0), rockMat);
      const base = new THREE.Vector3(n.x + Math.sin(i * 2.1) * 1.1, n.y + 1.8 + (i % 3) * 0.4, n.z + Math.cos(i * 1.7) * 1.1);
      o.position.copy(base);
      scene.add(o);
      rocks.push({ o, base, k: i * 0.7 });
    });
  }

  // loose keys a flood washed out
  const keyMat = toy('#ffd23f', 0.25);
  const piles = new Map<string, THREE.Mesh>();

  /** Direction a zone's path runs at a space (where wind and water push you). */
  const along = (id: string): THREE.Vector3 => {
    const n = def.nodes[id];
    const to = def.nodes[n.next[0]];
    return to ? new THREE.Vector3(to.x - n.x, 0, to.z - n.z).normalize() : new THREE.Vector3(1, 0, 0);
  };
  const pick = (z: WeatherZone) => z.nodes[Math.floor(Math.random() * z.nodes.length)];
  const nodeV = (id: string, up = 0) => {
    const n = def.nodes[id];
    return new THREE.Vector3(n.x, n.y + up, n.z);
  };
  let acc = 0;

  return {
    update(b: BoardState, t: number, dt: number): void {
      // the board tour shows each zone at its worst, so you can see what it means
      const step = b.sub === 'tour' && b.tour ? b.tour.steps[b.tour.i] : null;
      const isOn = (z: WeatherZone) => zoneActive(b, z) || step?.title === z.name;
      for (const { z, mat } of tints) {
        const on = isOn(z);
        const want = on ? 0.42 + Math.sin(t * 3) * 0.06 : 0.2;
        mat.opacity += (want - mat.opacity) * Math.min(1, dt * 3);
      }
      // chevrons flip with the wind and ripple the way it blows
      const dir = (b.weather?.wind ?? 1) > 0 ? 1 : -1;
      for (const c of chevs) {
        c.m.rotation.set(-Math.PI / 2, 0, -(c.ang + (dir > 0 ? 0 : Math.PI)));
        c.mat.opacity = 0.35 + 0.6 * Math.max(0, Math.sin(t * 5 - c.k * dir * 0.9));
      }
      for (const r of rocks) {
        r.o.position.set(r.base.x + Math.sin(t * 0.6 + r.k) * 0.3, r.base.y + Math.sin(t * 0.9 + r.k) * 0.35, r.base.z + Math.cos(t * 0.5 + r.k) * 0.3);
        r.o.rotation.set(t * 0.4 + r.k, t * 0.3, 0);
      }
      // flood keys waiting to be picked up
      const loose = b.weather?.loose ?? {};
      for (const [id, m] of piles)
        if (!loose[id]) {
          scene.remove(m);
          piles.delete(id);
        }
      for (const id of Object.keys(loose)) {
        let m = piles.get(id);
        if (!m) {
          m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 8, 16), keyMat);
          scene.add(m);
          piles.set(id, m);
        }
        const n = def.nodes[id];
        m.position.set(n.x, n.y + 0.9 + Math.sin(t * 3) * 0.1, n.z);
        m.rotation.set(0, t * 2.5, 0);
      }

      // ambient particles, a few times a second
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      for (const z of zones) {
        if (!z.nodes.length) continue;
        const on = isOn(z);
        switch (z.kind) {
          case 'fog':
            // thick banks at night; a thin ground mist by day so the marsh still reads as a marsh
            if (on) for (let k = 0; k < 3; k++) fx.emit(nodeV(pick(z), 0.5), { tex: 'soft', color: ['#e8eef8', '#cdd8ea'], n: 1, speed: [0.1, 0.3], spread: 0, up: 0.03, life: [2.5, 3.5], size: [2.4, 3.6], drag: 0.2, jitter: 1.8 });
            else if (Math.random() < 0.35) fx.emit(nodeV(pick(z), 0.15), { tex: 'soft', color: ['#dfe8ee'], n: 1, speed: [0.05, 0.15], spread: 0, up: 0.02, life: [2, 3], size: [1.2, 1.8], drag: 0.2, jitter: 2 });
            break;
          case 'wind': {
            // stronger, longer streaks that clearly fly one way
            for (let k = 0; k < 3; k++) {
              const id = pick(z);
              const d = along(id).multiplyScalar(7 * Math.sign(b.weather?.wind ?? 1));
              fx.emit(nodeV(id, 0.5 + Math.random() * 1.2), { tex: 'soft', color: ['#ffffff', '#a8f0ff'], n: 3, speed: [0, 0.2], spread: 0.1, life: [0.8, 1.2], size: [0.5, 0.15], drag: 0, vel: [d.x, 0.3, d.z], jitter: 1.6 });
            }
            break;
          }
          case 'flare':
            if (on) fx.emit(nodeV(pick(z), 0.6), { tex: 'star', color: ['#ffd23f', '#ff9f1c'], n: 1, speed: [0.1, 0.4], up: 0.6, life: [0.6, 1], size: [0.4, 0.1], additive: true, jitter: 1.4 });
            break;
          case 'lowgrav':
            fx.emit(nodeV(pick(z), 0.3), { tex: 'star', color: ['#d6c4ff', '#ffffff'], n: 1, speed: [0, 0.2], up: 0.6, life: [1.2, 1.8], size: [0.18, 0.05], drag: 0, additive: true, jitter: 1.4 });
            break;
          case 'sandstorm':
            if (on || Math.random() < 0.3) {
              const id = pick(z);
              const d = along(id).multiplyScalar(on ? 5 : 2);
              fx.emit(nodeV(id, 0.6), { tex: 'puff', color: ['#e9c88a', '#d4a65a'], n: on ? 3 : 1, speed: [0.2, 0.6], spread: 0.2, life: [0.8, 1.3], size: [0.5, 1.4], drag: 0.3, vel: [d.x, 0.3, d.z], jitter: 1.6 });
            }
            break;
          case 'flood':
            if (on)
              for (let i = 0; i < 4; i++)
                fx.emit(nodeV(pick(z), 6), { tex: 'soft', color: ['#bfe6ff', '#7fc8ff'], n: 1, speed: [0, 0.1], spread: 0, life: [0.5, 0.6], size: [0.14, 0.1], gravity: 30, drag: 0, vel: [0.6, -4, 0], jitter: 3 });
            break;
          case 'heat':
            if (on) fx.emit(nodeV(pick(z), 0.3), { tex: 'soft', color: ['#ffb38a', '#ffd9a0'], n: 1, speed: [0, 0.1], up: 1, life: [1, 1.5], size: [0.8, 1.5], drag: 0, jitter: 1.4 });
            break;
        }
      }
    },

    /** The round-end moments from the engine: returns true if it handled the effect. */
    onFx(kind: string, at: THREE.Vector3, b: BoardState, amount?: number): boolean {
      switch (kind) {
        case 'flare':
          for (const z of zones.filter((q) => q.kind === 'flare'))
            for (const id of z.nodes.filter((_, i) => i % 2 === 0)) fx.emit(nodeV(id, 0.8), { tex: 'soft', color: ['#fff2a8', '#ffb02e'], n: 2, speed: [0.5, 1.5], up: 2, life: [0.4, 0.8], size: [1.2, 2.4], additive: true });
          shake(0.45);
          return true;
        case 'sandstorm':
          for (const z of zones.filter((q) => q.kind === 'sandstorm'))
            for (const id of z.nodes) {
              const d = along(id).multiplyScalar(7);
              fx.emit(nodeV(id, 0.8), { tex: 'puff', color: ['#e9c88a', '#c79a52'], n: 4, speed: [0.5, 1.5], spread: 0.3, life: [1, 1.6], size: [1, 2.4], drag: 0.4, vel: [d.x, 0.5, d.z], jitter: 1.5 });
            }
          shake(0.35);
          return true;
        case 'flood':
          for (const z of zones.filter((q) => q.kind === 'flood'))
            for (const id of z.nodes) {
              fx.splash(nodeV(id, 0.4));
              const d = along(id).multiplyScalar(6);
              fx.emit(nodeV(id, 0.5), { tex: 'soft', color: ['#7fc8ff', '#3fa9f5', '#ffffff'], n: 4, speed: [0.5, 1], spread: 0.2, up: 1, life: [0.6, 1], size: [0.6, 1.2], drag: 0.5, vel: [d.x, 0, d.z] });
            }
          shake(0.3);
          return true;
        case 'gust': {
          const dir = new THREE.Vector3(1, 0, 0);
          fx.emit(at, { tex: 'soft', color: ['#e6fbff', '#a8f0ff'], n: 10, speed: [0.5, 1.5], spread: 0.3, life: [0.5, 0.8], size: [0.6, 0.2], vel: [dir.x * (amount ?? 1) * 3, 0.5, 0], drag: 0.5 });
          return true;
        }
      }
      void b;
      return false;
    },

    /** Should the Crown Chests be hidden right now (the player moving is sandblind)? */
    chestsHidden(b: BoardState, cur: string): boolean {
      return !!b.weather?.blind.includes(cur) && ['roll', 'rolling', 'rolled', 'move', 'branch', 'prompt'].includes(b.sub);
    },
  };
}
