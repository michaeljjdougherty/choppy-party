import * as THREE from 'three';

/**
 * Evil LeBron's dance moves: procedural poses on his model's own skeleton, timed to the beat of
 * his song ("Seven Feet of Evil" runs at 136 BPM). He cycles through a set of deliberately silly
 * dances, 8 beats each, until the host skips him.
 *
 * Poses are written in "character space": x points to his left, y up, z forward (he faces +z).
 * Each bone's rotation is applied relative to its parent's REST frame, like a simple FK rig, so a
 * pose reads the same whichever way the bones were authored. Mirror a left-side rotation for the
 * right side with mir() (x stays, y and z flip).
 */
export const LEBRON_BPM = 136;
/** Where the first beat falls in the song, in seconds (measured from the mp3). */
export const LEBRON_BEAT0 = 0.163;

type E = [number, number, number];
type Key =
  | 'pelvis' | 'spine' | 'chest' | 'neck' | 'head' | 'jaw'
  | 'clavL' | 'clavR' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'handL' | 'handR'
  | 'thighL' | 'thighR' | 'calfL' | 'calfR' | 'footL' | 'footR'
  | 'wingL' | 'wingR';
export type Pose = Partial<Record<Key, E>> & {
  /** Whole-body offsets, in fractions of his height (x, y, z) and radians (spin, tilt, lean). */
  root?: { x?: number; y?: number; z?: number; spin?: number; tilt?: number; lean?: number; sx?: number; sy?: number };
};

const BONES: Record<Key, RegExp[]> = {
  pelvis: [/^pelvis_\d+$/],
  spine: [/^spine_02_\d+$/, /^spine_03_\d+$/],
  chest: [/^spine_05_\d+$/],
  // the body and the face are two skeletons with a neck each: turn both together
  neck: [/^neck_01001_\d+$/, /^neck_01_\d+$/],
  head: [/^head_\d+$/],
  jaw: [/^C_jaw_\d+$/],
  clavL: [/^clavicle_l_\d+$/],
  clavR: [/^clavicle_r_\d+$/],
  armL: [/^upperarm_l_\d+$/],
  armR: [/^upperarm_r_\d+$/],
  foreL: [/^lowerarm_l_\d+$/],
  foreR: [/^lowerarm_r_\d+$/],
  handL: [/^hand_l_\d+$/],
  handR: [/^hand_r_\d+$/],
  thighL: [/^thigh_l_\d+$/],
  thighR: [/^thigh_r_\d+$/],
  calfL: [/^calf_l_\d+$/],
  calfR: [/^calf_r_\d+$/],
  footL: [/^foot_l_\d+$/],
  footR: [/^foot_r_\d+$/],
  wingL: [/^wing_l_\d+$/],
  wingR: [/^wing_r_\d+$/],
};

interface Joint {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  /** The parent's rest orientation in the model's space, and its inverse. */
  pw: THREE.Quaternion;
  pwInv: THREE.Quaternion;
}

export interface Rig {
  joints: Partial<Record<Key, Joint[]>>;
  model: THREE.Object3D;
  base: { pos: THREE.Vector3; scale: THREE.Vector3 };
  /** His height in the model's parent space, for root offsets. */
  h: number;
}

const find = (root: THREE.Object3D, re: RegExp): THREE.Object3D | null => {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && re.test(o.name)) hit = o;
  });
  return hit;
};

/**
 * Set up a rig on his model (call once, in his rest pose). The model's wings, face and crown are
 * separate skeletons that don't follow the body, so they're re-hung on his chest and head first.
 */
export function makeRig(model: THREE.Object3D, h: number): Rig {
  model.updateMatrixWorld(true);
  const hang = (child: RegExp, parent: RegExp) => {
    const c = find(model, child);
    const p = find(model, parent);
    if (c && p && c.parent !== p) p.attach(c);
  };
  hang(/^wing_l_\d+$/, /^spine_05_\d+$/);
  hang(/^wing_r_\d+$/, /^spine_05_\d+$/);
  hang(/^neck_01_\d+$/, /^spine_05_\d+$/);
  hang(/^dyn_crown_\d+$/, /^head_\d+$/);
  model.updateMatrixWorld(true);
  const inv = new THREE.Quaternion();
  model.getWorldQuaternion(inv).invert();
  const joints: Rig['joints'] = {};
  for (const k of Object.keys(BONES) as Key[]) {
    const list: Joint[] = [];
    for (const re of BONES[k]) {
      const bone = find(model, re);
      if (!bone || !bone.parent) continue;
      const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv);
      list.push({ bone, rest: bone.quaternion.clone(), pw, pwInv: pw.clone().invert() });
    }
    if (list.length) joints[k] = list;
  }
  return { joints, model, base: { pos: model.position.clone(), scale: model.scale.clone() }, h };
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qc = new THREE.Quaternion();
const eu = new THREE.Euler();
const ID = new THREE.Quaternion();

/** Put the rig in a pose, blended with his rest pose by `w` (0 = rest, 1 = the full pose). */
export function applyPose(rig: Rig, pose: Pose | null, w: number): void {
  for (const k of Object.keys(rig.joints) as Key[]) {
    const js = rig.joints[k]!;
    const e = pose && w > 0 ? pose[k] : undefined;
    for (const j of js) {
      if (!e) {
        j.bone.quaternion.copy(j.rest);
        continue;
      }
      // a spine split over two bones gets half each
      const f = js.length > 1 && k === 'spine' ? 0.5 : 1;
      eu.set(e[0] * f, e[1] * f, e[2] * f, 'YXZ');
      qc.setFromEuler(eu);
      qa.slerpQuaternions(ID, qc, w);
      // rest-parent frame: local = pw^-1 * R * pw * rest
      qb.copy(j.pwInv).multiply(qa).multiply(j.pw).multiply(j.rest);
      j.bone.quaternion.copy(qb);
    }
  }
  const r = (w > 0 && pose?.root) || {};
  const m = rig.model;
  m.position.set(rig.base.pos.x + (r.x ?? 0) * rig.h * w, rig.base.pos.y + (r.y ?? 0) * rig.h * w, rig.base.pos.z + (r.z ?? 0) * rig.h * w);
  m.rotation.set((r.lean ?? 0) * w, (r.spin ?? 0) * w, (r.tilt ?? 0) * w, 'YXZ');
  const sx = 1 + ((r.sx ?? 1) - 1) * w;
  const sy = 1 + ((r.sy ?? 1) - 1) * w;
  m.scale.set(rig.base.scale.x * sx, rig.base.scale.y * sy, rig.base.scale.z * sx);
}

// ---- helpers for writing moves -------------------------------------------------------------

const PI = Math.PI;
/** Mirror a left-side rotation onto the right. */
const mir = (e: E): E => [e[0], -e[1], -e[2]];
const sin = Math.sin;
/** 0..1..0 once per beat, a sharp bounce. */
const bounce = (b: number) => Math.abs(sin(b * PI));
/** Snap a value to steps (robot moves). */
const snap = (v: number, n: number) => Math.round(v * n) / n;
/** Ease 0..1. */
const ease = (x: number) => x * x * (3 - 2 * x);
/** Which half of a 2-beat cycle we're in, -1 or 1. */
const alt = (b: number, per = 1) => (Math.floor(b / per) % 2 === 0 ? 1 : -1);
/** A squat: knees bent by `k` (0..1). */
const squat = (k: number): Pose => ({ thighL: [-0.9 * k, 0, 0.12 * k], thighR: mir([-0.9 * k, 0, 0.12 * k]), calfL: [1.5 * k, 0, 0], calfR: [1.5 * k, 0, 0], footL: [-0.6 * k, 0, 0], footR: [-0.6 * k, 0, 0] });

/** Arms hanging down by his sides (his rest is an A-pose). */
const DOWN = -0.75;

export interface Dance {
  name: string;
  pose: (b: number) => Pose;
}

/**
 * The moves. `b` is the beat count (a float, 1 per beat). They're meant to look ridiculous on a
 * seven-foot evil overlord.
 */
export const DANCES: Dance[] = [
  {
    // elbows flapping, head pecking, tail feathers wiggling, wings going like mad
    name: 'Chicken Dance',
    pose: (b) => {
      const flap = sin(b * PI * 4) * 0.5 + 0.5;
      const peck = Math.max(0, sin(b * PI * 2));
      const k = bounce(b) * 0.35;
      return {
        ...squat(0.25 + k),
        clavL: [0, 0, 0.2 * flap],
        clavR: mir([0, 0, 0.2 * flap]),
        armL: [0.2, 0.1, 0.1 + flap * 0.7],
        armR: mir([0.2, 0.1, 0.1 + flap * 0.7]),
        foreL: [0, 2.3, 0.5],
        foreR: mir([0, 2.3, 0.5]),
        handL: [0, 0, -0.6],
        handR: mir([0, 0, -0.6]),
        pelvis: [0.3, sin(b * PI * 2) * 0.35, 0],
        spine: [0.25, 0, 0],
        neck: [-0.3 + peck * 0.8, 0, 0],
        head: [peck * 0.3, 0, 0],
        jaw: [peck * 0.45, 0, 0],
        wingL: [0, 0, sin(b * PI * 4) * 0.6],
        wingR: mir([0, 0, sin(b * PI * 4) * 0.6]),
        root: { y: -0.08 - k * 0.12, z: peck * 0.04 },
      };
    },
  },
  {
    // the floss: both arms swing hard side to side, one in front of him and one behind
    name: 'Floss',
    pose: (b) => {
      const a = sin(b * PI) * 0.85;
      const fb = alt(b + 0.5) * 0.45;
      return {
        armL: [0, -fb, DOWN + a],
        armR: [0, -fb, -DOWN + a],
        foreL: [0, 0, 0.3],
        foreR: mir([0, 0, 0.3]),
        pelvis: [0, -a * 0.3, -a * 0.35],
        spine: [0, a * 0.2, a * 0.2],
        neck: [0, -a * 0.3, 0],
        head: [0, 0, -a * 0.25],
        jaw: [0.15 + bounce(b) * 0.2, 0, 0],
        wingL: [0, 0, -a * 0.3],
        wingR: [0, 0, -a * 0.3],
        root: { x: -a * 0.04, y: -bounce(b) * 0.03 },
      };
    },
  },
  {
    // the sprinkler: hand behind his head, the other arm ticking across like a lawn sprinkler
    name: 'Sprinkler',
    pose: (b) => {
      const c = b % 8;
      // 6 ticks across, then a quick whizz back
      const sweep = c < 6 ? snap(c / 6, 6) : 1 - ease((c - 6) / 2);
      const ang = -0.9 + sweep * 1.8;
      const hop = bounce(b * (c < 6 ? 1 : 2));
      return {
        armL: [0, 0.3, 2.2],
        foreL: [0, 1.8, 1.6],
        handL: [0, 0, 0.5],
        armR: [0, 1.0 + ang * -0.9, 0.85],
        foreR: [0, 0, 0],
        handR: [0, 0, 0.4],
        thighL: [-1.0, 0, 0.2],
        calfL: [1.6, 0, 0],
        thighR: [-0.15 * hop, 0, 0],
        calfR: [0.3 * hop, 0, 0],
        spine: [0.05, ang * 0.35, 0],
        neck: [0, ang * 0.5, 0],
        head: [-0.15, 0, 0.15],
        jaw: [0.35, 0, 0],
        wingL: [0, 0.3, 0.4],
        wingR: [0, -0.3, -0.2],
        root: { y: hop * 0.05, spin: ang * 0.3 },
      };
    },
  },
  {
    // disco: point up to the sky, then down across to the floor, hips swinging
    name: 'Disco Point',
    pose: (b) => {
      const up = alt(b) > 0;
      const s = sin(b * PI);
      return {
        armR: up ? [0, 0.4, -2.0] : [0, 0.9, 0.45],
        foreR: [0, 0, 0],
        handR: [0, 0, 0],
        armL: [0, -0.3, DOWN + 0.2],
        foreL: [0, 1.6, 1.1],
        handL: [0, 0, 0.9],
        pelvis: [0, 0, s * 0.35],
        spine: [0, up ? 0.2 : -0.35, up ? 0.15 : -0.25],
        neck: [up ? -0.4 : 0.35, up ? 0.3 : -0.3, 0],
        thighL: [-0.3 * Math.max(0, -s), 0, 0],
        calfL: [0.6 * Math.max(0, -s), 0, 0],
        thighR: [-0.3 * Math.max(0, s), 0, 0],
        calfR: [0.6 * Math.max(0, s), 0, 0],
        jaw: [0.25, 0, 0],
        wingL: [0, 0, 0.3 + s * 0.2],
        wingR: [0, 0, -0.3 + s * 0.2],
        root: { x: -s * 0.03, y: -bounce(b) * 0.03 },
      };
    },
  },
  {
    // the wacky waving inflatable tube man: everything flops on a wave travelling up his body
    name: 'Tube Man',
    pose: (b) => {
      const w = (o: number, sp = 1.3) => sin(b * PI * sp - o);
      return {
        pelvis: [0, 0, w(0) * 0.25],
        spine: [w(0.6) * 0.5, 0, w(0.8) * 0.6],
        chest: [w(1.2) * 0.4, w(1.5) * 0.3, w(1.4) * 0.5],
        neck: [w(2) * 0.5, 0, w(2.2) * 0.4],
        head: [w(2.6) * 0.4, 0, w(2.8) * 0.5],
        jaw: [0.3 + w(3) * 0.25, 0, 0],
        clavL: [0, 0, 0.3],
        clavR: mir([0, 0, 0.3]),
        armL: [w(2) * 0.6, w(2.5) * 0.5, 1.6 + w(2.2, 2) * 0.9],
        armR: mir([w(2.4) * 0.6, w(1.9) * 0.5, 1.6 + w(2.9, 2) * 0.9]),
        foreL: [0, w(3, 2) * 1.2, w(3.3, 2) * 1.0],
        foreR: mir([0, w(3.4, 2) * 1.2, w(3.7, 2) * 1.0]),
        handL: [0, 0, w(4, 2) * 1.0],
        handR: mir([0, 0, w(4.4, 2) * 1.0]),
        wingL: [0, w(2) * 0.4, w(1.5, 2) * 0.8],
        wingR: mir([0, w(2.3) * 0.4, w(1.8, 2) * 0.8]),
        ...squat(0.1 + Math.max(0, w(-0.5)) * 0.2),
        root: { x: w(0) * 0.02, y: -0.02 },
      };
    },
  },
  {
    // the robot: snaps from pose to pose on every beat
    name: 'Robot',
    pose: (b) => {
      const n = Math.floor(b) % 8;
      const P: Pose[] = [
        { armL: [0, -1.2, 0.75], foreL: [0, 0, 1.5], armR: mir([0, 0, DOWN]), neck: [0, 0.6, 0] },
        { armR: mir([0, -1.2, 0.75]), foreR: mir([0, 0, 1.5]), armL: [0, 0, DOWN], neck: [0, -0.6, 0] },
        { armL: [0, -1.2, 0.75], foreL: [0, 0, -1.2], armR: mir([0, -1.2, 0.75]), foreR: mir([0, 0, -1.2]), neck: [0.3, 0, 0], spine: [0.2, 0, 0] },
        { armL: [0, 0, 1.6], foreL: [0, 0, 1.5], armR: mir([0, 0, 1.6]), foreR: mir([0, 0, 1.5]), neck: [-0.3, 0, 0], chest: [0, 0.5, 0] },
        { armL: [0, 0, 0.75], foreL: [0, -1.5, 0], armR: mir([0, 0, 0.75]), foreR: mir([0, -1.5, 0]), neck: [0, 0.8, 0], chest: [0, -0.5, 0] },
        { armL: [0, -1.4, 0.75], armR: mir([0, -1.4, 0.75]), neck: [0, 0, 0.4], jaw: [0.5, 0, 0] },
        { armL: [0, 0, 0.75], foreL: [0, 0, 1.5], armR: mir([0, 0, 0.1]), foreR: mir([0, 0, -1.5]), neck: [0, -0.5, -0.3] },
        { armL: [0, -1.2, 0.75], foreL: [0, 0, 1.5], armR: mir([0, -1.2, 0.75]), foreR: mir([0, 0, 1.5]), neck: [-0.2, 0, 0], jaw: [0.5, 0, 0] },
      ];
      // a short, mechanical move into each pose, then frozen
      const f = b - Math.floor(b);
      const k = Math.min(1, f / 0.18);
      const a = P[(n + 7) % 8];
      const c = P[n];
      const out: Pose = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(c)]) as Set<Key>) {
        const ea = a[key] ?? [0, 0, 0];
        const ec = c[key] ?? [0, 0, 0];
        out[key] = [ea[0] + (ec[0] - ea[0]) * k, ea[1] + (ec[1] - ea[1]) * k, ea[2] + (ec[2] - ea[2]) * k];
      }
      out.armL ??= [0, 0, DOWN];
      out.armR ??= mir([0, 0, DOWN]);
      // wings twitch on the beat
      out.wingL = [0, 0, f < 0.2 ? 0.35 : 0];
      out.wingR = mir([0, 0, f < 0.2 ? 0.35 : 0]);
      out.root = { y: f < 0.15 ? 0.012 : 0, spin: snap(sin(b * PI * 0.25), 2) * 0.4 };
      return out;
    },
  },
  {
    // knees up to his chin, arms pumping, jogging nowhere
    name: 'Big Knees',
    pose: (b) => {
      const s = sin(b * PI);
      const l = Math.max(0, s);
      const r = Math.max(0, -s);
      return {
        thighL: [-1.7 * l, 0, 0.1],
        calfL: [2.2 * l, 0, 0],
        thighR: mir([-1.7 * r, 0, 0.1]),
        calfR: [2.2 * r, 0, 0],
        armL: [0, -s * 0.9, DOWN + 0.2],
        foreL: [0, 0.4, 1.5],
        armR: mir([0, s * 0.9, DOWN + 0.2]),
        foreR: mir([0, 0.4, 1.5]),
        spine: [-0.15, s * 0.2, 0],
        neck: [-0.25, -s * 0.2, 0],
        jaw: [0.2 + Math.abs(s) * 0.3, 0, 0],
        wingL: [0, 0, l * 0.5],
        wingR: mir([0, 0, r * 0.5]),
        root: { y: Math.abs(s) * 0.06, lean: -0.05 },
      };
    },
  },
  {
    // the helicopter: arms out, spinning on the spot, head thrown back laughing
    name: 'Helicopter',
    pose: (b) => {
      const c = b % 8;
      return {
        armL: [0, 0, 0.75 + sin(b * PI * 2) * 0.15],
        armR: mir([0, 0, 0.75 - sin(b * PI * 2) * 0.15]),
        foreL: [0, 0, 0.2],
        foreR: mir([0, 0, 0.2]),
        handL: [sin(b * PI * 2), 0, 0],
        handR: [-sin(b * PI * 2), 0, 0],
        neck: [-0.5, 0, 0],
        head: [-0.3, 0, sin(b * PI) * 0.3],
        jaw: [0.6, 0, 0],
        thighL: [-0.9 * Math.max(0, sin(b * PI * 2)), 0, 0.3],
        calfL: [1.2 * Math.max(0, sin(b * PI * 2)), 0, 0],
        wingL: [0, 0, sin(b * PI * 4) * 0.7],
        wingR: mir([0, 0, sin(b * PI * 4) * 0.7]),
        root: { spin: ease(c / 8) * PI * 4, y: bounce(b) * 0.05, tilt: sin(b * PI) * 0.08 },
      };
    },
  },
  {
    // turns his back to everyone, squats and shakes it, peeking over his shoulder
    name: 'Tail Shake',
    pose: (b) => {
      const c = b % 8;
      const turn = c < 1 ? ease(c) : c > 7 ? 1 - ease(c - 7) : 1;
      const wig = sin(b * PI * 4);
      return {
        ...squat(0.45),
        pelvis: [0.35, wig * 0.45, wig * 0.15],
        spine: [0.45, 0, 0],
        chest: [0, 0.4, 0],
        neck: [-0.4, 0.8, 0],
        head: [0, 0.4, 0.2],
        jaw: [0.15, 0, 0],
        armL: [0, -0.9, DOWN + 0.35],
        foreL: [0, 0.6, 0.2],
        armR: mir([0, -0.9, DOWN + 0.35]),
        foreR: mir([0, 0.6, 0.2]),
        wingL: [0, 0, 0.5 + wig * 0.3],
        wingR: mir([0, 0, 0.5 - wig * 0.3]),
        root: { spin: turn * PI, y: -0.12, x: wig * 0.01 },
      };
    },
  },
  {
    // star jumps, with a little squash on every landing
    name: 'Star Jumps',
    pose: (b) => {
      const s = bounce(b);
      const open = alt(b + 0.5) > 0 ? 1 : 0;
      const k = ease(Math.min(1, s * 1.5));
      const o = open ? k : 1 - k;
      return {
        armL: [0, 0, DOWN + o * 2.7],
        armR: mir([0, 0, DOWN + o * 2.7]),
        foreL: [0, 0, o * 0.3],
        foreR: mir([0, 0, o * 0.3]),
        thighL: [0, 0, o * 0.45],
        thighR: mir([0, 0, o * 0.45]),
        neck: [-0.2 * o, 0, 0],
        jaw: [o * 0.5, 0, 0],
        wingL: [0, 0, o * 0.8],
        wingR: mir([0, 0, o * 0.8]),
        root: { y: s * 0.12, sy: 1 - (1 - s) * 0.08 + s * 0.04, sx: 1 + (1 - s) * 0.05 },
      };
    },
  },
];

/** What he's doing right now, for the HUD (the court's decor keeps it up to date). */
export const lebronNow = { name: '', beat: 0 };

/** Beats each dance lasts before he switches to the next. */
export const DANCE_BEATS = 8;
/** Beats spent blending from one dance into the next. */
const BLEND = 0.5;

/** The dance at beat `b`, blended into the next one around the switch. `order` shuffles the moves. */
export function dancePose(b: number, order: number[]): Pose {
  const i = Math.floor(b / DANCE_BEATS);
  const into = b - i * DANCE_BEATS;
  const cur = DANCES[order[i % order.length]].pose(b);
  if (into > BLEND || i === 0) return cur;
  const prev = DANCES[order[(i - 1) % order.length]].pose(b);
  return mixPose(prev, cur, ease(into / BLEND));
}

export function mixPose(a: Pose, c: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(c)])) {
    if (key === 'root') continue;
    const ea = a[key as Key] ?? [0, 0, 0];
    const ec = c[key as Key] ?? [0, 0, 0];
    out[key as Key] = [ea[0] + (ec[0] - ea[0]) * k, ea[1] + (ec[1] - ea[1]) * k, ea[2] + (ec[2] - ea[2]) * k];
  }
  const ra = a.root ?? {};
  const rc = c.root ?? {};
  const m = (f: keyof NonNullable<Pose['root']>, d = 0) => (ra[f] ?? d) + ((rc[f] ?? d) - (ra[f] ?? d)) * k;
  // a spin that ends a dance on a full turn would whip back around: carry it the short way
  let spinA = ra.spin ?? 0;
  const spinC = rc.spin ?? 0;
  spinA = spinC + ((((spinA - spinC) % (2 * PI)) + 3 * PI) % (2 * PI)) - PI;
  out.root = { x: m('x'), y: m('y'), z: m('z'), tilt: m('tilt'), lean: m('lean'), sx: m('sx', 1), sy: m('sy', 1), spin: spinA + (spinC - spinA) * k };
  return out;
}

/** A shuffled running order of every dance (seeded, so a given visit is the same everywhere). */
export function danceOrder(seed: number): number[] {
  const o = DANCES.map((_, i) => i);
  let s = seed | 0 || 1;
  for (let i = o.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) | 0;
    const j = Math.abs(s >> 8) % (i + 1);
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}

