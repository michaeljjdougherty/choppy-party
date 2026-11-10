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

const KEY_PROFILES = [
  { key: 'kb1', label: 'Keys: WASD + Space', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Space', b: 'ShiftLeft' },
  {
    key: 'kb2',
    label: 'Keys: Arrows + Enter',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: 'Enter',
    b: 'ShiftRight',
  },
];

const DEADZONE = 0.22;
// Standard Gamepad mapping: 0 = bottom face button, 1 = right face button, 12-15 = d-pad
const BTN_A = 0;
const BTN_B = 1;
const BTN_UP = 12, BTN_DOWN = 13, BTN_LEFT = 14, BTN_RIGHT = 15;

export class InputManager {
  private keys = new Set<string>();
  private devices = new Map<string, Device>();
  /** Fired on the frame a device's A goes down; used for joining. */
  onAPress: (d: Device) => void = () => {};
  onBPress: (d: Device) => void = () => {};

  constructor(target: Window = window) {
    for (const p of KEY_PROFILES) {
      this.devices.set(p.key, { key: p.key, label: p.label, raw: blank(), connected: true });
    }
    const watched = new Set(KEY_PROFILES.flatMap((p) => [p.up, p.down, p.left, p.right, p.a, p.b]));
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (watched.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const p of KEY_PROFILES) {
        const d = this.devices.get(p.key)!;
        if (e.code === p.a) {
          d.raw.aCount++;
          this.onAPress(d);
        }
        if (e.code === p.b) {
          d.raw.bCount++;
          this.onBPress(d);
        }
      }
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** Call once per animation frame. */
  poll(): void {
    for (const p of KEY_PROFILES) {
      const d = this.devices.get(p.key)!;
      let x = (this.keys.has(p.right) ? 1 : 0) - (this.keys.has(p.left) ? 1 : 0);
      let y = (this.keys.has(p.down) ? 1 : 0) - (this.keys.has(p.up) ? 1 : 0);
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      d.raw.x = x;
      d.raw.y = y;
      d.raw.a = this.keys.has(p.a);
      d.raw.b = this.keys.has(p.b);
    }

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set<string>();
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
      const a = pressed(BTN_A);
      const b = pressed(BTN_B);
      if (a && !d.raw.a) {
        d.raw.aCount++;
        this.onAPress(d);
      }
      if (b && !d.raw.b) {
        d.raw.bCount++;
        this.onBPress(d);
      }
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
  }

  get(key: string): Device | undefined {
    return this.devices.get(key);
  }

  list(): Device[] {
    return [...this.devices.values()];
  }
}

function blank(): RawInput {
  return { x: 0, y: 0, a: false, b: false, aCount: 0, bCount: 0 };
}

function shortPadName(id: string): string {
  const s = id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 22 ? s.slice(0, 22) + '…' : s || 'Gamepad';
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
