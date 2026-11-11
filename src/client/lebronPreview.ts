import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { preloadAll } from './three/assets';
import { makeLebron } from './three/stewCourtDecor';

/** Dev page: Evil LeBron on his own, for checking his dances. window.__pose(t) sets the clock. */
const W = 1280, H = 720;
const cv = document.getElementById('c') as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.outputColorSpace = THREE.SRGBColorSpace;
const pm = new THREE.PMREMGenerator(r);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1b5e');
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#806040', 1.2));
const sun = new THREE.DirectionalLight('#fff4dc', 2);
sun.position.set(5, 10, 8);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
cam.position.set(0, 5, 20);
cam.lookAt(0, 4, 0);
await preloadAll(() => {});
const ty = makeLebron(8.5);
scene.add(ty.g);
const grid = new THREE.GridHelper(20, 20);
scene.add(grid);
(window as unknown as Record<string, unknown>).__ty = ty;
(window as unknown as Record<string, unknown>).__scene = scene;
(window as unknown as Record<string, unknown>).__render = (az = 0) => {
  cam.position.set(Math.sin(az) * 20, 5, Math.cos(az) * 20);
  cam.lookAt(0, 4, 0);
  r.render(scene, cam);
};
(window as unknown as Record<string, unknown>).__ready = true;
import { applyPose, DANCES, dancePose } from './three/lebronDance';
(window as unknown as Record<string, unknown>).__dance = (i: number, b: number) => {
  applyPose(ty.rig!, i < 0 ? dancePose(b, DANCES.map((_, k) => k)) : DANCES[i].pose(b), 1);
};
(window as unknown as Record<string, unknown>).__n = DANCES.map((d) => d.name);
