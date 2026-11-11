import * as THREE from 'three';
import type { BoardDef, BoardState } from '../../shared/board/types';
import { mesh, toy } from './kit';
import { prop } from './assets';
import { forecast } from '../../shared/board/weather';

/**
 * Hazard zones are marked on the map itself rather than lit up: themed ground under the spaces
 * (rubble in the boulder canyons, wet mud in the flood plain, hazard stripes where solar flares hit)
 * and a warning sign wherever the path enters a zone. The spaces themselves are left alone.
 */
type Style = 'marsh' | 'wind' | 'pine' | 'flare' | 'lowgrav' | 'laser' | 'rubble' | 'sand' | 'flood' | 'heat';

const SIGN: Record<Style, [string, string, string]> = {
  // label, sign colour, ink
  marsh: ['FOG', '#c9d6e8', '#2a3550'],
  wind: ['WIND', '#d9f99d', '#2f4a12'],
  pine: ['TIMBER!', '#ffd23f', '#3a2a00'],
  flare: ['FLARE', '#ffd23f', '#111111'],
  lowgrav: ['LOW G', '#c4b5fd', '#2e1065'],
  laser: ['LASER', '#ff5ae0', '#ffffff'],
  rubble: ['ROCKS', '#ffb020', '#2a1600'],
  sand: ['SAND', '#f3d9a4', '#5a3a12'],
  flood: ['FLOOD', '#7dd3fc', '#0c2a4a'],
  heat: ['HEAT', '#ff8a4c', '#3a0d00'],
};

const decals = new Map<Style, THREE.Texture>();
function decal(style: Style): THREE.Texture {
  const hit = decals.get(style);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = style.length * 97 + style.charCodeAt(0);
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const blob = (x: number, y: number, rad: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    g.fill();
  };
  const scatter = (n: number, f: (x: number, y: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * S * 0.42;
      f(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d);
    }
  };
  // a tinted base so the zone reads as its own strip of ground
  const BASE: Partial<Record<Style, string>> = {
    marsh: 'rgba(60,96,74,0.75)',
    wind: 'rgba(214,240,170,0.6)',
    pine: 'rgba(110,78,42,0.6)',
    lowgrav: 'rgba(124,92,255,0.35)',
    rubble: 'rgba(96,66,44,0.7)',
    sand: 'rgba(236,196,120,0.75)',
    flood: 'rgba(86,66,46,0.75)',
    heat: 'rgba(255,250,238,0.8)',
  };
  if (BASE[style]) {
    g.fillStyle = BASE[style]!;
    g.fillRect(0, 0, S, S);
  }
  switch (style) {
    case 'marsh':
      scatter(26, (x, y) => blob(x, y, 18 + r() * 26, 'rgba(62,84,58,0.75)'));
      scatter(14, (x, y) => blob(x, y, 10 + r() * 16, 'rgba(90,120,140,0.7)'));
      break;
    case 'wind':
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 5;
      g.lineCap = 'round';
      scatter(14, (x, y) => {
        g.beginPath();
        g.moveTo(x - 30, y);
        g.quadraticCurveTo(x, y - 14, x + 30, y);
        g.stroke();
      });
      scatter(30, (x, y) => blob(x, y, 4, 'rgba(160,210,110,0.8)'));
      break;
    case 'pine':
      scatter(40, (x, y) => blob(x, y, 8 + r() * 10, 'rgba(120,80,40,0.65)'));
      g.strokeStyle = 'rgba(60,90,40,0.9)';
      g.lineWidth = 3;
      scatter(70, (x, y) => {
        const a = r() * Math.PI;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        g.stroke();
      });
      break;
    case 'flare': {
      // a ring of yellow and black hazard stripes
      g.save();
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
      g.arc(S / 2, S / 2, S * 0.33, 0, Math.PI * 2, true);
      g.clip();
      for (let i = -S; i < S * 2; i += 28) {
        g.fillStyle = (i / 28) % 2 ? '#111111' : '#ffd23f';
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 28, 0);
        g.lineTo(i + 28 - S, S);
        g.lineTo(i - S, S);
        g.closePath();
        g.fill();
      }
      g.restore();
      break;
    }
    case 'lowgrav':
      g.strokeStyle = 'rgba(196,181,253,0.95)';
      g.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(S / 2, S / 2, S * (0.2 + k * 0.12), 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'laser':
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,90,224,0.9)' : 'rgba(40,10,40,0.85)';
        g.fillRect(0, S * 0.12 + i * S * 0.19, S, S * 0.19);
      }
      break;
    case 'rubble':
      scatter(34, (x, y) => blob(x, y, 6 + r() * 14, `rgba(${110 + r() * 40},${90 + r() * 30},${70 + r() * 20},0.9)`));
      g.strokeStyle = 'rgba(70,45,25,0.7)';
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        let x = S / 2, y = S / 2;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 60;
          y += (r() - 0.5) * 60;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case 'sand':
      g.strokeStyle = 'rgba(160,110,50,0.6)';
      g.lineWidth = 6;
      for (let y = 30; y < S; y += 26) {
        g.beginPath();
        for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 6);
        g.stroke();
      }
      break;
    case 'flood':
      scatter(24, (x, y) => blob(x, y, 20 + r() * 20, 'rgba(110,80,50,0.75)'));
      scatter(12, (x, y) => blob(x, y, 12 + r() * 18, 'rgba(90,170,230,0.8)'));
      break;
    case 'heat':
      scatter(30, (x, y) => blob(x, y, 24 + r() * 20, 'rgba(250,245,235,0.85)'));
      g.strokeStyle = 'rgba(150,110,80,0.75)';
      g.lineWidth = 2.5;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        let x = r() * S, y = r() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.5) * 50;
          y += (r() - 0.5) * 50;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
  }
  // soften the edge so neighbouring patches blend into one strip
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decals.set(style, t);
  return t;
}

function signTexture(style: Style): THREE.Texture {
  const [label, bg, ink] = SIGN[style];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // a diamond warning sign
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(64, 2);
  g.lineTo(126, 64);
  g.lineTo(64, 126);
  g.lineTo(2, 64);
  g.closePath();
  g.fill();
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(64, 10);
  g.lineTo(118, 64);
  g.lineTo(64, 118);
  g.lineTo(10, 64);
  g.closePath();
  g.fill();
  g.fillStyle = ink;
  g.font = '900 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 46);
  g.font = `900 ${label.length > 5 ? 17 : 21}px system-ui, sans-serif`;
  g.fillText(label, 64, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Zone {
  key: string;
  style: Style;
  nodes: string[];
}

function zonesOf(def: BoardDef): Zone[] {
  const out: Zone[] = [];
  const W: Record<string, Style> = { fog: 'marsh', wind: 'wind', flare: 'flare', lowgrav: 'lowgrav', sandstorm: 'sand', flood: 'flood', heat: 'heat' };
  for (const z of def.weather ?? []) out.push({ key: `weather:${z.kind}`, style: W[z.kind] ?? 'rubble', nodes: z.nodes });
  if (def.pines?.length) out.push({ key: 'pine', style: 'pine', nodes: def.pines.flat() });
  const lanes = new Map<number, string[]>();
  for (const n of Object.values(def.nodes)) if (n.canyon !== undefined) lanes.set(n.canyon, [...(lanes.get(n.canyon) ?? []), n.id]);
  for (const [lane, ids] of lanes) out.push({ key: `canyon:${lane}`, style: 'rubble', nodes: ids });
  const laser = Object.values(def.nodes).filter((n) => n.lane).map((n) => n.id);
  if (laser.length) out.push({ key: 'laser', style: 'laser', nodes: laser });
  return out;
}

export interface HazardMarks {
  update(s: BoardState, t: number): void;
}

/** Build the ground markings and signs. `ground(x, z)` is the height of the floor there. */
export function markHazards(scene: THREE.Scene, def: BoardDef, ground: (x: number, z: number) => number): HazardMarks {
  const zones = zonesOf(def);
  const prev = new Map<string, string[]>();
  for (const n of Object.values(def.nodes)) for (const nx of n.next) prev.set(nx, [...(prev.get(nx) ?? []), n.id]);
  const lamps = new Map<string, { lamp: THREE.Mesh; node: string }[]>();
  const geo = new THREE.PlaneGeometry(1, 1);
  const postMat = toy('#6b5a4a', 0.7);
  zones.forEach((z, zi) => {
    const mat = new THREE.MeshBasicMaterial({ map: decal(z.style), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - zi });
    const set = new Set(z.nodes);
    for (const id of z.nodes) {
      const n = def.nodes[id];
      if (!n) continue;
      // the patch sits on the floor under the space (under the bridge or deck if it's raised)
      const d = new THREE.Mesh(geo, mat);
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = (n.x * 1.7 + n.z) % (Math.PI * 2);
      const fy = def.theme === 'cosmo' ? (n.y > 0.5 ? n.y - 0.02 : 0.0) : Math.min(n.y, ground(n.x, n.z)) + 0.03;
      d.position.set(n.x, fy + 0.012 * (zi + 1), n.z);
      d.scale.setScalar(z.style === 'flare' ? 2.1 : 3.4);
      d.renderOrder = -1;
      d.userData.placed = true;
      d.name = `hazard-${z.style}`;
      scene.add(d);
    }
    // a few real props beside the path sell it: rocks in the canyons, reeds in the marsh, sandbags by the river
    const PROP: Partial<Record<Style, [string, number]>> = { rubble: ['forest/rocks-low', 0.9], marsh: ['forest/plant', 0.7], pine: ['forest/stones', 0.6], flood: ['forest/stones', 0.5] };
    const pp = PROP[z.style];
    if (pp)
      z.nodes.forEach((id, k) => {
        if (k % 2) return;
        const n = def.nodes[id];
        const side = k % 4 ? 1 : -1;
        const x = n.x + side * 1.7, zz = n.z + (k % 3) * 0.4 - 0.4;
        const o = prop(pp[0], 1);
        const box = new THREE.Box3().setFromObject(o);
        const sz = box.getSize(new THREE.Vector3());
        o.scale.multiplyScalar(pp[1] / Math.max(0.01, sz.x, sz.z));
        o.position.set(x, def.theme === 'cosmo' ? 0 : ground(x, zz), zz);
        o.rotation.y = k * 1.3;
        o.userData.placed = true;
        scene.add(o);
      });
    // a warning sign wherever the path walks into the zone
    const entries = z.nodes.filter((id) => (prev.get(id) ?? []).some((p) => !set.has(p)));
    const tex = signTexture(z.style);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide });
    for (const id of entries.slice(0, 4)) {
      const n = def.nodes[id];
      const from = def.nodes[(prev.get(id) ?? []).find((p) => !set.has(p)) ?? id];
      const dx = n.x - from.x, dz = n.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      // stand it on the side of the path nearer the camera (+z), just before the zone
      let px = -dz / l, pz = dx / l;
      if (pz < 0) {
        px = -px;
        pz = -pz;
      }
      const sx = (n.x + from.x) / 2 + px * 2.1;
      const sz = (n.z + from.z) / 2 + pz * 2.1;
      const sy = def.theme === 'cosmo' ? Math.max(0, Math.min(n.y, from.y)) : ground(sx, sz);
      const sign = new THREE.Group();
      const post = mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 8), postMat);
      post.position.y = 0.85;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), signMat);
      plate.position.y = 1.75;
      plate.rotation.x = -0.35;
      plate.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3b4e' }));
      lamp.position.y = 2.45;
      lamp.visible = false;
      sign.add(post, plate, lamp);
      sign.position.set(sx, sy, sz);
      sign.userData.placed = true;
      sign.name = 'hazard-sign';
      scene.add(sign);
      lamps.set(z.key, [...(lamps.get(z.key) ?? []), { lamp, node: id }]);
    }
  });
  return {
    update(s, t) {
      // the sign lamps blink on the zones that will go off this round
      const live = new Set<string>();
      if (def.theme === 'gulch') live.add(`canyon:${s.hazards.boulderLane}`);
      if (s.night) live.add('pine');
      if (def.theme === 'cosmo' && s.counter <= 2) live.add('laser');
      for (const z of def.weather ?? []) if (forecast(s, z).warn) live.add(`weather:${z.kind}`);
      const on = Math.sin(t * 7) > 0;
      for (const [key, ls] of lamps)
        for (const { lamp, node } of ls) {
          // only the pine that's going to fall tonight blinks
          const mine = key !== 'pine' || s.hazards.pine.includes(node) || s.hazards.pine.some((p) => def.pines?.some((pair) => pair.includes(p) && pair.includes(node)));
          lamp.visible = live.has(key) && mine && on;
        }
    },
  };
}
