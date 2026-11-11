import * as THREE from 'three';
import { mesh, toy } from './kit';

/**
 * Stew Court's two worlds, dressed up:
 * - the FUCCI VERSE arena: a full seating bowl packed with an instanced crowd that does the wave,
 *   suites, championship banners, a lighting rig with beams, LED ribbon boards and a live jumbotron
 * - the CHOPPY VERSE inferno: sprite flames on the court, rising embers, a burning asteroid under
 *   the floor with lava veins, drifting debris and an eclipsed red sun
 * Built in the board's unspread coordinates, like the rest of the court decor.
 */

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow, white in the middle, for flames, embers and light pools. */
let glowTex: THREE.CanvasTexture | null = null;
export function glow(): THREE.CanvasTexture {
  glowTex ??= canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}

/** A flame tongue: a teardrop of light, hot at the bottom. */
let flameTex: THREE.CanvasTexture | null = null;
function flame(): THREE.CanvasTexture {
  flameTex ??= canvasTex(64, 128, (g) => {
    const r = g.createRadialGradient(32, 96, 2, 32, 80, 60);
    r.addColorStop(0, 'rgba(255,255,220,1)');
    r.addColorStop(0.25, 'rgba(255,200,60,0.95)');
    r.addColorStop(0.6, 'rgba(255,80,10,0.6)');
    r.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = r;
    g.beginPath();
    g.moveTo(32, 2);
    g.bezierCurveTo(58, 50, 62, 90, 32, 126);
    g.bezierCurveTo(2, 90, 6, 50, 32, 2);
    g.fill();
  });
  return flameTex;
}

export interface Dressing {
  objects: THREE.Object3D[];
  tick: (t: number, dt: number, info: { turn: number; maxTurns: number; leader: string; choppy: boolean }) => void;
}

// ---------------------------------------------------------------------------------------------
// FUCCI VERSE: the arena
// ---------------------------------------------------------------------------------------------

export function buildArena(scene: THREE.Scene, floor: { w: number; h: number }): Dressing {
  const objects: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T, tag: 'ground' | 'sky' | 'keep' = 'ground'): T => {
    o.userData[tag] = true;
    scene.add(o);
    objects.push(o);
    return o;
  };
  const r = rnd(11);

  // the arena floor around the court, polished concrete
  const ground = mesh(new THREE.CircleGeometry(110, 72), new THREE.MeshStandardMaterial({ color: '#2b2433', roughness: 0.35, metalness: 0.2 }), { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.22;
  add(ground);
  // a padded apron with team-colour stripes right round the court
  const apron = mesh(new THREE.BoxGeometry(floor.w + 8, 0.3, floor.h + 8), toy('#1d1630', 0.6), { cast: false, receive: true });
  apron.position.y = -1.08;
  add(apron);

  // the seating bowl: tier after tier on an ellipse, each a step up and out
  const TIERS = 16;
  const RX0 = floor.w / 2 + 7, RZ0 = floor.h / 2 + 7;
  const tierMats = [toy('#2a2342', 0.55), toy('#322a4f', 0.55)];
  const seatCols = ['#3d5bff', '#ff8a1f'];
  for (let k = 0; k < TIERS; k++) {
    const rx = RX0 + k * 1.25, rz = RZ0 + k * 1.25;
    const y = -1.2 + k * 0.62;
    const ring = mesh(new THREE.RingGeometry(1, 1 + 1.25 / rx, 96, 1), tierMats[k % 2], { cast: false, receive: true });
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(rx, rz, 1);
    ring.position.y = y + 0.62;
    add(ring);
    const riser = mesh(new THREE.CylinderGeometry(1, 1, 0.62, 96, 1, true), toy(seatCols[Math.floor(k / 8) % 2], 0.5), { cast: false });
    riser.scale.set(rx, 1, rz);
    riser.position.y = y + 0.31;
    (riser.material as THREE.Material).side = THREE.BackSide;
    add(riser);
  }
  // a balcony wall at the top of the bowl with a glowing band of suites
  const topRx = RX0 + TIERS * 1.25, topRz = RZ0 + TIERS * 1.25;
  const suiteTex = canvasTex(1024, 64, (g) => {
    g.fillStyle = '#120d1c';
    g.fillRect(0, 0, 1024, 64);
    for (let x = 4; x < 1024; x += 32) {
      g.fillStyle = r() < 0.75 ? `hsl(${40 + r() * 20},90%,${55 + r() * 20}%)` : '#2a2238';
      g.fillRect(x, 14, 26, 36);
    }
  });
  suiteTex.wrapS = THREE.RepeatWrapping;
  suiteTex.repeat.set(6, 1);
  const suites = mesh(new THREE.CylinderGeometry(1, 1, 3.2, 128, 1, true), new THREE.MeshStandardMaterial({ map: suiteTex, emissive: '#ffffff', emissiveMap: suiteTex, emissiveIntensity: 0.7, side: THREE.BackSide }), { cast: false });
  suites.scale.set(topRx, 1, topRz);
  suites.position.y = -1.2 + TIERS * 0.62 + 1.6;
  add(suites);
  const upper = mesh(new THREE.CylinderGeometry(1, 1, 30, 96, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1426', side: THREE.BackSide, roughness: 0.9 }), { cast: false });
  upper.scale.set(topRx + 0.5, 1, topRz + 0.5);
  upper.position.y = -1.2 + TIERS * 0.62 + 3.2 + 15;
  add(upper);
  // the roof: a dark dome with a ring of lamps
  const roof = mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0e0b16', side: THREE.BackSide, roughness: 1 }), { cast: false });
  roof.scale.set(topRx + 0.5, 22, topRz + 0.5);
  roof.position.y = upper.position.y + 15;
  add(roof, 'sky');

  // the crowd: one instanced body and one instanced head per seat, doing the wave
  const seats: { x: number; y: number; z: number; a: number }[] = [];
  for (let k = 0; k < TIERS; k++) {
    const rx = RX0 + k * 1.25 + 0.55, rz = RZ0 + k * 1.25 + 0.55;
    const y = -1.2 + (k + 1) * 0.62;
    const n = Math.floor(170 + k * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // aisles, and a few empty seats
      if (Math.abs(Math.sin(a * 5)) < 0.06 || r() < 0.12) continue;
      seats.push({ x: Math.cos(a) * rx, y, z: Math.sin(a) * rz, a });
    }
  }
  const bodyGeo = new THREE.BoxGeometry(0.62, 0.8, 0.45);
  bodyGeo.translate(0, 0.4, 0);
  const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
  headGeo.translate(0, 1.05, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), seats.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), seats.length);
  const shirt = ['#3d5bff', '#ff8a1f', '#ffffff', '#ffd23f', '#ff5a5f', '#4cd97b', '#c79bff', '#1b1b2a'];
  const skin = ['#f2c9a0', '#d9a066', '#a8693f', '#7a4a2a', '#ffdcb8', '#5a3620'];
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    // home side wears blue, away side orange, with some of everything mixed in
    const home = Math.cos(s.a) < 0;
    bodies.setColorAt(i, c.set(r() < 0.6 ? (home ? '#3d5bff' : '#ff8a1f') : shirt[Math.floor(r() * shirt.length)]));
    heads.setColorAt(i, c.set(skin[Math.floor(r() * skin.length)]));
  });
  bodies.castShadow = false;
  heads.castShadow = false;
  add(bodies);
  add(heads);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const place = (t: number) => {
    const wave = (t * 0.9) % (Math.PI * 2);
    seats.forEach((s, i) => {
      // face the court; jump when the wave goes past, plus a little fidget
      let d = Math.abs(s.a - wave);
      d = Math.min(d, Math.PI * 2 - d);
      const jump = Math.max(0, 1 - d * 3) * 0.55 + Math.max(0, Math.sin(t * 6 + i * 1.7)) * 0.05;
      q.setFromAxisAngle(up, -s.a - Math.PI / 2);
      p.set(s.x, s.y + jump, s.z);
      m4.compose(p, q, one);
      bodies.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  place(0);

  // championship banners hanging from the roof
  const bannerCols: [string, string][] = [['#3d5bff', '#ffd23f'], ['#ff8a1f', '#ffffff'], ['#7a3fb0', '#ffd23f'], ['#1b1b2a', '#ff8a1f']];
  const bannerText = ['STEW CHAMPS', 'CHOPPY PARTY', 'FUCCI VERSE', 'PIT COIN CUP'];
  bannerCols.forEach(([bg, fg], i) => {
    const tex = canvasTex(256, 512, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 512);
      g.fillStyle = fg;
      g.fillRect(0, 24, 256, 10);
      g.fillRect(0, 470, 256, 10);
      g.font = '900 44px system-ui, sans-serif';
      g.textAlign = 'center';
      bannerText[i].split(' ').forEach((w, k) => g.fillText(w, 128, 140 + k * 70));
      g.font = '900 120px system-ui, sans-serif';
      g.fillText('★', 128, 400);
    });
    const b = mesh(new THREE.PlaneGeometry(3.2, 6.4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }), { cast: false });
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.position.set(Math.cos(a) * (topRx - 6), 21, Math.sin(a) * (topRz - 6));
    b.lookAt(0, 21, 0);
    add(b, 'sky');
  });

  // the lighting rig: a truss ring of lamps, each throwing a soft beam down onto the court
  const rig = new THREE.Group();
  const truss = mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), toy('#3a3f5c', 0.4), { cast: false });
  truss.rotation.x = Math.PI / 2;
  truss.scale.set(26, 17, 26);
  rig.add(truss);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1d0', transparent: true, opacity: 0.025, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 1.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 26, z = Math.sin(a) * 17;
    const lamp = mesh(new THREE.CylinderGeometry(0.6, 1, 1, 12), lampMat, { cast: false });
    lamp.position.set(x, -0.6, z);
    rig.add(lamp);
    // the beam: an open cone from the lamp to a pool on the court
    const tx = x * 0.45, tz = z * 0.45;
    const from = new THREE.Vector3(x, 28.5, z), to = new THREE.Vector3(tx, -0.5, tz);
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 6, len, 20, 1, true), beamMat);
    beam.position.copy(from).add(to).multiplyScalar(0.5).sub(new THREE.Vector3(0, 29, 0));
    beam.quaternion.setFromUnitVectors(up, from.clone().sub(to).normalize());
    rig.add(beam);
  }
  rig.position.y = 29;
  add(rig, 'sky');

  // LED ribbon boards along both sidelines and baselines, scrolling
  const ledTex = canvasTex(1024, 64, (g) => {
    g.fillStyle = '#05040a';
    g.fillRect(0, 0, 1024, 64);
    g.font = '900 40px system-ui, sans-serif';
    g.textBaseline = 'middle';
    const words = ['STEW COURT', '★', 'CHOPPY PARTY', '★', 'PIT COIN', '★', 'FUCCI VERSE', '★'];
    let x = 10;
    words.forEach((w, i) => {
      g.fillStyle = i % 2 ? '#ffd23f' : i % 4 === 0 ? '#5fb8ff' : '#ff8a1f';
      g.fillText(w, x, 34);
      x += g.measureText(w).width + 28;
    });
  });
  ledTex.wrapS = THREE.RepeatWrapping;
  const ledMat = new THREE.MeshStandardMaterial({ map: ledTex, emissive: '#ffffff', emissiveMap: ledTex, emissiveIntensity: 1.1, color: '#000000' });
  const leds: THREE.Texture[] = [];
  for (const [w, x, z, ry] of [
    [floor.w + 4, 0, -(floor.h / 2 + 3.2), 0],
    [floor.h + 2, -(floor.w / 2 + 3.2), 0, Math.PI / 2],
    [floor.h + 2, floor.w / 2 + 3.2, 0, -Math.PI / 2],
  ] as [number, number, number, number][]) {
    const t = ledTex.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(w / 16, 1);
    t.needsUpdate = true;
    leds.push(t);
    const board = mesh(new THREE.BoxGeometry(w, 1.1, 0.3), [toy('#111', 0.5), toy('#111', 0.5), toy('#111', 0.5), toy('#111', 0.5), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.1, color: '#000000' }), toy('#111', 0.5)] as unknown as THREE.Material, { cast: false });
    board.position.set(x, -0.45, z);
    board.rotation.y = ry;
    add(board);
  }
  void ledMat;

  return {
    objects,
    tick: (t) => {
      place(t);
      for (const l of leds) l.offset.x = (t * 0.06) % 1;
      beamMat.opacity = 0.022 + Math.sin(t * 0.7) * 0.006;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The jumbotron (both worlds): live screens with the turn, the leader and the verse
// ---------------------------------------------------------------------------------------------

export function buildJumbotron(scene: THREE.Scene, ball: (r: number) => THREE.Mesh): Dressing & { group: THREE.Group } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, color: '#000000' });
  const shell = toy('#1d2033', 0.4);
  const group = new THREE.Group();
  group.userData.sky = true;
  const box = mesh(new THREE.BoxGeometry(7.2, 4.05, 7.2), [screen, screen, shell, shell, screen, screen] as unknown as THREE.Material, { cast: false });
  group.add(box);
  for (const y of [-2.25, 2.25]) {
    const band = mesh(new THREE.BoxGeometry(7.7, 0.45, 7.7), new THREE.MeshStandardMaterial({ color: '#ff8a1f', emissive: '#ff6a00', emissiveIntensity: 1.2 }), { cast: false });
    band.position.y = y;
    group.add(band);
  }
  const under = mesh(new THREE.CylinderGeometry(2.6, 1.2, 1.6, 8), shell, { cast: false });
  under.position.y = -3.2;
  group.add(under);
  const cable = mesh(new THREE.CylinderGeometry(0.08, 0.08, 14, 6), toy('#222', 0.5), { cast: false });
  cable.position.y = 9.2;
  group.add(cable);
  const b = ball(1.1);
  b.position.y = 3.6;
  group.add(b);
  group.position.set(0, 24, -4);
  group.scale.setScalar(0.85);
  scene.add(group);
  let last = '';
  return {
    group,
    objects: [group],
    tick: (t, _dt, info) => {
      group.rotation.y = t * 0.2;
      b.rotation.y = -t * 1.5;
      const key = `${info.turn}|${info.leader}|${info.choppy}|${Math.floor(t * 2) % 2}`;
      if (key === last) return;
      last = key;
      const evil = info.choppy;
      g.fillStyle = evil ? '#1a0204' : '#07102a';
      g.fillRect(0, 0, 512, 288);
      g.fillStyle = evil ? '#ff2a10' : '#3d5bff';
      g.fillRect(0, 0, 512, 54);
      g.font = '900 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.fillText(evil ? 'CHOPPY VERSE' : 'STEW COURT', 256, 42);
      g.font = '900 64px system-ui, sans-serif';
      g.fillStyle = evil ? '#ff6a3d' : '#ffd23f';
      g.fillText(`TURN ${info.turn}/${info.maxTurns}`, 256, 138);
      g.font = '800 34px system-ui, sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(info.leader ? `LEADER: ${info.leader.toUpperCase()}` : '', 256, 198);
      if (Math.floor(t * 2) % 2) {
        g.fillStyle = evil ? '#ff2a10' : '#4cd97b';
        g.fillText(evil ? '!! LEBRON IS WATCHING !!' : 'MAKE SOME NOISE!', 256, 254);
      }
      tex.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CHOPPY VERSE: the inferno
// ---------------------------------------------------------------------------------------------

export function buildInferno(scene: THREE.Scene, floor: { w: number; h: number }): Dressing & { fires: THREE.Object3D[] } {
  const objects: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T, tag?: 'ground' | 'sky'): T => {
    if (tag) o.userData[tag] = true;
    scene.add(o);
    objects.push(o);
    return o;
  };
  const r = rnd(5);

  // a burning asteroid under the floor: a rough rock chunk with glowing lava veins
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 7.1) * Math.cos(v.z * 6.3) * 0.5 + Math.sin(v.y * 9.7 + v.x * 3) * 0.3;
    const bump = 1 + n * 0.12;
    v.multiplyScalar(bump);
    // flatten the top so the court sits on it
    if (v.y > 0) v.y *= 0.08;
    pos.setXYZ(i, v.x, v.y, v.z);
    const vein = Math.abs(Math.sin(v.x * 11 + v.z * 7) * Math.cos(v.y * 13)) < 0.12;
    if (vein) cols.push(1, 0.35, 0.05);
    else {
      const k = 0.12 + (n + 1) * 0.06;
      cols.push(k * 1.2, k * 0.8, k);
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#ff3a00', emissiveIntensity: 0.0 });
  // lava: a second, glowing copy of just the veins would be costly; instead tint the emissive by vertex colour
  rockMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance = vec3(1.0, 0.3, 0.05) * smoothstep(0.6, 0.9, vColor.r - vColor.b) * 2.2;',
    );
  };
  const rock = mesh(geo, rockMat, { cast: false });
  rock.scale.set(floor.w * 0.62, 16, floor.h * 0.66);
  rock.position.y = -2.8;
  add(rock, 'ground');
  // chunks breaking off and drifting below
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const d = mesh(new THREE.DodecahedronGeometry(0.6 + r() * 1.8, 0), new THREE.MeshStandardMaterial({ color: '#2a1a18', roughness: 0.9, emissive: '#ff2a00', emissiveIntensity: r() < 0.4 ? 0.6 : 0 }), { cast: false });
    const a = r() * Math.PI * 2;
    d.position.set(Math.cos(a) * (floor.w * 0.35 + r() * 14), -12 - r() * 20, Math.sin(a) * (floor.h * 0.4 + r() * 10));
    d.userData.spin = 0.2 + r() * 0.6;
    d.userData.base = d.position.y;
    add(d, 'sky');
    debris.push(d);
  }

  // an eclipsed red sun hanging behind the court
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: '#ff3a10', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.scale.set(70, 70, 1);
  sun.position.set(-20, 30, -95);
  add(sun, 'sky');
  const disc = mesh(new THREE.SphereGeometry(13, 32, 16), new THREE.MeshBasicMaterial({ color: '#050002' }), { cast: false });
  disc.position.set(-20, 30, -92);
  add(disc, 'sky');

  // fires on the court: a few flickering flame sprites over a glowing scorch mark
  const fires: THREE.Object3D[] = [];
  const flameMats = ['#ffb340', '#ff7a1a', '#ff3a00'].map((col) => new THREE.SpriteMaterial({ map: flame(), color: col, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  const scorchMat = new THREE.MeshBasicMaterial({ map: glow(), color: '#ff3a00', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 34; i++) {
    const f = new THREE.Group();
    const big = 0.7 + r() * 0.8;
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(flameMats[k % 3]);
      s.center.set(0.5, 0);
      s.position.set((r() - 0.5) * 0.7 * big, 0.02, (r() - 0.5) * 0.7 * big);
      s.userData.h = (1.4 + r() * 1.2) * big;
      s.userData.k = r() * 10;
      s.scale.set(0.9 * big, s.userData.h, 1);
      f.add(s);
    }
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(3 * big, 3 * big), scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.03;
    f.add(scorch);
    f.position.set((r() - 0.5) * (floor.w - 6), 0, (r() - 0.5) * (floor.h - 6));
    add(f);
    fires.push(f);
  }

  // embers drifting up off the court
  const N = 700;
  const ePos = new Float32Array(N * 3);
  const eVel: number[] = [];
  for (let i = 0; i < N; i++) {
    ePos[i * 3] = (r() - 0.5) * floor.w;
    ePos[i * 3 + 1] = r() * 18;
    ePos[i * 3 + 2] = (r() - 0.5) * floor.h;
    eVel.push(0.6 + r() * 1.6);
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ map: glow(), color: '#ff6a1a', size: 0.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  add(embers, 'sky');

  return {
    objects,
    fires,
    tick: (t, dt) => {
      for (const f of fires)
        for (const s of f.children) {
          if (!(s as THREE.Sprite).isSprite) continue;
          const k = s.userData.k as number;
          const h = s.userData.h as number;
          s.scale.y = h * (0.75 + Math.abs(Math.sin(t * 9 + k)) * 0.35 + Math.sin(t * 23 + k * 3) * 0.06);
          s.scale.x = h * 0.55 * (0.9 + Math.sin(t * 13 + k) * 0.12);
        }
      scorchMat.opacity = 0.3 + Math.sin(t * 7) * 0.06;
      for (let i = 0; i < N; i++) {
        let y = ePos[i * 3 + 1] + eVel[i] * dt;
        if (y > 20) y = 0;
        ePos[i * 3 + 1] = y;
        ePos[i * 3] += Math.sin(t * 1.3 + i) * dt * 0.4;
      }
      eGeo.attributes.position.needsUpdate = true;
      for (const d of debris) {
        d.rotation.x += dt * (d.userData.spin as number);
        d.rotation.y += dt * (d.userData.spin as number) * 0.7;
        d.position.y = (d.userData.base as number) + Math.sin(t * 0.5 + d.position.x) * 0.8;
      }
      sun.material.opacity = 0.85 + Math.sin(t * 1.7) * 0.1;
    },
  };
}
