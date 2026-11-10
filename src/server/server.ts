import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK_HZ } from '../shared/types';
import { Room } from '../shared/room';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
const EMPTY_ROOM_TTL_MS = 60_000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

const rooms = new Map<string, { room: Room; timer: NodeJS.Timeout; emptySince: number | null }>();

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function createRoom(): Room {
  const room = new Room(newCode());
  const entry = {
    room,
    emptySince: null as number | null,
    timer: setInterval(() => {
      if (!room.anyoneHere()) {
        entry.emptySince ??= Date.now();
        if (Date.now() - entry.emptySince > EMPTY_ROOM_TTL_MS) {
          clearInterval(entry.timer);
          rooms.delete(room.code);
        }
        return;
      }
      entry.emptySince = null;
      room.tick();
    }, 1000 / TICK_HZ),
  };
  rooms.set(room.code, entry);
  return room;
}

function handle(ws: WebSocket): void {
  let room: Room | null = null;
  let clientId = '';
  const link = { send: (_m: ServerMsg, json: string) => ws.readyState === ws.OPEN && ws.send(json) };

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!room) {
      if (msg.t === 'create') {
        room = createRoom();
        clientId = room.connect(link, msg.clientId);
      } else if (msg.t === 'join') {
        const r = rooms.get(String(msg.code).toUpperCase())?.room;
        if (!r) ws.send(JSON.stringify({ t: 'error', message: `No room called ${String(msg.code).slice(0, 4)}.` } satisfies ServerMsg));
        else {
          room = r;
          clientId = r.connect(link, msg.clientId);
        }
      }
      return;
    }
    room.message(clientId, msg);
  });

  ws.on('close', () => room?.disconnect(clientId));
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
