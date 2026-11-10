import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { TURNS, type LaserState } from '../../../shared/games/laserLimbo';
import { place } from '../assets';
import { ChoppyModel } from '../choppy';
import { Fx, shake } from '../fx';
import { PX, makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';

const H = 20; // ramp height
const CORE = 2.6; // reactor column radius
const WIDTH = 5.2; // ramp width
const LOW_Y = 0.45;
const HIGH_Y = 1.55;

const angleAt = (p: number) => p * TURNS * Math.PI * 2;
function spot(p: number, r: number, y = 0): THREE.Vector3 {
  const a = angleAt(p);
  return new THREE.Vector3(Math.cos(a) * r, p * H + y, Math.sin(a) * r);
}

/** Laser Limbo: a glowing reactor column on the moon base with a spiral ramp winding up around it. */
export function laserView(env: THREE.Texture, state: LaserState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'space-galaxy', skyTop: '#05041a', skyBottom: '#1a1450', sunColor: '#d8e0ff', sunIntensity: 2, shadowSize: 16, sunDir: [10, 30, 12] });
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 300);
  const ground = mesh(new THREE.CircleGeometry(70, 48), toy('#8d8aa3', 0.95), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  // reactor core: a glass column with a pulsing energy rod inside
  const coreMat = new THREE.MeshStandardMaterial({ color: '#41e8ff', emissive: '#41e8ff', emissiveIntensity: 1.6 });
  const rod = mesh(new THREE.CylinderGeometry(CORE * 0.45, CORE * 0.45, H + 4, 24), coreMat, { cast: false });
  rod.position.y = (H + 4) / 2;
  scene.add(rod);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(CORE, CORE, H + 4, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide }),
  );
  glass.position.y = (H + 4) / 2;
  scene.add(glass);
  for (let k = 0; k <= 6; k++) {
    const band = mesh(new THREE.TorusGeometry(CORE + 0.05, 0.12, 8, 40), toy('#3a3f5c', 0.4), { cast: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = k * ((H + 4) / 6);
    scene.add(band);
  }
  // the ramp: many short slabs following the helix, with a rail on the outside
  const segs = 220;
  const slabMat = toy('#b9c2ff', 0.55);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb020', emissiveIntensity: 0.6 });
  const arc = ((TURNS * Math.PI * 2) / segs) * (CORE + WIDTH / 2) * 1.08;
  for (let i = 0; i < segs; i++) {
    const p = (i + 0.5) / segs;
    const c = spot(p, CORE + WIDTH / 2);
    const slab = mesh(new THREE.BoxGeometry(WIDTH, 0.25, arc), slabMat, { receive: true });
    slab.position.set(c.x, c.y - 0.12, c.z);
    slab.rotation.y = -angleAt(p);
    scene.add(slab);
    if (i % 2 === 0) {
      const e = spot(p, CORE + WIDTH + 0.05);
      const post = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), edgeMat, { cast: false });
      post.position.set(e.x, e.y + 0.2, e.z);
      scene.add(post);
    }
  }
  // goal pad at the top
  const top = spot(1, CORE + WIDTH / 2);
  const flag = place(scene, 'platformer/flag', top.x, top.y, top.z, { s: 2.2 });
  flag.rotation.y = -angleAt(1);
  for (const [n, a, d, s] of [['space/satelliteDish_large', 0.6, 12, 2.6], ['space/machine_generator', 2, 10, 2.4], ['space/rover', 3.4, 12, 2.2], ['station/container-tall', 4.6, 11, 2.4], ['space/rock_crystalsLargeA', 5.6, 10, 2.5]] as [string, number, number, number][]) {
    place(scene, n, Math.cos(a) * d, 0, Math.sin(a) * d, { s, ry: -a });
  }
  const coreLight = new THREE.PointLight('#41e8ff', 30, 20, 2);
  scene.add(coreLight);

  // beams
  const beamGeo = new THREE.CylinderGeometry(0.09, 0.09, WIDTH + 0.6, 10);
  beamGeo.rotateZ(Math.PI / 2);
  const beamObjs = new Map<number, { g: THREE.Group; mat: THREE.MeshStandardMaterial; light: THREE.PointLight }>();
  const fx = new Fx(scene);
  const models = new Map<string, ChoppyModel>();
  const n = state.folk.length;
  for (const f of state.folk) {
    const m = new ChoppyModel(players.find((p) => p.id === f.id)?.color ?? '#fff', 0.55);
    scene.add(m.group);
    models.set(f.id, m);
  }
  const laneR = (lane: number) => CORE + 0.45 + ((lane + 0.5) / Math.max(1, n)) * (WIDTH - 0.9);
  const lastP = new Map<string, number>();
  const camAt = new THREE.Vector3(0, 6, 16);
  let camAng = 0.2;
  let camY = 2;
  let last = state;
  return {
    scene,
    camera,
    update(s: LaserState, _p, t, dt) {
      last = s;
      coreMat.emissiveIntensity = 1.4 + Math.sin(t * 4) * 0.4 + s.level * 0.08;
      // the camera follows the pack round the column
      const live = s.folk.filter((f) => f.outAt < 0);
      const lead = (live.length ? live : s.folk).reduce((a, f) => Math.max(a, f.p), 0);
      const mean = (live.length ? live : s.folk).reduce((a, f) => a + f.p, 0) / Math.max(1, (live.length ? live : s.folk).length);
      const focus = mean * 0.5 + lead * 0.5;
      camAng += (angleAt(focus) + 0.35 - camAng) * Math.min(1, dt * 2.5);
      camY += (focus * H - camY) * Math.min(1, dt * 2.5);
      camAt.set(Math.cos(camAng) * 19, camY + 8, Math.sin(camAng) * 19);
      camera.position.copy(camAt);
      camera.lookAt(Math.cos(camAng) * 4, camY + 1.5, Math.sin(camAng) * 4);
      coreLight.position.set(Math.cos(camAng) * 4, camY + 2, Math.sin(camAng) * 4);
      // laser arms
      const alive = new Set<number>();
      for (const b of s.beams) {
        alive.add(b.id);
        let o = beamObjs.get(b.id);
        if (!o) {
          const g = new THREE.Group();
          const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff3b3b', emissiveIntensity: 3 });
          const beam = mesh(beamGeo, mat, { cast: false });
          beam.position.x = CORE + WIDTH / 2;
          const emitter = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), toy('#3a3f5c', 0.4));
          emitter.position.x = CORE + 0.1;
          g.add(beam, emitter);
          const light = new THREE.PointLight('#ff3b3b', 6, 5, 2);
          light.position.x = CORE + WIDTH / 2;
          g.add(light);
          scene.add(g);
          o = { g, mat, light };
          beamObjs.set(b.id, o);
        }
        const col = b.high ? '#3b8bff' : '#ff3b3b';
        o.mat.emissive.set(col);
        o.light.color.set(col);
        const p = Math.min(1.02, b.p);
        o.g.position.set(0, p * H + (b.high ? HIGH_Y : LOW_Y), 0);
        o.g.rotation.y = -angleAt(p);
        o.g.visible = b.p < 1.03;
        o.mat.emissiveIntensity = 2.5 + Math.sin(t * 30) * 0.6;
      }
      for (const [id, o] of beamObjs)
        if (!alive.has(id)) {
          scene.remove(o.g);
          beamObjs.delete(id);
        }
      for (const z of s.zaps) {
        const f = s.folk.find((q) => q.id === z.id);
        if (!f) continue;
        const at = spot(f.p, laneR(f.lane), 1.2);
        fx.emit(at, { tex: 'star', color: [z.high ? '#3b8bff' : '#ff3b3b', '#ffffff'], n: 16, speed: [2, 5], up: 2, life: [0.3, 0.6], size: [0.5, 0.1], additive: true });
        fx.bonk(at);
        shake(0.2);
      }
      for (const f of s.folk) {
        const m = models.get(f.id)!;
        const pos = spot(f.p, laneR(f.lane), f.z * PX * 0.9);
        m.group.position.copy(pos);
        // face up the ramp (along the spiral)
        m.group.rotation.y = -angleAt(f.p) - Math.PI;
        const moved = Math.abs(f.p - (lastP.get(f.id) ?? f.p)) / Math.max(1e-3, dt);
        lastP.set(f.id, f.p);
        m.group.scale.set(0.55, f.duck ? 0.55 * 0.5 : 0.55, 0.55);
        m.group.visible = !(f.outAt >= 0 && s.t - f.outAt > 1.2);
        m.update(dt, { speed: Math.min(1, moved * 25), stunned: f.outAt >= 0 || f.safe > 0.5, happy: f.topAt >= 0, jump: (f.z * PX) / 0.55, t: t + f.lane });
      }
      fx.update(dt);
    },
    tags(): Tag[] {
      return last.folk
        .filter((f) => f.outAt < 0)
        .map((f) => {
          const p = players.find((q) => q.id === f.id);
          return { pos: spot(f.p, laneR(f.lane), 1.7 + f.z * PX), text: p?.name ?? '', color: p?.color, sub: f.hits ? '✕'.repeat(f.hits) : undefined, subColor: '#ff5a5f' };
        });
    },
  };
}
