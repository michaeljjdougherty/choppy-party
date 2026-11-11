import * as THREE from 'three';
import type { Pose } from './lebronDance';

/**
 * Evil LeBron's magic entrance and dance-party set on Stew Court:
 * - a spinning magic circle of runes opens on centre court and a beam of light comes down
 * - he rides the beam down (the court decor moves him) amid spiralling sparkles
 * - he lands in a burst of stars and a shockwave, and a disco ball drops in with coloured beams
 *   sweeping the court, lights flashing on the beat, until the host skips his dance
 * Built in the court's unspread coordinates (the board view scales it with the rest).
 */
export interface DanceParty {
  /** `on` fades the whole set (0..1); `entering` is true while he's coming down the beam. */
  tick(t: number, dt: number, beat: number, visitT: number, on: number, entering: boolean): void;
  /** A burst of stars from his feet (1 = the landing, with a shockwave). */
  burst(strength?: number): void;
}

const COLORS = ['#ff3b4e', '#ffd23f', '#4cd97b', '#5fb8ff', '#c79bff', '#ff7bd5'];

function runeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 12;
  const ring = (r: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(246, 8);
  ring(214, 4);
  ring(140, 5);
  ring(118, 3);
  // a star of two triangles, and a ring of runes between the outer circles
  g.lineWidth = 5;
  for (const off of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i * Math.PI * 2) / 3 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 214, Math.sin(a) * 214);
    }
    g.stroke();
  }
  g.font = 'bold 30px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillText(runes[i % runes.length], 0, -230);
    g.restore();
  }
  // a basketball's seams in the middle, so it's his circle
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-118, 0);
  g.lineTo(118, 0);
  g.moveTo(0, -118);
  g.lineTo(0, 118);
  g.stroke();
  g.beginPath();
  g.ellipse(-70, 0, 40, 112, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(70, 0, 40, 112, 0, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  // a four-point twinkle
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(30, 2, 4, 60);
  g.fillRect(2, 30, 60, 4);
  return new THREE.CanvasTexture(c);
}

/** A beam that fades out towards its top and bottom. */
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.95, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

const add = (o: THREE.Object3D) => {
  o.userData.sky = true;
  return o;
};

export function buildDanceParty(scene: THREE.Scene, at: THREE.Vector3): DanceParty {
  const root = new THREE.Group();
  root.position.copy(at);
  root.visible = false;
  scene.add(add(root));
  const additive = (color: string, map?: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

  // the magic circle, and a smaller one turning the other way
  const runes = runeTexture();
  const circleMat = additive('#c79bff', runes);
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.06;
  const innerMat = additive('#ffd23f', runes);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.08;
  root.add(circle, inner);

  // the beam he rides down
  const beamMat = additive('#e6d0ff', beamTexture());
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 60, 32, 1, true), beamMat);
  beam.position.y = 30;
  const coreMat = additive('#ffffff', beamTexture());
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), coreMat);
  core.position.y = 30;
  root.add(beam, core);

  // sparkles: a swirl that spirals up the beam, then drifts round him while he dances
  const glow = glowTexture();
  const N = 240;
  const swirlGeo = new THREE.BufferGeometry();
  const swirlPos = new Float32Array(N * 3);
  const swirlCol = new Float32Array(N * 3);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    col.set(COLORS[i % COLORS.length]).lerp(new THREE.Color('#ffffff'), 0.35);
    swirlCol.set([col.r, col.g, col.b], i * 3);
  }
  swirlGeo.setAttribute('position', new THREE.BufferAttribute(swirlPos, 3));
  swirlGeo.setAttribute('color', new THREE.BufferAttribute(swirlCol, 3));
  const swirlMat = new THREE.PointsMaterial({ size: 0.7, map: glow, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const swirl = new THREE.Points(swirlGeo, swirlMat);
  swirl.frustumCulled = false;
  root.add(swirl);

  // star bursts from his feet
  const M = 160;
  const burstGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(M * 3);
  const bCol = new Float32Array(M * 3);
  const bVel = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    col.set(COLORS[(i * 7) % COLORS.length]);
    bCol.set([col.r, col.g, col.b], i * 3);
  }
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({ size: 1.0, map: glow, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(burstGeo, burstMat);
  stars.frustumCulled = false;
  root.add(stars);
  let burstLife = 0;

  // the landing shockwave
  const waveMat = additive('#ffffff');
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 48), waveMat);
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = 0.12;
  root.add(wave);
  let waveT = 9;

  // the disco ball, on a chain from the dark, throwing coloured beams over the court
  const disco = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 2),
    new THREE.MeshStandardMaterial({ color: '#e8e8f0', metalness: 1, roughness: 0.12, flatShading: true, emissive: '#3a3050', emissiveIntensity: 0.6 }),
  );
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 30, 6), new THREE.MeshStandardMaterial({ color: '#888899', metalness: 0.8, roughness: 0.3 }));
  chain.position.y = 15 + 1.4;
  disco.add(ball, chain);
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = additive(COLORS[i]);
    const len = 15;
    const geo = new THREE.ConeGeometry(1.0, len, 16, 1, true);
    geo.translate(0, -len / 2, 0);
    const ray = new THREE.Mesh(geo, m);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    ray.rotation.x = 0.5 + (i % 2) * 0.25;
    pivot.add(ray);
    disco.add(pivot);
    rays.push(ray);
  }
  disco.position.y = 40;
  root.add(disco);

  // real light: two coloured lamps that swap on the beat, and the beam's glow
  const lampA = new THREE.PointLight('#ff3b4e', 0, 40, 1.4);
  lampA.position.set(-6, 9, 5);
  const lampB = new THREE.PointLight('#5fb8ff', 0, 40, 1.4);
  lampB.position.set(6, 9, 5);
  const beamLight = new THREE.PointLight('#d8b8ff', 0, 30, 1.2);
  beamLight.position.set(0, 4, 2);
  // and a warm key light from the front so his face reads in the dark Choppy Verse
  const key = new THREE.PointLight('#fff1e0', 0, 40, 1.2);
  key.position.set(0, 7, 10);
  root.add(lampA, lampB, beamLight, key);

  let discoY = 40;

  return {
    burst(strength = 1) {
      burstLife = 1;
      burstMat.size = 0.6 + strength * 0.6;
      for (let i = 0; i < M; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = 4 + Math.random() * 10 * strength;
        const out = (3 + Math.random() * 9) * strength;
        bPos.set([Math.cos(a) * 1.5, 0.5 + Math.random() * (strength < 1 ? 7 : 1), Math.sin(a) * 1.5], i * 3);
        bVel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
      }
      burstGeo.attributes.position.needsUpdate = true;
      if (strength >= 1) waveT = 0;
    },

    tick(t, dt, beat, visitT, on, entering) {
      const live = on > 0.001 || burstLife > 0 || waveT < 1.2;
      root.visible = live;
      if (!live) {
        discoY = 40;
        return;
      }
      const onBeat = Math.max(0, 1 - (beat - Math.floor(beat)) * 3);
      // the circle: opens fast, spins, and throbs to the beat
      const open = Math.min(1, visitT / 0.5);
      const cs = 0.3 + open * 0.7;
      circle.scale.setScalar(cs);
      inner.scale.setScalar(cs);
      circle.rotation.z = t * 0.6;
      inner.rotation.z = -t * 1.3;
      circleMat.opacity = on * open * (entering ? 0.95 : 0.55 + onBeat * 0.35);
      innerMat.opacity = on * open * (entering ? 0.9 : 0.4 + onBeat * 0.4);
      circleMat.color.set(entering ? '#c79bff' : COLORS[Math.floor(beat) % COLORS.length]);
      // the beam: in while he comes down, gone soon after he lands
      const beamK = visitT < 0.5 ? visitT / 0.5 : visitT < 2.1 ? 1 : Math.max(0, 1 - (visitT - 2.1) / 0.6);
      beamMat.opacity = on * beamK * (0.22 + Math.sin(t * 20) * 0.04);
      coreMat.opacity = on * beamK * 0.28;
      beam.scale.set(1 + Math.sin(t * 7) * 0.04, 1, 1 + Math.sin(t * 7) * 0.04);
      beamLight.intensity = on * (beamK * 40 + (entering ? 0 : 6 + onBeat * 10));
      // sparkles spiral up the beam fast on the way in, then lazily orbit him
      const sp = entering ? 1 : 0.25;
      for (let i = 0; i < N; i++) {
        const a = i * 2.39996 + t * (1.2 + (i % 5) * 0.15) * (entering ? 2.5 : 0.6);
        const r = entering ? 2.0 + (i % 7) * 0.35 : 4.5 + (i % 9) * 0.55;
        const h = entering ? (i * 0.53 + t * 9 * sp) % 30 : (i * 0.37 + t * 1.1) % 13;
        swirlPos[i * 3] = Math.cos(a) * r;
        swirlPos[i * 3 + 1] = h;
        swirlPos[i * 3 + 2] = Math.sin(a) * r;
      }
      swirlGeo.attributes.position.needsUpdate = true;
      swirlMat.opacity = on * open * (entering ? 1 : 0.6 + onBeat * 0.3);
      swirlMat.size = entering ? 0.8 : 0.55 + onBeat * 0.3;
      // star bursts fall under gravity and fade
      if (burstLife > 0) {
        burstLife = Math.max(0, burstLife - dt * 0.8);
        for (let i = 0; i < M; i++) {
          bVel[i * 3 + 1] -= 14 * dt;
          bPos[i * 3] += bVel[i * 3] * dt;
          bPos[i * 3 + 1] = Math.max(0.1, bPos[i * 3 + 1] + bVel[i * 3 + 1] * dt);
          bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
        }
        burstGeo.attributes.position.needsUpdate = true;
      }
      burstMat.opacity = Math.min(1, burstLife * 1.5);
      // the shockwave
      waveT += dt;
      wave.scale.setScalar(1 + waveT * 22);
      waveMat.opacity = Math.max(0, 1 - waveT / 0.7) * 0.9;
      // the disco ball drops in once he's landed, and goes back up when the party's over
      const want = !entering && on > 0.5 && visitT > 2.2 ? 13.5 : 40;
      discoY += (want - discoY) * Math.min(1, dt * (want < discoY ? 2.5 : 1.5));
      disco.position.y = discoY + Math.sin(t * 1.3) * 0.15;
      disco.rotation.y = t * 0.9;
      const raysOn = on * Math.max(0, Math.min(1, (40 - discoY) / 20));
      rays.forEach((r, i) => {
        (r.material as THREE.MeshBasicMaterial).opacity = raysOn * (0.08 + (Math.floor(beat) % 6 === i ? 0.12 : 0) + onBeat * 0.04);
        r.rotation.x = 0.85 + Math.sin(t * 1.7 + i) * 0.25 + (i % 2) * 0.2;
      });
      // the lamps swap colours on every beat
      const ci = Math.floor(beat);
      lampA.color.set(COLORS[((ci % 6) + 6) % 6]);
      lampB.color.set(COLORS[(((ci + 3) % 6) + 6) % 6]);
      const lamp = entering ? 0 : on * (14 + onBeat * 30);
      lampA.intensity = lamp;
      lampB.intensity = lamp;
      key.intensity = on * (entering ? 10 : 35);
    },
  };
}

/** Coming down the beam: arms out wide, wings beating, legs tucked like a superhero landing. */
export function descendPose(t: number): Pose {
  const f = Math.sin(t * 14);
  return {
    armL: [0, -0.2, 1.3],
    armR: [0, 0.2, -1.3],
    foreL: [0, 0, 0.3],
    foreR: [0, 0, -0.3],
    neck: [-0.25, 0, 0],
    thighL: [-0.6, 0, 0.1],
    calfL: [1.1, 0, 0],
    thighR: [-0.2, 0, -0.1],
    calfR: [0.5, 0, 0],
    wingL: [0, 0, f * 0.7 + 0.2],
    wingR: [0, 0, -(f * 0.7 + 0.2)],
    jaw: [0.2, 0, 0],
  };
}

/** Ta-da! Both arms up, head back, wings spread: the pose he lands in. */
export const TADA: Pose = {
  armL: [0, 0, 2.4],
  armR: [0, 0, -2.4],
  foreL: [0, 0, 0.3],
  foreR: [0, 0, -0.3],
  neck: [-0.35, 0, 0],
  jaw: [0.5, 0, 0],
  wingL: [0, 0, 0.6],
  wingR: [0, 0, -0.6],
  thighL: [0, 0, 0.25],
  thighR: [0, 0, -0.25],
  root: { y: 0 },
};
