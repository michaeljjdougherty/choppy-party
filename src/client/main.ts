import { BOARDS } from '../shared/board/boards';
import { VIEW_H, VIEW_W } from '../shared/types';
import { getGame } from '../shared/games';
import { FINISH_T, FIRST_GAME, PAUSE_OPTIONS, countTotal, FIRST_MIX, MAX_PLAYERS, OPTIONS, addPlayer, hostId, inGame, standings, startParty, type PartyState } from '../shared/party';
import { InputManager } from './input';
import { LocalSession, OnlineSession, type Session } from './session';
import { loadHosted } from './net';
import { netDialogOpen, openNetDialog } from './netDialog';

/** ?server uses the optional Node room server instead of peer-to-peer. */
const SERVER_MODE = new URLSearchParams(location.search).has('server');
import { INTRO_PREVIEW, PREVIEW, drawFinal, drawIntro, drawLobby, drawResults } from './screens';
import { loadSamples, sfx, unlockAudio } from './sfx';
import { kickMusic, menuMusic } from './music';
import { drawConfetti, resetJuice, watch } from './juice';
import { drawBoardHud } from './boardHud';
import { bakeItemIcons } from './three/itemIcons';
import { MainMenu } from './menu';
import { roundRect, text } from '../shared/draw';
import { Stage, type Tag } from './three/stage';
import { GAME_VIEWS, boardView, mainMenuView, menuView } from './three/views';
import { preloadAll } from './three/assets';
import { logo } from './menu';
import type { BotLevel } from '../shared/bots';
import { HostLine, LINES, countIn, finishBanner, hostCorner, pick } from './showtime';
import { getBoard } from '../shared/board/boards';
import type { View } from './three/stage';
import { setCharacters } from './three/choppy';
import { boardPreview, clearBoardPreviews } from './three/views/boardPreview';
import { clearGamePreview, gamePreview } from './three/views/gamePreview';
import { attachUi, beginUi, button, endUi, pointerAt, takeStrayClick, uiSound } from './ui';
import { Y, setPromptKind } from './prompts';
import { closeMap, mapCam, openMap } from './mapCam';
import { setMapLook } from './three/views/board';

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
uiSound.hover = () => sfx.hover();
uiSound.press = (k) => (k === 'back' ? sfx.back : sfx.select)();
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
  pendingJoin = menu.picker === 'mouse' ? 'kb1' : menu.picker;
  enter(new OnlineSession(input, { code, server: SERVER_MODE }, showError));
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
  if (action !== 'join') pendingJoin = menu.picker === 'mouse' ? 'kb1' : menu.picker;
  if (action === 'boards') enter(new LocalSession(input, 0));
  else if (action === 'mix') enter(new LocalSession(input, FIRST_MIX));
  else if (action === 'free') enter(new LocalSession(input, FIRST_GAME));
  else if (action === 'host') enter(new OnlineSession(input, SERVER_MODE ? { create: true, server: true } : { host: true }, showError));
  else if (action === 'join') openJoin();
  else if (action === 'netcfg') openNetDialog();
}

canvas.style.pointerEvents = 'auto';
attachUi(canvas, VIEW_W, VIEW_H);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
/** Device to drop into the lobby as soon as it opens: whoever picked the mode. */
let pendingJoin: string | null = null;

// ?room=ABCD joins straight away, so a host can share a link
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if (roomParam) {
  // the host reloading their page picks their own room back up; everyone else rejoins it
  if (params.has('host') && loadHosted(roomParam)) enter(new OnlineSession(input, { host: true, resume: roomParam.toUpperCase() }, showError));
  else enter(new OnlineSession(input, { code: roomParam, server: SERVER_MODE }, showError));
}

// in the lobby: A joins, B leaves (or goes back to the menu if you're not in)
for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, () => (unlockAudio(), kickMusic()));
input.onAPress = (d) => {
  unlockAudio();
  kickMusic();
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
/* ---------- map view: Y (or M, or the Map button) on the board */
const canMap = () => {
  const s = session?.view();
  return !!s && s.phase === 'board' && !s.pause;
};
function setMap(on: boolean) {
  if (on && !canMap()) return;
  if (on) openMap();
  else closeMap();
  input.capture = on;
  (on ? sfx.select : sfx.back)();
}
input.onYPress = () => {
  if (!mapCam.on && canMap()) setMap(true);
};
input.onCaptureExit = () => setMap(false);
setMapLook(() => {
  const l = { ...input.look };
  input.look = { panX: 0, panY: 0, orbit: 0, tilt: 0, zoom: 0 };
  return l;
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat && (e.target as HTMLElement)?.tagName !== 'INPUT') setMap(!mapCam.on);
});
// mouse: drag to orbit and tilt, wheel to zoom
let dragAt: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => mapCam.on && (dragAt = { x: e.clientX, y: e.clientY }));
window.addEventListener('pointerup', () => (dragAt = null));
window.addEventListener('pointermove', (e) => {
  if (!mapCam.on || !dragAt) return;
  mapCam.yaw -= (e.clientX - dragAt.x) * 0.006;
  mapCam.pitch = Math.max(0.35, Math.min(1.45, mapCam.pitch + (e.clientY - dragAt.y) * 0.004));
  dragAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!mapCam.on) return;
    e.preventDefault();
    mapCam.dist = Math.max(8, Math.min(120, mapCam.dist * Math.exp(e.deltaY * 0.0012)));
  },
  { passive: false },
);
function mapLayer(s: PartyState) {
  if (mapCam.on && !canMap()) setMap(false);
  if (s.phase !== 'board' || s.pause) return;
  if (!mapCam.on) {
    if (button(ctx, `Map (${Y()})`, 1106, 668, 106, 40, { color: '#3fa9f5', size: 17, sound: 'none' })) setMap(true);
    return;
  }
  ctx.fillStyle = 'rgba(20,12,40,0.7)';
  roundRect(ctx, 370, 512, 540, 74, 18);
  ctx.fill();
  text(ctx, 'MAP VIEW', 640, 536, 26, { color: '#ffd23f' });
  const hint =
    input.kind === 'pad'
      ? 'Left stick: move · Right stick: turn · Bumpers: zoom · A/B: close'
      : input.kind === 'mouse'
        ? 'Drag: turn · Wheel: zoom · WASD: move · click Close'
        : 'WASD: move · Q/E: turn · R/F: tilt · Z/X: zoom · Space: close';
  text(ctx, hint, 640, 566, 15, { color: '#ffffff', weight: 600 });
  if (button(ctx, 'Close map', 1106, 668, 106, 40, { color: '#ff8a1f', size: 16, sound: 'none' })) setMap(false);
}

/** The local device that pauses from the keyboard or mouse: a keyboard player if there is one. */
function pauseDevice(): string | null {
  const ids = [...(session?.localIds() ?? [])].filter((id) => !session?.view()?.players.find((p) => p.id === id)?.bot);
  const kb = ids.find((id) => deviceOf(id).startsWith('kb'));
  return kb ? deviceOf(kb) : ids[0] ? deviceOf(ids[0]) : null;
}
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.key !== 'Escape' && e.code !== 'KeyP') || !joinBox.classList.contains('hidden') || netDialogOpen()) return;
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  const phase = session?.view()?.phase;
  // in a party, Esc / P is the Start button: pause menu
  if (session && phase && phase !== 'lobby') {
    const dev = pauseDevice();
    if (dev) input.start(dev);
    return;
  }
  if (e.key !== 'Escape') return;
  if (!session) {
    const was = menu.screen;
    menu.back();
    if (menu.screen !== was) sfx.back();
  } else if (session.view()?.phase === 'lobby') backToMenu();
});

// bots: buttons in the lobby bar, or keys 1/2/3 to add and 0 to remove
const BOT_KEYS: Record<string, BotLevel> = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard', Numpad1: 'easy', Numpad2: 'normal', Numpad3: 'hard' };
function lobbyBot(level: BotLevel | null) {
  if (session?.view()?.phase !== 'lobby') return;
  if (level) session.addBot(level);
  else session.removeBot();
  (level ? sfx.join : sfx.leave)();
}
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (BOT_KEYS[e.code]) lobbyBot(BOT_KEYS[e.code]);
  else if (e.code === 'Digit0' || e.code === 'Numpad0') lobbyBot(null);
  else if (e.code === 'Tab' && session?.view()?.phase === 'lobby') {
    e.preventDefault();
    addSecondKeyboard();
  }
});

/** Split the keyboard: WASD + Space for one player, Arrows + Enter for another. */
function addSecondKeyboard() {
  if (!session) return;
  if (!hasLocal('kb1')) session.join('kb1');
  session.join('kb2');
  sfx.join();
}
function hasLocal(dev: string): boolean {
  return [...(session?.localIds() ?? [])].some((id) => deviceOf(id) === dev);
}
function deviceOf(id: string): string {
  return id.slice(id.lastIndexOf('.') + 1);
}

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
  input.soloKeys = !hasLocal('kb2');
  input.poll();
  setPromptKind(input.kind, input.soloKeys);
  // menu music on the title, main menu and lobby; it fades out when the party starts
  menuMusic(!session || session.view()?.phase === 'lobby' || !session.view(), dt);
  if (session && pendingJoin && session.view()?.phase === 'lobby') {
    session.join(pendingJoin);
    pendingJoin = null;
  }
  if (!session) {
    const p = pointerAt();
    if (p && input.kind === 'mouse') menu.hover(p.x, p.y);
    const before = `${menu.screen}:${menu.sel}`;
    if (joinBox.classList.contains('hidden') && !netDialogOpen()) act(menu.update(dt));
    const after = `${menu.screen}:${menu.sel}`;
    if (session) sfx.select();
    else if (before !== after) {
      const [from, to] = [before.split(':')[0], after.split(':')[0]];
      const depth = { title: 0, main: 1, online: 2 } as Record<string, number>;
      if (from === to) sfx.move();
      else if (depth[to] < depth[from]) sfx.back();
      else sfx.select();
    }
  } else {
    session.update(dt);
    const v = session.view();
    if (v) watch(v);
  }
  render(now / 1000, dt);
  requestAnimationFrame(frame);
}

function render(wallT: number, dt: number) {
  beginUi();
  renderScreens(wallT, dt);
  mouseFallback();
  endUi();
}

/** A click that no button used acts like A for the right local player (roll, ready, continue). */
function mouseFallback() {
  const c = takeStrayClick();
  if (!c) return;
  if (!session) {
    if (joinBox.classList.contains('hidden') && !netDialogOpen()) {
      const before = menu.screen;
      act(menu.click(c.x, c.y));
      if (session || menu.screen !== before) sfx.select();
    }
    return;
  }
  const s = session.view();
  if (!s || s.phase === 'lobby') return;
  // dragging the map around, or a click on the pause screen, is not a press of A
  if (mapCam.on || s.pause) return;
  const mine = [...session.localIds()];
  if (!mine.length) return;
  let who: string[] = [mine[0]];
  if (s.phase === 'intro') who = mine;
  else if (s.phase === 'board' && s.board) {
    const cur = s.board.order[s.board.cur];
    if (mine.includes(cur)) who = [cur];
  } else if (s.phase === 'results' || s.phase === 'final') {
    const h = hostId(s);
    if (h && mine.includes(h)) who = [h];
  }
  for (const id of who) input.tap(deviceOf(id), 'a');
}

/** Clickable lobby controls: back, CPUs, mode arrows, turns, start. */
let lastTags: Tag[] = [];
let previewsLive = false;
let introLive = false;

/** "Character" and "Colour" buttons under each local player on the lobby stage. */
function lookButtons(s: PartyState, mine: Set<string>) {
  for (const tg of lastTags) {
    if (!tg.id || !mine.has(tg.id)) continue;
    const p = s.players.find((q) => q.id === tg.id);
    if (!p || p.bot) continue;
    const at = stage.project(tg.pos);
    if (!at.visible) continue;
    const dev = deviceOf(p.id);
    const w = 46, h = 30, y = at.y + 18;
    if (button(ctx, '☺', at.x - w - 3, y, w, h, { color: '#9a5bff', size: 18 })) (input.tap(dev, 'x'));
    if (button(ctx, '', at.x + 3, y, w, h, { color: p.color, size: 16 })) (input.tap(dev, 'y'));
    // paint-drop icon on the colour button
    ctx.save();
    ctx.fillStyle = lightness(p.color) > 0.7 ? '#2a1b5e' : '#ffffff';
    ctx.beginPath();
    const cx = at.x + 3 + w / 2, cy = y + h / 2 + 3;
    ctx.arc(cx, cy, 6, 0, Math.PI);
    ctx.lineTo(cx, cy - 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function lobbyButtons(s: PartyState) {
  if (!session) return;
  if (button(ctx, '◀  Back', 16, 16, 150, 50, { color: '#6b6f86', size: 20, sound: 'none' })) {
    backToMenu();
    return;
  }
  const mine = session.localIds();
  const humans = [...mine];
  lookButtons(s, mine);
  // the CPU row
  const full = s.players.length >= MAX_PLAYERS;
  const bots = s.players.filter((p) => p.bot).length;
  const row: [string, string, () => void, boolean][] = [
    ['+ Easy CPU', '#21c45a', () => lobbyBot('easy'), full],
    ['+ Normal CPU', '#e0a800', () => lobbyBot('normal'), full],
    ['+ Hard CPU', '#ff4d5a', () => lobbyBot('hard'), full],
    ['− Remove CPU', '#6b6f86', () => lobbyBot(null), bots === 0],
  ];
  if (!humans.length) row.unshift(['Join', '#2f8cff', () => (session!.join('kb1'), sfx.join()), full]);
  else if (!hasLocal('kb2')) row.push(['+ 2nd keyboard', '#9a5bff', addSecondKeyboard, full]);
  const w = 170;
  const gap = 12;
  let x = 640 - (row.length * w + (row.length - 1) * gap) / 2;
  for (const [label, color, fn, disabled] of row) {
    if (button(ctx, label, x, 196, w, 46, { color, size: 18, disabled, sound: 'none' })) fn();
    x += w + gap;
  }
  // host controls
  const h = hostId(s);
  if (!h || !mine.has(h)) return;
  const dev = deviceOf(h);
  if (button(ctx, '◀', 236, 572, 64, 52, { color: '#9a5bff', size: 26 })) (input.nudge(dev, -1, 0));
  if (button(ctx, '▶', 980, 572, 64, 52, { color: '#9a5bff', size: 26 })) (input.nudge(dev, 1, 0));
  const kind = OPTIONS[s.selection].kind;
  if (kind !== 'game') {
    text(ctx, kind === 'mix' ? 'Rounds' : 'Turns', 160, 698, 18, { weight: 800 });
    if (button(ctx, '+', 130, 566, 60, 50, { color: '#2f8cff', size: 30 })) (input.nudge(dev, 0, -1));
    if (button(ctx, '−', 130, 626, 60, 50, { color: '#2f8cff', size: 30 })) (input.nudge(dev, 0, 1));
  }
  if (button(ctx, 'START!', 1080, 566, 184, 110, { color: '#21c45a', size: 34, disabled: !s.players.length })) input.tap(dev, 'a');
}

function renderScreens(wallT: number, dt: number) {
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
  if (s) setCharacters(s.players);
  statusEl.textContent = session.status();
  if (!s) {
    ctx.fillStyle = '#1a1033';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(ctx, session.status(), 640, 360, 36);
    return;
  }
  bar.classList.add('hidden');

  // 3D: one view per minigame round, one per board game, and a shared party stage for the menus
  let view;
  const finishing = s.phase === 'results' && s.phaseT < FINISH_T && !!s.gameId && !!s.game;
  if ((s.phase === 'play' || finishing) && s.gameId && GAME_VIEWS[s.gameId]) {
    const who = inGame(s);
    const key = `game:${s.gameId}:${s.round}:${s.playlist.length}:${s.board ? `${s.board.turn}.${s.board.cur}.${s.boardEvent}` : ''}`;
    view = stage.show(key, () => GAME_VIEWS[s.gameId!](stage.env, s.game, who));
    view.update(s.game, who, wallT, dt);
  } else if (s.phase === 'board' && s.board) {
    view = stage.show(`board:${s.board.boardId}:${s.players.length}`, () => boardView(stage.env, s, s.players));
    view.update(s, s.players, wallT, dt);
  } else {
    view = stage.show('menu', () => menuView(stage.env, () => session?.localIds() ?? new Set(), () => session?.kind === 'online'));
    view.update(s, s.players, wallT, dt);
  }
  hostFor(s, view, wallT, dt);
  stage.render(dt, wallT);
  // lobby: a live flyover of the board that's picked
  const opt = OPTIONS[s.selection];
  if (s.phase === 'lobby' && opt?.kind === 'board') {
    const pv = boardPreview(stage.env, opt.id);
    pv.update(null, [], wallT, dt);
    stage.renderInset(pv, PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h);
    previewsLive = true;
  } else if (s.phase !== 'lobby' && previewsLive) {
    clearBoardPreviews();
    previewsLive = false;
  }
  // minigame intro: the game itself, played by CPU stand-ins, in a window
  if (s.phase === 'intro' && s.gameId) {
    const gv = gamePreview(stage.env, `${s.gameId}:${s.round}:${s.board?.turn ?? 0}:${s.boardEvent ?? ''}`, s.gameId, s.gamePlayers ?? s.players);
    if (gv) {
      gv.update(null, [], wallT, dt);
      stage.renderInset(gv, INTRO_PREVIEW.x, INTRO_PREVIEW.y, INTRO_PREVIEW.w, INTRO_PREVIEW.h);
    }
    introLive = true;
  } else if (introLive) {
    clearGamePreview();
    introLive = false;
  }
  input.mouseHoldsA = s.phase === 'intro';
  lastTags = view.tags();
  drawTags(lastTags);
  if (stage.switches !== seenSwitches) {
    // skip the wipe for the very first scene
    if (seenSwitches > 0) wipeT = 0;
    seenSwitches = stage.switches;
  }

  const sc = { status: session.status(), roomCode: session.roomCode() };
  switch (s.phase) {
    case 'lobby':
      drawLobby(ctx, s, sc);
      lobbyButtons(s);
      break;
    case 'board':
      bakeItemIcons(stage.renderer);
      drawBoardHud(ctx, s, wallT);
      hostCorner(ctx, hostLine, wallT, 'br', 340);
      break;
    case 'intro': {
      drawIntro(ctx, s, wallT);
      // mouse: the host gets a Start now button (same as X)
      const h = hostId(s);
      if (h && session.localIds().has(h) && button(ctx, 'Start now', 1120, 650, 132, 38, { color: '#ff8a1f', size: 16 })) input.tap(deviceOf(h), 'x');
      break;
    }
    case 'play': {
      const g = getGame(s.gameId!);
      g.draw(ctx, s.game, inGame(s));
      // shared 3, 2, 1, GO! before every minigame (the party holds the game still until GO)
      countIn(ctx, s.phaseT, countTotal(g), g.goWord);
      countSfx(s.phaseT, countTotal(g));
      break;
    }
    case 'results':
      if (finishing) {
        getGame(s.gameId!).draw(ctx, s.game, inGame(s));
        finishBanner(ctx, s.phaseT);
      } else drawResults(ctx, s, s.phaseT - FINISH_T, wallT);
      break;
    case 'final':
      drawFinal(ctx, s, wallT);
      break;
  }
  if (s.phase !== 'play' && s.phase !== 'board' && !finishing) drawHostBubble(view, s.phase, wallT);
  drawConfetti(ctx, dt, wallT);
  mapLayer(s);
  pauseLayer(s);
  drawWipe(dt);
}

/* ---------- pause menu (Start / Esc / P), shared by everyone in the room */
let seenQuit = -1;
let pauseWas = '';
/** Pause menu sounds: open = select, close = back, moving the highlight = move. */
function pauseSounds(s: PartyState) {
  const p = s.pause;
  const now = p ? `${p.sel}:${p.help}` : '';
  if (now !== pauseWas) {
    if (!pauseWas) sfx.select();
    else if (!now) sfx.back();
    else if (p!.help) sfx.select();
    else if (pauseWas.endsWith('true')) sfx.back();
    else sfx.move();
  }
  pauseWas = now;
}
function pauseLayer(s: PartyState) {
  pauseSounds(s);
  // someone on this screen chose "Quit to main menu"
  const q = s.quit;
  if (seenQuit < 0) seenQuit = q?.n ?? 0;
  else if (q && q.n > seenQuit) {
    seenQuit = q.n;
    if (session?.localIds().has(q.id)) {
      seenQuit = -1;
      backToMenu();
      return;
    }
  }
  if (s.phase === 'lobby') return;
  const p = s.pause;
  if (!p) {
    // small pause button for mouse players
    const dev = pauseDevice();
    if (dev && s.phase !== 'intro' && button(ctx, 'II', 1220, 668, 44, 40, { color: '#6b6f86', size: 18, sound: 'none' })) input.start(dev);
    return;
  }
  const who = s.players.find((x) => x.id === p.by);
  const mine = !!session?.localIds().has(p.by);
  ctx.fillStyle = 'rgba(14,8,32,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(ctx, 400, 130, 480, 440, 30);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 6;
  ctx.stroke();
  text(ctx, 'PAUSED', 640, 180, 48, { color: '#2a1b5e', outline: false });
  text(ctx, `${who?.name ?? 'Someone'} paused the game`, 640, 222, 18, { color: who?.color ?? '#6b5aa8', outline: false, weight: 700 });
  if (p.help) {
    const g = s.phase === 'board' ? null : s.gameId ? getGame(s.gameId) : null;
    const lines = g
      ? [g.name, ...wrap(g.blurb, 40), '', g.controls]
      : ['Board game', 'Roll the die with A, use an item with B.', 'Pick a path at forks with the stick.', 'Buy Choppy Crowns at the Crown Chest', 'for 40 Choppy Keys. Most crowns wins!'];
    lines.forEach((l, i) => text(ctx, l, 640, 270 + i * 30, i === 0 ? 24 : 18, { color: i === 0 ? '#ff4d5a' : '#2a1b5e', outline: false, weight: i === 0 ? 900 : 600 }));
    text(ctx, mine ? 'A or B: back' : `Waiting for ${who?.name ?? 'them'}`, 640, 540, 18, { color: '#6b5aa8', outline: false, weight: 700 });
    return;
  }
  const host = hostId(s) === p.by;
  PAUSE_OPTIONS.forEach((label, i) => {
    const y = 270 + i * 62;
    const sel = i === p.sel;
    const off = label.startsWith('End party') && !host;
    ctx.fillStyle = sel ? '#ffd23f' : '#efeaff';
    roundRect(ctx, 450, y - 24, 380, 48, 16);
    ctx.fill();
    text(ctx, off ? 'End party (host only)' : label, 640, y, 22, { color: off ? '#a99fcf' : '#2a1b5e', outline: false, weight: 800 });
  });
  text(ctx, mine ? 'Stick: choose   A: pick   B / Start: resume' : `Only ${who?.name ?? 'they'} can use this menu`, 640, 540, 17, { color: '#6b5aa8', outline: false, weight: 700 });
  // mouse: Resume
  if (mine && button(ctx, 'Resume', 1110, 668, 150, 40, { color: '#4cd97b', size: 18, sound: 'none' })) input.start(deviceOf(p.by));
}

function wrap(t: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of t.split(' ')) {
    if ((line + ' ' + w).trim().length > n) {
      out.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

/* ---------- Square Brian, the host */
const hostLine = new HostLine();

/** Pick what Brian says and how he stands for the current screen. */
function hostFor(s: PartyState, view: View, t: number, dt: number) {
  const b = view.host?.brian;
  let mood: 'pout' | 'proud' | 'smug' | 'wow' = 'pout';
  switch (s.phase) {
    case 'lobby': {
      hostLine.say('');
      break;
    }
    case 'intro':
      hostLine.say(LINES.intro(getGame(s.gameId!).blurb));
      if (b) b.pose = hostLine.talking ? 'present' : 'point';
      break;
    case 'results': {
      if (s.phaseT < FINISH_T) {
        hostLine.say('');
        break;
      }
      const top = s.placements.filter((p) => p.place === 1);
      const name = s.players.find((p) => p.id === top[0]?.id)?.name ?? '';
      hostLine.say(top.length > 1 ? LINES.tie[0] : pick(LINES.winner(name), s.round + name.length), 'smug');
      mood = 'smug';
      if (b) b.pose = s.phaseT < FINISH_T + 2.5 ? 'cheer' : 'idle';
      break;
    }
    case 'final': {
      const st = standings(s).filter((r) => r.place === 1);
      const name = s.players.find((p) => p.id === st[0]?.id)?.name ?? '';
      hostLine.say(st.length > 1 ? LINES.tie[0] : pick(LINES.champion(name), name.length), 'proud');
      mood = 'proud';
      if (b) b.pose = 'cheer';
      break;
    }
    case 'board': {
      // on the board he only pipes up at big moments, from the corner
      const bd = s.board;
      if (!bd) break;
      const def = getBoard(bd.boardId);
      if (bd.sub === 'tour' && bd.tour) hostLine.say(bd.tour.steps[bd.tour.i]?.text ?? '', bd.tour.i === 0 ? 'proud' : 'pout');
      // (with no tour, an all-CPU game, he just gives the summary)
      else if (bd.turn === 1 && bd.cur === 0 && bd.sub !== 'move' && s.players.every((p) => p.bot)) hostLine.say(`Welcome to ${def.name}. ${def.gimmick}`);
      else if (bd.turn === bd.maxTurns - bd.preset.doubleTurns + 1 && bd.cur === 0 && bd.sub !== 'move' && bd.turn > 1)
        hostLine.say('The final turns are upon us. Key and Heart Spaces now pay double.', 'wow');
      else if (bd.turn === bd.maxTurns && bd.cur === 0 && bd.sub !== 'move') hostLine.say('The last turn. Make it a good one.', 'smug');
      else hostLine.say('');
      break;
    }
    default:
      hostLine.say('');
  }
  hostLine.update(dt);
  if (b) {
    b.talking = hostLine.talking;
    b.mood = hostLine.talking ? 'pout' : mood;
  }
}

/** Brian speaks from a corner bust, clear of each screen's main panel. */
function drawHostBubble(_view: View, screen: string, t = 0) {
  if (screen === 'results' || screen === 'final' || screen === 'intro') hostCorner(ctx, hostLine, t, 'bl', screen === 'intro' ? 560 : 500);
}

let lastCount = 99;
function countSfx(t: number, readyFor: number) {
  const n = t < readyFor ? Math.ceil(readyFor - t) : 0;
  if (n !== lastCount) {
    if (n > 0 && n <= 3) sfx.count(n);
    else if (n === 0 && t < readyFor + 0.3) sfx.go();
    lastCount = n;
  }
  if (t > readyFor + 1) lastCount = 99;
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
    if (tg.bar !== undefined) {
      // hold-to-ready meter
      const bw = 74;
      ctx.fillStyle = 'rgba(20,12,40,0.7)';
      roundRect(ctx, p.x - bw / 2, p.y + 18, bw, 12, 6);
      ctx.fill();
      if (tg.bar > 0) {
        ctx.fillStyle = tg.bar >= 1 ? '#4cd97b' : '#ffd23f';
        roundRect(ctx, p.x - bw / 2 + 2, p.y + 20, Math.max(8, (bw - 4) * tg.bar), 8, 4);
        ctx.fill();
      }
    }
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
  logo(ctx, 640, 255, 1.3, loadT);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, 390, 470, 500, 34, 17);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  roundRect(ctx, 394, 474, Math.max(26, 492 * (done / Math.max(1, total))), 26, 13);
  ctx.fill();
  text(ctx, `Loading party supplies… ${done}/${total}`, 640, 540, 22, { weight: 700 });
}
drawLoading(0, 1);
Promise.all([preloadAll(drawLoading), loadSamples(), document.fonts.load("40px 'Kenney Future Narrow'").catch(() => undefined)]).then(() => requestAnimationFrame(frame));

// expose for automated smoke tests
(window as any).__choppy = {
  get session() {
    return session;
  },
  input,
  menu,
  stage,
  OPTIONS,
  BOARDS,
  /** Test helper: fill local lobby seats with idle players. */
  addBots(n: number) {
    const st = (session as any)?.state;
    for (let i = 0; i < n && st; i++) addPlayer(st, `bot${i}`);
  },
  /** Test helper: start whatever is selected in a local lobby. */
  start() {
    const st = (session as any)?.state;
    if (st) startParty(st);
  },
};
