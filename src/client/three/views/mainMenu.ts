import * as THREE from 'three';
import { ChoppyModel } from '../choppy';
import { makeScene, mesh, toy, toonWater } from '../kit';
import { place } from '../assets';
import type { Tag, View } from '../stage';
import { PLAYER_COLORS } from '../../../shared/players';

/** Title and main menu: a little party island where the Choppies dance around a giant dice block. */
export function mainMenuView(env: THREE.Texture, screen: () => string = () => 'title'): View {
  const scene = makeScene(env, { sky: 'day', skyTop: '#3ba7ff', skyBottom: '#c9f0ff', fog: ['#c9f0ff', 40, 120], shadowSize: 16 });
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);

  const water = toonWater('#1e9be8', 60);
  const sea = mesh(new THREE.CircleGeometry(200, 64), water.material, { cast: false, receive: true });
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

  // pirate-kit dressing: palms, a dock, treasure and ships out at sea
  place(scene, 'pirate/palm-detailed-bend', -7, 0.2, -4, { s: 1.0, ry: 0.6 });
  place(scene, 'pirate/palm-detailed-straight', 6.5, 0.2, -5, { s: 1.1 });
  place(scene, 'pirate/palm-bend', -8, 0.2, 1.5, { s: 0.9, ry: -1 });
  place(scene, 'pirate/palm-detailed-straight', 8.2, 0.2, 0.5, { s: 0.9, ry: 2 });
  place(scene, 'pirate/chest', 4.6, 0.2, 2.2, { s: 1.1, ry: -0.6 });
  place(scene, 'pirate/barrel', -4.2, 0.2, -5.6, { s: 0.9 });
  place(scene, 'pirate/barrel', -3.0, 0.2, -6.2, { s: 0.8, ry: 1 });
  place(scene, 'pirate/crate-bottles', 3.5, 0.2, -6.0, { s: 1, ry: 0.4 });
  place(scene, 'pirate/flag-pirate', 0, 0.2, -6.5, { s: 1.3 });
  place(scene, 'pirate/structure-platform-dock', 9.5, -1.2, 6, { s: 1.4, ry: 0.4 });
  place(scene, 'pirate/boat-row-small', 12.5, -1.1, 8, { s: 1, ry: 1.2 });
  const ship = place(scene, 'pirate/ship-pirate-large', -24, -1.6, -22, { s: 1.3, ry: 0.9 });
  const ship2 = place(scene, 'pirate/ship-small', 26, -1.4, -26, { s: 1.1, ry: -0.5 });
  place(scene, 'pirate/rocks-a', 18, -1.4, -6, { s: 1 });
  place(scene, 'pirate/rocks-sand-a', -14, -1.2, 8, { s: 1.2 });
  for (const [x, z] of [[-3, 6.5], [2, 7], [-8.5, 0], [8.4, -0.5], [-1, -7.5]] as [number, number][]) {
    place(scene, 'pirate/grass-plant', x, 0.2, z, { s: 1.2, shadow: false });
  }

  // balloons
  const balloons: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const b = mesh(new THREE.SphereGeometry(0.6, 20, 14), toy(PLAYER_COLORS[i % 8], 0.25), { cast: false });
    b.scale.y = 1.2;
    const a = (i / 12) * Math.PI * 2;
    b.position.set(Math.cos(a) * 18, 6 + (i % 3) * 1.8, Math.sin(a) * 10 - 14);
    b.userData.y = b.position.y;
    scene.add(b);
    balloons.push(b);
  }

  // dancers
  const dancers: ChoppyModel[] = [];
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    const m = new ChoppyModel(PLAYER_COLORS[i], 0.62);
    scene.add(m.group);
    dancers.push(m);
  }

  const camGoal = new THREE.Vector3(0, 7.5, 17);
  const lookGoal = new THREE.Vector3(0, 3.2, 0);
  const look = lookGoal.clone();
  camera.position.copy(camGoal);
  return {
    scene,
    camera,
    update(_s, _p, t, dt) {
      water.update(t);
      // title: island centred under the logo; menu: island on the left, buttons on the right
      const sway = Math.sin(t * 0.15) * 1.2;
      const onMenu = screen() !== 'title';
      camGoal.set(onMenu ? 6.5 + sway : sway, onMenu ? 6 : 7.5, onMenu ? 15 : 17);
      lookGoal.set(onMenu ? 6.5 : 0, onMenu ? 1.6 : 3.2, 0);
      camera.position.lerp(camGoal, Math.min(1, dt * 3));
      look.lerp(lookGoal, Math.min(1, dt * 3));
      camera.lookAt(look);
      dice.rotation.set(Math.sin(t * 0.7) * 0.3, t * 0.9, Math.cos(t * 0.6) * 0.3);
      dice.position.y = 3.4 + Math.sin(t * 2) * 0.25;
      dancers.forEach((m, i) => {
        const ang = (i / dancers.length) * Math.PI * 2 + t * 0.5;
        m.group.position.set(Math.cos(ang) * 3.6, 0.36, Math.sin(ang) * 3.6);
        m.group.rotation.y = -ang; // walk along the circle
        m.update(dt, { speed: 0.45, happy: Math.sin(t * 0.9 + i * 1.7) > 0.75, t: t + i });
      });
      balloons.forEach((b, i) => (b.position.y = (b.userData.y as number) + Math.sin(t + i) * 0.4));
      ship.position.y = -1.6 + Math.sin(t * 0.8) * 0.15;
      ship.rotation.z = Math.sin(t * 0.6) * 0.03;
      ship2.position.y = -1.4 + Math.sin(t * 0.9 + 1) * 0.12;
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
