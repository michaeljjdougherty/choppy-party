import { VIEW_H, VIEW_W } from '../shared/types';
import { getGame } from '../shared/games';
import { InputManager } from './input';
import { LocalSession, OnlineSession, type Session } from './session';
import { drawFinal, drawIntro, drawLobby, drawResults } from './screens';
import { text } from '../shared/draw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;
const codeEl = document.getElementById('code') as HTMLInputElement;
const bar = document.getElementById('bar')!;
const toast = document.getElementById('toast')!;
const localBtn = document.getElementById('localBtn')!;

const input = new InputManager();
let session: Session = new LocalSession(input);

function showError(msg: string) {
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 4000);
}

function switchTo(next: Session) {
  session.close();
  session = next;
  localBtn.style.display = next.kind === 'online' ? '' : 'none';
}

document.getElementById('host')!.addEventListener('click', () => {
  switchTo(new OnlineSession(input, { create: true }, showError));
  (document.activeElement as HTMLElement)?.blur();
});
document.getElementById('joinBtn')!.addEventListener('click', () => {
  const code = codeEl.value.trim().toUpperCase();
  if (code.length !== 4) return showError('Room codes are 4 letters.');
  switchTo(new OnlineSession(input, { code }, showError));
  (document.activeElement as HTMLElement)?.blur();
});
localBtn.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  switchTo(new LocalSession(input));
});

// ?room=ABCD joins straight away, so a host can share a link
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) switchTo(new OnlineSession(input, { code: roomParam }, showError));

// A joins in the lobby, B leaves
input.onAPress = (d) => {
  const s = session.view();
  if (!s || s.phase === 'lobby') session.join(d.key);
};
input.onBPress = (d) => {
  const s = session.view();
  if (s?.phase === 'lobby') session.leave(d.key);
};

function resize() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.width = Math.round(VIEW_W * scale * dpr);
  canvas.height = Math.round(VIEW_H * scale * dpr);
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  input.poll();
  session.update(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}

function render(wallT: number) {
  const s = session.view();
  statusEl.textContent = session.status();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (!s) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(ctx, session.status(), 640, 360, 36);
    return;
  }
  // the online/local bar is only useful in the lobby
  bar.classList.toggle('hidden', s.phase !== 'lobby');
  const sc = { status: session.status(), roomCode: session.roomCode(), localIds: session.localIds() };
  switch (s.phase) {
    case 'lobby':
      drawLobby(ctx, s, sc, wallT);
      break;
    case 'intro':
      drawIntro(ctx, s, wallT);
      break;
    case 'play':
      getGame(s.gameId!).draw(ctx, s.game, s.players);
      break;
    case 'results':
      drawResults(ctx, s, wallT);
      break;
    case 'final':
      drawFinal(ctx, s, wallT);
      break;
  }
}

requestAnimationFrame(frame);

// expose for automated smoke tests
(window as any).__choppy = { get session() { return session; }, input };
