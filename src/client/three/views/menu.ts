import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { BOT_LABEL } from '../../../shared/bots';
import { hostId, OPTIONS, standings, type PartyState } from '../../../shared/party';
import { ChoppyModel } from '../choppy';
import { checkerTexture, makeScene, mesh, toy } from '../kit';
import { place } from '../assets';
import { Fx, shake } from '../fx';
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

  // platformer-kit garden around the stage
  const spinners: THREE.Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI; // back half of the stage
    const x = Math.cos(a) * 11.5;
    const z = Math.sin(a) * 6 - 4;
    place(scene, i % 3 === 0 ? 'platformer/tree-pine' : i % 3 === 1 ? 'platformer/tree' : 'forest/tree-high', x, 0, z, { s: 2.2 + (i % 2) * 0.6, ry: i });
  }
  for (const [x, z, ry] of [[-8.5, -2, 0.4], [8.5, -2, -0.4], [-6, -6.5, 0.2], [6, -6.5, -0.2]] as [number, number, number][]) {
    place(scene, 'platformer/flag', x, 0, z, { s: 2.4, ry });
  }
  for (let i = 0; i < 10; i++) {
    const x = -9 + i * 2;
    place(scene, i % 2 ? 'platformer/flowers' : 'platformer/mushrooms', x, 0, -7.5 + (i % 3) * 0.5, { s: 2, ry: i, shadow: false });
  }
  for (let i = 0; i < 6; i++) {
    const c = place(scene, 'platformer/coin-gold', -7.5 + i * 3, 4.6 + (i % 2) * 0.8, -6, { s: 2.2 });
    spinners.push(c);
  }
  place(scene, 'platformer/chest', 7.8, 0, 1.6, { s: 2, ry: -0.6 });
  place(scene, 'platformer/barrel', -8, 0, 1.4, { s: 2, ry: 0.5 });
  // party gifts and candy (Kenney Holiday Kit)
  const gifts = ['holiday/present-a-cube', 'holiday/present-b-round', 'holiday/present-a-rectangle', 'holiday/present-b-cube'];
  for (const [i, [x, z, ry]] of ([[-9.6, 3.4, 0.3], [-8.6, 4.4, 1.1], [-10.4, 4.6, 2], [9.4, 3.6, -0.4], [10.3, 4.6, 0.9], [8.9, 4.9, 2.2]] as [number, number, number][]).entries()) {
    place(scene, gifts[i % gifts.length], x, 0, z, { s: 2.6, ry });
  }
  place(scene, 'holiday/present-a-cube', -9.6, 0.78, 3.4, { s: 1.8, ry: 0.9 });
  for (const [x, z, red] of [[-11, 1.5, 1], [11, 1.5, 0], [-11.5, -1.5, 0], [11.5, -1.5, 1]] as [number, number, number][]) {
    place(scene, red ? 'holiday/candy-cane-red' : 'holiday/candy-cane-green', x, 0, z, { s: 4, ry: x > 0 ? Math.PI : 0 });
  }
  // string lights between the flags
  for (const [x, z, ry] of [[-7.25, -4.25, -1.06], [7.25, -4.25, 1.06], [0, -6.5, 0]] as [number, number, number][]) {
    const len = ry === 0 ? 12 : 5;
    for (let k = 0; k < len / 2.5; k++) {
      const f = (k + 0.5) / (len / 2.5) - 0.5;
      place(scene, 'holiday/lights-colored', x + Math.cos(-ry) * f * len, 3.3 - Math.cos(f * Math.PI) * 0.3, z + Math.sin(-ry) * f * len, { s: 2.5, ry, shadow: false });
    }
  }

  // podium (results and final screens)
  const podium = new THREE.Group();
  const podiumSpec: [number, string, number][] = [
    [-4.6, '#ffcf3a', 1.3],
    [-6.5, '#d5dbe6', 0.85],
    [-2.7, '#e09a5a', 0.5],
  ];
  const blocks: THREE.Mesh[] = [];
  for (const [x, c, h] of podiumSpec) {
    // geometry sits on y = 0 so scaling y grows it up out of the floor
    const geo = new THREE.BoxGeometry(1.8, h, 1.6);
    geo.translate(0, h / 2, 0);
    const block = mesh(geo, toy(c, 0.3), { receive: true });
    block.position.set(x, 0, 1);
    podium.add(block);
    blocks.push(block);
  }
  // podium blocks spring up one after another: 3rd, 2nd, then 1st
  const GROW_DELAY = [0.7, 0.4, 0.1];
  const springOut = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(10 * p));
  let rankT = -1;
  const fx = new Fx(scene);
  const hops = new Map<string, { from: THREE.Vector3; t: number; dur: number; h: number }>();
  scene.add(podium);


  const models = new Map<string, { m: ChoppyModel; target: THREE.Vector3; scale: number; look: string }>();
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
      // with a board picked, the right side of the stage shows its flyover, so everyone shuffles left
      const board = s.phase === 'lobby' && OPTIONS[s.selection]?.kind === 'board';
      const gap = board ? Math.min(1.5, 6.2 / Math.max(1, n - 1)) : Math.min(1.9, 16 / Math.max(1, n));
      const cx = board ? -3.0 : 0;
      [...s.players]
        .sort((a, b) => a.slot - b.slot)
        .forEach((p, i) => {
          const e = models.get(p.id);
          if (e) e.target.set(cx + (i - (n - 1) / 2) * gap, 0, 1);
        });
      return;
    }
    const rest = sorted.slice(3);
    sorted.forEach((r, i) => {
      const e = models.get(r.id);
      if (!e) return;
      if (i < 3) {
        const [x, , h] = podiumSpec[i];
        e.target.set(x, h * blocks[i].scale.y, 1);
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
        const look = `${p.color}|${p.char ?? p.slot}`;
        const old = models.get(p.id);
        if (old && old.look !== look) {
          // swapped character or colour: rebuild in place with a little hop
          const m = new ChoppyModel(p.color, 0.8);
          m.group.position.copy(old.m.group.position);
          m.group.position.y += 0.6;
          scene.remove(old.m.group);
          scene.add(m.group);
          old.m = m;
          old.look = look;
          fx.sparkle(m.group.position.clone().setY(m.group.position.y + 1), p.color, 14);
        } else if (!old) {
          const m = new ChoppyModel(p.color, 0.8);
          m.group.position.set(0, 6, 1);
          scene.add(m.group);
          models.set(p.id, { m, target: new THREE.Vector3(), scale: 0.8, look });
        }
      }
      for (const [id, e] of models) {
        if (!ps.some((p) => p.id === id)) {
          scene.remove(e.m.group);
          models.delete(id);
        }
      }
      const ranked = s.phase === 'results' || s.phase === 'final';
      const prevRankT = rankT;
      rankT = ranked ? (rankT < 0 ? 0 : rankT + dt) : -1;
      blocks.forEach((b, i) => {
        const p = ranked ? Math.min(1, Math.max(0, (rankT - GROW_DELAY[i]) / 0.55)) : 1;
        b.scale.y = Math.max(0.001, springOut(p));
        // a puff of dust as each block lands at full height
        if (ranked && prevRankT >= 0 && prevRankT < GROW_DELAY[i] + 0.25 && rankT >= GROW_DELAY[i] + 0.25) {
          fx.dust(new THREE.Vector3(podiumSpec[i][0], 0.1, 1.6), 1);
          shake(0.08);
        }
      });
      layout(s);
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
        // big moves (onto the podium, back to the lobby line) are bouncy hops, not slides
        let hop = hops.get(id);
        if (!hop && g.position.distanceTo(e.target) > 1.2 && g.position.y < 5) {
          hop = { from: g.position.clone(), t: 0, dur: 0.55, h: 1.6 + Math.max(0, e.target.y - g.position.y) };
          hops.set(id, hop);
        }
        if (hop) {
          hop.t += dt;
          const f = Math.min(1, hop.t / hop.dur);
          g.position.lerpVectors(hop.from, e.target, f);
          g.position.y += Math.sin(f * Math.PI) * hop.h;
          if (f >= 1) {
            hops.delete(id);
            e.m.squash(7);
            fx.dust(g.position.clone().setY(g.position.y + 0.1), 0.5);
            if (winners.has(id)) fx.party(g.position.clone().setY(g.position.y + 2));
          }
        } else g.position.lerp(e.target, Math.min(1, dt * 8));
        const moving = !!hop || g.position.distanceTo(e.target) > 0.05;
        g.rotation.y = Math.sin(t * 0.8 + id.length) * 0.25;
        const ready = s.phase === 'intro' && s.ready.includes(id);
        e.m.update(dt, { speed: moving ? 0.6 : 0, happy: ready || winners.has(id), t: t + id.length });
      }
      fx.update(dt);
      spinners.forEach((c, i) => {
        c.rotation.y = t * 2 + i;
        c.position.y = 4.6 + (i % 2) * 0.8 + Math.sin(t * 2 + i) * 0.2;
      });
      balloons.forEach((b, i) => {
        const base = b.userData.base as THREE.Vector3;
        b.position.y = base.y + Math.sin(t * 0.9 + i) * 0.35;
        b.rotation.z = Math.sin(t * 0.7 + i) * 0.1;
      });
    },
    tags(): Tag[] {
      if (!state) return [];
      const mine = localIds();
      const host = hostId(state);
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
          id: p.id,
          pos: new THREE.Vector3(pos.x, pos.y - 0.3, pos.z),
          text: p.name,
          color: p.color,
          sub,
          subColor,
          badge: p.id === host ? 'HOST' : p.bot ? `${BOT_LABEL[p.bot].toUpperCase()} CPU` : isOnline() && mine.has(p.id) ? 'YOU' : undefined,
        };
      });
    },
  };
}
