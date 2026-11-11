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

export type InputKind = 'pad' | 'keys' | 'mouse' | 'touch';
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

/** What a name-entry keyboard hears from the device that's typing. */
export type TypeEvent =
  | { kind: 'char'; ch: string }
  | { kind: 'move'; x: number; y: number }
  | { kind: 'press' | 'del' | 'case' | 'ok' | 'cancel' };

/** What a menu that has taken over every device (Settings) hears: one step of the stick, or a button. */
export type GrabEvent = { kind: 'move'; x: number; y: number } | { kind: 'a' | 'b' };

export class InputManager {
  /**
   * While set, every keyboard, pad and touch button drives this overlay menu instead of the game
   * (Settings). The game sees no presses until it is cleared.
   */
  grab: ((e: GrabEvent) => void) | null = null;
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
  /** X in map view (the map key toggle). */
  onCaptureX: () => void = () => {};
  /** Y pressed (pad Y, keyboard V / Period): the board uses it to open the map. */
  onYPress: (d: Device) => void = () => {};
  private padHeld = new Map<string, boolean>();
  /** Name entry: the device whose buttons type on the on-screen keyboard instead of playing. */
  typing: string | null = null;
  onType: (e: TypeEvent) => void = () => {};
  /** A bumper (LB / RB) press: in the lobby it opens name entry for that pad. */
  onNamePress: (d: Device) => void = () => {};
  private padBump = new Map<string, boolean>();
  private typeHeld = new Map<string, number>();
  private typeDir = { x: 0, y: 0, next: 0 };
  /** On-screen touch controls (src/client/touch.ts): a virtual stick and buttons that drive kb1. */
  private virt = { x: 0, y: 0, a: false, b: false };
  /** True once this device has been touched: the touch controls and touch prompts switch on. */
  touchSeen = false;
  private nudges = new Map<string, { x: number; y: number; until: number; polls: number }>();

  constructor(target: Window = window) {
    for (const p of KEY_PROFILES) {
      this.devices.set(p.key, { key: p.key, label: p.label, raw: blank(), connected: true });
    }
    const watched = new Set(KEY_PROFILES.flatMap((p) => [...p.up, ...p.down, ...p.left, ...p.right, ...p.a, ...p.b, ...p.x, ...p.y]));
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (this.typing?.startsWith('kb')) {
        // typing a name on a real keyboard: keys type letters, Enter saves, Esc cancels
        e.preventDefault();
        this.kind = 'keys';
        if (e.key === 'Enter') this.onType({ kind: 'ok' });
        else if (e.key === 'Escape') this.onType({ kind: 'cancel' });
        else if (e.key === 'Backspace') this.onType({ kind: 'del' });
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.onType({ kind: 'char', ch: e.key });
        return;
      }
      if (watched.has(e.code)) e.preventDefault();
      if (this.grab) {
        // the overlay menu owns this key: no other key handler (pause, map, lobby keys) sees it
        e.stopImmediatePropagation();
        this.kind = 'keys';
        const k = e.code;
        if (SOLO.up.includes(k)) this.grab({ kind: 'move', x: 0, y: -1 });
        else if (SOLO.down.includes(k)) this.grab({ kind: 'move', x: 0, y: 1 });
        else if (SOLO.left.includes(k)) this.grab({ kind: 'move', x: -1, y: 0 });
        else if (SOLO.right.includes(k)) this.grab({ kind: 'move', x: 1, y: 0 });
        else if (!e.repeat && SOLO.a.includes(k)) this.grab({ kind: 'a' });
        else if (!e.repeat && (SOLO.b.includes(k) || e.key === 'Escape')) this.grab({ kind: 'b' });
        return;
      }
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
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.kind = 'mouse';
    });
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this.kind = 'touch';
        this.touchSeen = true;
      } else this.kind = 'mouse';
      // presses on the on-screen buttons are not a held mouse button
      if (!(e.target as Element | null)?.closest?.('#touchPad')) this.pointerDown = true;
    });
    target.addEventListener('pointercancel', () => (this.pointerDown = false));
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

  /** The on-screen stick, -1..1 on each axis (y down). Drives kb1, like the keyboard does. */
  touchStick(x: number, y: number): void {
    this.virt.x = x;
    this.virt.y = y;
    this.kind = 'touch';
  }

  /** An on-screen button going down or up. Presses count exactly like a key or pad button. */
  touchButton(btn: 'a' | 'b' | 'x' | 'y' | 'start', down: boolean): void {
    this.kind = 'touch';
    this.touchSeen = true;
    if (btn === 'a') this.virt.a = down;
    if (btn === 'b') this.virt.b = down;
    if (!down) return;
    if (this.grab) {
      if (btn === 'a') this.grab({ kind: 'a' });
      else if (btn === 'b' || btn === 'start') this.grab({ kind: 'b' });
      return;
    }
    if (this.capture) {
      if (btn === 'a' || btn === 'b' || btn === 'y') this.onCaptureExit();
      return;
    }
    const d = this.devices.get('kb1')!;
    if (btn === 'start') return this.start('kb1');
    if (btn === 'y') this.onYPress(d);
    if (btn === 'a') this.onAPress(d);
    if (btn === 'b') this.onBPress(d);
    this.tap('kb1', btn);
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
      if (p.key === 'kb1') {
        // the touch stick wins whenever it's pushed further than the keys
        if (Math.hypot(this.virt.x, this.virt.y) > Math.hypot(d.raw.x, d.raw.y)) {
          d.raw.x = this.virt.x;
          d.raw.y = this.virt.y;
        }
        d.raw.a ||= this.virt.a;
        d.raw.b ||= this.virt.b;
      }
    }

    if (this.grab) {
      // the touch stick steps through the overlay menu; the game hears nothing
      this.grabStick('touch', this.virt.x, this.virt.y);
      for (const p of this.profiles()) {
        const d = this.devices.get(p.key)!;
        d.raw.x = d.raw.y = 0;
        d.raw.a = d.raw.b = false;
      }
    }
    if (this.capture) {
      // keyboard map controls: WASD / arrows pan, Q / E orbit, R / F tilt, Z / X zoom
      const k = (c: string) => (this.keys.has(c) ? 1 : 0);
      this.look.panX += k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
      this.look.panY += k('KeyS') + k('ArrowDown') - k('KeyW') - k('ArrowUp');
      this.look.orbit += k('KeyE') - k('KeyQ');
      this.look.tilt += k('KeyF') - k('KeyR');
      this.look.zoom += k('KeyZ') + k('Equal') - k('KeyX') - k('Minus');
      this.look.panX += this.virt.x;
      this.look.panY += this.virt.y;
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
        // X toggles the map key
        const xk = pressed(BTN_X);
        if (xk && !this.padHeld.get(key + 'x')) this.onCaptureX();
        this.padHeld.set(key + 'x', xk);
        d.raw.x = d.raw.y = 0;
        d.raw.a = d.raw.b = false;
        continue;
      }
      if (this.grab) {
        const edge = (name: string, on: boolean) => {
          const was = this.typeHeld.get(key + name) ?? 0;
          this.typeHeld.set(key + name, on ? 1 : 0);
          return on && !was;
        };
        if (gp.buttons.some((bt) => bt.pressed) || Math.hypot(x, y) > 0.5) {
          this.kind = 'pad';
          this.padStyle = padStyleOf(gp.id);
        }
        this.grabStick(key, x, y);
        if (edge('ga', pressed(BTN_A))) this.grab?.({ kind: 'a' });
        if (edge('gb', pressed(BTN_B) || pressed(BTN_START) || pressed(BTN_BACK))) this.grab?.({ kind: 'b' });
        // remember these as already down so the game doesn't see a press when the menu closes
        d.raw.x = d.raw.y = 0;
        d.raw.a = pressed(BTN_A);
        d.raw.b = pressed(BTN_B);
        padX.set(key, pressed(BTN_X));
        padY.set(key, pressed(BTN_Y));
        this.padStart.set(key, pressed(BTN_START) || pressed(BTN_BACK));
        this.padBump.set(key, pressed(4) || pressed(5));
        continue;
      }
      if (this.typing === key) {
        // this pad is typing a name: the stick walks the on-screen keyboard, A types, B deletes,
        // Y switches case, Start saves
        const now = performance.now();
        const edge = (name: string, on: boolean) => {
          const was = this.typeHeld.get(key + name) ?? 0;
          this.typeHeld.set(key + name, on ? 1 : 0);
          return on && !was;
        };
        const dx = Math.abs(x) > 0.5 ? Math.sign(x) : 0;
        const dy = Math.abs(y) > 0.5 ? Math.sign(y) : 0;
        if (dx !== this.typeDir.x || dy !== this.typeDir.y) {
          this.typeDir = { x: dx, y: dy, next: now + 380 };
          if (dx || dy) this.onType({ kind: 'move', x: dx, y: dy });
        } else if ((dx || dy) && now > this.typeDir.next) {
          this.typeDir.next = now + 110;
          this.onType({ kind: 'move', x: dx, y: dy });
        }
        if (edge('a', pressed(BTN_A))) this.onType({ kind: 'press' });
        if (edge('b', pressed(BTN_B))) this.onType({ kind: 'del' });
        if (edge('y', pressed(BTN_Y))) this.onType({ kind: 'case' });
        if (edge('x', pressed(BTN_X))) this.onType({ kind: 'char', ch: ' ' });
        if (edge('s', pressed(BTN_START))) this.onType({ kind: 'ok' });
        this.kind = 'pad';
        this.padStyle = padStyleOf(gp.id);
        // keep the game from seeing these presses: remember them as already down
        d.raw.x = d.raw.y = 0;
        d.raw.a = pressed(BTN_A);
        d.raw.b = pressed(BTN_B);
        padX.set(key, pressed(BTN_X));
        padY.set(key, pressed(BTN_Y));
        this.padStart.set(key, pressed(BTN_START) || pressed(BTN_BACK));
        this.padHeld.set(key, true);
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
      const bump = pressed(4) || pressed(5);
      if (bump && !this.padBump.get(key)) this.onNamePress(d);
      this.padBump.set(key, bump);
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

  /** Stick steps for the grabbing menu: one step on a push, then repeats while held. */
  private grabSticks = new Map<string, { x: number; y: number; next: number }>();
  private grabStick(key: string, x: number, y: number): void {
    const dx = Math.abs(x) > 0.5 && Math.abs(x) >= Math.abs(y) ? Math.sign(x) : 0;
    const dy = Math.abs(y) > 0.5 && Math.abs(y) > Math.abs(x) ? Math.sign(y) : 0;
    const now = performance.now();
    const was = this.grabSticks.get(key) ?? { x: 0, y: 0, next: 0 };
    if (dx !== was.x || dy !== was.y) {
      this.grabSticks.set(key, { x: dx, y: dy, next: now + 380 });
      if (dx || dy) this.grab?.({ kind: 'move', x: dx, y: dy });
    } else if ((dx || dy) && now > was.next) {
      was.next = now + 140;
      this.grab?.({ kind: 'move', x: dx, y: dy });
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
