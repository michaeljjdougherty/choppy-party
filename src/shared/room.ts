import { clamp, toTickInput, DT, type Inputs, type RawInput } from './types';
import { addBot, addPlayer, createParty, hostId, removeBot, removePlayer, renamePlayer, stepParty, type PartyState } from './party';
import { MAX_DEVICES_PER_CLIENT, onlinePlayerId, type ClientMsg, type ServerMsg } from './protocol';

/**
 * One online room: the party state plus everyone connected to it. Platform-neutral, so the same
 * code runs in the host's browser (peer-to-peer) and in the optional Node server.
 *
 * Each browser is a "client" with a stable id it keeps in sessionStorage. If its connection drops
 * mid-game, its players stay in the party and a Normal CPU plays for them ("away") until the same
 * browser comes back with the same code.
 */
export interface Link {
  /** `json` is the message already encoded (shared by every link for the per-tick state). */
  send(m: ServerMsg, json: string): void;
}

const out = (link: Link | null | undefined, m: ServerMsg) => link?.send(m, JSON.stringify(m));

interface Client {
  id: string;
  link: Link | null;
  raws: Record<string, RawInput>;
  /** Tick of the last message, to notice a silent drop (WebRTC can take ages to report one). */
  seen: number;
}

/** Ticks of silence before a guest counts as gone (browsers ping at least once a second). */
const SILENT_TICKS = 30 * 6;

const DEVICE_KEY = /^[a-z0-9]{1,8}$/;
const CLIENT_ID = /^[a-z0-9]{8}$/;

function randomId(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

export function cleanRaw(r: any): RawInput | null {
  if (!r || typeof r !== 'object') return null;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : 0);
  return {
    x: num(r.x, -1, 1),
    y: num(r.y, -1, 1),
    a: r.a === true,
    b: r.b === true,
    aCount: Math.floor(num(r.aCount, 0, 1e9)),
    bCount: Math.floor(num(r.bCount, 0, 1e9)),
    xCount: Math.floor(num(r.xCount, 0, 1e9)),
    yCount: Math.floor(num(r.yCount, 0, 1e9)),
    startCount: Math.floor(num(r.startCount, 0, 1e9)),
  };
}

export class Room {
  readonly party: PartyState;
  private clients = new Map<string, Client>();
  private prev = new Map<string, RawInput>();
  private ticks = 0;
  /** The host's own browser never times out. */
  private local = new Set<string>();

  constructor(
    readonly code: string,
    seed = (Math.random() * 2 ** 31) | 0,
  ) {
    this.party = createParty(seed);
  }

  anyoneHere(): boolean {
    for (const c of this.clients.values()) if (c.link) return true;
    return false;
  }

  /** A browser connected (or reconnected). Returns its client id. */
  connect(link: Link, wantedId?: string): string {
    let id = typeof wantedId === 'string' && CLIENT_ID.test(wantedId) ? wantedId : '';
    // a returning browser takes its seat back, even if its old connection hasn't timed out yet
    const existing = id ? this.clients.get(id) : undefined;
    if (!id) id = randomId();
    const client = existing ?? { id, link: null, raws: {}, seen: 0 };
    client.link = link;
    client.seen = this.ticks;
    this.clients.set(client.id, client);
    // welcome back: take your players back from the stand-in CPU
    for (const p of this.party.players) if (p.id.startsWith(client.id + '.')) delete p.away;
    out(link, { t: 'welcome', code: this.code, clientId: client.id });
    return client.id;
  }

  /** `link` is the connection that closed; a stale one (already replaced by a reconnect) is ignored. */
  disconnect(clientId: string, link?: Link): void {
    const client = this.clients.get(clientId);
    if (!client || (link && client.link !== link)) return;
    client.link = null;
    client.raws = {};
    const mine = this.party.players.filter((p) => p.id.startsWith(clientId + '.'));
    if (this.party.phase === 'lobby') {
      // in the lobby, leaving frees the slots
      for (const p of mine) removePlayer(this.party, p.id);
    } else {
      // mid-game they stay, and a CPU covers for them until they're back
      for (const p of mine) p.away = true;
    }
  }

  /** `link` is the connection it came in on: a client that was timed out for silence comes back to life. */
  message(clientId: string, msg: ClientMsg, link?: Link): void {
    const client = this.clients.get(clientId);
    if (client && !client.link && link) {
      client.link = link;
      for (const p of this.party.players) if (p.id.startsWith(client.id + '.')) delete p.away;
    }
    if (!client?.link || !msg || typeof msg !== 'object') return;
    const send = (m: ServerMsg) => out(client.link, m);
    client.seen = this.ticks;
    if (msg.t === 'add' && DEVICE_KEY.test(msg.deviceKey)) {
      const mine = this.party.players.filter((p) => p.id.startsWith(client.id + '.')).length;
      if (mine >= MAX_DEVICES_PER_CLIENT) return send({ t: 'error', message: 'Max 4 players per browser.' });
      const name = typeof msg.name === 'string' ? msg.name : undefined;
      if (!addPlayer(this.party, onlinePlayerId(client.id, msg.deviceKey), name) && this.party.phase !== 'lobby') {
        send({ t: 'error', message: 'Wait for the lobby to join.' });
      }
    } else if (msg.t === 'name' && DEVICE_KEY.test(msg.deviceKey) && typeof msg.name === 'string') {
      renamePlayer(this.party, onlinePlayerId(client.id, msg.deviceKey), msg.name.slice(0, 40));
    } else if (msg.t === 'remove' && DEVICE_KEY.test(msg.deviceKey)) {
      removePlayer(this.party, onlinePlayerId(client.id, msg.deviceKey));
    } else if (msg.t === 'bot' || msg.t === 'unbot') {
      // only the host's browser manages CPUs
      if (!hostId(this.party)?.startsWith(client.id + '.')) return send({ t: 'error', message: 'Only the host can add CPUs.' });
      if (msg.t === 'unbot') removeBot(this.party);
      else if (['easy', 'normal', 'hard'].includes(msg.level)) addBot(this.party, msg.level);
    } else if (msg.t === 'input' && msg.raws && typeof msg.raws === 'object') {
      for (const [k, v] of Object.entries(msg.raws).slice(0, MAX_DEVICES_PER_CLIENT)) {
        const raw = cleanRaw(v);
        if (raw && DEVICE_KEY.test(k)) client.raws[k] = raw;
      }
    }
  }

  /** Advance one tick and send everyone the new state. */
  /** Mark a client (the host's own browser) as never timing out. */
  keepAlive(clientId: string): void {
    this.local.add(clientId);
  }

  tick(): void {
    this.ticks++;
    for (const c of this.clients.values()) {
      if (c.link && !this.local.has(c.id) && this.ticks - c.seen > SILENT_TICKS) this.disconnect(c.id);
    }
    const inputs: Inputs = {};
    for (const p of this.party.players) {
      const dot = p.id.indexOf('.');
      if (dot < 0) continue;
      const client = this.clients.get(p.id.slice(0, dot));
      const raw = client?.link ? client.raws[p.id.slice(dot + 1)] : undefined;
      if (!raw) continue;
      inputs[p.id] = toTickInput(raw, this.prev.get(p.id));
      this.prev.set(p.id, { ...raw });
    }
    stepParty(this.party, inputs, DT);
    const msg: ServerMsg = { t: 'state', s: this.party };
    const json = JSON.stringify(msg);
    for (const c of this.clients.values()) c.link?.send(msg, json);
  }
}
