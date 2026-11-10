import type { RawInput, Inputs } from '../shared/types';
import { DT, TICK_HZ, toTickInput } from '../shared/types';
import { addPlayer, createParty, removePlayer, stepParty, type PartyState } from '../shared/party';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { onlinePlayerId } from '../shared/protocol';
import type { InputManager } from './input';

export interface Session {
  kind: 'local' | 'online';
  /** Short status for the HUD, e.g. room code or connection state. */
  status(): string;
  roomCode(): string | null;
  update(realDt: number): void;
  /** State to draw this frame (may be interpolated). Null until the first snapshot arrives online. */
  view(): PartyState | null;
  join(deviceKey: string): void;
  leave(deviceKey: string): void;
  /** Player ids controlled from this browser. */
  localIds(): Set<string>;
  close(): void;
}

const copy = (r: RawInput): RawInput => ({ ...r });

export class LocalSession implements Session {
  kind = 'local' as const;
  private state = createParty((Math.random() * 2 ** 31) | 0);
  private acc = 0;
  private prev = new Map<string, RawInput>();

  constructor(
    private input: InputManager,
    startSelection = 0,
  ) {
    this.state.selection = startSelection;
  }

  status() {
    return 'Local play';
  }
  roomCode() {
    return null;
  }

  update(realDt: number): void {
    this.acc = Math.min(this.acc + realDt, DT * 5); // don't spiral after a tab switch
    while (this.acc >= DT) {
      this.acc -= DT;
      const inputs: Inputs = {};
      for (const p of this.state.players) {
        const d = this.input.get(p.id);
        if (!d) continue;
        inputs[p.id] = toTickInput(d.raw, this.prev.get(p.id));
        this.prev.set(p.id, copy(d.raw));
      }
      stepParty(this.state, inputs, DT);
    }
  }

  view() {
    return this.state;
  }

  join(deviceKey: string): void {
    // local player ids are just the device key; a fresh join starts with no carried-over presses
    if (this.state.players.some((p) => p.id === deviceKey)) return;
    if (addPlayer(this.state, deviceKey)) this.prev.delete(deviceKey);
  }

  leave(deviceKey: string): void {
    removePlayer(this.state, deviceKey);
  }

  localIds() {
    return new Set(this.state.players.map((p) => p.id));
  }

  close() {}
}

export class OnlineSession implements Session {
  kind = 'online' as const;
  private ws: WebSocket;
  private clientId: string | null = null;
  private code: string | null = null;
  private err: string | null = null;
  private prevSnap: PartyState | null = null;
  private curSnap: PartyState | null = null;
  private curAt = 0;
  private sendAcc = 0;

  constructor(
    private input: InputManager,
    mode: { create: true } | { code: string },
    private onError: (msg: string) => void,
  ) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    const savedId = sessionStorage.getItem('choppy.clientId') ?? undefined;
    this.ws.addEventListener('open', () => {
      if ('create' in mode) this.send({ t: 'create', clientId: savedId });
      else this.send({ t: 'join', code: mode.code.toUpperCase(), clientId: savedId });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (msg.t === 'welcome') {
        this.clientId = msg.clientId;
        this.code = msg.code;
        sessionStorage.setItem('choppy.clientId', msg.clientId);
        history.replaceState(null, '', `?room=${msg.code}`);
      } else if (msg.t === 'error') {
        this.err = msg.message;
        this.onError(msg.message);
      } else if (msg.t === 'state') {
        this.prevSnap = this.curSnap;
        this.curSnap = msg.s;
        this.curAt = performance.now();
      }
    });
    this.ws.addEventListener('close', () => {
      if (!this.err) {
        this.err = 'Disconnected';
        this.onError('Lost connection to the room server.');
      }
    });
  }

  private send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  status() {
    if (this.err) return this.err;
    if (!this.code) return 'Connecting…';
    return `Online room ${this.code}`;
  }
  roomCode() {
    return this.code;
  }

  update(realDt: number): void {
    this.sendAcc += realDt;
    if (this.sendAcc < 1 / (TICK_HZ * 2) || !this.clientId || !this.curSnap) return;
    this.sendAcc = 0;
    const raws: Record<string, RawInput> = {};
    const mine = this.localIds();
    for (const d of this.input.list()) {
      if (mine.has(onlinePlayerId(this.clientId, d.key))) raws[d.key] = d.raw;
    }
    if (Object.keys(raws).length) this.send({ t: 'input', raws });
  }

  view(): PartyState | null {
    const cur = this.curSnap;
    const prev = this.prevSnap;
    if (!cur) return null;
    if (!prev || prev.phase !== 'play' || cur.phase !== 'play' || prev.round !== cur.round || prev.gameId !== cur.gameId) {
      return cur;
    }
    // draw one tick behind, blending between the last two snapshots for smooth motion
    const alpha = Math.min(1, (performance.now() - this.curAt) / (1000 / TICK_HZ));
    return { ...cur, game: lerpDeep(prev.game, cur.game, alpha) };
  }

  join(deviceKey: string): void {
    this.send({ t: 'add', deviceKey });
  }
  leave(deviceKey: string): void {
    this.send({ t: 'remove', deviceKey });
  }

  localIds(): Set<string> {
    const out = new Set<string>();
    if (!this.clientId || !this.curSnap) return out;
    const prefix = this.clientId + '.';
    for (const p of this.curSnap.players) if (p.id.startsWith(prefix)) out.add(p.id);
    return out;
  }

  close() {
    this.err = 'Closed';
    this.ws.close();
  }
}

/** Blend numbers in two same-shaped JSON values. Arrays of different length are not blended. */
function lerpDeep(a: unknown, b: unknown, t: number): unknown {
  if (typeof a === 'number' && typeof b === 'number') {
    // big jumps (respawns, wraparounds) snap instead of sliding across the screen
    return Math.abs(b - a) > 200 ? b : a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return b;
    return b.map((v, i) => lerpDeep(a[i], v, t));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(b)) out[k] = lerpDeep((a as any)[k], (b as any)[k], t);
    return out;
  }
  return b;
}
