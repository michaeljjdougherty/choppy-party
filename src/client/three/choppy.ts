import * as THREE from 'three';
import { darken, lighten, mesh, toy } from './kit';

/**
 * A "Choppy", the game's own mascot: a round, glossy fruit-like critter with big eyes,
 * stubby hands and feet and a leaf on top. Built from primitives, animated procedurally.
 */
export class ChoppyModel {
  readonly group = new THREE.Group(); // place and rotate this
  private body = new THREE.Group(); // bounce and squash this
  private feet: THREE.Mesh[] = [];
  private hands: THREE.Mesh[] = [];
  private pupils: THREE.Mesh[] = [];
  private dizzy = new THREE.Group();
  private leaf: THREE.Group;
  private walk = 0;
  private blinkT = Math.random() * 3;

  constructor(color: string, scale = 1) {
    const g = this.body;
    const skin = toy(color, 0.32);
    const shell = mesh(new THREE.SphereGeometry(1, 40, 28), skin);
    shell.scale.set(1, 0.94, 1);
    g.add(shell);

    const belly = mesh(new THREE.SphereGeometry(0.62, 28, 20), toy(lighten(color, 0.55), 0.4), { cast: false });
    belly.position.set(0, -0.28, 0.55);
    belly.scale.set(1, 0.85, 0.55);
    g.add(belly);

    const white = toy('#ffffff', 0.15);
    const black = toy('#1b1b24', 0.2);
    for (const side of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.27, 24, 18), white, { cast: false });
      eye.position.set(side * 0.31, 0.22, 0.8);
      eye.scale.set(0.9, 1.25, 0.6);
      g.add(eye);
      const pupil = mesh(new THREE.SphereGeometry(0.14, 20, 14), black, { cast: false });
      pupil.position.set(side * 0.31, 0.2, 0.95);
      pupil.scale.set(0.9, 1.3, 0.5);
      g.add(pupil);
      this.pupils.push(pupil);
      const glint = mesh(new THREE.SphereGeometry(0.045, 10, 8), white, { cast: false });
      glint.position.set(side * 0.31 + 0.05, 0.3, 1.01);
      g.add(glint);
      const cheek = mesh(new THREE.SphereGeometry(0.12, 14, 10), toy('#ff8fb0', 0.5), { cast: false });
      cheek.position.set(side * 0.58, -0.08, 0.72);
      cheek.scale.set(1.2, 0.8, 0.4);
      g.add(cheek);
      const hand = mesh(new THREE.SphereGeometry(0.22, 18, 14), toy(lighten(color, 0.15), 0.35));
      hand.position.set(side * 0.98, -0.2, 0.15);
      g.add(hand);
      this.hands.push(hand);
      const foot = mesh(new THREE.SphereGeometry(0.33, 20, 14), toy(darken(color, 0.25), 0.45));
      foot.scale.set(1, 0.55, 1.35);
      foot.position.set(side * 0.42, -0.9, 0.12);
      this.feet.push(foot);
      this.group.add(foot);
    }
    // smile
    const smile = mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI), black, { cast: false });
    smile.position.set(0, -0.05, 0.94);
    smile.rotation.set(0.25, 0, Math.PI);
    g.add(smile);

    // leaf + stem
    this.leaf = new THREE.Group();
    const stem = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), toy('#6b4a2b', 0.6));
    stem.position.y = 1.0;
    this.leaf.add(stem);
    const leaf = mesh(new THREE.SphereGeometry(0.34, 18, 12), toy('#49c25a', 0.38));
    leaf.scale.set(1, 0.22, 0.55);
    leaf.position.set(0.26, 1.13, 0);
    leaf.rotation.z = 0.45;
    this.leaf.add(leaf);
    g.add(this.leaf);

    // dizzy stars
    const starMat = toy('#ffd23f', 0.3);
    starMat.emissive = new THREE.Color('#7a5a00');
    for (let i = 0; i < 3; i++) {
      const st = mesh(new THREE.OctahedronGeometry(0.14), starMat, { cast: false });
      const a = (i / 3) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
      this.dizzy.add(st);
    }
    this.dizzy.position.y = 1.45;
    this.dizzy.visible = false;
    g.add(this.dizzy);

    this.body.position.y = 1;
    this.group.add(this.body);
    this.group.scale.setScalar(scale);
  }

  /** speed: 0..1 how fast it is moving. jump: extra height in body units. */
  update(dt: number, o: { speed?: number; stunned?: boolean; jump?: number; happy?: boolean; t?: number } = {}): void {
    const speed = o.speed ?? 0;
    this.walk += dt * (4 + speed * 12);
    const step = Math.sin(this.walk) * Math.min(1, speed * 1.5);
    const idle = Math.sin(this.walk * 0.6) * 0.03;
    const hop = o.happy ? Math.abs(Math.sin((o.t ?? this.walk) * 7)) * 0.5 : 0;
    this.body.position.y = 1 + Math.abs(step) * 0.12 + idle + (o.jump ?? 0) + hop;
    const squash = 1 - Math.abs(step) * 0.05 + idle * 0.6;
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.body.rotation.z = step * 0.08;
    this.feet[0].position.z = 0.12 + step * 0.3;
    this.feet[1].position.z = 0.12 - step * 0.3;
    this.feet[0].position.y = -0.9 + Math.max(0, step) * 0.18 + (o.jump ?? 0) * 0.6 + hop * 0.6;
    this.feet[1].position.y = -0.9 + Math.max(0, -step) * 0.18 + (o.jump ?? 0) * 0.6 + hop * 0.6;
    const wave = o.happy ? 1.2 : 0;
    this.hands[0].position.y = -0.2 + step * 0.12 + wave * Math.abs(Math.sin((o.t ?? 0) * 8)) * 0.5;
    this.hands[1].position.y = -0.2 - step * 0.12 + wave * Math.abs(Math.cos((o.t ?? 0) * 8)) * 0.5;
    this.leaf.rotation.z = Math.sin(this.walk * 0.8) * 0.15;

    this.dizzy.visible = !!o.stunned;
    if (o.stunned) this.dizzy.rotation.y += dt * 6;

    // blink
    this.blinkT -= dt;
    const blinking = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const p of this.pupils) p.scale.y = o.stunned ? 0.35 : blinking ? 0.15 : 1.3;
  }
}
