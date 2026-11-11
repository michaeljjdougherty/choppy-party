import type { RawInput } from '../shared/types';

/**
 * One physical input source: a keyboard half or a gamepad.
 * `key` is stable for the session (e.g. "kb1", "pad0") and is how players are bound to devices.
 */
export interface Device {
  key: string;
  label: string;
  raw: RawInput;
  connected: boolean;
}

interface KeyProfile {
  key: string;
  label: string;
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  a: string[];
  b: string[];
  /** X / Y: change character / colour in the lobby. */
  x: string[];
  y: string[];
}

/** Two keyboard halves so two people can share one keyboard. */
const KEY_PROFILES: KeyProfile[] = [
  { key: 'kb1', label: 'Keys: WASD + Space', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['Space', 'KeyE'], b: ['ShiftLeft', 'KeyQ'], x: ['KeyC'], y: ['KeyV'] },
  {
    key: 'kb2',
    label: 'Keys: Arrows + Enter',
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    a: ['Enter', 'NumpadEnter'],
    b: ['ShiftRight', 'Backspace'],
    x: ['Comma'],
    y: ['Period'],
  },
];
/** While only one person is on the keyboard, every key drives them: WASD or arrows, Space or Enter. */
const SOLO: KeyProfile = {
  key: 'kb1',
  label: 'Keyboard',
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  a: ['Space', 'KeyE', 'Enter', 'NumpadEnter'],
  b: ['ShiftLeft', 'KeyQ', 'ShiftRight', 'Backspace'],
  x: ['KeyC', 'Comma'],
  y: ['KeyV', 'Period'],
};

export type InputKind = 'pad' | 'keys' | 'mouse';
/** x = Xbox / generic, p = PlayStation, n = Nintendo. */
export type PadStyle = 'x' | 'p' | 'n';
export function padStyleOf(id: string): PadStyle {
  if (/xbox|045e|xinput/i.test(id)) return 'x';
  if (/054c|dualsense|dualshock|playstation|ps[345]|^wireless controller/i.test(id)) return 'p';
  if (/057e|nintendo|pro controller|joy-?con|switch/i.test(id)) return 'n';
  return 'x';
}

const DEADZONE = 0.22;
// Standard Gamepad mapping: 0 = bottom face button, 1 = right face button, 12-15 = d-pad
const BTN_A = 0;
const BTN_B = 1;
const BTN_X = 2;
const BTN_Y = 3;
const BTN_BACK = 8, BTN_START = 9;
const BTN_UP = 12, BTN_DOWN = 13, BTN_LEFT = 14, BTN_RIGHT = 15;

export class InputManager {
  private keys = new Set<string>();
  private devices = new Map<string, Device>();
  /** Fired on the frame a device's A goes down; used for joining. */
  onAPress: (d: Device) => void = () => {};
  onBPress: (d: Device) => void = () => {};
  /** True while only one person uses the keyboard: then both halves drive kb1. */
  soloKeys = true;
  /** What the player last touched, so on-screen prompts can name the right buttons. */
  kind: InputKind = 'keys';
  /** Which controller family the last-used pad is, so prompts show its own button glyphs. */
  padStyle: PadStyle = 'x';
  /** While true, holding the mouse button down holds A for the keyboard player (hold to ready). */
  mouseHoldsA = false;
  private pointerDown = false;
  private padX = new Map<string, boolean>();
  private padY = new Map<string, boolean>();
  private padStart = new Map<string, boolean>();
  /**
   * Map view: while true, sticks and buttons drive the camera instead of the game. `look` collects
   * this frame's camera controls; A, B or Y closes the map (onCaptureExit).
   */
  capture = false;
  look = { panX: 0, panY: 0, orbit: 0, tilt: 0, zoom: 0 };
  onCaptureExit: () => void = () => {};
  /** Y pressed (pad Y, keyboard V / Period): the board uses it to open the map. */
  onYPress: (d: Device) => void = () => {};
  private padHeld = new Map<string, boolean>();
  private nudges = new Map<string, { x: number; y: number; until: number; polls: number }>();

  constructor(target: Window = window) {
    for (const p of KEY_PROFILES) {
      this.devices.set(p.key, { key: p.key, label: p.label, raw: blank(), connected: true });
    }
    const watched = new Set(KEY_PROFILES.flatMap((p) => [...p.up, ...p.down, ...p.left, ...p.right, ...p.a, ...p.b, ...p.x, ...p.y]));
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (watched.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.kind = 'keys';
      this.keys.add(e.code);
      if (this.capture) {
        // Q / E turn the map, so they don't close it
        const close = e.code !== 'KeyQ' && e.code !== 'KeyE' && this.profiles().some((p) => p.a.includes(e.code) || p.b.includes(e.code) || p.y.includes(e.code));
        if (close) this.onCaptureExit();
        return;
      }
      for (const p of this.profiles()) {
        const d = this.devices.get(p.key)!;
        if (p.y.includes(e.code)) this.onYPress(d);
        if (p.a.includes(e.code)) {
          d.raw.aCount++;
          this.onAPress(d);
        }
        if (p.b.includes(e.code)) {
          d.raw.bCount++;
          this.onBPress(d);
        }
        if (p.x.includes(e.code)) d.raw.xCount = (d.raw.xCount ?? 0) + 1;
        if (p.y.includes(e.code)) d.raw.yCount = (d.raw.yCount ?? 0) + 1;
      }
    });
    target.addEventListener('pointermove', () => (this.kind = 'mouse'));
    target.addEventListener('pointerdown', () => {
      this.kind = 'mouse';
      this.pointerDown = true;
    });
    target.addEventListener('pointerup', () => (this.pointerDown = false));
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  private profiles(): KeyProfile[] {
    return this.soloKeys ? [SOLO] : KEY_PROFILES;
  }

  /** A press of A or B from the mouse, for whichever device the click stands in for. */
  tap(key: string, btn: 'a' | 'b' | 'x' | 'y'): void {
    const d = this.devices.get(key);
    if (!d) return;
    if (btn === 'a') d.raw.aCount++;
    else if (btn === 'b') d.raw.bCount++;
    else if (btn === 'x') d.raw.xCount = (d.raw.xCount ?? 0) + 1;
    else d.raw.yCount = (d.raw.yCount ?? 0) + 1;
  }

  /** Start / pause press for a device (Esc or P on the keyboard). */
  start(key: string): void {
    const d = this.devices.get(key);
    if (d) d.raw.startCount = (d.raw.startCount ?? 0) + 1;
  }

  /** Hold the stick in a direction briefly (one menu step), for mouse clicks on arrows. */
  nudge(key: string, x: number, y: number, secs = 0.12): void {
    this.nudges.set(key, { x, y, until: performance.now() + secs * 1000, polls: 0 });
  }

  /** Call once per animation frame. */
  poll(): void {
    if (this.soloKeys) {
      const d2 = this.devices.get('kb2')!;
      d2.raw.x = d2.raw.y = 0;
      d2.raw.a = d2.raw.b = false;
    }
    for (const p of this.profiles()) {
      const d = this.devices.get(p.key)!;
      const any = (codes: string[]) => codes.some((c) => this.keys.has(c));
      let x = (any(p.right) ? 1 : 0) - (any(p.left) ? 1 : 0);
      let y = (any(p.down) ? 1 : 0) - (any(p.up) ? 1 : 0);
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      d.raw.x = x;
      d.raw.y = y;
      d.raw.a = any(p.a) || (p.key === 'kb1' && this.mouseHoldsA && this.pointerDown);
      d.raw.b = any(p.b);
    }

    if (this.capture) {
      // keyboard map controls: WASD / arrows pan, Q / E orbit, R / F tilt, Z / X zoom
      const k = (c: string) => (this.keys.has(c) ? 1 : 0);
      this.look.panX += k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
      this.look.panY += k('KeyS') + k('ArrowDown') - k('KeyW') - k('ArrowUp');
      this.look.orbit += k('KeyE') - k('KeyQ');
      this.look.tilt += k('KeyF') - k('KeyR');
      this.look.zoom += k('KeyZ') + k('Equal') - k('KeyX') - k('Minus');
      for (const p of this.profiles()) {
        const d = this.devices.get(p.key)!;
        d.raw.x = d.raw.y = 0;
        d.raw.a = d.raw.b = false;
      }
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set<string>();
    const padX = this.padX, padY = this.padY;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const key = `pad${gp.index}`;
      seen.add(key);
      let d = this.devices.get(key);
      if (!d) {
        d = { key, label: `Pad ${gp.index + 1}: ${shortPadName(gp.id)}`, raw: blank(), connected: true };
        this.devices.set(key, d);
      }
      d.connected = true;
      const pressed = (i: number) => !!gp.buttons[i]?.pressed;
      let x = gp.axes[0] ?? 0;
      let y = gp.axes[1] ?? 0;
      const mag = Math.hypot(x, y);
      if (mag < DEADZONE) {
        x = 0;
        y = 0;
      } else {
        // rescale so movement starts smoothly just outside the deadzone
        const k = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
        x *= k;
        y *= k;
      }
      if (pressed(BTN_LEFT)) x = -1;
      if (pressed(BTN_RIGHT)) x = 1;
      if (pressed(BTN_UP)) y = -1;
      if (pressed(BTN_DOWN)) y = 1;
      if (this.capture) {
        // map view: left stick pans, right stick orbits and tilts, bumpers / triggers zoom
        const rx = Math.abs(gp.axes[2] ?? 0) > DEADZONE ? gp.axes[2] : 0;
        const ry = Math.abs(gp.axes[3] ?? 0) > DEADZONE ? gp.axes[3] : 0;
        this.look.panX += x;
        this.look.panY += y;
        this.look.orbit += rx;
        this.look.tilt += ry;
        this.look.zoom += (pressed(5) || pressed(7) ? 1 : 0) - (pressed(4) || pressed(6) ? 1 : 0);
        const any = pressed(BTN_A) || pressed(BTN_B) || pressed(BTN_Y);
        if (any && !this.padHeld.get(key)) this.onCaptureExit();
        this.padHeld.set(key, any);
        d.raw.x = d.raw.y = 0;
        d.raw.a = d.raw.b = false;
        continue;
      }
      this.padHeld.set(key, pressed(BTN_A) || pressed(BTN_B) || pressed(BTN_Y));
      const a = pressed(BTN_A);
      const b = pressed(BTN_B);
      if (a || b || Math.abs(x) > 0.5 || Math.abs(y) > 0.5 || gp.buttons.some((bt) => bt.pressed)) {
        this.kind = 'pad';
        this.padStyle = padStyleOf(gp.id);
      }
      if (a && !d.raw.a) {
        d.raw.aCount++;
        this.onAPress(d);
      }
      if (b && !d.raw.b) {
        d.raw.bCount++;
        this.onBPress(d);
      }
      const bs = pressed(BTN_START) || pressed(BTN_BACK);
      if (bs && !this.padStart.get(key)) d.raw.startCount = (d.raw.startCount ?? 0) + 1;
      this.padStart.set(key, bs);
      const bx = pressed(BTN_X), by = pressed(BTN_Y);
      if (bx && !padX.get(key)) d.raw.xCount = (d.raw.xCount ?? 0) + 1;
      if (by && !padY.get(key)) {
        d.raw.yCount = (d.raw.yCount ?? 0) + 1;
        this.onYPress(d);
      }
      padX.set(key, bx);
      padY.set(key, by);
      d.raw.x = x;
      d.raw.y = y;
      d.raw.a = a;
      d.raw.b = b;
    }
    for (const d of this.devices.values()) {
      if (d.key.startsWith('pad') && !seen.has(d.key)) {
        d.connected = false;
        d.raw.x = d.raw.y = 0;
        d.raw.a = d.raw.b = false;
      }
    }
    const now = performance.now();
    for (const [key, n] of this.nudges) {
      const d = this.devices.get(key);
      // held for a short time, but always for at least one frame even on a slow machine
      if (!d || (now > n.until && n.polls > 0)) {
        this.nudges.delete(key);
        continue;
      }
      n.polls++;
      d.raw.x = n.x;
      d.raw.y = n.y;
    }
  }

  get(key: string): Device | undefined {
    return this.devices.get(key);
  }

  list(): Device[] {
    return [...this.devices.values()];
  }
}

function blank(): RawInput {
  return { x: 0, y: 0, a: false, b: false, aCount: 0, bCount: 0, xCount: 0, yCount: 0, startCount: 0 };
}

function shortPadName(id: string): string {
  const s = id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 22 ? s.slice(0, 22) + '…' : s || 'Gamepad';
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
