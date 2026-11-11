import { BOARDS } from '../shared/board/boards';
import { VIEW_H, VIEW_W } from '../shared/types';
import { getGame } from '../shared/games';
import { CHARACTERS, DEFAULT_NAMES, PLAYER_COLORS } from '../shared/players';
import { addBot, FINISH_T, FIRST_GAME, PAUSE_OPTIONS, ROUND_OPTIONS, TURN_OPTIONS, countTotal, FIRST_MIX, GRID_COLS, MAX_PLAYERS, OPTIONS, optionsOfKind, addPlayer, hostId, inGame, standings, startParty, type PartyState } from '../shared/party';
import { InputManager } from './input';
import { LocalSession, OnlineSession, type Session } from './session';
import { loadHosted } from './net';
import { netDialogOpen, openNetDialog } from './netDialog';

/** ?server uses the optional Node room server instead of peer-to-peer. */
const SERVER_MODE = new URLSearchParams(location.search).has('server');
import { CPU_ROW, INTRO_PREVIEW, INTRO_START, LEFT, MIX_TABS, ONLINE_TABS, PICK, PREVIEW, START_BTN, STEP, drawFinal, drawIntro, drawLobby, drawResults, gridTiles } from './screens';
import { loadSamples, sfx, unlockAudio } from './sfx';
import { music, syncMusic } from './soundtrack';
import { playSplash, splashActive } from './splash';
import { drawConfetti, resetJuice, watch } from './juice';
import { drawBoardHud } from './boardHud';
import { bakeItemIcons } from './three/itemIcons';
import { MainMenu } from './menu';
import { CustomizeScreen } from './customize';
import { customizeView } from './three/views/customize';
import { roundRect, text } from '../shared/draw';
import { Stage, type Tag } from './three/stage';
import { GAME_VIEWS, boardView, mainMenuView, menuView } from './three/views';
import { preloadAll } from './three/assets';
import { logo } from './menu';
import type { BotLevel } from '../shared/bots';
import { HostLine, LINES, countIn, finishBanner, hostCorner, pick } from './showtime';
import { getBoard } from '../shared/board/boards';
import type { View } from './three/stage';
import { setCharacters, setOutlined } from './three/choppy';
import { boardPreview, clearBoardPreviews } from './three/views/boardPreview';
import { clearGamePreview, gamePreview } from './three/views/gamePreview';
import { NameEntry } from './nameEntry';
import { attachUi, beginUi, button, clicked, endUi, inside, pointerAt, takeStrayClick, uiSound } from './ui';
import { A, B, START, STICK, X, Y, localizeControls, setPromptKind } from './prompts';
import { closeMap, mapCam, openMap } from './mapCam';
import { drawSpaceKey, mapKey } from './spaceKey';
import { setMapLook } from './three/views/board';
import { TouchControls, isTouchDevice, needsFromControls, safeInsets, type TouchNeed } from './touch';
import { PAUSE_ROW_H, PAUSE_ROW_Y, boardPointer, pauseHover, pausePointer, stepSeek } from './pointerNav';
import { Settings, gear } from './settings';
import { OstScreen } from './ost';

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
/** On-screen stick and buttons for phones and tablets (shown during a party once the screen is touched). */
const touch = new TouchControls(input);
if (isTouchDevice()) {
  input.touchSeen = true;
  input.kind = 'touch';
}
/** null while the title screen / main menu is up. */
let session: Session | null = null;
/** The Customize screen, while it's open (from the main menu). */
let customize: CustomizeScreen | null = null;
function closeCustomize() {
  customize = null;
  menu.screen = 'main';
  menu.resync();
}

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
  if (action === 'settings') {
    settings.show(() => menu.resync());
    return;
  }
  if (action === 'ost') {
    ost.show(() => menu.resync());
    return;
  }
  if (action === 'customize') {
    customize = new CustomizeScreen(input);
    return;
  }
  if (action !== 'join') pendingJoin = menu.picker === 'mouse' ? 'kb1' : menu.picker;
  if (action === 'boards') enter(new LocalSession(input, 0));
  else if (action === 'mix') enter(new LocalSession(input, FIRST_MIX));
  else if (action === 'free') enter(new LocalSession(input, FIRST_GAME));
  else if (action === 'host') enter(new OnlineSession(input, SERVER_MODE ? { create: true, server: true } : { host: true }, showError));
  else if (action === 'join') openJoin();
  else if (action === 'netcfg') openNetDialog();
}

const settings = new Settings(input);
const ost = new OstScreen(input);
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
for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, () => (unlockAudio(), music.unlock()));
// Tiger Fish Interactive studio splash: plays over the loading screen; any input skips it
void playSplash({ onGesture: () => (unlockAudio(), music.unlock()) });
input.onAPress = (d) => {
  unlockAudio();
  music.unlock();
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
/* ---------- lobby name entry: N on the keyboard, a bumper on a pad, or the ✎ button */
const names = new NameEntry();
names.onChange = (dev) => (input.typing = dev);
names.onSave = (dev, name) => session?.rename(dev, name);
input.onType = (e) => names.handle(e);
input.onNamePress = (d) => openNames(d.key);
function openNames(dev: string) {
  const s = session?.view();
  if (!session || s?.phase !== 'lobby' || names.open) return;
  const p = s.players.find((q) => !q.bot && deviceOf(q.id) === dev && session!.localIds().has(q.id));
  if (!p) return;
  // a character's own name starts blank, so you just type; a name you typed before stays to edit
  names.start({ device: dev, playerId: p.id, color: p.color }, DEFAULT_NAMES.includes(p.name) ? '' : p.name);
}

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
input.onCaptureX = () => mapKey.toggle();
setMapLook(() => {
  const l = { ...input.look };
  input.look = { panX: 0, panY: 0, orbit: 0, tilt: 0, zoom: 0 };
  return l;
});
window.addEventListener('keydown', (e) => {
  if (names.open || settings.open || ost.open) return;
  if (e.code === 'KeyM' && !e.repeat && (e.target as HTMLElement)?.tagName !== 'INPUT') setMap(!mapCam.on);
  if (e.code === 'KeyK' && !e.repeat && mapCam.on) mapKey.toggle();
});
// mouse: drag to orbit and tilt, wheel to zoom. touch: drag to orbit, pinch to zoom
let dragAt: { x: number; y: number } | null = null;
const fingers = new Map<number, { x: number; y: number }>();
let pinchWas = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (!mapCam.on) return;
  dragAt = { x: e.clientX, y: e.clientY };
  if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pinchWas = 0;
});
const lift = (e: PointerEvent) => {
  fingers.delete(e.pointerId);
  pinchWas = 0;
  dragAt = null;
};
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('pointermove', (e) => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mapCam.on && fingers.size >= 2) {
    const [f1, f2] = [...fingers.values()];
    const d = Math.hypot(f1.x - f2.x, f1.y - f2.y);
    if (pinchWas) mapCam.dist = Math.max(8, Math.min(120, mapCam.dist * (pinchWas / d)));
    pinchWas = d;
    return;
  }
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
    // touch: the on-screen Y opens the map, so no button under the thumbs
    if (!touch.visible && button(ctx, `Map (${Y()})`, 1106, 668, 106, 40, { color: '#3fa9f5', size: 17, sound: 'none' })) setMap(true);
    return;
  }
  ctx.fillStyle = 'rgba(20,12,40,0.7)';
  roundRect(ctx, 370, 512, 540, 74, 18);
  ctx.fill();
  text(ctx, 'MAP VIEW', 640, 536, 26, { color: '#ffd23f' });
  const hint =
    input.kind === 'pad'
      ? `Left stick: move · Right stick: turn · Bumpers: zoom · ${X()}: key · ${B()}: close`
      : input.kind === 'touch'
        ? 'Stick: move · Drag: turn · Pinch: zoom · tap Close'
        : input.kind === 'mouse'
        ? 'Drag: turn · Wheel: zoom · WASD: move · click Close'
        : 'WASD: move · Q/E: turn · R/F: tilt · Z/X: zoom · K: key · Space: close';
  text(ctx, hint, 640, 566, 15, { color: '#ffffff', weight: 600 });
  drawSpaceKey(ctx, s);
  if (button(ctx, mapKey.shown ? 'Hide key' : 'Show key', 990, 668, 106, 40, { color: '#8b5cf6', size: 16, sound: 'none' })) mapKey.toggle();
  if (button(ctx, 'Close map', 1106, 668, 106, 40, { color: '#ff8a1f', size: 16, sound: 'none' })) setMap(false);
}

/** Only the on-screen buttons this screen uses: each minigame's own controls, the board's, A to continue. */
function touchNeeds(): TouchNeed {
  const s = session?.view();
  const all = { stick: true, a: true, b: true, x: true, y: true };
  if (!s) return all;
  if (mapCam.on) return { stick: true, a: false, b: true, x: false, y: false };
  if (settings.open) return { stick: true, a: true, b: true, x: false, y: false };
  if (s.pause) return { stick: true, a: true, b: true, x: false, y: false };
  const finishing = s.phase === 'results' && s.phaseT < FINISH_T;
  if (s.phase === 'play' && s.gameId) return needsFromControls(getGame(s.gameId).controls);
  // stick to aim at forks and walk the menus, A to roll, B for items, Y for the map
  if (s.phase === 'board') return { stick: true, a: true, b: true, x: false, y: true };
  if (s.phase === 'intro') {
    const h = hostId(s);
    return { stick: false, a: true, b: false, x: !!h && !!session?.localIds().has(h), y: false };
  }
  if (finishing || s.phase === 'results' || s.phase === 'final') return { stick: false, a: true, b: false, x: false, y: false };
  return all;
}

/** The local device that pauses from the keyboard or mouse: a keyboard player if there is one. */
function pauseDevice(): string | null {
  const ids = [...(session?.localIds() ?? [])].filter((id) => !session?.view()?.players.find((p) => p.id === id)?.bot);
  const kb = ids.find((id) => deviceOf(id).startsWith('kb'));
  return kb ? deviceOf(kb) : ids[0] ? deviceOf(ids[0]) : null;
}
window.addEventListener('keydown', (e) => {
  if (names.open || settings.open || ost.open) return;
  // O: settings, from the title or main menu
  if (e.code === 'KeyO' && !e.repeat && !session && !customize && joinBox.classList.contains('hidden') && !netDialogOpen()) {
    act('settings');
    return;
  }
  if (e.repeat || (e.key !== 'Escape' && e.code !== 'KeyP') || !joinBox.classList.contains('hidden') || netDialogOpen()) return;
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  const phase = session?.view()?.phase;
  // in a party, Esc / P is the Start button: pause menu
  if (session && phase && phase !== 'lobby') {
    const dev = pauseDevice();
    if (dev) input.start(dev);
    return;
  }
  // in an online lobby, P is Start too: it switches between boards, the mix and Free Play
  if (session && phase === 'lobby' && e.code === 'KeyP') {
    const dev = pauseDevice();
    if (dev) input.start(dev);
    return;
  }
  if (e.key !== 'Escape') return;
  if (!session && customize) {
    sfx.back();
    closeCustomize();
    return;
  }
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
  if (names.open || settings.open || ost.open || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
  // N: type your name (the first keyboard player)
  if (e.code === 'KeyN' && session?.view()?.phase === 'lobby') {
    openNames('kb1');
    return;
  }
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
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  // phones: cap the pixel ratio at 2 (a 3x iPhone renders 2.25x the pixels for little gain)
  const dpr = Math.min(window.devicePixelRatio || 1, input.touchSeen ? 2 : 4);
  const gw = VIEW_W * scale, gh = VIEW_H * scale;
  // a phone held upright: the game sits near the top, leaving room under it for the touch controls
  const safe = safeInsets();
  const upright = input.touchSeen && vh > vw;
  const gy = upright ? Math.max(safe.t + 8, Math.min((vh - gh) / 2, (vh - gh - 250) / 2)) : (vh - gh) / 2;
  for (const c of [canvas, glCanvas]) {
    c.style.width = `${gw}px`;
    c.style.height = `${gh}px`;
    c.style.top = upright ? `${gy}px` : '';
    c.style.bottom = upright ? 'auto' : '';
  }
  touch.place(vw, vh, { x: (vw - gw) / 2, y: gy, w: gw, h: gh }, safe);
  stage.resize(VIEW_W * scale, VIEW_H * scale, dpr);
  canvas.width = Math.round(VIEW_W * scale * dpr);
  canvas.height = Math.round(VIEW_H * scale * dpr);
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
window.visualViewport?.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  input.soloKeys = !hasLocal('kb2');
  input.poll();
  // the touch pad shows during a party; menus, the lobby and Customize are tapped directly
  const ph = session?.view()?.phase;
  const wasTouch = touch.visible;
  touch.setVisible(!!session && !customize && !!ph && ph !== 'lobby');
  if (touch.visible) touch.setNeeds(touchNeeds());
  if (touch.visible !== wasTouch && input.touchSeen) resize();
  setPromptKind(input.kind, input.soloKeys, input.padStyle, touch.visible);
  // menu music on the title, main menu and lobby; it fades out when the party starts
  syncMusic(session?.view() ?? null, dt);
  if (session && pendingJoin && session.view()?.phase === 'lobby') {
    session.join(pendingJoin);
    pendingJoin = null;
  }
  if (!session && customize) {
    if (customize.update(dt) === 'back') closeCustomize();
  } else if (!session && (settings.open || ost.open)) {
    // Settings / the OST player has the controls
  } else if (!session) {
    const p = pointerAt();
    if (p && input.kind === 'mouse') menu.hover(p.x, p.y);
    const before = `${menu.screen}:${menu.sel}`;
    if (joinBox.classList.contains('hidden') && !netDialogOpen() && !splashActive()) act(menu.update(dt));
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
    stepSeek(input);
    const v = session.view();
    if (v) watch(v);
  }
  render(now / 1000, dt);
  requestAnimationFrame(frame);
}

function render(wallT: number, dt: number) {
  beginUi();
  renderScreens(wallT, dt);
  ost.draw(ctx, wallT);
  settings.draw(ctx, wallT);
  if (!settings.open && !ost.open) mouseFallback();
  endUi();
}

/** A click that no button used acts like A for the right local player (roll, ready, continue). */
function mouseFallback() {
  const c = takeStrayClick();
  if (!c) return;
  if (!session && customize) return;
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
let lobbyGameLive = false;
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
    if (button(ctx, '✎', at.x - w / 2, y + h + 6, w, h, { color: '#2f8cff', size: 18 })) openNames(dev);
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

let gridPick: { opt: number; until: number } | null = null;
let gridNudgeAt = 0;

/** Which CPU level the + CPU button adds (cycled by the level button next to it). */
const CPU_LEVELS: [BotLevel, string, string][] = [['easy', 'Easy', '#21c45a'], ['normal', 'Normal', '#e0a800'], ['hard', 'Hard', '#ff4d5a']];
let cpuLevel = 1;
/** Online lobby: the mode tab that was clicked; Start is pressed until the room gets there. */
let tabPick: { kind: string; until: number; next: number } | null = null;

function lobbyButtons(s: PartyState) {
  if (!session) return;
  if (button(ctx, '◀  Back', 16, 16, 140, 46, { color: '#6b6f86', size: 19, sound: 'none' })) {
    backToMenu();
    return;
  }
  const mine = session.localIds();
  const humans = [...mine];
  lookButtons(s, mine);
  // players: add / remove CPUs (one button picks the level), a second keyboard, or Join
  const full = s.players.length >= MAX_PLAYERS;
  const bots = s.players.filter((p) => p.bot).length;
  const [lvl, lvlName, lvlColor] = CPU_LEVELS[cpuLevel];
  const row: { label: string; color: string; fn: () => void; off: boolean; w: number; sound?: 'select' }[] = [];
  if (!humans.length) row.push({ label: 'Join', color: '#2f8cff', fn: () => (session!.join('kb1'), sfx.join()), off: full, w: 110 });
  row.push({ label: '+ CPU', color: lvlColor, fn: () => lobbyBot(lvl), off: full, w: 104 });
  row.push({ label: `${lvlName} ▾`, color: 'rgba(20,10,50,0.6)', fn: () => (cpuLevel = (cpuLevel + 1) % CPU_LEVELS.length), off: false, w: 112, sound: 'select' });
  row.push({ label: '− CPU', color: '#6b6f86', fn: () => lobbyBot(null), off: bots === 0, w: 104 });
  if (humans.length && !hasLocal('kb2') && !input.touchSeen) row.push({ label: '+ Keyboard 2', color: '#9a5bff', fn: addSecondKeyboard, off: full, w: 136 });
  const gap = 10;
  let x = LEFT.cx - (row.reduce((a, r) => a + r.w, 0) + (row.length - 1) * gap) / 2;
  for (const r of row) {
    if (button(ctx, r.label, x, CPU_ROW.y, r.w, CPU_ROW.h, { color: r.color, size: 17, disabled: r.off, sound: r.sound ?? 'none' })) r.fn();
    x += r.w + gap;
  }
  // host controls
  const h = hostId(s);
  if (!h || !mine.has(h)) return;
  const dev = deviceOf(h);
  const kind = OPTIONS[s.selection].kind;
  if (kind === 'board') {
    if (button(ctx, '◀', PICK.prev.x, PICK.y, PICK.prev.w, PICK.h, { color: '#9a5bff', size: 24 })) input.nudge(dev, -1, 0);
    if (button(ctx, '▶', PICK.next.x, PICK.y, PICK.next.w, PICK.h, { color: '#9a5bff', size: 24 })) input.nudge(dev, 1, 0);
    if (button(ctx, '−', STEP.minus.x, STEP.minus.y, STEP.minus.w, STEP.minus.h, { color: '#2f8cff', size: 30, disabled: s.turnsIdx === 0 })) input.nudge(dev, 0, 1);
    if (button(ctx, '+', STEP.plus.x, STEP.plus.y, STEP.plus.w, STEP.plus.h, { color: '#2f8cff', size: 30, disabled: s.turnsIdx === TURN_OPTIONS.length - 1 })) input.nudge(dev, 0, -1);
  }
  if (kind === 'mix') {
    // click a mode tab: up/down steps toward it (so it works online too)
    MIX_TABS.forEach((r, i) => {
      if (i !== (s.mixMode ?? 0) && clicked(r.x, r.y, r.w, r.h)) input.nudge(dev, 0, ((i - (s.mixMode ?? 0) + 3) % 3) === 1 ? 1 : -1);
    });
    if (button(ctx, '−', STEP.minus.x, STEP.minus.y, STEP.minus.w, STEP.minus.h, { color: '#2f8cff', size: 30, disabled: s.roundsIdx === 0 })) input.nudge(dev, -1, 0);
    if (button(ctx, '+', STEP.plus.x, STEP.plus.y, STEP.plus.w, STEP.plus.h, { color: '#2f8cff', size: 30, disabled: s.roundsIdx === ROUND_OPTIONS.length - 1 })) input.nudge(dev, 1, 0);
  }
  if (session.kind === 'online') {
    for (const tab of ONLINE_TABS) if (tab.kind !== kind && clicked(tab.x, tab.y, tab.w, tab.h)) tabPick = { kind: tab.kind, until: performance.now() + 3000, next: 0 };
    if (tabPick) {
      if (tabPick.kind === kind || performance.now() > tabPick.until) tabPick = null;
      else if (performance.now() > tabPick.next) {
        input.start(dev);
        sfx.move();
        tabPick.next = performance.now() + 300;
      }
    }
  }
  // Free Play: click a tile to pick it (the stick walks there a step at a time, so it works online too)
  if (kind === 'game') {
    for (const tile of gridTiles(s)) if (tile.opt !== s.selection && clicked(tile.x, tile.y, tile.w, tile.h)) gridPick = { opt: tile.opt, until: performance.now() + 4000 };
  }
  if (gridPick) {
    const list = optionsOfKind('game');
    const at = list.indexOf(s.selection), want = list.indexOf(gridPick.opt);
    if (at < 0 || want < 0 || at === want || performance.now() > gridPick.until || kind !== 'game') gridPick = null;
    else if (s.navCooldown === 0 && performance.now() > gridNudgeAt) {
      const dr = Math.floor(want / GRID_COLS) - Math.floor(at / GRID_COLS);
      if (dr) input.nudge(dev, 0, Math.sign(dr));
      else input.nudge(dev, Math.sign(want - at), 0);
      gridNudgeAt = performance.now() + 140;
    }
  }
  if (button(ctx, 'START!', START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, { color: '#21c45a', size: 34, disabled: !s.players.length })) input.tap(dev, 'a');
}

function renderScreens(wallT: number, dt: number) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (!session && customize) {
    bar.classList.add('hidden');
    const cz = customize;
    const view = stage.show('customize', () => customizeView(stage.env, () => (customize ?? cz).dressing()));
    view.update(null, [], wallT, dt);
    stage.render(dt, wallT);
    if (cz.draw(ctx, wallT) === 'back') closeCustomize();
    if (stage.switches !== seenSwitches) {
      if (seenSwitches > 0) wipeT = 0;
      seenSwitches = stage.switches;
    }
    drawWipe(dt);
    return;
  }
  if (!session) {
    bar.classList.add('hidden');
    const view = stage.show('main-menu', () => mainMenuView(stage.env, () => menu.screen));
    view.update(null, [], wallT, dt);
    stage.render(dt, wallT);
    menu.draw(ctx, wallT);
    settingsButton(wallT);
    if (stage.switches !== seenSwitches) {
      if (seenSwitches > 0) wipeT = 0;
      seenSwitches = stage.switches;
    }
    drawWipe(dt);
    return;
  }
  const s = session.view();
  if (s) {
    setCharacters(s.players);
    setOutlined(s.players, session.localIds());
  }
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
  } else if (s.phase === 'lobby' && opt?.kind === 'game') {
    // a minigame is picked: show it being played by CPU stand-ins
    const g = getGame(opt.id);
    const who = s.players.slice(0, g.maxPlayers).map((p) => ({ ...p }));
    // too few people for this game (or nobody yet)? CPU stand-ins fill the preview
    const want = Math.min(g.maxPlayers, Math.max(g.minPlayers, 4));
    for (const color of PLAYER_COLORS) {
      if (who.length >= want) break;
      if (who.some((p) => p.color === color)) continue;
      const slot = PLAYER_COLORS.indexOf(color);
      who.push({ id: `pv${slot}`, name: CHARACTERS[slot]?.name ?? 'CPU', color, slot, bot: 'hard' });
    }
    const gv = gamePreview(stage.env, `lobby:${opt.id}:${who.map((p) => p.color).join(',')}`, opt.id, who);
    if (gv) {
      gv.update(null, [], wallT, dt);
      stage.renderInset(gv, PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h);
    }
    lobbyGameLive = true;
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
  if (lobbyGameLive && !(s.phase === 'lobby' && opt?.kind === 'game')) {
    if (s.phase !== 'intro') clearGamePreview();
    lobbyGameLive = false;
  }
  input.mouseHoldsA = s.phase === 'intro';
  if (names.open && (s.phase !== 'lobby' || !s.players.some((p) => p.id === names.open!.playerId))) names.close(false);
  lastTags = view.tags();
  drawTags(lastTags);
  if (stage.switches !== seenSwitches) {
    // skip the wipe for the very first scene
    if (seenSwitches > 0) wipeT = 0;
    seenSwitches = stage.switches;
  }

  const sc = { status: session.status(), roomCode: session.roomCode(), online: session.kind === 'online' };
  switch (s.phase) {
    case 'lobby':
      drawLobby(ctx, s, sc, wallT);
      if (names.open) {
        const who = s.players.find((p) => p.id === names.open!.playerId);
        names.draw(ctx, dt, who?.name ?? '', !names.open.device.startsWith('kb'));
      } else lobbyButtons(s);
      break;
    case 'board':
      bakeItemIcons(stage.renderer);
      drawBoardHud(ctx, s, wallT, mapCam.on);
      hostCorner(ctx, hostLine, wallT, 'br', 340, 70);
      // mouse / touch: clickable board menus, path markers and tour buttons
      boardPointer(ctx, s, input, session.localIds(), (v) => stage.project(v), mapCam.on);
      break;
    case 'intro': {
      drawIntro(ctx, s, wallT);
      // mouse: the host gets a Start now button (same as X)
      const h = hostId(s);
      if (h && session.localIds().has(h) && button(ctx, 'Start now', INTRO_START.x, INTRO_START.y, INTRO_START.w, INTRO_START.h, { color: '#ff8a1f', size: 17 })) input.tap(deviceOf(h), 'x');
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

/** Round cog button in the main menu's top-right corner: opens Settings. */
function settingsButton(t: number) {
  if (settings.open || ost.open || !joinBox.classList.contains('hidden') || netDialogOpen()) return;
  const x = 1196, y = 16, w = 68, h = 60;
  if (button(ctx, '', x, y, w, h, { color: '#6b6f86', sound: 'none' })) act('settings');
  const over = inside(pointerAt(), x, y, w, h);
  gear(ctx, x + w / 2, y + h / 2 + (over ? -2 : 1), 17, t * (over ? 1.4 : 0.3));
}

/* ---------- pause menu (Start / Esc / P), shared by everyone in the room */
let seenQuit = -1;
/** How many times the pause menu's Settings row was picked (so this screen opens the panel once each). */
let seenPauseSettings = 0;
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
    seenPauseSettings = 0;
    // small pause button for mouse players
    const dev = pauseDevice();
    if (dev && s.phase !== 'intro' && !touch.visible && button(ctx, 'II', 1220, 668, 44, 40, { color: '#6b6f86', size: 18, sound: 'none' })) input.start(dev);
    return;
  }
  const who = s.players.find((x) => x.id === p.by);
  const mine = !!session?.localIds().has(p.by);
  // the pauser picked Settings: open the panel on their screen (it is local; the pause stays up)
  if ((p.settings ?? 0) > seenPauseSettings) {
    seenPauseSettings = p.settings ?? 0;
    if (mine) settings.show();
  }
  ctx.fillStyle = 'rgba(14,8,32,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(ctx, 400, 112, 480, 496, 30);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 6;
  ctx.stroke();
  text(ctx, 'PAUSED', 640, 160, 48, { color: '#2a1b5e', outline: false });
  text(ctx, `${who?.name ?? 'Someone'} paused the game`, 640, 202, 18, { color: who?.color ?? '#6b5aa8', outline: false, weight: 700 });
  if (settings.open) return;
  pausePointer(s, input, mine);
  if (p.help) {
    const g = s.phase === 'board' ? null : s.gameId ? getGame(s.gameId) : null;
    const lines = g
      ? [g.name, ...wrap(g.blurb, 40), '', localizeControls(g.controls)]
      : ['Board game', 'Roll the dice with A. B opens your item bag.', 'Pick a path at forks with the stick.', 'Buy Chobglobs at the Chobglob Chest', 'for 40 Pit Coin. Most Chobglobs wins!'];
    lines.forEach((l, i) => text(ctx, l, 640, PAUSE_ROW_Y + i * 30, i === 0 ? 24 : 18, { color: i === 0 ? '#ff4d5a' : '#2a1b5e', outline: false, weight: i === 0 ? 900 : 600 }));
    text(ctx, mine ? `${A()} or ${B()}: back` : `Waiting for ${who?.name ?? 'them'}`, 640, 576, 18, { color: '#6b5aa8', outline: false, weight: 700 });
    return;
  }
  const host = hostId(s) === p.by;
  PAUSE_OPTIONS.forEach((label, i) => {
    const y = PAUSE_ROW_Y + i * PAUSE_ROW_H;
    const sel = i === p.sel;
    const off = label.startsWith('End party') && !host;
    ctx.fillStyle = sel ? '#ffd23f' : '#efeaff';
    roundRect(ctx, 450, y - 24, 380, 48, 16);
    ctx.fill();
    text(ctx, off ? 'End party (host only)' : label, 640, y, 22, { color: off ? '#a99fcf' : '#2a1b5e', outline: false, weight: 800 });
  });
  text(ctx, mine ? `${STICK()} choose   ${A()} pick   ${B()} / ${START()} resume` : `Only ${who?.name ?? 'they'} can use this menu`, 640, 576, 17, { color: '#6b5aa8', outline: false, weight: 700 });
  // mouse / touch: click a row to pick it, Resume to close
  pauseHover(ctx, s);
  if (mine && !touch.visible && button(ctx, 'Resume', 1110, 668, 150, 40, { color: '#4cd97b', size: 18, sound: 'none' })) input.start(deviceOf(p.by));
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
        hostLine.say('The final turns are upon us. Coin and Heart Spaces now pay double.', 'wow');
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
  if (screen === 'results' || screen === 'final' || screen === 'intro') hostCorner(ctx, hostLine, t, 'bl', screen === 'intro' ? 400 : 500);
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
    // far enough that even the last band ends fully off the left edge
    const x0 = -200 + i * bandW * 0.5 - e * (VIEW_W + 1150);
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
  get settings() {
    return settings;
  },
  /** Test helper: where each player tag is on screen (catches things leaving the camera). */
  tagSpots() {
    return lastTags.map((t) => ({ text: t.text, ...stage.project(t.pos) }));
  },
  OPTIONS,
  BOARDS,
  /** Test helper: fill local lobby seats with idle players. */
  addBots(n: number) {
    const st = (session as any)?.state;
    for (let i = 0; i < n && st; i++) addPlayer(st, `bot${i}`);
  },
  /** Test helper: open a local lobby on option `sel` with `n` CPUs and start it. */
  play(sel: number, n = 4, level: BotLevel = 'normal') {
    enter(new LocalSession(input, sel));
    const st = (session as any).state;
    for (let i = 0; i < n; i++) addBot(st, level);
    startParty(st);
  },
  /** Test helper: open a local lobby on option `sel` with `n` CPUs, without starting. */
  lobby(sel: number, n = 0, level: BotLevel = 'normal') {
    enter(new LocalSession(input, sel));
    const st = (session as any).state;
    for (let i = 0; i < n; i++) addBot(st, level);
  },
  /** Test helper: start whatever is selected in a local lobby. */
  start() {
    const st = (session as any)?.state;
    if (st) startParty(st);
  },
};
