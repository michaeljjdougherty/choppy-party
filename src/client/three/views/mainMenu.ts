import * as THREE from 'three';
import { ChoppyModel } from '../choppy';
import { makeScene, mesh, toy } from '../kit';
import type { Tag, View } from '../stage';
import { PLAYER_COLORS } from '../../../shared/players';

/** Title and main menu: a little party island where the Choppies dance around a giant dice block. */
export function mainMenuView(env: THREE.Texture): View {
  const scene = makeScene(env, { skyTop: '#3ba7ff', skyBottom: '#c9f0ff', fog: ['#c9f0ff', 40, 120], shadowSize: 16 });
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);

  const sea = mesh(new THREE.CircleGeometry(200, 64), toy('#1e9be8', 0.15), { cast: false, receive: true });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.2;
  scene.add(sea);
  const island = mesh(new THREE.CylinderGeometry(9, 10.5, 2.4, 48), toy('#59c24e', 0.8), { receive: true });
  island.position.y = -0.95;
  scene.add(island);
  const beach = mesh(new THREE.CylinderGeometry(10.6, 11.5, 0.6, 48), toy('#ffe0a0', 0.9), { cast: false, receive: true });
  beach.position.y = -1.3;
  scene.add(beach);
  // checkered dance floor
  const floorTiles = new THREE.Group();
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      if (i * i + j * j > 10) continue;
      const t = mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), toy((i + j) % 2 ? '#ffd23f' : '#ffffff', 0.4), { cast: false, receive: true });
      t.position.set(i * 1.2, 0.3, j * 1.2);
      floorTiles.add(t);
    }
  scene.add(floorTiles);

  // giant dice block in the middle
  const dice = new THREE.Group();
  const block = mesh(new THREE.BoxGeometry(2, 2, 2), [face('3'), face('6'), face('9'), face('1'), face('5'), face('7')]);
  dice.add(block);
  dice.position.set(0, 3.4, 0);
  scene.add(dice);

  // palm trees
  const trunkMat = toy('#9a6a3a', 0.8);
  const leafMat = toy('#2fb35a', 0.6);
  for (const [x, z] of [[-7, -3], [6.5, -4.5], [-5.5, 5], [7, 3.5]] as [number, number][]) {
    const tr = mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 8), trunkMat);
    tr.position.set(x, 2.3, z);
    tr.rotation.z = x > 0 ? -0.15 : 0.15;
    scene.add(tr);
    for (let k = 0; k < 5; k++) {
      const leaf = mesh(new THREE.SphereGeometry(1.4, 10, 6), leafMat);
      leaf.scale.set(1, 0.18, 0.4);
      const a = (k / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.1 + (x > 0 ? -0.4 : 0.4), 4.9, z + Math.sin(a) * 1.1);
      leaf.rotation.y = -a;
      leaf.rotation.z = -0.35;
      scene.add(leaf);
    }
  }

  // balloons
  const balloons: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const b = mesh(new THREE.SphereGeometry(0.6, 20, 14), toy(PLAYER_COLORS[i % 8], 0.25), { cast: false });
    b.scale.y = 1.2;
    const a = (i / 12) * Math.PI * 2;
    b.position.set(Math.cos(a) * 14, 5 + (i % 3) * 1.5, Math.sin(a) * 14 - 4);
    b.userData.y = b.position.y;
    scene.add(b);
    balloons.push(b);
  }

  // dancers
  const dancers: ChoppyModel[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new ChoppyModel(PLAYER_COLORS[i], 0.7);
    scene.add(m.group);
    dancers.push(m);
  }

  return {
    scene,
    camera,
    update(_s, _p, t, dt) {
      const a = t * 0.08;
      camera.position.set(Math.sin(a) * 4 - 4, 6.2, 16 + Math.cos(a) * 1.5);
      camera.lookAt(-3.6, 2.2, 0);
      dice.rotation.set(Math.sin(t * 0.7) * 0.3, t * 0.9, Math.cos(t * 0.6) * 0.3);
      dice.position.y = 3.4 + Math.sin(t * 2) * 0.25;
      dancers.forEach((m, i) => {
        const ang = (i / dancers.length) * Math.PI * 2 + t * 0.5;
        m.group.position.set(Math.cos(ang) * 3.2, 0.36, Math.sin(ang) * 3.2);
        m.group.rotation.y = ang + Math.PI; // face along the circle
        m.update(dt, { speed: 0.5, happy: Math.sin(t * 1.5 + i) > 0.3, t: t + i });
      });
      balloons.forEach((b, i) => (b.position.y = (b.userData.y as number) + Math.sin(t + i) * 0.4));
    },
    tags(): Tag[] {
      return [];
    },
  };
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
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 });
}
