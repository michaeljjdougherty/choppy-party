import * as THREE from 'three';

/**
 * Burger layers that look like food, not coloured discs: a domed toasted bun with sesame seeds,
 * a lumpy seared patty, cheese melting over the edge, ruffled lettuce, tomato slices with seeds,
 * onion rings and wavy bacon. All centred, sitting on y=0, about `r` in radius.
 */
let seeded = 3;
const rnd = () => ((seeded = (seeded * 16807) % 2147483647) / 2147483647);

function canvasTex(S: number, draw: (g: CanvasRenderingContext2D, S: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d')!, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = make();
    m.userData.noDetail = true;
    mats.set(key, m);
  }
  return m;
}

function bunMat(): THREE.Material {
  return mat('bun', () => {
    // toasted golden top fading to a pale crumb at the base (uv.y runs base -> crown on the lathe)
    const map = canvasTex(64, (g, S) => {
      const gr = g.createLinearGradient(0, S, 0, 0);
      gr.addColorStop(0, '#f6dcae');
      gr.addColorStop(0.18, '#e9a659');
      gr.addColorStop(0.6, '#c87830');
      gr.addColorStop(1, '#b8682a');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    });
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffd9a0'), clearcoat: 0.25, clearcoatRoughness: 0.5 });
  });
}

function pattyMat(): THREE.Material {
  return mat('patty', () => {
    const map = canvasTex(128, (g, S) => {
      g.fillStyle = '#5a3020';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const v = rnd();
        g.fillStyle = v < 0.5 ? `rgba(40,20,12,${0.3 + rnd() * 0.4})` : `rgba(140,80,50,${0.2 + rnd() * 0.3})`;
        g.beginPath();
        g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    });
    return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 3, roughness: 0.7, metalness: 0 });
  });
}

function lathe(profile: [number, number][], segs = 40): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

function bun(r: number, top: boolean): THREE.Object3D {
  const g = new THREE.Group();
  if (top) {
    const pts: [number, number][] = [[0, 0]];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 0.5;
      // bulgy rounded rim, then a soft dome
      pts.push([r * (0.98 + Math.sin(a * 2) * 0.04) * Math.cos(a) + 0.001, r * 0.62 * Math.sin(a) + 0.04 * Math.sin(a * 2)]);
    }
    pts[pts.length - 1][0] = 0.001;
    pts.reverse();
    const dome = new THREE.Mesh(lathe(pts), bunMat());
    dome.castShadow = true;
    g.add(dome);
    // sesame seeds scattered on the dome
    const seed = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05 * r, 6, 4), mat('seed', () => new THREE.MeshStandardMaterial({ color: '#fbf0d6', roughness: 0.5 })), 26);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 0.5, 2.0), p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * 0.8;
      const ang = Math.asin(Math.min(1, k));
      p.set(Math.cos(a) * k * r, Math.cos(ang) * r * 0.62 + 0.005, Math.sin(a) * k * r);
      n.set(p.x / r, (p.y / (r * 0.62)) * 1.6, p.z / r).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6));
      m4.compose(p, q, s);
      seed.setMatrixAt(i, m4);
    }
    g.add(seed);
  } else {
    const h = 0.32 * r;
    const pts: [number, number][] = [[0.001, 0], [r * 0.9, 0], [r * 0.98, h * 0.25], [r, h * 0.6], [r * 0.97, h * 0.92], [r * 0.9, h], [0.001, h]];
    const base = new THREE.Mesh(lathe(pts), bunMat());
    base.castShadow = true;
    g.add(base);
    // the cut face: pale soft crumb
    const crumb = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 32), mat('crumb', () => new THREE.MeshStandardMaterial({ color: '#f7e2bc', roughness: 0.95 })));
    crumb.rotation.x = -Math.PI / 2;
    crumb.position.y = h + 0.002;
    g.add(crumb);
  }
  return g;
}

function patty(r: number): THREE.Object3D {
  const h = 0.24 * r;
  const pts: [number, number][] = [[0.001, 0], [r * 0.92, 0], [r * 1.0, h * 0.3], [r * 1.02, h * 0.6], [r * 0.95, h], [0.001, h * 1.05]];
  const geo = lathe(pts, 48);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 5) * 0.03 + Math.sin(a * 11 + 1) * 0.02;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    pos.setY(i, pos.getY(i) * (1 + Math.sin(a * 7) * 0.08));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, pattyMat());
  m.castShadow = true;
  return m;
}

function cheese(r: number): THREE.Object3D {
  // a square slice draped over the layer below: corners droop over the edge
  const s = r * 1.8;
  const geo = new THREE.PlaneGeometry(s, s, 16, 16);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const over = Math.max(0, d - r * 0.85);
    pos.setY(i, 0.04 - over * over * 2.2 - over * 0.4);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat('cheese', () => new THREE.MeshPhysicalMaterial({ color: '#ffbf1f', roughness: 0.35, clearcoat: 0.4, side: THREE.DoubleSide, sheen: 0.3, sheenColor: new THREE.Color('#fff0a0') })));
  m.rotation.y = rnd() * Math.PI;
  m.castShadow = true;
  return m;
}

function lettuce(r: number): THREE.Object3D {
  // a ruffled leaf: a disc whose rim waves up and down
  const geo = new THREE.CircleGeometry(r * 1.12, 72, 0, Math.PI * 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y) / (r * 1.12), a = Math.atan2(y, x);
    pos.setZ(i, (Math.sin(a * 13) * 0.6 + Math.sin(a * 7 + 2) * 0.4) * 0.09 * r * d * d);
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(
    geo,
    mat('lettuce', () => {
      const t = canvasTex(128, (g, S) => {
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        gr.addColorStop(0, '#d6f08a');
        gr.addColorStop(0.7, '#7ccf3c');
        gr.addColorStop(1, '#4fa12a');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
        g.strokeStyle = 'rgba(235,255,190,0.55)';
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(S / 2, S / 2);
          g.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48);
          g.stroke();
        }
      });
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, side: THREE.DoubleSide });
    }),
  );
  m.position.y = 0.04;
  m.castShadow = true;
  return m;
}

function tomato(r: number): THREE.Object3D {
  const g = new THREE.Group();
  const face = mat('tomatoFace', () => {
    const t = canvasTex(128, (c, S) => {
      c.fillStyle = '#d8241c';
      c.fillRect(0, 0, S, S);
      // the flesh chambers with seeds
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const x = S / 2 + Math.cos(a) * S * 0.24, y = S / 2 + Math.sin(a) * S * 0.24;
        c.fillStyle = '#ff6a4a';
        c.beginPath();
        c.ellipse(x, y, S * 0.14, S * 0.09, a, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffe9a8';
        for (let k = 0; k < 6; k++) {
          c.beginPath();
          c.ellipse(x + (rnd() - 0.5) * S * 0.14, y + (rnd() - 0.5) * S * 0.1, 2.2, 1.3, rnd() * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = '#ff8c70';
      c.beginPath();
      c.arc(S / 2, S / 2, S * 0.07, 0, Math.PI * 2);
      c.fill();
    });
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  });
  const skin = mat('tomatoSkin', () => new THREE.MeshPhysicalMaterial({ color: '#c41a14', roughness: 0.25, clearcoat: 1 }));
  for (let i = 0; i < 2; i++) {
    const sr = r * 0.62;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr, 0.09 * r, 28), [skin, face, face]);
    c.position.set((i - 0.5) * r * 0.75, 0.05 * r + i * 0.02, (i - 0.5) * 0.2 * r);
    c.rotation.z = (i - 0.5) * 0.06;
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

function onion(r: number): THREE.Object3D {
  const g = new THREE.Group();
  const m = mat('onion', () => new THREE.MeshPhysicalMaterial({ color: '#f4e4f4', roughness: 0.3, clearcoat: 0.6, opacity: 0.9, transparent: true }));
  for (let i = 0; i < 5; i++) {
    const rr = r * (0.28 + rnd() * 0.22);
    const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.04 * r, 8, 32), m);
    t.rotation.x = Math.PI / 2 + (rnd() - 0.5) * 0.15;
    const a = (i / 5) * Math.PI * 2 + rnd();
    t.position.set(Math.cos(a) * r * 0.42, 0.04 * r, Math.sin(a) * r * 0.42);
    g.add(t);
  }
  return g;
}

function bacon(r: number): THREE.Object3D {
  const g = new THREE.Group();
  const m = mat('bacon', () => {
    const t = canvasTex(64, (c, S) => {
      // streaks of meat and fat along the strip
      const rows = ['#9c2a1c', '#e8b48a', '#b2382a', '#f0c49c', '#8a2216'];
      rows.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, (i / rows.length) * S, S, S / rows.length + 1);
      });
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, side: THREE.DoubleSide });
  });
  for (let i = 0; i < 2; i++) {
    const L = r * 2.1, W = r * 0.42;
    const geo = new THREE.PlaneGeometry(L, W, 30, 1);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin((pos.getX(k) / L) * Math.PI * 5 + i) * 0.06 * r);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const s = new THREE.Mesh(geo, m);
    s.position.set(0, 0.06 * r + i * 0.02, (i - 0.5) * r * 0.55);
    s.rotation.y = (i - 0.5) * 0.4;
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

export type BurgerLayer = 'bun' | 'patty' | 'cheese' | 'tomato' | 'bacon' | 'onion' | 'lettuce' | string;

/** One layer of a burger. Returns the object and how tall it stacks. */
export function burgerLayer(kind: BurgerLayer, top: boolean, r = 0.75): { o: THREE.Object3D; h: number } {
  switch (kind) {
    case 'bun':
      return top ? { o: bun(r, true), h: 0.5 * r } : { o: bun(r, false), h: 0.32 * r };
    case 'patty':
      return { o: patty(r), h: 0.25 * r };
    case 'cheese':
      return { o: cheese(r), h: 0.05 * r };
    case 'tomato':
      return { o: tomato(r), h: 0.13 * r };
    case 'bacon':
      return { o: bacon(r), h: 0.12 * r };
    case 'onion':
      return { o: onion(r), h: 0.1 * r };
    case 'lettuce':
      return { o: lettuce(r), h: 0.1 * r };
    default:
      return { o: patty(r), h: 0.25 * r };
  }
}
