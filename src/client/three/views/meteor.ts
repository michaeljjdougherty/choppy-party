import * as THREE from 'three';
import { glowSprite, telegraph, trail, trailMaterial, type Telegraph } from '../look/fxKit';
import { moltenMaterial, rockGeometry } from '../life/rocks';
import { emberTex, scorchTex } from '../life/setPieces';
import type { PlayerInfo } from '../../../shared/types';
import { BLAST, FALL, MCX, MCY, MR, type MeteorState } from '../../../shared/games/meteorShower';
import { place, texture } from '../assets';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy, wx, wz } from '../kit';
import type { View } from '../stage';
import { crew, pool } from './crew';

/** Meteor Shower: a round moon base under a nebula sky, ringed by Space Kit gear. */
export function meteorView(env: THREE.Texture, state: MeteorState, players: PlayerInfo[]): View {
  const scene = makeScene(env, {
    sky: 'space-nebula',
    skyTop: '#05041a',
    skyBottom: '#2a1660',
    sunColor: '#e8e4ff',
    sunIntensity: 2.4,
    shadowSize: 14,
  });
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  camera.position.set(0, 15.5, 14.5);
  camera.lookAt(0, 0, 1.4);

  const cx = wx(MCX);
  const cz = wz(MCY);
  const r = MR * PX;
  // grey moon dust all around, the base deck in the middle
  const moon = mesh(new THREE.CircleGeometry(80, 48), toy('#8d8aa3', 0.95), { cast: false, receive: true });
  moon.rotation.x = -Math.PI / 2;
  moon.position.y = -0.05;
  scene.add(moon);
  const deckTex = texture('proto-dark', 6, 6);
  const deck = mesh(new THREE.CylinderGeometry(r, r + 0.15, 0.3, 64), new THREE.MeshStandardMaterial({ map: deckTex, color: '#b9c2ff', roughness: 0.6 }), {
    receive: true,
  });
  deck.position.set(cx, -0.15, cz);
  scene.add(deck);
  // glowing force-field rim
  const rimMat = new THREE.MeshStandardMaterial({ color: '#41e8ff', emissive: '#41e8ff', emissiveIntensity: 1.6 });
  const rim = mesh(new THREE.TorusGeometry(r, 0.12, 10, 96), rimMat, { cast: false });
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(cx, 0.05, cz);
  scene.add(rim);
  const domeMat = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(cx, 0, cz);
  dome.scale.y = 0.45;
  scene.add(dome);

  // Space Kit around the base
  const ring = (a: number, d: number) => [cx + Math.cos(a) * d, cz + Math.sin(a) * d] as const;
  const gear: [string, number, number, number][] = [
    ['space/hangar_roundGlass', -2.3, 11.5, 2.6], ['space/satelliteDish_large', -1.6, 10.5, 2.6], ['space/machine_generator', -0.9, 10, 2.2],
    ['space/rover', -0.4, 11, 2.2], ['space/rock_crystalsLargeA', 0.3, 10.5, 2.5], ['space/machine_wireless', 3.6, 10.5, 2.4],
    ['space/craft_speederA', 3.1, 12, 2.2], ['space/satelliteDish', 4.2, 10.5, 2.4], ['space/rock_crystals', 2.3, 9.8, 2.2],
    ['station/container-tall', -2.9, 10.2, 2.2], ['station/container', -3.3, 10.6, 2.2], ['space/turret_double', 1.0, 11.5, 2.2],
  ];
  for (const [name, a, d, s] of gear) {
    const [x, z] = ring(a, d);
    place(scene, name, x, 0, z, { s, ry: -a + Math.PI / 2 });
  }
  for (let i = 0; i < 10; i++) {
    const [x, z] = ring(i * 0.63 + 0.2, 9 + (i % 3) * 3);
    place(scene, i % 2 ? 'space/crater' : 'space/craterLarge', x, -0.02, z, { s: 2 + (i % 3), shadow: false });
  }
  // rocket on its pad behind the base
  const rocket = new THREE.Group();
  ['space/rocket_baseA', 'space/rocket_fuelA', 'space/rocket_fuelA', 'space/rocket_sidesA', 'space/rocket_topA'].forEach((n, i) => {
    place(rocket, n, 0, i * 1, 0, { s: 1 });
  });
  place(rocket, 'space/rocket_finsA', 0, 0, 0, { s: 1 });
  rocket.scale.setScalar(2.2);
  rocket.position.set(cx + 9.5, 0, cz - 9);
  scene.add(rocket);

  const fx = new Fx(scene);
  const team = crew(scene, players, state.astros, fx);
  // meteor models + the red target rings under them
  // molten rocks with a hot halo and a soft fire tail, over a telegraph that closes in as they arrive
  const molten = moltenMaterial();
  const tailMat = trailMaterial('#fff0b0', '#ff3a10');
  const meteorPool = pool(scene, () => {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(rockGeometry(0.75, 3 + Math.random() * 5, 0.3), molten);
    rock.castShadow = true;
    rock.name = 'rock';
    g.add(rock, glowSprite('#ff8a3a', 3.4, 0.9));
    return g;
  });
  const telePool = pool(scene, () => telegraph('#ff4030'));
  // craters: a charred scorch with embers still glowing in it (they cool as the crater fades)
  const craterPool = pool(scene, () => {
    const g = new THREE.Group();
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: emberTex(), color: '#ff7a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ember.position.y = 0.01;
    ember.name = 'ember';
    g.add(scorch, ember);
    return g;
  });
  const trailPool = pool(scene, () => trail(tailMat, 0.75, 6));
  const hearts = new Map(state.astros.map((a) => [a.id, a.hearts]));
  let last = state;

  return {
    scene,
    camera,
    update(s: MeteorState, _p, t, dt) {
      last = s;
      rimMat.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.4;
      rocket.position.y = 0;
      meteorPool.begin();
      telePool.begin();
      tailMat.userData.time.value = t;
      molten.userData.glow.value = 1.6 + Math.sin(t * 7) * 0.25;
      trailPool.begin();
      craterPool.begin();
      const tilt = new THREE.Vector3(0.45, 1, 0.25).normalize();
      for (const m of s.meteors) {
        const x = wx(m.x);
        const z = wz(m.y);
        const k = Math.max(0, m.fall) / FALL;
        const h = k * 18;
        const obj = meteorPool.take();
        obj.position.set(x + tilt.x * h, 0.6 + tilt.y * h, z + tilt.z * h);
        obj.getObjectByName('rock')!.rotation.set(t * 3, t * 2 + m.x, 0);
        const tr = trailPool.take();
        tr.position.copy(obj.position);
        tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tilt);
        const rad = BLAST * PX;
        const tg = telePool.take() as Telegraph;
        tg.position.set(x, 0.04, z);
        tg.scale.set(rad, 1, rad);
        tg.userData.prog.value = 1 - k;
        tg.userData.time.value = t;
      }
      for (const c of s.craters) {
        const o = craterPool.take();
        const shrink = Math.min(1, c.life / 0.8);
        o.scale.setScalar(shrink);
        const em = o.getObjectByName('ember') as THREE.Mesh;
        (em.material as THREE.MeshBasicMaterial).opacity = Math.min(1, c.life * 0.6) * (0.75 + Math.sin(t * 5 + c.x) * 0.2);
        o.position.set(wx(c.x), 0.01, wz(c.y));
      }
      for (const b of s.booms) {
        fx.blast(new THREE.Vector3(wx(b.x), 0.6, wz(b.y)), BLAST * PX);
        shake(0.3);
      }
      for (const a of s.astros) {
        const was = hearts.get(a.id) ?? a.hearts;
        if (a.hearts < was) fx.bonk(new THREE.Vector3(wx(a.x), 1.8 + (a.z ?? 0) * PX, wz(a.y)));
        hearts.set(a.id, a.hearts);
      }
      fx.update(dt);
      team.update(s.astros, dt, (r) => {
        const a = r as MeteorState['astros'][number];
        const out = a.outAt >= 0;
        // flicker while invulnerable; knocked-out astronauts float off into space
        return { stunned: a.safe > 0.8 || out, hidden: (out && s.t - a.outAt > 1.6) || (a.safe > 0 && Math.floor(t * 14) % 2 === 0) };
      });
    },
    tags() {
      return team.tags(last.astros, 2.35, () => '', (r) => (r as MeteorState['astros'][number]).outAt >= 0);
    },
  };
}
