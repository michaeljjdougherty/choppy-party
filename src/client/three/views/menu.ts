import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { standings, type PartyState } from '../../../shared/party';
import { ChoppyModel } from '../choppy';
import { checkerTexture, makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';

const BALLOON_COLORS = ['#ff5a5f', '#3fa9f5', '#ffd23f', '#4cd97b', '#b06cff', '#ff9f1c', '#ff7bd5'];

/** The party stage behind the lobby, instructions, results and final screens. */
export function menuView(env: THREE.Texture, localIds: () => Set<string>, isOnline: () => boolean): View {
  const scene = makeScene(env, { skyTop: '#5b3fd6', skyBottom: '#ff9ccf', fog: ['#c98be0', 28, 70], sunDir: [5, 14, 12] });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 4.4, 13);
  const look = new THREE.Vector3(0, 1.4, 0);

  // round stage with a checkered top
  const top = checkerTexture('#ffd23f', '#fff1c9', 12, 256);
  const stage = mesh(
    new THREE.CylinderGeometry(10, 10.3, 1, 64),
    [toy('#e8434f', 0.4), new THREE.MeshStandardMaterial({ map: top, roughness: 0.5 }), toy('#e8434f', 0.4)],
    { receive: true },
  );
  stage.position.set(0, -0.5, -1);
  scene.add(stage);
  const trim = mesh(new THREE.TorusGeometry(10.15, 0.18, 12, 80), toy('#ffffff', 0.3));
  trim.rotation.x = Math.PI / 2;
  trim.position.set(0, 0, -1);
  scene.add(trim);

  // floating balloons
  const balloons: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(0.7, 24, 18), toy(BALLOON_COLORS[i % BALLOON_COLORS.length], 0.25), { cast: false });
    b.scale.y = 1.18;
    const knot = mesh(new THREE.ConeGeometry(0.12, 0.2, 8), toy(BALLOON_COLORS[i % BALLOON_COLORS.length], 0.4), { cast: false });
    knot.position.y = -0.86;
    knot.rotation.x = Math.PI;
    const string = mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.4, 4), toy('#ffffff', 0.8), { cast: false });
    string.position.y = -2.1;
    g.add(b, knot, string);
    const side = i % 2 ? 1 : -1;
    g.position.set(side * (9 + (i % 4) * 2.4), 3 + ((i * 7) % 5) * 1.6, -6 - ((i * 3) % 5) * 3);
    g.userData.base = g.position.clone();
    scene.add(g);
    balloons.push(g);
  }

  // podium (results and final screens)
  const podium = new THREE.Group();
  const podiumSpec: [number, string, number][] = [
    [-4.6, '#ffcf3a', 1.3],
    [-6.5, '#d5dbe6', 0.85],
    [-2.7, '#e09a5a', 0.5],
  ];
  for (const [x, c, h] of podiumSpec) {
    const block = mesh(new THREE.BoxGeometry(1.8, h, 1.6), toy(c, 0.3), { receive: true });
    block.position.set(x, h / 2, 1);
    podium.add(block);
  }
  scene.add(podium);

  const models = new Map<string, { m: ChoppyModel; target: THREE.Vector3; scale: number }>();
  let state: PartyState | null = null;
  let players: PlayerInfo[] = [];

  function layout(s: PartyState): void {
    const n = s.players.length;
    const sorted =
      s.phase === 'results'
        ? s.placements.map((p) => ({ id: p.id, place: p.place }))
        : s.phase === 'final'
          ? standings(s).map((r) => ({ id: r.id, place: r.place }))
          : null;
    podium.visible = !!sorted;
    if (!sorted) {
      const gap = Math.min(1.9, 16 / Math.max(1, n));
      [...s.players]
        .sort((a, b) => a.slot - b.slot)
        .forEach((p, i) => {
          const e = models.get(p.id);
          if (e) e.target.set((i - (n - 1) / 2) * gap, 0, 1);
        });
      return;
    }
    const rest = sorted.slice(3);
    sorted.forEach((r, i) => {
      const e = models.get(r.id);
      if (!e) return;
      if (i < 3) {
        const [x, , h] = podiumSpec[i];
        e.target.set(x, h, 1);
      } else {
        const k = i - 3;
        const span = 7;
        e.target.set(-8 + (rest.length > 1 ? (k / (rest.length - 1)) * span : span / 2), 0, -1.8);
      }
    });
  }

  return {
    scene,
    camera,
    update(s: PartyState, ps, t, dt) {
      state = s;
      players = ps;
      // add/remove models as people join and leave
      for (const p of ps) {
        if (!models.has(p.id)) {
          const m = new ChoppyModel(p.color, 0.8);
          m.group.position.set(0, 6, 1);
          scene.add(m.group);
          models.set(p.id, { m, target: new THREE.Vector3(), scale: 0.8 });
        }
      }
      for (const [id, e] of models) {
        if (!ps.some((p) => p.id === id)) {
          scene.remove(e.m.group);
          models.delete(id);
        }
      }
      layout(s);
      const ranked = s.phase === 'results' || s.phase === 'final';
      if (ranked) look.set(-1.6, 1.6, 0);
      else if (s.phase === 'intro') look.set(0, 3.1, 0);
      else look.set(0, 1.3, 0);
      camera.lookAt(look);

      const winners =
        s.phase === 'final'
          ? new Set(standings(s).filter((r) => r.place === 1).map((r) => r.id))
          : s.phase === 'results'
            ? new Set(s.placements.filter((p) => p.place === 1).map((p) => p.id))
            : new Set<string>();
      for (const [id, e] of models) {
        const g = e.m.group;
        g.position.lerp(e.target, Math.min(1, dt * 6));
        const moving = g.position.distanceTo(e.target) > 0.05;
        g.rotation.y = Math.sin(t * 0.8 + id.length) * 0.25;
        const ready = s.phase === 'intro' && s.ready.includes(id);
        e.m.update(dt, { speed: moving ? 0.6 : 0, happy: ready || winners.has(id), t: t + id.length });
      }
      balloons.forEach((b, i) => {
        const base = b.userData.base as THREE.Vector3;
        b.position.y = base.y + Math.sin(t * 0.9 + i) * 0.35;
        b.rotation.z = Math.sin(t * 0.7 + i) * 0.1;
      });
    },
    tags(): Tag[] {
      if (!state) return [];
      const mine = localIds();
      const host = state.players[0]?.id;
      return players.map((p) => {
        const e = models.get(p.id)!;
        const pos = e.m.group.position;
        let sub: string | undefined;
        let subColor = '#ffffff';
        if (state!.phase === 'intro') {
          const r = state!.ready.includes(p.id);
          sub = r ? 'Ready!' : '';
          subColor = '#4cd97b';
        }
        return {
          pos: new THREE.Vector3(pos.x, pos.y - 0.3, pos.z),
          text: p.name,
          color: p.color,
          sub,
          subColor,
          badge: p.id === host ? 'HOST' : isOnline() && mine.has(p.id) ? 'YOU' : undefined,
        };
      });
    },
  };
}
