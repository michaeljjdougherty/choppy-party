import type { RawInput, Inputs } from '../shared/types';
import { DT, TICK_HZ, toTickInput } from '../shared/types';
import { addBot, addPlayer, createParty, removeBot, removePlayer, renamePlayer, stepParty, type PartyState } from '../shared/party';
import type { BotLevel } from '../shared/bots';
import type { ClientMsg } from '../shared/protocol';
import { onlinePlayerId } from '../shared/protocol';
import type { InputManager } from './input';
import { PeerClient, PeerHost, WsTransport, localClientId, rememberClientId, type Transport } from './net';

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
  /** Lobby: set the name of the player on this device. */
  rename(deviceKey: string, name: string): void;
  /** Player ids controlled from this browser. */
  localIds(): Set<string>;
  addBot(level: BotLevel): void;
  removeBot(): void;
  close(): void;
}

const copy = (r: RawInput): RawInput => ({ ...r });

/** The name each controller last typed, so it comes back next time that controller joins. */
function savedName(deviceKey: string): string | undefined {
  try {
    return localStorage.getItem(`choppy.name.${deviceKey}`) || undefined;
  } catch {
    return undefined;
  }
}
function saveName(deviceKey: string, name: string): void {
  try {
    localStorage.setItem(`choppy.name.${deviceKey}`, name);
  } catch {
    /* private mode: names just aren't remembered */
  }
}

export class LocalSession implements Session {
  kind = 'local' as const;
  private state = createParty((Math.random() * 2 ** 31) | 0);
  private acc = 0;
  private prev = new Map<string, RawInput>();
  /** Developer mode: how fast the party runs (1 = normal), and whether it's held still. */
  speed = 1;
  frozen = false;

  constructor(
    private input: InputManager,
    startSelection = 0,
  ) {
    this.state.selection = startSelection;
    this.state.lockMode = true;
  }

  status() {
    return 'Local play';
  }
  roomCode() {
    return null;
  }

  update(realDt: number): void {
    if (this.frozen) return;
    this.acc = Math.min(this.acc + realDt * this.speed, DT * 5 * Math.max(1, this.speed)); // don't spiral after a tab switch
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

  /** The party itself, for developer mode to change. */
  raw(): PartyState {
    return this.state;
  }

  join(deviceKey: string): void {
    // local player ids are just the device key; a fresh join starts with no carried-over presses
    if (this.state.players.some((p) => p.id === deviceKey)) return;
    if (addPlayer(this.state, deviceKey, savedName(deviceKey))) this.prev.delete(deviceKey);
  }

  rename(deviceKey: string, name: string): void {
    renamePlayer(this.state, deviceKey, name);
    saveName(deviceKey, name);
  }

  leave(deviceKey: string): void {
    removePlayer(this.state, deviceKey);
  }

  localIds() {
    return new Set(this.state.players.filter((p) => !p.bot).map((p) => p.id));
  }

  addBot(level: BotLevel): void {
    addBot(this.state, level);
  }

  removeBot(): void {
    removeBot(this.state);
  }

  close() {}
}

/** How an online session reaches its room: as the host (runs it), a guest (peer-to-peer), or via the Node server. */
export type OnlineMode = { host: true; resume?: string } | { code: string; server?: boolean } | { create: true; server: true };

export class OnlineSession implements Session {
  kind = 'online' as const;
  private t!: Transport;
  private clientId: string | null = null;
  private code: string | null = null;
  private err: string | null = null;
  private retrying = 0;
  private why = '';
  private closed = false;
  private prevSnap: PartyState | null = null;
  private curSnap: PartyState | null = null;
  private curAt = 0;
  private sendAcc = 0;
  private pingAcc = 0;
  private pendingJoins = new Set<string>();
  private beat: ReturnType<typeof setInterval>;

  constructor(
    private input: InputManager,
    private mode: OnlineMode,
    private onError: (msg: string) => void,
  ) {
    this.connect();
    // a heartbeat on a timer, so a tab in the background (no animation frames) still counts as here
    this.beat = setInterval(() => this.clientId && this.send({ t: 'input', raws: {} }), 1000);
  }

  /** True when this browser is hosting the room. */
  get hosting(): boolean {
    return 'host' in this.mode;
  }

  private connect() {
    const m = this.mode;
    const code = 'code' in m ? m.code.toUpperCase() : (this.code ?? undefined);
    this.t = 'host' in m ? new PeerHost(m.resume ?? this.code ?? undefined) : 'server' in m && m.server ? new WsTransport() : new PeerClient(code!);
    this.t.onOpen = () => {
      if ('host' in m) return; // the host's own browser is connected by the room itself
      const clientId = code ? localClientId(code) : undefined;
      if ('create' in m) this.t.send({ t: 'create', clientId });
      else this.t.send({ t: 'join', code: code!, clientId });
    };
    this.t.onMessage = (msg) => {
      if (msg.t === 'welcome') {
        this.clientId = msg.clientId;
        this.code = msg.code;
        this.err = null;
        this.retrying = 0;
        rememberClientId(msg.code, msg.clientId);
        for (const k of this.pendingJoins) this.t.send({ t: 'add', deviceKey: k, name: savedName(k) });
        this.pendingJoins.clear();
        history.replaceState(null, '', `?room=${msg.code}${'host' in m ? '&host=1' : ''}`);
      } else if (msg.t === 'error') {
        this.onError(msg.message);
      } else if (msg.t === 'state') {
        this.prevSnap = this.curSnap;
        this.curSnap = msg.s;
        this.curAt = performance.now();
      }
    };
    this.t.onClose = (why, retry) => {
      if (this.closed) return;
      this.why = why;
      // dropped mid-party: keep trying the same code; a CPU covers for us meanwhile
      if (retry && this.code && this.retrying < 30) {
        this.retrying++;
        this.err = `Reconnecting… (${this.retrying})`;
        if (this.retrying === 1) this.onError(`${why} Trying to reconnect…`);
        setTimeout(() => !this.closed && this.connect(), 2000);
        return;
      }
      this.err = 'Disconnected';
      this.onError(why);
    };
  }

  private send(m: ClientMsg) {
    this.t.send(m);
  }

  /** Why the last connection attempt failed, shown under the status so it doesn't vanish with the toast. */
  detail(): string {
    return this.err ? this.why : '';
  }

  status() {
    if (this.err) return this.err;
    if (!this.code) return this.hosting ? 'Opening a room…' : 'Connecting…';
    return `${this.hosting ? 'Hosting' : 'Online'} room ${this.code}`;
  }
  roomCode() {
    return this.code;
  }

  update(realDt: number): void {
    this.sendAcc += realDt;
    this.pingAcc += realDt;
    if (this.sendAcc < 1 / (TICK_HZ * 2) || !this.clientId || !this.curSnap) return;
    this.sendAcc = 0;
    const raws: Record<string, RawInput> = {};
    const mine = this.localIds();
    for (const d of this.input.list()) {
      if (mine.has(onlinePlayerId(this.clientId, d.key))) raws[d.key] = d.raw;
    }
    // always send something now and then: it's how the host knows we're still here
    if (Object.keys(raws).length || this.pingAcc > 1) {
      this.pingAcc = 0;
      this.send({ t: 'input', raws });
    }
  }

  view(): PartyState | null {
    const st = this.blended();
    if (!st) return null;
    // online pause menus are per player: this screen shows (and is held by) only its own player's menu
    const menus = st.menus;
    if (!menus) return st;
    const mine = [...this.localIds()].find((id) => menus[id]);
    return { ...st, pause: mine ? menus[mine] : null };
  }

  private blended(): PartyState | null {
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
    // pressed A before the room answered: join as soon as we're in
    if (!this.clientId) this.pendingJoins.add(deviceKey);
    else this.send({ t: 'add', deviceKey, name: savedName(deviceKey) });
  }
  rename(deviceKey: string, name: string): void {
    this.send({ t: 'name', deviceKey, name });
    saveName(deviceKey, name);
  }
  leave(deviceKey: string): void {
    this.send({ t: 'remove', deviceKey });
  }

  addBot(level: BotLevel): void {
    this.send({ t: 'bot', level });
  }

  removeBot(): void {
    this.send({ t: 'unbot' });
  }

  localIds(): Set<string> {
    const out = new Set<string>();
    if (!this.clientId || !this.curSnap) return out;
    const prefix = this.clientId + '.';
    for (const p of this.curSnap.players) if (p.id.startsWith(prefix)) out.add(p.id);
    return out;
  }

  close() {
    clearInterval(this.beat);
    this.closed = true;
    this.err = 'Closed';
    this.t.close();
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
