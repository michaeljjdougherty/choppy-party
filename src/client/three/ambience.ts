import * as THREE from 'three';

/**
 * Background life for the minigame arenas: a slow camera sway, motes of dust (or snow, or
 * sparkles in space) drifting through the air, and every tree, plant and flag swaying in a breeze.
 * Built once per arena from what's already in the scene, so every minigame gets it for free.
 */
const SWAYS = /tree|pine|palm|plant|grass|bush|flower|flag|cactus|reed|crop|kelp|corn/i;

export class Ambience {
  private motes: THREE.Points;
  private speeds: Float32Array;
  private sways: { o: THREE.Object3D; rx: number; rz: number; k: number; amp: number }[] = [];
  private centre = new THREE.Vector3();
  private radius: number;
  private offPos = new THREE.Vector3();
  private offRot = new THREE.Euler();

  constructor(private scene: THREE.Scene) {
    // how big is the arena? (ground-sized things set the box for the dust)
    const box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    for (const o of scene.children) {
      if ((o as THREE.Light).isLight) continue;
      const b = new THREE.Box3().setFromObject(o);
      if (!b.isEmpty() && b.getSize(new THREE.Vector3()).length() < 400) box.union(b);
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-15, 0, -15), new THREE.Vector3(15, 6, 15));
    box.getCenter(this.centre);
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.min(40, Math.max(12, Math.max(size.x, size.z) * 0.55));

    // the mood decides the motes: snow on snowy maps, star-dust in space, warm dust otherwise
    const names: string[] = [];
    scene.traverse((o) => o.name && names.length < 400 && names.push(o.name));
    const all = names.join(' ');
    const kind = /snow|holiday|sled|ice/i.test(all) ? 'snow' : /space|station|rocket|hangar|alien|planet/i.test(all) ? 'space' : 'dust';
    const n = 220;
    const pos = new Float32Array(n * 3);
    this.speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = this.centre.x + (Math.random() - 0.5) * this.radius * 2;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = this.centre.z + (Math.random() - 0.5) * this.radius * 2;
      this.speeds[i] = 0.4 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(dot),
      color: kind === 'snow' ? '#ffffff' : kind === 'space' ? '#bfe9ff' : '#fff1c9',
      size: kind === 'snow' ? 0.22 : 0.13,
      transparent: true,
      opacity: kind === 'snow' ? 0.9 : 0.6,
      depthWrite: false,
      blending: kind === 'space' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.userData.kind = kind;
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    // plants and flags sway from their base
    scene.traverse((o) => {
      if (!o.name || !SWAYS.test(o.name) || o.userData.noSway) return;
      // only the top-most named prop, not every mesh inside it
      let p = o.parent;
      while (p && p !== scene) {
        if (p.name && SWAYS.test(p.name)) return;
        p = p.parent;
      }
      const tall = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
      if (tall < 0.2 || tall > 25) return;
      this.sways.push({ o, rx: o.rotation.x, rz: o.rotation.z, k: o.position.x * 0.37 + o.position.z * 0.21, amp: Math.min(0.06, 0.25 / Math.max(1, tall)) + 0.012 });
    });
  }

  update(dt: number, t: number): void {
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const kind = this.motes.userData.kind;
    const r = this.radius;
    for (let i = 0; i < pos.count; i++) {
      const sp = this.speeds[i];
      let x = pos.getX(i) + (Math.sin(t * 0.5 + i) * 0.25 + 0.35) * dt * sp;
      let y = pos.getY(i) + (kind === 'snow' ? -0.9 * sp : Math.sin(t * 0.8 + i * 1.3) * 0.12) * dt;
      let z = pos.getZ(i) + Math.cos(t * 0.4 + i * 0.7) * 0.2 * dt * sp;
      if (x > this.centre.x + r) x -= r * 2;
      if (y < 0) y += 9;
      if (y > 9) y -= 9;
      if (z > this.centre.z + r) z -= r * 2;
      if (z < this.centre.z - r) z += r * 2;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    // gusts come and go, so the sway isn't a metronome
    const gust = 0.7 + Math.sin(t * 0.37) * 0.3 + Math.sin(t * 1.1) * 0.1;
    for (const s of this.sways) {
      s.o.rotation.x = s.rx + Math.sin(t * 1.3 + s.k) * s.amp * 0.5 * gust;
      s.o.rotation.z = s.rz + Math.sin(t * 1.7 + s.k * 1.3) * s.amp * gust;
    }
  }

  /** A gentle handheld drift on the camera; undo it after rendering. */
  swayCamera(cam: THREE.Camera, t: number): void {
    this.offPos.set(Math.sin(t * 0.31) * 0.18 + Math.sin(t * 0.73) * 0.06, Math.sin(t * 0.43) * 0.1, Math.cos(t * 0.27) * 0.12);
    this.offRot.set(Math.sin(t * 0.37) * 0.006, Math.sin(t * 0.29) * 0.008, Math.sin(t * 0.21) * 0.005);
    cam.position.add(this.offPos);
    cam.rotation.x += this.offRot.x;
    cam.rotation.y += this.offRot.y;
    cam.rotation.z += this.offRot.z;
  }

  unswayCamera(cam: THREE.Camera): void {
    cam.position.sub(this.offPos);
    cam.rotation.x -= this.offRot.x;
    cam.rotation.y -= this.offRot.y;
    cam.rotation.z -= this.offRot.z;
  }

  dispose(): void {
    this.scene.remove(this.motes);
    this.motes.geometry.dispose();
  }
}
