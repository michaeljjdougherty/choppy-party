import { VIEW_H, VIEW_W } from '../shared/types';
import { getGame } from '../shared/games';
import { InputManager } from './input';
import { LocalSession, OnlineSession, type Session } from './session';
import { drawFinal, drawIntro, drawLobby, drawResults } from './screens';
import { roundRect, text } from '../shared/draw';
import { Stage, type Tag } from './three/stage';
import { GAME_VIEWS, menuView } from './three/views';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const stage = new Stage(glCanvas);
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
  for (const c of [canvas, glCanvas]) {
    c.style.width = `${VIEW_W * scale}px`;
    c.style.height = `${VIEW_H * scale}px`;
  }
  stage.resize(VIEW_W * scale, VIEW_H * scale, dpr);
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
  render(now / 1000, dt);
  requestAnimationFrame(frame);
}

function render(wallT: number, dt: number) {
  const s = session.view();
  statusEl.textContent = session.status();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (!s) {
    ctx.fillStyle = '#1a1033';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(ctx, session.status(), 640, 360, 36);
    return;
  }
  // the online/local bar is only useful in the lobby
  bar.classList.toggle('hidden', s.phase !== 'lobby');

  // 3D: one view per minigame round, one shared party stage for the menus
  const inGame = s.phase === 'play' && s.gameId && GAME_VIEWS[s.gameId];
  const view = inGame
    ? stage.show(`game:${s.gameId}:${s.round}:${s.playlist.length}`, () => GAME_VIEWS[s.gameId!](stage.env, s.game, s.players))
    : stage.show('menu', () => menuView(stage.env, () => session.localIds(), () => session.kind === 'online'));
  view.update(inGame ? s.game : s, s.players, wallT, dt);
  stage.render();
  drawTags(view.tags());

  const sc = { status: session.status(), roomCode: session.roomCode() };
  switch (s.phase) {
    case 'lobby':
      drawLobby(ctx, s, sc);
      break;
    case 'intro':
      drawIntro(ctx, s);
      break;
    case 'play':
      getGame(s.gameId!).draw(ctx, s.game, s.players);
      break;
    case 'results':
      drawResults(ctx, s);
      break;
    case 'final':
      drawFinal(ctx, s);
      break;
  }
}

/** Name plates that follow characters around the 3D scene. */
function drawTags(tags: Tag[]) {
  for (const tg of tags) {
    const p = stage.project(tg.pos);
    if (!p.visible) continue;
    ctx.save();
    ctx.font = '700 17px system-ui, sans-serif';
    const w = ctx.measureText(tg.text).width + 22;
    ctx.fillStyle = 'rgba(20,12,40,0.62)';
    roundRect(ctx, p.x - w / 2, p.y - 13, w, 26, 13);
    ctx.fill();
    ctx.fillStyle = tg.color ?? '#fff';
    ctx.beginPath();
    ctx.arc(p.x - w / 2 + 2, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(ctx, tg.text, p.x + 3, p.y + 1, 16, { outline: false, weight: 700 });
    if (tg.badge) text(ctx, tg.badge, p.x, p.y - 24, 13, { color: '#ffd23f', weight: 800 });
    if (tg.sub) text(ctx, tg.sub, p.x, p.y + 28, 20, { color: tg.subColor ?? '#fff', weight: 800 });
  }
}

requestAnimationFrame(frame);

// expose for automated smoke tests
(window as any).__choppy = { get session() { return session; }, input };
