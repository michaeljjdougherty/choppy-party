import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { ANVIL_HIT, AX0, AX1, AY0, AY1, FALL_TIME, type CloudburstState } from '../../../shared/games/coinCloudburst';
import { ChoppyModel } from '../choppy';
import { PX, makeScene, mesh, stripeTexture, toy, wx, wz, yaw } from '../kit';
import type { Tag, View } from '../stage';

const DROP_HEIGHT = 13;

export function coinsView(env: THREE.Texture, state: CloudburstState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { skyTop: '#6ccaff', skyBottom: '#e6f7ff', fog: ['#cdeeff', 35, 80], shadowSize: 22 });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 15.5, 15.5);
  camera.lookAt(0, 0, 1.2);

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
  const hedge = toy('#2f7d35', 0.8);
  const bush = (x: number, z: number, w: number, d: number) => {
    const b = mesh(new THREE.BoxGeometry(w, 0.8, d), hedge, { receive: true });
    b.position.set(x, 0.4, z);
    scene.add(b);
  };
  bush(cx, cz - fd / 2 - 0.5, fw + 2, 1);
  bush(cx - fw / 2 - 0.5, cz, 1, fd);
  bush(cx + fw / 2 + 0.5, cz, 1, fd);
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

  const coinGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 28);
  const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcb2f', roughness: 0.25, metalness: 0.6 });
  const gemGeo = new THREE.OctahedronGeometry(0.55);
  const gemMat = new THREE.MeshStandardMaterial({ color: '#45e3ff', roughness: 0.1, metalness: 0.2, emissive: '#0a4a66' });
  const anvilMat = new THREE.MeshStandardMaterial({ color: '#4b5160', roughness: 0.4, metalness: 0.5 });
  const shadowGeo = new THREE.CircleGeometry(1, 32);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false });
  const dangerMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.35, depthWrite: false });

  const makeAnvil = () => {
    const g = new THREE.Group();
    const top = mesh(new THREE.BoxGeometry(1.7, 0.35, 0.8), anvilMat);
    top.position.y = 0.85;
    const waist = mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), anvilMat);
    waist.position.y = 0.48;
    const base = mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), anvilMat);
    base.position.y = 0.15;
    const horn = mesh(new THREE.ConeGeometry(0.17, 0.6, 12), anvilMat);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(1.1, 0.88, 0);
    g.add(top, waist, base, horn);
    return g;
  };

  const pools = {
    coin: [] as THREE.Object3D[],
    gem: [] as THREE.Object3D[],
    anvil: [] as THREE.Object3D[],
    shadow: [] as THREE.Mesh[],
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
  let last = state;

  return {
    scene,
    camera,
    update(s: CloudburstState, _p, t, dt) {
      last = s;
      clouds.forEach((c, i) => (c.position.x = ((-16 + i * 8 + t * 0.6 + 20) % 40) - 20));
      for (const arr of [pools.coin, pools.gem, pools.anvil, pools.shadow]) for (const o of arr) o.visible = false;
      const used = { coin: 0, gem: 0, anvil: 0, shadow: 0 };
      for (const d of s.drops) {
        const x = wx(d.x);
        const z = wz(d.y);
        const k = d.kind;
        const obj =
          k === 'coin'
            ? take(pools.coin, used.coin++, () => mesh(coinGeo, coinMat))
            : k === 'gem'
              ? take(pools.gem, used.gem++, () => mesh(gemGeo, gemMat))
              : take(pools.anvil, used.anvil++, makeAnvil);
        const air = Math.max(0, d.fall) / FALL_TIME;
        const hoverY = k === 'anvil' ? 0 : 0.5 + Math.sin(t * 4 + d.x) * 0.08;
        obj.position.set(x, hoverY + air * DROP_HEIGHT, z);
        if (k === 'coin') obj.rotation.set(Math.PI / 2, 0, t * 4 + d.x);
        if (k === 'gem') obj.rotation.set(0, t * 3, 0);
        if (k === 'anvil') obj.rotation.set(0, d.x, 0);
        // blink before vanishing
        if (k !== 'anvil' && d.fall <= 0 && d.life < 1) obj.visible = Math.floor(d.life * 10) % 2 === 0;
        if (d.fall > 0) {
          const sh = take(pools.shadow, used.shadow++, () => {
            const m = new THREE.Mesh(shadowGeo, shadowMat);
            m.rotation.x = -Math.PI / 2;
            return m;
          });
          const p = 1 - air;
          const rad = (k === 'anvil' ? ANVIL_HIT : 16) * PX * (0.4 + p * 0.6);
          sh.material = k === 'anvil' ? dangerMat : shadowMat;
          sh.scale.set(rad, rad, 1);
          sh.position.set(x, 0.02, z);
        }
      }
      for (const r of s.runners) {
        const m = models.get(r.id)!;
        const prev = lastPos.get(r.id) ?? [r.x, r.y];
        const speed = Math.min(1, Math.hypot(r.x - prev[0], r.y - prev[1]) / Math.max(1e-3, dt) / 300);
        lastPos.set(r.id, [r.x, r.y]);
        m.group.position.set(wx(r.x), 0, wz(r.y));
        m.group.rotation.y = yaw(r.face);
        m.update(dt, { speed: r.stun > 0 ? 0 : speed, stunned: r.stun > 0, jump: r.pop > 0 ? r.pop : 0 });
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
