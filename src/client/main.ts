import { VIEW_H, VIEW_W } from '../shared/types';
import { getGame } from '../shared/games';
import { FIRST_GAME, FIRST_MIX, addPlayer } from '../shared/party';
import { InputManager } from './input';
import { LocalSession, OnlineSession, type Session } from './session';
import { drawFinal, drawIntro, drawLobby, drawResults } from './screens';
import { sfx, unlockAudio } from './sfx';
import { drawConfetti, resetJuice, watch } from './juice';
import { drawBoardHud } from './boardHud';
import { MainMenu } from './menu';
import { roundRect, text } from '../shared/draw';
import { Stage, type Tag } from './three/stage';
import { GAME_VIEWS, boardView, mainMenuView, menuView } from './three/views';
import { preloadAll } from './three/assets';
import { logo } from './menu';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const stage = new Stage(glCanvas);
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;
const codeEl = document.getElementById('code') as HTMLInputElement;
const bar = document.getElementById('bar')!;
const joinBox = document.getElementById('joinBox')!;
const toast = document.getElementById('toast')!;

const input = new InputManager();
const menu = new MainMenu(input);
/** null while the title screen / main menu is up. */
let session: Session | null = null;

function showError(msg: string) {
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 4000);
}

function enter(next: Session) {
  session?.close();
  session = next;
}

function backToMenu() {
  sfx.back();
  resetJuice();
  session?.close();
  session = null;
  menu.screen = 'main';
  history.replaceState(null, '', location.pathname);
}

function openJoin() {
  joinBox.classList.remove('hidden');
  codeEl.value = '';
  setTimeout(() => codeEl.focus(), 0);
}
function submitJoin() {
  const code = codeEl.value.trim().toUpperCase();
  if (code.length !== 4) return showError('Room codes are 4 letters.');
  joinBox.classList.add('hidden');
  codeEl.blur();
  enter(new OnlineSession(input, { code }, showError));
}
document.getElementById('joinBtn')!.addEventListener('click', submitJoin);
codeEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitJoin();
  if (e.key === 'Escape') joinBox.classList.add('hidden');
});
document.getElementById('cancelJoin')!.addEventListener('click', () => joinBox.classList.add('hidden'));
document.getElementById('menuBtn')!.addEventListener('click', () => {
  backToMenu();
  (document.activeElement as HTMLElement)?.blur();
});

function act(action: ReturnType<MainMenu['update']>) {
  if (!action) return;
  if (action === 'boards') enter(new LocalSession(input, 0));
  else if (action === 'mix') enter(new LocalSession(input, FIRST_MIX));
  else if (action === 'free') enter(new LocalSession(input, FIRST_GAME));
  else if (action === 'host') enter(new OnlineSession(input, { create: true }, showError));
  else if (action === 'join') openJoin();
}

canvas.style.pointerEvents = 'auto';
canvas.addEventListener('click', (e) => {
  if (session) return;
  const r = canvas.getBoundingClientRect();
  act(menu.click(((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H));
});

// ?room=ABCD joins straight away, so a host can share a link
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) enter(new OnlineSession(input, { code: roomParam }, showError));

// in the lobby: A joins, B leaves (or goes back to the menu if you're not in)
for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, unlockAudio);
input.onAPress = (d) => {
  unlockAudio();
  if (!session) return;
  const s = session.view();
  if (!s || s.phase === 'lobby') session.join(d.key);
};
input.onBPress = (d) => {
  if (!session) return;
  const s = session.view();
  if (s?.phase !== 'lobby') return;
  const mine = [...session.localIds()].some((id) => id === d.key || id.endsWith('.' + d.key));
  if (mine) session.leave(d.key);
  else if (session.localIds().size === 0) backToMenu();
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && session?.view()?.phase === 'lobby') backToMenu();
});

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
  if (!session) {
    const before = `${menu.screen}:${menu.sel}`;
    if (joinBox.classList.contains('hidden')) act(menu.update(dt));
    const after = `${menu.screen}:${menu.sel}`;
    if (session) sfx.select();
    else if (before !== after) (before.split(':')[0] !== after.split(':')[0] ? sfx.select : sfx.move)();
  } else {
    session.update(dt);
    const v = session.view();
    if (v) watch(v);
  }
  render(now / 1000, dt);
  requestAnimationFrame(frame);
}

function render(wallT: number, dt: number) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (!session) {
    bar.classList.add('hidden');
    const view = stage.show('main-menu', () => mainMenuView(stage.env, () => menu.screen));
    view.update(null, [], wallT, dt);
    stage.render(dt, wallT);
    menu.draw(ctx, wallT);
    if (stage.switches !== seenSwitches) {
      if (seenSwitches > 0) wipeT = 0;
      seenSwitches = stage.switches;
    }
    drawWipe(dt);
    return;
  }
  const s = session.view();
  statusEl.textContent = session.status();
  if (!s) {
    ctx.fillStyle = '#1a1033';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(ctx, session.status(), 640, 360, 36);
    return;
  }
  bar.classList.toggle('hidden', s.phase !== 'lobby');

  // 3D: one view per minigame round, one per board game, and a shared party stage for the menus
  let view;
  if (s.phase === 'play' && s.gameId && GAME_VIEWS[s.gameId]) {
    view = stage.show(`game:${s.gameId}:${s.round}:${s.playlist.length}`, () => GAME_VIEWS[s.gameId!](stage.env, s.game, s.players));
    view.update(s.game, s.players, wallT, dt);
  } else if (s.phase === 'board' && s.board) {
    view = stage.show(`board:${s.board.boardId}:${s.players.length}`, () => boardView(stage.env, s, s.players));
    view.update(s, s.players, wallT, dt);
  } else {
    view = stage.show('menu', () => menuView(stage.env, () => session?.localIds() ?? new Set(), () => session?.kind === 'online'));
    view.update(s, s.players, wallT, dt);
  }
  stage.render(dt, wallT);
  drawTags(view.tags());
  if (stage.switches !== seenSwitches) {
    // skip the wipe for the very first scene
    if (seenSwitches > 0) wipeT = 0;
    seenSwitches = stage.switches;
  }

  const sc = { status: session.status(), roomCode: session.roomCode() };
  switch (s.phase) {
    case 'lobby':
      drawLobby(ctx, s, sc);
      break;
    case 'board':
      drawBoardHud(ctx, s, wallT);
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
  drawConfetti(ctx, dt, wallT);
  drawWipe(dt);
}

/** Screen transition: candy-coloured diagonal bands sweep off the screen to reveal the new scene. */
let wipeT = 9;
let seenSwitches = 0;
const WIPE = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#4cd97b', '#3fa9f5', '#b06cff'];
function drawWipe(dt: number) {
  if (wipeT > 1.2) return;
  wipeT += dt;
  const bandW = 260;
  ctx.save();
  WIPE.forEach((c, i) => {
    // each band leaves a little after the one before it, with an ease-in so they whoosh away
    const p = Math.min(1, Math.max(0, (wipeT - i * 0.05) / 0.5));
    const e = p * p * (3 - 2 * p);
    const x0 = -200 + i * bandW * 0.5 - e * (VIEW_W + 900);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + VIEW_W + 600, 0);
    ctx.lineTo(x0 + VIEW_W + 300, VIEW_H);
    ctx.lineTo(x0 - 300, VIEW_H);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
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
    if (tg.sub) text(ctx, tg.sub, p.x, p.y - (tg.sub.length <= 2 ? 40 : -28), tg.sub.length <= 2 ? 44 : 20, { color: tg.subColor ?? '#fff', weight: 900 });
  }
}

// load every model first, with a little loading screen
let loadT = 0;
function drawLoading(done: number, total: number) {
  loadT += 0.05;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#3ba7ff');
  g.addColorStop(1, '#c9f0ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  logo(ctx, 640, 270, 1, loadT);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, 390, 470, 500, 34, 17);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  roundRect(ctx, 394, 474, Math.max(26, 492 * (done / Math.max(1, total))), 26, 13);
  ctx.fill();
  text(ctx, `Loading party supplies… ${done}/${total}`, 640, 540, 22, { weight: 700 });
}
drawLoading(0, 1);
preloadAll(drawLoading).then(() => requestAnimationFrame(frame));

// expose for automated smoke tests
(window as any).__choppy = {
  get session() {
    return session;
  },
  input,
  menu,
  stage,
  /** Test helper: fill local lobby seats with idle players. */
  addBots(n: number) {
    const st = (session as any)?.state;
    for (let i = 0; i < n && st; i++) addPlayer(st, `bot${i}`);
  },
};
