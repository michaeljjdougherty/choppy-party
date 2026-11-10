import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { DT, TICK_HZ, clamp, toTickInput, type Inputs, type RawInput } from '../shared/types';
import { addBot, addPlayer, createParty, hostId, removeBot, removePlayer, stepParty, type PartyState } from '../shared/party';
import { MAX_DEVICES_PER_CLIENT, onlinePlayerId, type ClientMsg, type ServerMsg } from '../shared/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
const EMPTY_ROOM_TTL_MS = 60_000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

interface Client {
  id: string;
  ws: WebSocket | null;
  raws: Record<string, RawInput>;
}

interface Room {
  code: string;
  party: PartyState;
  clients: Map<string, Client>;
  prev: Map<string, RawInput>;
  emptySince: number | null;
  timer: NodeJS.Timeout;
}

const rooms = new Map<string, Room>();

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function createRoom(): Room {
  const code = newCode();
  const room: Room = {
    code,
    party: createParty((Math.random() * 2 ** 31) | 0),
    clients: new Map(),
    prev: new Map(),
    emptySince: null,
    timer: setInterval(() => tick(room), 1000 / TICK_HZ),
  };
  rooms.set(code, room);
  return room;
}

function tick(room: Room): void {
  const anyone = [...room.clients.values()].some((c) => c.ws);
  if (!anyone) {
    room.emptySince ??= Date.now();
    if (Date.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
      clearInterval(room.timer);
      rooms.delete(room.code);
    }
    return;
  }
  room.emptySince = null;
  const inputs: Inputs = {};
  for (const p of room.party.players) {
    const dot = p.id.indexOf('.');
    const client = room.clients.get(p.id.slice(0, dot));
    const raw = client?.ws ? client.raws[p.id.slice(dot + 1)] : undefined;
    if (!raw) continue;
    inputs[p.id] = toTickInput(raw, room.prev.get(p.id));
    room.prev.set(p.id, { ...raw });
  }
  stepParty(room.party, inputs, DT);
  const msg = JSON.stringify({ t: 'state', s: room.party } satisfies ServerMsg);
  for (const c of room.clients.values()) if (c.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(msg);
}

function cleanRaw(r: any): RawInput | null {
  if (!r || typeof r !== 'object') return null;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : 0);
  return {
    x: num(r.x, -1, 1),
    y: num(r.y, -1, 1),
    a: r.a === true,
    b: r.b === true,
    aCount: Math.floor(num(r.aCount, 0, 1e9)),
    bCount: Math.floor(num(r.bCount, 0, 1e9)),
  };
}

const DEVICE_KEY = /^[a-z0-9]{1,8}$/;

function handle(ws: WebSocket): void {
  let room: Room | null = null;
  let client: Client | null = null;
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

  const attach = (r: Room, wantedId?: string) => {
    let id = typeof wantedId === 'string' && /^[a-z0-9]{8}$/.test(wantedId) ? wantedId : '';
    const existing = id ? r.clients.get(id) : undefined;
    if (existing?.ws) id = ''; // that id is in use by a live tab; issue a fresh one
    if (!id) id = randomBytes(4).toString('hex');
    client = existing && !existing.ws ? existing : { id, ws: null, raws: {} };
    client.ws = ws;
    r.clients.set(client.id, client);
    room = r;
    send({ t: 'welcome', code: r.code, clientId: client.id });
  };

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!room || !client) {
      if (msg.t === 'create') attach(createRoom(), msg.clientId);
      else if (msg.t === 'join') {
        const r = rooms.get(String(msg.code).toUpperCase());
        if (!r) send({ t: 'error', message: `No room called ${String(msg.code).slice(0, 4)}.` });
        else attach(r, msg.clientId);
      }
      return;
    }
    if (msg.t === 'add' && DEVICE_KEY.test(msg.deviceKey)) {
      const mine = room.party.players.filter((p) => p.id.startsWith(client!.id + '.')).length;
      if (mine >= MAX_DEVICES_PER_CLIENT) return send({ t: 'error', message: 'Max 4 players per browser.' });
      if (!addPlayer(room.party, onlinePlayerId(client.id, msg.deviceKey), msg.name) && room.party.phase !== 'lobby') {
        send({ t: 'error', message: 'Wait for the lobby to join.' });
      }
    } else if (msg.t === 'remove' && DEVICE_KEY.test(msg.deviceKey)) {
      removePlayer(room.party, onlinePlayerId(client.id, msg.deviceKey));
    } else if (msg.t === 'bot' || msg.t === 'unbot') {
      // only the host's browser manages bots
      if (!hostId(room.party)?.startsWith(client.id + '.')) return send({ t: 'error', message: 'Only the host can add bots.' });
      if (msg.t === 'unbot') removeBot(room.party);
      else if (['easy', 'normal', 'hard'].includes(msg.level)) addBot(room.party, msg.level);
    } else if (msg.t === 'input' && msg.raws && typeof msg.raws === 'object') {
      for (const [k, v] of Object.entries(msg.raws).slice(0, MAX_DEVICES_PER_CLIENT)) {
        const raw = cleanRaw(v);
        if (raw && DEVICE_KEY.test(k)) client.raws[k] = raw;
      }
    }
  });

  ws.on('close', () => {
    if (!room || !client) return;
    client.ws = null;
    client.raws = {};
    // in the lobby, leaving frees the slots; mid-game the players stay so they can reconnect
    if (room.party.phase === 'lobby') {
      for (const p of [...room.party.players]) if (p.id.startsWith(client.id + '.')) removePlayer(room.party, p.id);
    }
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!path.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    if (url.pathname === '/health') {
      res.writeHead(200).end(`ok ${rooms.size} rooms`);
      return;
    }
    res.writeHead(404).end('Not found. In development, open the Vite dev server (npm run dev).');
  }
}

const server = createServer((req, res) => void serveStatic(req, res));
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', handle);
server.listen(PORT, () => console.log(`Choppy Party server on http://localhost:${PORT}`));
