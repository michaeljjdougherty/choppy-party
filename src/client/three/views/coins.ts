import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { ANVIL_HIT, AX0, AX1, AY0, AY1, FALL_TIME, type CloudburstState } from '../../../shared/games/coinCloudburst';
import { ChoppyModel } from '../choppy';
import { place, prop } from '../assets';
import { Fx, shake } from '../fx';
import { rockGeometry } from '../life/rocks';
import { glowSprite, softShadowMat, telegraph, type Telegraph } from '../look/fxKit';
import { PX, makeScene, mesh, stripeTexture, toy, wx, wz, yaw, frameRect } from '../kit';
import type { Tag, View } from '../stage';

const DROP_HEIGHT = 13;

export function coinsView(env: THREE.Texture, state: CloudburstState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#6ccaff', skyBottom: '#e6f7ff', fog: ['#cdeeff', 35, 80], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  frameRect(camera, AX0, AX1, AY0, AY1, 0.85);

  const fw = (AX1 - AX0) * PX;
  const fd = (AY1 - AY0) * PX;
  const cx = wx((AX0 + AX1) / 2);
  const cz = wz((AY0 + AY1) / 2);
  const ground = mesh(new THREE.CircleGeometry(90, 48), toy('#3f8f3c', 0.9), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  const tex = stripeTexture('#5fbf4a', '#4fab3d', 2, 64);
  tex.repeat.set(fw / 2, 1);
  const field = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), {
    cast: false,
    receive: true,
  });
  field.rotation.x = -Math.PI / 2;
  field.position.set(cx, 0, cz);
  scene.add(field);
  // hedges around the field
  // leafy hedges: rows of lumpy overlapping bushes in a few greens, not boxes
  const hedgeMats = ['#2f7d35', '#3a8a3a', '#2a6e30'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const bush = (x: number, z: number, w: number, d: number) => {
    const len = Math.max(w, d), along = w >= d;
    const n = Math.max(2, Math.round(len / 0.75));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      const r = 0.55 + ((i * 7) % 5) * 0.05;
      const b = mesh(rockGeometry(r, i % 6, 0.22), hedgeMats[i % 3], { receive: true });
      b.position.set(x + (along ? u * len : (((i * 13) % 5) - 2) * 0.04), r * 0.55, z + (along ? (((i * 13) % 5) - 2) * 0.04 : u * len));
      b.rotation.y = i * 1.3;
      scene.add(b);
    }
  };
  bush(cx, cz - fd / 2 - 0.5, fw + 2, 1);
  bush(cx - fw / 2 - 0.5, cz, 1, fd);
  bush(cx + fw / 2 + 0.5, cz, 1, fd);
  // garden around the field
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    place(scene, i % 3 ? 'platformer/tree' : 'platformer/tree-pine', cx + side * (fw / 2 + 3 + (i % 3)), 0, cz - fd / 2 + (i >> 1) * (fd / 3), { s: 2.4 + (i % 2) * 0.5, ry: i });
  }
  for (let i = 0; i < 7; i++) place(scene, i % 2 ? 'platformer/flowers' : 'platformer/flowers-tall', cx - fw / 2 + 1 + i * (fw / 6.5), 0, cz - fd / 2 - 1.6, { s: 1.6, ry: i, shadow: false });
  place(scene, 'platformer/hedge', cx - fw / 2 - 2, 0, cz + fd / 2 + 0.6, { s: 2 });
  place(scene, 'platformer/hedge', cx + fw / 2 + 2, 0, cz + fd / 2 + 0.6, { s: 2 });
  place(scene, 'platformer/mushrooms', cx + fw / 2 + 1.8, 0, cz + fd / 4, { s: 1.6, shadow: false });
  // puffy clouds overhead (where the loot comes from)
  const cloudMat = toy('#ffffff', 0.6);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = mesh(new THREE.SphereGeometry(1.2 + (j % 2) * 0.5, 16, 12), cloudMat, { cast: false });
      puff.position.set(j * 1.4 - 2, (j % 2) * 0.4, 0);
      c.add(puff);
    }
    c.position.set(-16 + i * 8, 11 + (i % 2), -10 - (i % 3) * 3);
    scene.add(c);
    clouds.push(c);
  }

  const shadowGeo = new THREE.PlaneGeometry(2, 2);
  const shadowMat = softShadowMat(0.45);

  // Kenney platformer pickups: gold coins, jewels and round bombs
  const makeCoin = () => prop('platformer/coin-gold', 1.25);
  const makeGem = () => prop('platformer/jewel', 1.3);
  const makeAnvil = () => {
    const g = new THREE.Group();
    const bomb = prop('platformer/bomb', 1.8);
    bomb.name = 'bomb';
    const blast = glowSprite('#ffa030', 1, 0.9);
    blast.name = 'blast';
    g.add(bomb, blast);
    return g;
  };

  const pools = {
    coin: [] as THREE.Object3D[],
    gem: [] as THREE.Object3D[],
    anvil: [] as THREE.Object3D[],
    shadow: [] as THREE.Mesh[],
    tele: [] as Telegraph[],
  };
  const take = <T extends THREE.Object3D>(arr: T[], i: number, make: () => T): T => {
    while (arr.length <= i) {
      const o = make();
      scene.add(o);
      arr.push(o);
    }
    arr[i].visible = true;
    return arr[i];
  };

  const models = new Map<string, ChoppyModel>();
  for (const r of state.runners) {
    const p = players.find((q) => q.id === r.id);
    const m = new ChoppyModel(p?.color ?? '#fff', 0.8);
    models.set(r.id, m);
    scene.add(m.group);
  }
  const lastPos = new Map<string, [number, number]>();
  const fx = new Fx(scene);
  const prevRunner = new Map<string, { z: number; coins: number; stun: boolean }>();
  const boomed = new Set<string>();
  let last = state;

  return {
    scene,
    camera,
    update(s: CloudburstState, _p, t, dt) {
      last = s;
      clouds.forEach((c, i) => (c.position.x = ((-16 + i * 8 + t * 0.6 + 20) % 40) - 20));
      for (const arr of [pools.coin, pools.gem, pools.anvil, pools.shadow, pools.tele]) for (const o of arr) o.visible = false;
      const used = { coin: 0, gem: 0, anvil: 0, shadow: 0, tele: 0 };
      for (const d of s.drops) {
        const x = wx(d.x);
        const z = wz(d.y);
        const k = d.kind;
        const obj =
          k === 'coin'
            ? take(pools.coin, used.coin++, makeCoin)
            : k === 'gem'
              ? take(pools.gem, used.gem++, makeGem)
              : take(pools.anvil, used.anvil++, makeAnvil);
        const air = Math.max(0, d.fall) / FALL_TIME;
        const hoverY = k === 'anvil' ? 0 : 0.5 + Math.sin(t * 4 + d.x) * 0.08;
        obj.position.set(x, hoverY + air * DROP_HEIGHT, z);
        if (k === 'coin') obj.rotation.set(0, t * 4 + d.x, 0);
        if (k === 'gem') obj.rotation.set(0, t * 3, 0);
        if (k === 'anvil') {
          // falling bomb wobbles; on landing it bursts into a big puffy blast
          const landed = d.fall <= 0;
          const bomb = obj.getObjectByName('bomb')!;
          const blast = obj.getObjectByName('blast') as THREE.Sprite;
          bomb.visible = !landed;
          blast.visible = landed;
          obj.rotation.set(Math.sin(t * 9 + d.x) * 0.25, d.x, 0);
          if (landed) {
            const p = 1 - d.life / 0.6;
            const r = ANVIL_HIT * PX * (0.5 + Math.sqrt(p) * 0.7);
            blast.position.y = 0.8;
            blast.scale.setScalar(r * 3);
            blast.material.opacity = 0.95 * (1 - p) ** 1.5;
          }
        }
        // blink before vanishing
        if (k !== 'anvil' && d.fall <= 0 && d.life < 1) obj.visible = Math.floor(d.life * 10) % 2 === 0;
        if (d.fall > 0) {
          const p = 1 - air;
          if (k === 'anvil') {
            const tg = take(pools.tele, used.tele++, () => telegraph('#ff3020'));
            tg.position.set(x, 0.03, z);
            tg.scale.set(ANVIL_HIT * PX, 1, ANVIL_HIT * PX);
            tg.userData.prog.value = p;
            tg.userData.time.value = t;
          }
          // a soft contact shadow that tightens and darkens as the drop comes down
          const sh = take(pools.shadow, used.shadow++, () => {
            const m = new THREE.Mesh(shadowGeo, shadowMat);
            m.rotation.x = -Math.PI / 2;
            return m;
          });
          const rad = (k === 'anvil' ? 0.9 : 0.55) * (1.6 - p * 0.6);
          sh.scale.set(rad, rad, 1);
          sh.position.set(x, 0.025, z);
        }
      }
      // explosions, once per bomb
      const liveBombs = new Set<string>();
      for (const d of s.drops) {
        if (d.kind !== 'anvil' || d.fall > 0) continue;
        const key = `${d.x.toFixed(1)},${d.y.toFixed(1)}`;
        liveBombs.add(key);
        if (!boomed.has(key)) {
          boomed.add(key);
          fx.blast(new THREE.Vector3(wx(d.x), 0.6, wz(d.y)), ANVIL_HIT * PX * 0.8);
          shake(0.35);
        }
      }
      for (const k of boomed) if (!liveBombs.has(k)) boomed.delete(k);
      for (const r of s.runners) {
        const pr = prevRunner.get(r.id);
        const at = new THREE.Vector3(wx(r.x), 0.15, wz(r.y));
        if (pr) {
          if (pr.z > 4 && (r.z ?? 0) <= 0.01) fx.dust(at, 0.8);
          if (r.coins > pr.coins) fx.sparkle(at.clone().setY(1.6), r.coins - pr.coins >= 5 ? '#45e3ff' : '#ffd23f', r.coins - pr.coins >= 5 ? 18 : 9);
          if (r.stun > 0 && !pr.stun) fx.bonk(at.clone().setY(1.8));
        }
        prevRunner.set(r.id, { z: r.z ?? 0, coins: r.coins, stun: r.stun > 0 });
      }
      fx.update(dt);
      for (const r of s.runners) {
        const m = models.get(r.id)!;
        const prev = lastPos.get(r.id) ?? [r.x, r.y];
        const speed = Math.min(1, Math.hypot(r.x - prev[0], r.y - prev[1]) / Math.max(1e-3, dt) / 300);
        lastPos.set(r.id, [r.x, r.y]);
        m.group.position.set(wx(r.x), 0, wz(r.y));
        m.group.rotation.y = yaw(r.face);
        m.update(dt, { speed: r.stun > 0 ? 0 : speed, stunned: r.stun > 0, jump: ((r.z ?? 0) * PX) / 0.8 });
      }
    },
    tags(): Tag[] {
      return last.runners.map((r) => {
        const p = players.find((q) => q.id === r.id);
        return { pos: new THREE.Vector3(wx(r.x), 2.35, wz(r.y)), text: p?.name ?? '', color: p?.color };
      });
    },
  };
}
