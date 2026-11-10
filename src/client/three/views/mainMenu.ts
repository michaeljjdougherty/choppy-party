import * as THREE from 'three';
import { ChoppyModel } from '../choppy';
import { makeScene, mesh, toy, toonWater } from '../kit';
import { place } from '../assets';
import { Fx } from '../fx';
import type { Tag, View } from '../stage';
import { PLAYER_COLORS } from '../../../shared/players';
import { sandMaterial } from '../nature';

/**
 * Title and main menu: the party island at dusk. A light-up disco floor, searchlights sweeping
 * the sky, marquee bulbs chasing round the shore, lanterns drifting up off the sea and fireworks
 * over the water, with the Choppies dancing in the middle.
 */
const NEON = ['#ff3d9a', '#ffd23f', '#2ee6d6', '#9a5bff', '#4cd97b', '#ff8a1f'];

export function mainMenuView(env: THREE.Texture, screen: () => string = () => 'title'): View {
  const scene = makeScene(env, {
    skyTop: '#1b0f4a',
    skyBottom: '#ff7a59',
    fog: ['#3a1d63', 50, 160],
    sunDir: [-14, 9, -18],
    sunColor: '#ffb27a',
    sunIntensity: 1.1,
    shadowSize: 16,
  });
  const skyTex = duskSky();
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTex;
  scene.environmentIntensity = 0.3;
  // dusk: dim the daylight fill to a violet/teal wash so the neon carries the scene
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) {
      o.color.set('#8a7cff');
      o.groundColor.set('#3a2050');
      o.intensity = 0.55;
    }
  });
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400);
  const fx = new Fx(scene);

  // sea, with the sunset streaking across it
  const water = toonWater('#2b3a8f', 60);
  const sea = mesh(new THREE.CircleGeometry(260, 64), water.material, { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.2;
  scene.add(sea);
  const glint = mesh(
    new THREE.PlaneGeometry(22, 150),
    new THREE.MeshBasicMaterial({ map: glowStrip(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    { cast: false },
  );
  glint.rotation.x = -Math.PI / 2;
  glint.rotation.z = 0.2;
  glint.position.set(-14, -1.1, -80);
  scene.add(glint);

  // island and beach
  const island = mesh(new THREE.CylinderGeometry(9, 10.5, 2.4, 48), toy('#2f7a4a', 0.8), { receive: true });
  island.position.y = -0.95;
  scene.add(island);
  const beach = mesh(new THREE.CylinderGeometry(10.6, 11.5, 0.6, 48), sandMaterial('#e3b48e', 6), { cast: false, receive: true });
  beach.position.y = -1.3;
  scene.add(beach);

  // marquee bulbs round the shore, chasing like a carnival sign
  const bulbs: THREE.MeshStandardMaterial[] = [];
  const bulbGeo = new THREE.SphereGeometry(0.17, 10, 8);
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const m = new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: NEON[[1, 0, 2][i % 3]], emissiveIntensity: 2 });
    const b = mesh(bulbGeo, m, { cast: false });
    b.position.set(Math.cos(a) * 9.2, 0.34, Math.sin(a) * 9.2);
    scene.add(b);
    bulbs.push(m);
  }

  // the light-up disco floor
  const tiles: { m: THREE.MeshStandardMaterial; i: number; j: number }[] = [];
  const tileGeo = new THREE.BoxGeometry(1.12, 0.14, 1.12);
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      if (i * i + j * j > 10) continue;
      const m = new THREE.MeshStandardMaterial({ color: '#241a40', emissive: '#ff3d9a', emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 });
      const t = mesh(tileGeo, m, { cast: false, receive: true });
      t.position.set(i * 1.2, 0.3, j * 1.2);
      scene.add(t);
      tiles.push({ m, i, j });
    }
  const rimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#2ee6d6', emissiveIntensity: 2.4 });
  const rim = mesh(new THREE.TorusGeometry(4.3, 0.09, 8, 80), rimMat, { cast: false });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.4;
  scene.add(rim);

  // giant spinning dice with glowing edges
  const dice = new THREE.Group();
  dice.add(mesh(new THREE.BoxGeometry(2, 2, 2), [face('3'), face('6'), face('9'), face('1'), face('5'), face('7')]));
  dice.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.04, 2.04, 2.04)), new THREE.LineBasicMaterial({ color: '#ffe680' })));
  scene.add(dice);
  const diceGlow = new THREE.PointLight('#ffd23f', 18, 10, 2);
  scene.add(diceGlow);

  // party lights roaming over the floor
  const party = [NEON[0], NEON[2], NEON[3]].map((c) => {
    const l = new THREE.PointLight(c, 30, 14, 2);
    scene.add(l);
    return l;
  });

  // searchlights on the beach, sweeping the sky
  const beamTexture = beamTex();
  const beams: { g: THREE.Group; phase: number }[] = [];
  ([[-7.4, -4.6], [7.2, -4.8], [-4.4, -7.6], [4.4, -7.6]] as [number, number][]).forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0.5, z);
    const mat = new THREE.MeshBasicMaterial({
      map: beamTexture,
      color: [NEON[0], NEON[2], NEON[1], NEON[3]][i],
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const cone = mesh(new THREE.CylinderGeometry(3, 0.3, 46, 24, 1, true), mat, { cast: false });
    cone.position.y = 23;
    g.add(cone);
    const lamp = mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.8, 16), toy('#2a2a35', 0.4));
    lamp.position.y = 0.2;
    g.add(lamp);
    scene.add(g);
    beams.push({ g, phase: i * 1.7 });
  });

  // pirate-kit dressing: palms, a dock, treasure, torches, and ships out at sea
  place(scene, 'pirate/palm-detailed-bend', -7, 0.2, -4, { s: 1.0, ry: 0.6 });
  place(scene, 'pirate/palm-detailed-straight', 6.5, 0.2, -5, { s: 1.1 });
  place(scene, 'pirate/palm-bend', -8, 0.2, 1.5, { s: 0.9, ry: -1 });
  place(scene, 'pirate/palm-detailed-straight', 8.2, 0.2, 0.5, { s: 0.9, ry: 2 });
  place(scene, 'pirate/chest', 4.8, 0.2, 2.8, { s: 1.1, ry: -0.6 });
  place(scene, 'pirate/barrel', -2.6, 0.2, -6.4, { s: 0.9 });
  place(scene, 'pirate/flag-pirate-high-pennant', 0, 0.2, -6.6, { s: 1.3 });
  place(scene, 'pirate/structure-platform-dock', 9.5, -1.2, 6, { s: 1.4, ry: 0.4 });
  const ship = place(scene, 'pirate/ship-pirate-large', -26, -1.6, -26, { s: 1.3, ry: 0.9 });
  const ship2 = place(scene, 'pirate/ship-small', 28, -1.4, -30, { s: 1.1, ry: -0.5 });
  const flames: THREE.PointLight[] = [];
  const torches: THREE.Vector3[] = [];
  let flicker = 0;
  for (const [x, z] of [[-6.2, 4.6], [6.4, 5], [-8.3, -1.4], [8.6, -2.4]] as [number, number][]) {
    place(scene, 'graveyard/fire-basket', x, 0.2, z, { s: 1.4 });
    const fire = new THREE.PointLight('#ff9a3c', 8, 7, 2);
    fire.position.set(x, 1.6, z);
    scene.add(fire);
    flames.push(fire);
    torches.push(new THREE.Vector3(x, 1.25, z));
  }

  // strings of bulbs between the palms
  const stringMats: THREE.MeshStandardMaterial[] = [];
  const stringGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const spans: [number[], number[]][] = [
    [[-7, 4.6, -4], [0, 4.4, -6.6]],
    [[0, 4.4, -6.6], [6.5, 4.9, -5]],
    [[-8, 4.1, 1.5], [-7, 4.6, -4]],
    [[6.5, 4.9, -5], [8.2, 4.1, 0.5]],
  ];
  spans.forEach(([a, b], si) => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    for (let k = 1; k < 10; k++) {
      const f = k / 10;
      const p = A.clone().lerp(B, f);
      p.y -= Math.sin(f * Math.PI) * 0.9;
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: NEON[(k + si) % NEON.length], emissiveIntensity: 2.2 });
      const bl = mesh(stringGeo, m, { cast: false });
      bl.position.copy(p);
      scene.add(bl);
      stringMats.push(m);
    }
  });

  // paper lanterns drifting up off the sea
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ff9a3c', emissiveIntensity: 2.4 });
  const lanternGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.6, 10);
  const lanterns: { m: THREE.Mesh; speed: number; phase: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const m = mesh(lanternGeo, lanternMat, { cast: false });
    const a = -Math.PI + (i / 30) * Math.PI + Math.sin(i * 7.3) * 0.2;
    const r = 16 + ((i * 7) % 22);
    m.position.set(Math.cos(a) * r * 1.4, -1 + ((i * 13) % 30), Math.sin(a) * r - 4);
    scene.add(m);
    lanterns.push({ m, speed: 0.5 + ((i * 3) % 5) * 0.12, phase: i });
  }

  // dancers
  const dancers: ChoppyModel[] = [];
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    const m = new ChoppyModel(PLAYER_COLORS[i], 0.62);
    scene.add(m.group);
    dancers.push(m);
  }

  const camGoal = new THREE.Vector3(0, 7, 18);
  const lookGoal = new THREE.Vector3(0, 3.4, 0);
  const look = lookGoal.clone();
  camera.position.copy(camGoal);
  const at = new THREE.Vector3();
  let nextFirework = 0.4;
  return {
    scene,
    camera,
    update(_s, _p, t, dt) {
      water.update(t);
      // title: slow drift round the island under the logo; menu: island on the left, buttons on the right
      const onMenu = screen() !== 'title';
      const orbit = onMenu ? Math.sin(t * 0.12) * 0.06 : Math.sin(t * 0.1) * 0.3;
      const dist = onMenu ? 15 : 18;
      const cx = onMenu ? 6.5 : 0;
      camGoal.set(cx + Math.sin(orbit) * dist, onMenu ? 6 : 6.6, Math.cos(orbit) * dist);
      lookGoal.set(cx, onMenu ? 1.8 : 3.8, 0);
      camera.position.lerp(camGoal, Math.min(1, dt * 3));
      look.lerp(lookGoal, Math.min(1, dt * 3));
      camera.lookAt(look);

      // one party beat drives the floor, the lights and the dancers' hops
      const bps = 118 / 60;
      const beat = Math.floor(t * bps);
      const phase = (t * bps) % 1;
      const pulse = Math.pow(1 - phase, 3);
      const pattern = Math.floor(beat / 8) % 3;
      tiles.forEach((tl, k) => {
        const v = pattern === 0 ? tl.i + tl.j + beat : pattern === 1 ? Math.round(Math.hypot(tl.i, tl.j)) - beat : tl.i * 3 + tl.j * 5 + k + beat;
        tl.m.emissive.set(NEON[((v % NEON.length) + NEON.length) % NEON.length]);
        tl.m.emissiveIntensity = 0.5 + pulse * 1.3;
      });
      rimMat.emissive.set(NEON[beat % NEON.length]);
      rimMat.emissiveIntensity = 1.6 + pulse * 2;
      const chase = Math.floor(t * 10);
      bulbs.forEach((m, i) => (m.emissiveIntensity = (i + chase) % 4 === 0 ? 3.4 : 0.6));
      stringMats.forEach((m, i) => (m.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 3 + i)) * 2));
      party.forEach((l, i) => {
        const a = t * (0.7 + i * 0.25) + (i * Math.PI * 2) / 3;
        l.position.set(Math.cos(a) * 3.2, 2.2, Math.sin(a) * 3.2);
        l.intensity = 20 + pulse * 30;
      });
      flicker -= dt;
      if (flicker <= 0) {
        flicker = 0.06;
        for (const p of torches)
          fx.emit(p, { tex: 'soft', color: ['#ffd23f', '#ff8a1f', '#ff5a2a'], n: 2, speed: [0.3, 0.8], spread: 0.3, up: 2.2, life: [0.35, 0.6], size: [0.9, 0.2], additive: true });
      }
      flames.forEach((l, i) => (l.intensity = 7 + Math.sin(t * 13 + i * 3) * 1.5 + Math.sin(t * 7.7 + i) * 1.2));
      beams.forEach((bm) => {
        bm.g.rotation.z = Math.sin(t * 0.5 + bm.phase) * 0.55;
        bm.g.rotation.x = -0.35 + Math.cos(t * 0.37 + bm.phase) * 0.25;
      });
      dice.rotation.set(Math.sin(t * 0.7) * 0.3, t * 0.9, Math.cos(t * 0.6) * 0.3);
      dice.position.set(0, 3.7 + Math.sin(t * 2) * 0.25 + pulse * 0.15, 0);
      diceGlow.position.copy(dice.position);
      diceGlow.intensity = 12 + pulse * 14;
      dancers.forEach((m, i) => {
        const ang = (i / dancers.length) * Math.PI * 2 + t * 0.5;
        m.group.position.set(Math.cos(ang) * 3.4, 0.38, Math.sin(ang) * 3.4);
        m.group.rotation.y = -ang;
        // half the crowd hops on each beat
        const hop = (beat + i) % 2 === 0 ? Math.sin(phase * Math.PI) * 0.35 : 0;
        m.update(dt, { speed: 0.4, happy: Math.sin(t * 0.9 + i * 1.7) > 0.6, jump: hop, t: t + i });
      });
      lanterns.forEach((ln) => {
        ln.m.position.y += ln.speed * dt;
        ln.m.position.x += Math.sin(t * 0.5 + ln.phase) * 0.2 * dt;
        if (ln.m.position.y > 30) ln.m.position.y = -1;
      });
      // fireworks over the sea, behind the island
      nextFirework -= dt;
      if (nextFirework <= 0) {
        nextFirework = 0.45 + Math.random() * 0.9;
        at.set((Math.random() - 0.5) * 80, 16 + Math.random() * 16, -40 - Math.random() * 25);
        const c = NEON[Math.floor(Math.random() * NEON.length)];
        fx.emit(at, { tex: 'star', color: [c, c, '#ffffff'], n: 46, speed: [8, 12], spread: 1, life: [1, 1.6], size: [1.8, 0.3], gravity: 3, drag: 1.4, additive: true });
        fx.emit(at, { tex: 'soft', color: c, n: 1, speed: [0, 0], life: [0.4, 0.4], size: [8, 18], additive: true });
      }
      fx.update(dt);
      ship.position.y = -1.6 + Math.sin(t * 0.8) * 0.15;
      ship.rotation.z = Math.sin(t * 0.6) * 0.03;
      ship2.position.y = -1.4 + Math.sin(t * 0.9 + 1) * 0.12;
    },
    tags(): Tag[] {
      return [];
    },
  };
}

/** Sunset sky: deep violet overhead fading to magenta and a hot orange horizon, with stars. */
function duskSky(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#0a0628');
  grad.addColorStop(0.28, '#24125e');
  grad.addColorStop(0.4, '#6a2795');
  grad.addColorStop(0.46, '#e64c8c');
  grad.addColorStop(0.5, '#ffaa5c');
  grad.addColorStop(0.53, '#4a2a7a');
  grad.addColorStop(1, '#140a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 1024);
  // the sun sinking into the sea
  const sun = g.createRadialGradient(820, 512, 0, 820, 512, 300);
  sun.addColorStop(0, 'rgba(255,244,200,1)');
  sun.addColorStop(0.12, 'rgba(255,205,130,0.9)');
  sun.addColorStop(0.5, 'rgba(255,110,120,0.35)');
  sun.addColorStop(1, 'rgba(255,90,120,0)');
  g.fillStyle = sun;
  g.fillRect(420, 200, 800, 330);
  // stars in the upper sky
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const y = rnd() * 400;
    g.fillStyle = `rgba(255,255,255,${(0.3 + rnd() * 0.7) * (1 - y / 440)})`;
    g.beginPath();
    g.arc(rnd() * 2048, y, rnd() < 0.08 ? 2.2 : 1.1, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rippled streak of sunset light on the water. */
function glowStrip(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 256; y += 3) {
    const f = y / 256;
    const w = 8 + f * 44 + rnd() * 10;
    g.fillStyle = `rgba(255,170,110,${0.1 + f * 0.5})`;
    g.fillRect(32 - w / 2 + (rnd() - 0.5) * 6, y, w, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Searchlight beam: bright at the lamp, fading out into the sky. */
function beamTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.85)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function face(n: string): THREE.Material {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 12;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#ff3b4e';
  g.font = '900 86px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(n, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3 });
}
