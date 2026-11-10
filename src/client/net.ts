import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { TICK_HZ } from '../shared/types';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { Room, type Link } from '../shared/room';

/**
 * How browsers reach each other online.
 *
 * Peer-to-peer (default): the host's browser runs the room (src/shared/room.ts) and everyone else
 * connects straight to it over WebRTC. PeerJS's free public signalling server only introduces the
 * browsers to each other, so the game can be hosted anywhere static, like GitHub Pages.
 * Room code ABCD is the PeerJS id "choppyparty-abcd".
 *
 * Server mode (?server): the old Node + WebSocket room server, for anyone who runs it.
 */
export interface Transport {
  send(m: ClientMsg): void;
  close(): void;
  onOpen: () => void;
  onMessage: (m: ServerMsg) => void;
  /** `retry` is true when the connection dropped and it's worth trying again. */
  onClose: (why: string, retry: boolean) => void;
}

const PEER_PREFIX = 'choppyparty-';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Saved in localStorage: an optional TURN relay (for strict networks) and signalling server. */
export interface NetSettings {
  turnUrl: string;
  turnUser: string;
  turnPass: string;
  /** "host:port/path", empty for the free PeerJS cloud. */
  peerServer: string;
}

const SETTINGS_KEY = 'choppy.net';

export function loadNet(): NetSettings {
  const blank: NetSettings = { turnUrl: '', turnUser: '', turnPass: '', peerServer: '' };
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return blank;
  }
}

export function saveNet(n: NetSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(n));
  } catch {
    /* private mode: settings last for this visit only */
  }
}

function peerOptions(): PeerOptions {
  const n = loadNet();
  const ice: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  if (n.turnUrl.trim()) {
    ice.push({ urls: n.turnUrl.split(',').map((u) => u.trim()).filter(Boolean), username: n.turnUser || undefined, credential: n.turnPass || undefined });
  }
  const opts: PeerOptions = { config: { iceServers: ice }, debug: 0 };
  // ?peer=host:port overrides (handy for testing against a local PeerServer)
  const over = new URLSearchParams(location.search).get('peer') ?? n.peerServer;
  if (over.trim()) {
    const m = /^(?:(https?):\/\/)?([^:/]+)(?::(\d+))?(\/.*)?$/.exec(over.trim());
    if (m) {
      opts.host = m[2];
      opts.port = Number(m[3] ?? (m[1] === 'http' ? 80 : 443));
      opts.path = m[4] ?? '/';
      opts.secure = m[1] ? m[1] === 'https' : opts.port === 443;
    }
  }
  return opts;
}

const peerId = (code: string) => PEER_PREFIX + code.toLowerCase();

function friendly(err: { type?: string; message?: string }): string {
  switch (err.type) {
    case 'peer-unavailable':
      return 'No room with that code. Check the letters with your host.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your internet.';
    case 'browser-incompatible':
      return 'This browser cannot do online play.';
    case 'webrtc':
      return 'Could not connect to the host. A TURN server in Connection Settings may help.';
    default:
      return err.message || 'Connection problem.';
  }
}

/** A joining browser's connection to the host. */
export class PeerClient implements Transport {
  onOpen = () => {};
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: (why: string, retry: boolean) => void = () => {};
  private peer: Peer;
  private conn: DataConnection | null = null;
  private closed = false;

  constructor(code: string) {
    this.peer = new Peer(peerOptions());
    this.peer.on('open', () => {
      const conn = this.peer.connect(peerId(code), { reliable: true, serialization: 'raw' });
      this.conn = conn;
      // WebRTC can hang silently on hostile networks; give it a fair while, then say so
      const slow = setTimeout(() => {
        if (!conn.open && !this.closed) this.fail('Could not connect to the host. A TURN server in Connection Settings may help.', true);
      }, 15000);
      conn.on('open', () => {
        clearTimeout(slow);
        this.onOpen();
      });
      conn.on('data', (d) => {
        try {
          this.onMessage(JSON.parse(String(d)) as ServerMsg);
        } catch {
          /* ignore garbage */
        }
      });
      conn.on('close', () => this.fail('Lost connection to the host.', true));
      conn.on('error', () => this.fail('Lost connection to the host.', true));
    });
    this.peer.on('error', (e) => this.fail(friendly(e), e.type !== 'peer-unavailable' && e.type !== 'browser-incompatible'));
  }

  private fail(why: string, retry: boolean) {
    if (this.closed) return;
    this.closed = true;
    this.onClose(why, retry);
    this.peer.destroy();
  }

  send(m: ClientMsg): void {
    if (this.conn?.open) this.conn.send(JSON.stringify(m));
  }

  close(): void {
    this.closed = true;
    this.peer.destroy();
  }
}

/** Worker-driven ticker: keeps the room running at full speed even when the host's tab is in the background. */
function ticker(hz: number, fn: () => void): () => void {
  try {
    const src = `let id=setInterval(()=>postMessage(0),${1000 / hz});onmessage=()=>clearInterval(id);`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
    return () => w.terminate();
  } catch {
    const id = setInterval(fn, 1000 / hz);
    return () => clearInterval(id);
  }
}

const HOSTED_KEY = 'choppy.hosted';

/**
 * The host's browser: owns the room, accepts peers, and talks to its own game through a loopback
 * link. The room is saved every couple of seconds, so if the host's page reloads it can pick the
 * same room back up and everyone reconnects to it.
 */
export class PeerHost implements Transport {
  onOpen = () => {};
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: (why: string, retry: boolean) => void = () => {};
  private peer!: Peer;
  private room!: Room;
  private stop: () => void = () => {};
  private selfId = '';
  private closed = false;
  private saveAcc = 0;
  private tries = 0;

  constructor(resumeCode?: string) {
    const saved = resumeCode ? loadHosted(resumeCode) : null;
    this.start(saved?.code ?? newCode(), saved);
  }

  private start(code: string, saved: Hosted | null) {
    this.room = new Room(code);
    if (saved) {
      Object.assign(this.room.party, saved.party);
      // everyone else is away until they reconnect
      for (const p of this.room.party.players) if (!p.bot) p.away = true;
    }
    this.peer = new Peer(peerId(code), peerOptions());
    this.peer.on('open', () => {
      this.tries = 0;
      const self: Link = { send: (_m, json) => this.onMessage(JSON.parse(json) as ServerMsg) };
      this.selfId = this.room.connect(self, saved?.selfId ?? localClientId(code));
      this.room.keepAlive(this.selfId);
      this.onOpen();
      this.stop = ticker(TICK_HZ, () => this.tick());
    });
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('error', (e) => {
      // someone else already has this code: roll another (a resumed room keeps trying its own)
      if (e.type === 'unavailable-id' && ++this.tries < 6) {
        this.peer.destroy();
        if (saved) setTimeout(() => this.start(code, saved), 2000);
        else this.start(newCode(), null);
        return;
      }
      if (e.type === 'peer-unavailable') return; // a guest's own lookup, not ours
      if (!this.closed) this.onClose(friendly(e), false);
    });
    // the signalling link can drop while games keep running fine; quietly reconnect it
    this.peer.on('disconnected', () => !this.closed && setTimeout(() => !this.closed && this.peer.reconnect(), 1500));
  }

  private accept(conn: DataConnection) {
    let clientId = '';
    const link: Link = { send: (_m, json) => conn.open && conn.send(json) };
    conn.on('data', (d) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(d));
      } catch {
        return;
      }
      if (!clientId) {
        if (msg.t === 'join' || msg.t === 'create') clientId = this.room.connect(link, msg.clientId);
        return;
      }
      this.room.message(clientId, msg, link);
    });
    const gone = () => clientId && this.room.disconnect(clientId, link);
    conn.on('close', gone);
    conn.on('error', gone);
  }

  private tick() {
    this.room.tick();
    this.saveAcc += 1;
    if (this.saveAcc >= TICK_HZ * 2) {
      this.saveAcc = 0;
      saveHosted({ code: this.room.code, selfId: this.selfId, party: this.room.party, at: Date.now() });
    }
  }

  send(m: ClientMsg): void {
    if (this.selfId) this.room.message(this.selfId, m);
  }

  close(): void {
    this.closed = true;
    this.stop();
    this.peer?.destroy();
    try {
      localStorage.removeItem(HOSTED_KEY);
    } catch {
      /* fine */
    }
  }
}

interface Hosted {
  code: string;
  selfId: string;
  party: Room['party'];
  at: number;
}

function saveHosted(h: Hosted) {
  try {
    localStorage.setItem(HOSTED_KEY, JSON.stringify(h));
  } catch {
    /* too big or private mode: no resume */
  }
}

/** A room this browser was hosting in the last 10 minutes, if it matches `code`. */
export function loadHosted(code: string): Hosted | null {
  try {
    const h = JSON.parse(localStorage.getItem(HOSTED_KEY) ?? 'null') as Hosted | null;
    if (h && h.code === code.toUpperCase() && Date.now() - h.at < 10 * 60_000) return h;
  } catch {
    /* none */
  }
  return null;
}

function newCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return c;
}

/**
 * The id this browser uses in a room. Kept per room code in localStorage, so typing the same code
 * again (even after closing the tab) brings you back as the same players.
 */
export function localClientId(code: string): string | undefined {
  try {
    return localStorage.getItem(`choppy.client.${code.toUpperCase()}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberClientId(code: string, id: string): void {
  try {
    localStorage.setItem(`choppy.client.${code.toUpperCase()}`, id);
  } catch {
    /* fine */
  }
}

/** The optional Node room server (?server in the URL). */
export class WsTransport implements Transport {
  onOpen = () => {};
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: (why: string, retry: boolean) => void = () => {};
  private ws: WebSocket;
  private closed = false;

  constructor() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.addEventListener('open', () => this.onOpen());
    this.ws.addEventListener('message', (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMsg));
    this.ws.addEventListener('close', () => !this.closed && this.onClose('Lost connection to the room server.', true));
  }

  send(m: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.closed = true;
    this.ws.close();
  }
}
