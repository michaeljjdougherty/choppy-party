import * as THREE from 'three';
import { makeScene, mesh, toy, stripeTexture, disposeTree } from '../kit';
import { place, texture } from '../assets';
import { FolkModel, folk } from '../folks';
import { applyLook, buildPiece, lookKey, type Look } from '../cosmetics';
import type { Tag, View } from '../stage';

/** What the Customize view needs to know from the screen each frame. */
export interface DressingState {
  folkId: string;
  color: string;
  look: Look;
  /** bumps each time something is put on, so the character can cheer */
  worn: number;
  /** turn round to show off the back (capes, wings, backpacks) */
  showBack: boolean;
}

/**
 * The Choppy Closet: a cosy boutique with a spinning pedestal, a wardrobe and a hat stand.
 * The character stands on the left; the Customize panel covers the right of the screen.
 */
export function customizeView(env: THREE.Texture, state: () => DressingState): View {
  const scene = makeScene(env, {
    skyTop: '#ffd9a8',
    skyBottom: '#ff9aa8',
    sunDir: [4, 12, 9],
    sunColor: '#fff1dc',
    sunIntensity: 1.6,
    shadowSize: 10,
  });
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  camera.position.set(2.85, 3.1, 11.4);
  camera.lookAt(2.85, 1.85, 0);

  // floor and walls
  const wood = texture('floor_wood_planks', 4, 4);
  const floor = mesh(new THREE.PlaneGeometry(30, 20), wood ? new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }) : toy('#c88a5a', 0.8), { cast: false, receive: true });
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const paper = stripeTexture('#ffe3ec', '#ffd0df', 24);
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  paper.repeat.set(3, 1);
  const wall = mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }), { cast: false, receive: true });
  wall.position.set(0, 6, -4.5);
  scene.add(wall);
  const skirting = mesh(new THREE.BoxGeometry(30, 0.4, 0.12), toy('#ffffff', 0.5), { cast: false, receive: true });
  skirting.position.set(0, 0.2, -4.42);
  scene.add(skirting);
  const rail = mesh(new THREE.BoxGeometry(30, 0.14, 0.1), toy('#e8a0b8', 0.5), { cast: false });
  rail.position.set(0, 2.6, -4.42);
  scene.add(rail);

  // rug and the spinning pedestal
  const rug = mesh(new THREE.CircleGeometry(2.4, 48), toy('#9a5bff', 0.9), { cast: false, receive: true });
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  scene.add(rug);
  const rugEdge = mesh(new THREE.RingGeometry(2.2, 2.4, 48), toy('#ffd23f', 0.8), { cast: false, receive: true });
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.position.y = 0.015;
  scene.add(rugEdge);
  const pedestal = new THREE.Group();
  pedestal.add(mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 40), toy('#ffffff', 0.35), { receive: true }));
  const trim = mesh(new THREE.TorusGeometry(1.3, 0.05, 8, 48), new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.25 }), { cast: false });
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.15;
  pedestal.add(trim);
  const bulbs: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const m = new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffcc55', emissiveIntensity: 1.5 });
    const b = mesh(new THREE.SphereGeometry(0.06, 8, 6), m, { cast: false });
    b.position.set(Math.cos(a) * 1.31, 0.02, Math.sin(a) * 1.31);
    pedestal.add(b);
    bulbs.push(m);
  }
  pedestal.position.y = 0.15;
  scene.add(pedestal);

  // a spotlight on the pedestal
  const spot = new THREE.SpotLight('#fff6e0', 30, 14, 0.45, 0.6, 1.2);
  spot.position.set(0.5, 8, 3);
  spot.target.position.set(0, 0.5, 0);
  scene.add(spot, spot.target);

  // wardrobe on the left: a rail of shirts in every colour
  const wardrobe = new THREE.Group();
  const frame = toy('#7a4a2a', 0.7);
  for (const x of [-1.2, 1.2]) {
    const post = mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), frame);
    post.position.set(x, 1.3, 0);
    wardrobe.add(post);
  }
  const bar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), new THREE.MeshStandardMaterial({ color: '#c0c0c0', metalness: 0.8, roughness: 0.3 }));
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 2.45;
  wardrobe.add(bar);
  const shirtCols = ['#ff5a5f', '#ffd23f', '#4cd97b', '#3fa9f5', '#b06cff', '#ff9f1c', '#2ee6d6', '#ff7bd5'];
  shirtCols.forEach((c, i) => {
    const s = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.16, 0.8, 0.6), toy(c, 0.6));
    body.position.y = -0.45;
    const sleeves = mesh(new THREE.BoxGeometry(0.14, 0.2, 0.9), toy(c, 0.6));
    sleeves.position.y = -0.18;
    const hook = mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: '#c0c0c0', metalness: 0.8 }), { cast: false });
    hook.position.y = 0.0;
    s.add(body, sleeves, hook);
    s.position.set(-1.0 + i * 0.28, 2.45, 0);
    s.rotation.y = 0.15 * Math.sin(i * 2.1);
    wardrobe.add(s);
  });
  wardrobe.position.set(-4.4, 0, -3.2);
  wardrobe.rotation.y = 0.35;
  scene.add(wardrobe);

  // hat stand on the right, wearing a few of the hats on offer
  const stand = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), frame);
  pole.position.y = 1.3;
  const base = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 20), frame);
  base.position.y = 0.06;
  stand.add(pole, base);
  const shown: [string, string, number, number][] = [['tophat', '#ff5a5f', 2.65, 0], ['wizard', '#9a5bff', 2.0, 1], ['cowboy', '#ffd23f', 1.55, -1]];
  for (const [id, c, y, side] of shown) {
    const peg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), frame);
    peg.rotation.z = Math.PI / 2;
    peg.position.set(side * 0.25, y - 0.1, 0);
    const h = buildPiece('hat', id, c);
    h.scale.setScalar(0.45);
    h.position.set(side * 0.5, y - 0.1, 0);
    h.rotation.z = -side * 0.2;
    stand.add(peg, h);
  }
  stand.position.set(-2.2, 0, -3.6);
  scene.add(stand);

  // plants and a full-length mirror for the boutique feel
  place(scene, 'furniture/pottedPlant', -6.2, 0, -3.4, { s: 2.6 });
  place(scene, 'furniture/pottedPlant', 6.5, 0, -3.4, { s: 2.2 });
  const mirror = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe8ff', metalness: 0.9, roughness: 0.08 });
  const glass = mesh(new THREE.BoxGeometry(1.2, 2.6, 0.04), glassMat, { cast: false });
  glass.position.y = 1.6;
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.3 });
  const rim = mesh(new THREE.BoxGeometry(1.4, 2.8, 0.06), gold);
  rim.position.set(0, 1.6, -0.03);
  mirror.add(rim, glass);
  mirror.position.set(0.8, 0, -4.35);
  scene.add(mirror);

  // sparkles drifting up
  const sparkGeo = new THREE.OctahedronGeometry(0.05);
  const sparkMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe680', emissiveIntensity: 1.6 });
  const sparks = Array.from({ length: 18 }, (_, i) => {
    const m = mesh(sparkGeo, sparkMat, { cast: false });
    m.userData.seed = i * 1.37;
    scene.add(m);
    return m;
  });

  // the character
  let model: FolkModel | null = null;
  let modelKey = '';
  let lookK = '';
  let worn = 0;
  let yaw = 0.25;

  return {
    scene,
    camera,
    update(_s, _p, t, dt) {
      const st = state();
      const k = `${st.folkId}`;
      if (k !== modelKey) {
        if (model) {
          pedestal.remove(model.group);
          disposeTree(model.group);
        }
        model = new FolkModel(folk(st.folkId), st.color, 1);
        model.group.position.y = 0.15;
        pedestal.add(model.group);
        modelKey = k;
        lookK = '';
        model.jump();
      }
      const m = model!;
      if (m.parts.color !== st.color) m.setColor(st.color);
      const lk = lookKey(st.look);
      if (lk !== lookK) {
        applyLook(m, st.look);
        lookK = lk;
      }
      if (st.worn !== worn) {
        worn = st.worn;
        m.react('happy', 0.9);
        m.jump();
      }
      // a slow showcase sway, or swing round to show the back
      const want = st.showBack ? Math.PI + Math.sin(t * 0.8) * 0.4 : 0.25 + Math.sin(t * 0.6) * 0.45;
      yaw += (want - yaw) * (1 - Math.exp(-dt * 4));
      m.group.rotation.y = yaw;
      m.update(dt, t, {});
      bulbs.forEach((b, i) => (b.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 4 - i * 0.8)) * 1.6));
      for (const s of sparks) {
        const sd = s.userData.seed as number;
        const life = (t * 0.25 + sd * 0.37) % 1;
        const a = sd * 2.3;
        s.position.set(Math.cos(a) * (1.1 + (sd % 0.7)), 0.3 + life * 3.6, Math.sin(a) * (1.1 + (sd % 0.7)));
        s.rotation.y = t * 2 + sd;
        s.scale.setScalar(Math.sin(life * Math.PI) * 1.2);
      }
    },
    tags(): Tag[] {
      return [];
    },
  };
}
