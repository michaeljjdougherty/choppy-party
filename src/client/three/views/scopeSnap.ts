import * as THREE from 'three';
import type { PlayerInfo } from '../../../shared/types';
import { TEAM_HEX } from '../../../shared/games/hud';
import { EYE, SNAP_HUD, ZOOM_IN, type SnapState, type Wall } from '../../../shared/games/scopeSnap';
import { place, texture } from '../assets';
import { ChoppyModel, LOCAL } from '../choppy';
import { Fx, shake } from '../fx';
import { makeScene, mesh, toy, yaw } from '../kit';
import type { Tag, View } from '../stage';
import { sfx } from '../../sfx';
import { fitProp } from './crew';

/**
 * The client tells first-person views how far each local player has turned their mouse / stick, so
 * online aiming doesn't wait a round trip for the host (see predictedYaw below).
 */
export const FPS_LOOK = { total: (_id: string): { x: number; y: number } | null => null, online: () => false };

const HIP_FOV = 74;
const SCOPE_FOV = 22;
const BODY_H = 1.75;

function boxed(name: string, w: number, h: number, d: number): THREE.Object3D {
  const o = fitProp(name, 1, 'max');
  const b = new THREE.Box3().setFromObject(o);
  const sz = b.getSize(new THREE.Vector3());
  if (sz.x < 1e-3) return o;
  o.scale.multiply(new THREE.Vector3(w / sz.x, h / Math.max(1e-3, sz.y), d / Math.max(1e-3, sz.z)));
  const b2 = new THREE.Box3().setFromObject(o);
  const c = b2.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -b2.min.y, -c.z);
  const g = new THREE.Group();
  g.add(o);
  return g;
}

/** The toy Snap Rifle: a chunky orange body, blue barrel, a scope on top. Points down +z. */
function snapRifle(accent: string): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.12, 0.14, 0.6), toy('#ff8a1f', 0.45));
  const barrel = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), toy('#3fa9f5', 0.35));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.5;
  const tip = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), toy('#ffd23f', 0.4));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.76;
  const scope = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 12), toy('#2a2f4a', 0.3));
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.12, 0.05);
  const lens = mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: '#7cf0ff' }), { cast: false });
  lens.position.set(0, 0.12, -0.101);
  lens.rotation.y = Math.PI;
  const grip = mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), toy(accent, 0.5));
  grip.position.set(0, -0.12, -0.12);
  grip.rotation.x = -0.35;
  const stock = mesh(new THREE.BoxGeometry(0.1, 0.16, 0.22), toy(accent, 0.5));
  stock.position.set(0, -0.02, -0.38);
  g.add(body, barrel, tip, scope, lens, grip, stock);
  // the photo surface detail turns to noise this close to your eyes
  g.userData.noDetail = true;
  return g;
}

function setLayer(o: THREE.Object3D, layer: number): void {
  o.traverse((c) => c.layers.set(layer));
}

interface Eye {
  id: string;
  cam: THREE.PerspectiveCamera;
  gun: THREE.Group;
  rect: { x: number; y: number; w: number; h: number };
  yaw: number;
  baseYaw: number;
  baseTotal: number;
  deaths: number;
  kick: number;
  shots: number;
  lastTotal: number;
}

export function scopeSnapView(env: THREE.Texture, state: SnapState, players: PlayerInfo[]): View {
  const scene = makeScene(env, { sky: 'space-nebula', skyTop: '#0b0e2a', skyBottom: '#2b2060', fog: ['#1a1d44', 45, 140], sunColor: '#dfe6ff', sunIntensity: 2.0, shadowSize: 22, sunDir: [10, 24, 6] });
  const W = state.hw, D = state.hd;
  // deck
  const floor = mesh(new THREE.BoxGeometry(W * 2 + 2, 0.3, D * 2 + 2), new THREE.MeshStandardMaterial({ map: texture('floor_tiles_blue_small', W, D), color: '#c4cff5', roughness: 0.55 }), { receive: true });
  floor.position.y = -0.15;
  floor.userData.noDetail = true;
  scene.add(floor);
  // glowing guide strips down the deck
  const glow = new THREE.MeshBasicMaterial({ color: '#57e1ff' });
  for (const z of [-D + 1.2, D - 1.2]) {
    const st = mesh(new THREE.BoxGeometry(W * 2 - 2, 0.03, 0.12), glow, { cast: false });
    st.position.set(0, 0.02, z);
    scene.add(st);
  }
  const ring = mesh(new THREE.RingGeometry(2.6, 2.85, 48), new THREE.MeshBasicMaterial({ color: '#ffb020', side: THREE.DoubleSide }), { cast: false });
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#8f9bd2', roughness: 0.55, metalness: 0.15 });
  const pillarMat = toy('#ffb020', 0.4);
  const trim = new THREE.MeshBasicMaterial({ color: '#57e1ff' });
  const addWall = (w: Wall) => {
    const sx = w.x1 - w.x0, sz = w.z1 - w.z0;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    if (w.kind === 'crate') {
      const c = boxed('station/container', sx, w.h, sz);
      c.position.set(cx, 0, cz);
      c.userData.noDetail = true;
      scene.add(c);
      // a box behind the model in case it is still loading
      const b = mesh(new THREE.BoxGeometry(sx * 0.96, w.h * 0.96, sz * 0.96), toy('#8a96c8', 0.6), { receive: true });
      b.position.set(cx, w.h * 0.48, cz);
      b.userData.noDetail = true;
      scene.add(b);
      return;
    }
    const m = mesh(new THREE.BoxGeometry(sx, w.h, sz), w.kind === 'pillar' ? pillarMat : wallMat, { receive: true });
    m.position.set(cx, w.h / 2, cz);
    m.userData.noDetail = true;
    scene.add(m);
    const t = mesh(new THREE.BoxGeometry(sx + 0.04, 0.08, sz + 0.04), trim, { cast: false });
    t.position.set(cx, w.h - 0.25, cz);
    scene.add(t);
  };
  state.walls.forEach(addWall);
  // the station around the deck, seen over the hull
  for (const sx of [-1, 1]) {
    place(scene, 'space/satelliteDish_large', sx * (W + 10), 0, -D - 14, { s: 6, ry: sx * 0.6 });
    place(scene, 'space/rocket_baseA', sx * (W + 12), 0, D + 12, { s: 5 });
    place(scene, 'space/hangar_roundGlass', sx * (W + 22), 0, 0, { s: 7, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
    place(scene, 'station/computer-system', sx * (W - 0.4), 0, -D + 0.6, { s: 1.6, ry: 0 });
  }
  for (let x = -W + 3; x <= W - 3; x += 6) place(scene, 'space/machine_generator', x, 0, -D - 5, { s: 3 });

  const fx = new Fx(scene);
  // the players
  const local = players.filter((p) => !p.bot && LOCAL.has(p.id)).slice(0, 4);
  const rects = layout(local.length);
  const models = new Map<string, { m: ChoppyModel; shield: THREE.Mesh; gun: THREE.Group }>();
  const probe = new ChoppyModel('#ffffff', 1);
  // measure the body alone (the hidden dizzy stars float above the head)
  const h0 = new THREE.Box3().setFromObject(probe.group.children[0]).getSize(new THREE.Vector3()).y || 1.8;
  const scale = BODY_H / h0;
  const shieldMat = new THREE.MeshBasicMaterial({ color: '#7cf0ff', transparent: true, opacity: 0.22, depthWrite: false });
  for (const p of players) {
    const m = new ChoppyModel(p.color, scale);
    const sn = state.players.find((q) => q.id === p.id);
    const team = sn && sn.team >= 0 ? sn.team : -1;
    const gun = snapRifle(team >= 0 ? TEAM_HEX[team] : p.color);
    gun.position.set(0.32, 1.05, 0.25);
    m.group.add(gun);
    if (team >= 0) {
      // team games: a glowing team-coloured halo over each player's head, seen from across the deck
      const halo = mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: TEAM_HEX[team] }), { cast: false });
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 2.05 / scale;
      m.group.add(halo);
    }
    const shield = mesh(new THREE.SphereGeometry(1.1, 18, 12), shieldMat, { cast: false });
    shield.position.y = 0.95;
    m.group.add(shield);
    scene.add(m.group);
    const li = local.findIndex((q) => q.id === p.id);
    // you don't see your own body in your view, but your split-screen friends do
    if (li >= 0) setLayer(m.group, li + 1);
    models.set(p.id, { m, shield, gun });
  }
  const eyes: Eye[] = local.map((p, i) => {
    const cam = new THREE.PerspectiveCamera(HIP_FOV, rects[i].w / rects[i].h, 0.05, 220);
    cam.rotation.order = 'YXZ';
    cam.layers.enable(0);
    for (let j = 0; j < 4; j++) if (j !== i) cam.layers.enable(j + 1);
    cam.layers.disable(i + 1);
    cam.layers.enable(11 + i);
    const gun = snapRifle(p.color);
    gun.position.set(0.26, -0.24, -0.5);
    gun.rotation.y = Math.PI;
    gun.scale.setScalar(0.8);
    const flash = mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, depthWrite: false }), { cast: false });
    flash.position.z = 0.84;
    flash.name = 'flash';
    gun.add(flash);
    setLayer(gun, 11 + i);
    cam.add(gun);
    scene.add(cam);
    const me = state.players.find((q) => q.id === p.id);
    return { id: p.id, cam, gun, rect: rects[i], yaw: me?.yaw ?? 0, baseYaw: me?.yaw ?? 0, baseTotal: NaN, deaths: me?.deaths ?? 0, kick: 0, shots: 0, lastTotal: NaN };
  });
  // a light that follows the first player, so the gun in your hands isn't in shadow
  const handLight = new THREE.PointLight('#ffffff', 2.5, 4);
  if (eyes.length) eyes[0].cam.add(handLight);
  // spectators (and the lobby preview) watch from above
  const over = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 300);
  // spectators get a top-down view of the whole deck
  over.position.set(0, W > 12 ? 44 : 34, 6);
  over.lookAt(0, 0, 0.6);
  for (let j = 1; j <= 4; j++) over.layers.enable(j);
  scene.add(over);
  const split = eyes.length > 1 ? eyes.map((e) => ({ camera: e.cam, ...e.rect })) : undefined;
  if (split && eyes.length === 3) split.push({ camera: over, ...rects[3] });

  // tracers
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracers: THREE.Mesh[] = [];
  const tracerAt = (i: number) => {
    while (tracers.length <= i) {
      const t = mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), { cast: false });
      scene.add(t);
      tracers.push(t);
    }
    return tracers[i];
  };
  const darts: THREE.Mesh[] = [];
  const dartGeo = new THREE.CapsuleGeometry(0.05, 0.12, 3, 6);
  const seenPop = new Set<string>();
  const seenShot = new Set(state.tracers.map((tr) => `${tr.by}:${tr.t.toFixed(3)}`));
  let last = state;
  const tmp = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();
  const starts = new Map<string, THREE.Vector3>();

  return {
    scene,
    camera: eyes[0]?.cam ?? over,
    split,
    fps: eyes.length > 0,
    update(s: SnapState, ps: PlayerInfo[], t, dt) {
      last = s;
      SNAP_HUD.views = eyes.map((e) => ({ id: e.id, ...e.rect }));
      // models
      for (const p of s.players) {
        const v = models.get(p.id);
        if (!v) continue;
        v.m.group.visible = p.alive;
        v.m.group.position.set(p.x, p.y, p.z);
        v.m.group.rotation.y = yaw(p.yaw);
        v.shield.visible = p.shield > 0;
        v.m.update(dt, { speed: Math.min(1, Math.hypot(p.vx, p.vz) / 6.4), jump: p.y, t });
        v.gun.rotation.x = p.scopeT >= 0 ? -0.05 : 0.15;
        // outlines and effects get added to models later: keep your own body out of your own view
        const li = eyes.findIndex((e) => e.id === p.id);
        if (li >= 0) setLayer(v.m.group, li + 1);
      }
      // pops: confetti where they stood
      for (const pp of s.popsAt) {
        const key = `${pp.id}:${pp.t.toFixed(2)}`;
        if (seenPop.has(key)) continue;
        seenPop.add(key);
        const col = ps.find((q) => q.id === pp.id)?.color ?? '#ffffff';
        fx.party(tmp.set(pp.x, 1, pp.z));
        fx.sparkle(tmp.set(pp.x, 1.2, pp.z), col, 16);
        sfx.hit(true);
        if (eyes.some((e) => e.id === pp.id)) shake(0.25);
      }
      // new shots
      let n = 0;
      for (const tr of s.tracers) {
        const age = s.t - tr.t;
        const sk = `${tr.by}:${tr.t.toFixed(3)}`;
        if (!seenShot.has(sk)) {
          seenShot.add(sk);
          const e = eyes.find((q) => q.id === tr.by);
          // the trail starts at the gun's muzzle: the one in your hands, or the one the shooter holds
          const shooter = models.get(tr.by);
          const muzzleOf = e && e.gun.visible ? e.gun : shooter?.gun;
          const start = new THREE.Vector3(tr.x0, EYE - 0.25, tr.z0);
          if (muzzleOf) {
            muzzleOf.updateWorldMatrix(true, false);
            muzzleOf.localToWorld(start.set(0, 0, 0.8));
          }
          starts.set(sk, start);
          // a muzzle flash that really lights the deck, and a pop of sparks where the shot lands
          const col = ps.find((q) => q.id === tr.by)?.color ?? '#ffffff';
          fx.flash(start, '#fff0c0', 14, 5);
          fx.emit(new THREE.Vector3(tr.x1, tr.hit ? 1.1 : EYE - 0.1, tr.z1), { tex: 'star', color: [col, '#ffffff'], n: tr.hit ? 10 : 5, speed: [2, 4], spread: 0.9, up: 1, life: [0.15, 0.35], size: [0.3, 0.05], gravity: 8, additive: true });
          if (!e && shooter) fx.sparkle(start, '#ffe066', 4);
          if (e) {
            e.kick = 1;
            sfx.bump();
          } else if (eyes.length) sfx.miss();
          if (!tr.hit) {
            // a foam dart stuck where it landed
            const dm = darts.length < 30 ? mesh(dartGeo, toy(ps.find((q) => q.id === tr.by)?.color ?? '#fff', 0.5), { cast: false }) : darts.shift()!;
            dm.position.set(tr.x1, 1.25, tr.z1);
            dm.rotation.set(Math.PI / 2, 0, -Math.atan2(tr.z1 - tr.z0, tr.x1 - tr.x0) + Math.PI / 2);
            scene.add(dm);
            darts.push(dm);
          }
        }
        if (age > 0.28 || age < 0) continue;
        const m = tracerAt(n++);
        const a = starts.get(sk) ?? tmp.set(tr.x0, EYE - 0.25, tr.z0);
        // it ends where the crosshair was: eye height, or the middle of whoever it popped
        const end = tmpEnd.set(tr.x1, tr.hit ? 1.1 : EYE - 0.1, tr.z1);
        m.visible = true;
        m.position.copy(a).add(end).multiplyScalar(0.5);
        m.scale.set(0.06 * (1 - age / 0.28) + 0.02, 0.06 * (1 - age / 0.28) + 0.02, a.distanceTo(end));
        m.lookAt(end);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(ps.find((q) => q.id === tr.by)?.color ?? '#ffffff').lerp(new THREE.Color('#ffffff'), 0.4);
        mat.opacity = 1 - age / 0.28;
      }
      for (let i = n; i < tracers.length; i++) tracers[i].visible = false;
      if (starts.size > 40) for (const k of [...starts.keys()].slice(0, starts.size - 40)) starts.delete(k);
      fx.update(dt);
      // first-person cameras
      for (const e of eyes) {
        const p = s.players.find((q) => q.id === e.id);
        if (!p) continue;
        const yawNow = predictedYaw(e, p);
        const zoom = p.alive && p.scopeT >= 0 ? Math.min(1, p.scopeT / ZOOM_IN) : 0;
        const fov = HIP_FOV + (SCOPE_FOV - HIP_FOV) * zoom;
        if (Math.abs(e.cam.fov - fov) > 0.01) {
          e.cam.fov = fov;
          e.cam.updateProjectionMatrix();
        }
        const moving = Math.hypot(p.vx, p.vz) / 6.4;
        const bob = p.y <= 0 ? Math.sin(p.moving * 11) * 0.04 * moving : 0;
        if (p.alive) {
          e.cam.position.set(p.x, p.y + EYE + bob, p.z);
          e.cam.rotation.set(p.pitch, -yawNow - Math.PI / 2, 0);
        } else {
          // popped: float up and look down at the spot
          e.cam.position.set(p.x, EYE + 2.5, p.z + 0.01);
          e.cam.rotation.set(-1.2, -yawNow - Math.PI / 2, 0);
        }
        e.kick = Math.max(0, e.kick - dt * 5);
        e.gun.visible = p.alive && zoom < 0.5;
        e.gun.position.set(0.28 + Math.sin(p.moving * 5.5) * 0.015 * moving, -0.25 + bob * 0.5 + e.kick * 0.03, -0.55 + e.kick * 0.09);
        e.gun.rotation.x = e.kick * 0.25;
        const fl = e.gun.getObjectByName('flash');
        if (fl) fl.visible = e.kick > 0.75;
      }
    },
    tags(): Tag[] {
      if (eyes.length > 1) return [];
      if (eyes.length) {
        // team games: name tags over your teammates, so you know who not to worry about
        const me = last.players.find((p) => p.id === eyes[0].id);
        if (!me || me.team < 0) return [];
        return last.players.filter((p) => p.alive && p !== me && p.team === me.team).map((p) => ({ id: p.id, pos: new THREE.Vector3(p.x, p.y + BODY_H + 0.45, p.z), text: players.find((q) => q.id === p.id)?.name ?? '', color: TEAM_HEX[p.team] }));
      }
      return last.players.filter((p) => p.alive).map((p) => ({ id: p.id, pos: new THREE.Vector3(p.x, BODY_H + 0.5, p.z), text: players.find((q) => q.id === p.id)?.name ?? '', color: p.team >= 0 ? TEAM_HEX[p.team] : undefined, sub: String(p.score), subColor: '#ffd23f' }));
    },
  };
}

/** Where each local player's view goes on the 1280x720 screen. */
function layout(n: number): { x: number; y: number; w: number; h: number }[] {
  if (n <= 1) return [{ x: 0, y: 0, w: 1280, h: 720 }];
  if (n === 2)
    return [
      { x: 0, y: 0, w: 640, h: 720 },
      { x: 640, y: 0, w: 640, h: 720 },
    ];
  return [
    { x: 0, y: 0, w: 640, h: 360 },
    { x: 640, y: 0, w: 640, h: 360 },
    { x: 0, y: 360, w: 640, h: 360 },
    { x: 640, y: 360, w: 640, h: 360 },
  ];
}

/**
 * Online, the host owns everyone's facing, so turning would lag by a round trip. Your own view turns
 * straight from your mouse / stick instead, starting from the host's facing whenever you (re)spawn.
 */
function predictedYaw(e: Eye, p: SnapState['players'][number]): number {
  if (!FPS_LOOK.online()) return p.yaw;
  const tot = FPS_LOOK.total(e.id);
  if (!tot) return p.yaw;
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  if (Number.isNaN(e.baseTotal) || p.deaths !== e.deaths || !p.alive || Math.abs(wrapA(e.yaw - p.yaw)) > 1.2) {
    e.deaths = p.deaths;
    e.baseYaw = p.yaw;
    e.baseTotal = tot.x;
  }
  const sens = p.scopeT >= 0 ? 0.38 : 1;
  // fold the new turning in, then reset the base so a scope change only affects what comes after
  e.yaw = e.baseYaw + (tot.x - e.baseTotal) * sens;
  e.baseYaw = e.yaw;
  e.baseTotal = tot.x;
  // while you hold still, settle onto the host's facing so any rounding never builds up
  if (tot.x === e.lastTotal) e.yaw += wrapA(p.yaw - e.yaw) * 0.08;
  e.lastTotal = tot.x;
  e.baseYaw = e.yaw;
  return e.yaw;
}
