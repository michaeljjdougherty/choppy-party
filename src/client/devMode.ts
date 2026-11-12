import * as THREE from 'three';
import type { GrabEvent, InputManager } from './input';
import { roundRect, text } from '../shared/draw';
import { button, clicked, inside, pointerAt, takeStrayClick } from './ui';
import { A, B, STICK, isTouch, promptKind } from './prompts';
import { sfx } from './sfx';
import { BOARDS, getBoard } from '../shared/board/boards';
import { GAMES, getGame } from '../shared/games';
import { ITEMS, ITEM_IDS } from '../shared/board/items';
import { addBot, OPTIONS, removeBot, startParty, type PartyState } from '../shared/party';
import { currentPlayer } from '../shared/board/engine';
import { LocalSession, type Session } from './session';
import { lightLook, type LightLook } from './three/stage';
import { mapCam, openMap, closeMap } from './mapCam';
import * as dev from '../shared/dev';

/**
 * Developer mode, for trying things out by hand: load any board or minigame with CPUs, teleport
 * players, flip day and night, summon events, load the dice, change the game speed and lighting.
 * It sits behind a code (asked once per browser tab) and is opened from Settings, or with the
 * backquote key (`) once it's unlocked. Everything in here only changes local games.
 */
const CODE = 'fuck-kurn';
const UNLOCK_KEY = 'choppy.dev';

export interface DevHooks {
  session(): Session | null;
  /** Start a new session in place of the current one. */
  enter(s: Session): void;
  /** The device that should play: the pad or keyboard that's being used. */
  device(): string;
  /** HUD position of a point in the 3D scene. */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean };
}

type Tab = 'Load' | 'Board' | 'Events' | 'Player' | 'Crust Game' | 'View';
const TABS: Tab[] = ['Load', 'Board', 'Events', 'Player', 'Crust Game', 'View'];

interface Row {
  label: string;
  /** What the row is set to (shown in the middle). */
  value?: () => string;
  /** ◀ / ▶ */
  step?: (dir: number) => void;
  /** The row's button (A presses it). */
  act?: () => void;
  actLabel?: string;
  /** Off rows are greyed out and say why. */
  off?: () => string | null;
  color?: string;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const LOOKS: LightLook[] = ['auto', 'day', 'dusk', 'night'];
const LOOK_NAME: Record<LightLook, string> = { auto: 'Normal', day: 'Bright day', dusk: 'Dusk', night: 'Night' };

const P = { x: 120, y: 30, w: 1040, h: 660 };
const TAB_Y = P.y + 118;
const ROW_Y0 = P.y + 186;
const ROW_H = 54;
const VAL = { x: P.x + 400, w: 330 };
const ACT = { x: P.x + 760, w: 250 };

const wrapI = (i: number, n: number) => ((i % n) + n) % n;

export class DevMode {
  open = false;
  entering = false;
  /** Picking a space on the board (for a teleport or the chest). */
  picking: { purpose: 'teleport' | 'chest'; sel: number; nodes: string[] } | null = null;
  hideHud = false;
  info = false;
  freeze = true;
  private tab = 0;
  /** -1 = the tab bar. */
  private sel = -1;
  private bump = 0;
  private openedAt = 0;
  private shake = 0;
  private wrong = '';
  private field: HTMLInputElement | null = null;
  private onClose: (() => void) | null = null;
  // settings for the tools
  private boardIdx = 0;
  private cpus = 3;
  private turns = 10;
  private skipIntro = true;
  private gameIdx = 0;
  private nextIdx = -1;
  private who = 0;
  private item = 0;
  private dice = 0;
  private speed = 2;
  private land = true;
  /** Players developer mode handed to a CPU, so they can be handed back. */
  private botted = new Map<string, PartyState['players'][number]['bot']>();
  private fps = 60;

  constructor(
    private input: InputManager,
    private hooks: DevHooks,
  ) {}

  get unlocked(): boolean {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === '1';
    } catch {
      return this.unlockedHere;
    }
  }
  private unlockedHere = false;
  private setUnlocked(on: boolean): void {
    this.unlockedHere = on;
    try {
      if (on) sessionStorage.setItem(UNLOCK_KEY, '1');
      else sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* private mode: unlocked until the page reloads */
    }
  }

  /** True while any part of developer mode wants the controls. */
  get busy(): boolean {
    return this.open || this.entering || !!this.picking;
  }

  /** From Settings: ask for the code, or open the panel if it's already unlocked. */
  show(onClose?: () => void): void {
    this.onClose = onClose ?? null;
    if (this.unlocked) this.openPanel();
    else this.askCode();
  }

  private askCode(): void {
    this.entering = true;
    this.wrong = '';
    this.openedAt = performance.now();
    this.input.grab = (e) => {
      if (e.kind === 'b') this.cancelCode();
    };
    takeStrayClick();
    sfx.select();
    const f = document.createElement('input');
    f.type = 'text';
    f.autocomplete = 'off';
    f.autocapitalize = 'off';
    f.spellcheck = false;
    f.placeholder = 'Enter code';
    f.setAttribute('aria-label', 'Developer code');
    Object.assign(f.style, {
      position: 'fixed',
      zIndex: '50',
      font: '700 22px system-ui, sans-serif',
      textAlign: 'center',
      border: '4px solid #ffd23f',
      borderRadius: '14px',
      outline: 'none',
      background: '#ffffff',
      color: '#2a1b5e',
      padding: '0 12px',
      boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    f.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.submitCode();
      else if (e.key === 'Escape') this.cancelCode();
    });
    document.body.appendChild(f);
    this.field = f;
    setTimeout(() => f.focus(), 0);
  }

  private submitCode(): void {
    const v = (this.field?.value ?? '').trim().toLowerCase();
    if (v === CODE) {
      this.setUnlocked(true);
      this.dropField();
      this.entering = false;
      sfx.join();
      this.openPanel();
    } else {
      this.wrong = v ? 'Wrong code' : 'Type the code first';
      this.shake = 1;
      sfx.back();
      if (this.field) this.field.value = '';
    }
  }

  private cancelCode(): void {
    this.dropField();
    this.entering = false;
    this.input.grab = null;
    sfx.back();
    this.finish();
  }

  private dropField(): void {
    this.field?.remove();
    this.field = null;
  }

  private finish(): void {
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }

  openPanel(): void {
    this.open = true;
    this.entering = false;
    this.openedAt = performance.now();
    this.input.grab = (e) => this.handle(e);
    takeStrayClick();
    // opened from the pause menu: the pause goes away, so the tools act straight away
    const ls = this.local();
    if (ls) ls.raw().pause = null;
    // start on the tab that fits what's on screen
    const s = this.state();
    if (s?.phase === 'board') this.tab = TABS.indexOf('Board');
    else if (s?.phase === 'play' || s?.phase === 'intro') this.tab = TABS.indexOf('Crust Game');
    else this.tab = 0;
    this.sel = -1;
    // the player tools start on whoever's turn it is
    if (s?.board) this.who = Math.max(0, s.players.findIndex((p) => p.id === currentPlayer(s.board!)));
    if (s?.board) this.boardIdx = Math.max(0, BOARDS.findIndex((b) => b.id === s.board!.boardId));
    sfx.select();
    this.syncFreeze();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.input.grab = null;
    sfx.back();
    this.syncFreeze();
    this.finish();
  }

  /** Backquote: open or close the panel (only once unlocked). */
  toggle(): void {
    if (this.picking) return this.endPick();
    if (this.open) this.close();
    else if (this.unlocked && !this.entering) this.openPanel();
  }

  private local(): LocalSession | null {
    const s = this.hooks.session();
    return s instanceof LocalSession ? s : null;
  }
  private state(): PartyState | null {
    return this.local()?.raw() ?? this.hooks.session()?.view() ?? null;
  }
  private syncFreeze(): void {
    const l = this.local();
    if (l) l.frozen = this.freeze && this.busy;
  }

  // ---- the rows -------------------------------------------------------------------------------

  private rows(): Row[] {
    const s = this.local()?.raw() ?? null;
    const b = s?.board ?? null;
    const def = b ? getBoard(b.boardId) : null;
    const needLocal = () => (!this.local() ? 'Only in local games' : null);
    const needBoard = () => needLocal() ?? (s?.phase !== 'board' || !b ? 'Load a board first' : null);
    const needIdle = () => needBoard() ?? (!dev.boardIdle(b) ? 'Wait for the next roll' : null);
    const needGame = () => needLocal() ?? (s?.phase !== 'play' && s?.phase !== 'intro' ? 'No Crust Game on right now' : null);
    const who = () => (s ? s.players[wrapI(this.who, s.players.length)] : undefined);
    const whoId = () => who()?.id ?? '';
    const bp = () => (b ? b.players[whoId()] : undefined);
    const tab = TABS[this.tab];
    if (tab === 'Load') {
      const g = GAMES[this.gameIdx];
      return [
        { label: 'Board', value: () => BOARDS[this.boardIdx].name, step: (d) => (this.boardIdx = wrapI(this.boardIdx + d, BOARDS.length)) },
        { label: 'CPU players', value: () => `${this.cpus}`, step: (d) => (this.cpus = Math.max(1, Math.min(9, this.cpus + d))) },
        { label: 'Turns', value: () => `${this.turns}`, step: (d) => (this.turns = Math.max(1, Math.min(50, this.turns + d))) },
        { label: 'Skip tour and order roll', value: () => (this.skipIntro ? 'On' : 'Off'), step: () => (this.skipIntro = !this.skipIntro) },
        { label: 'Load the board', act: () => this.loadBoard(), actLabel: 'Load board', color: '#21c45a' },
        {
          label: 'Crust Game',
          value: () => `${g.name}`,
          step: (d) => (this.gameIdx = wrapI(this.gameIdx + d, GAMES.length)),
        },
        { label: `Play it (${g.mode}, ${g.minPlayers}-${g.maxPlayers} players)`, act: () => this.loadGame(g.id), actLabel: 'Play Crust Game', color: '#2f8cff' },
        { label: 'A random Crust Game', act: () => this.loadGame(GAMES[Math.floor(Math.random() * GAMES.length)].id), actLabel: 'Surprise me', color: '#9a5bff' },
      ];
    }
    if (tab === 'Board') {
      const night = def?.theme === 'court' ? (b?.choppy ? 'Choppy Verse' : 'Fucci Verse') : b?.night ? 'Night' : 'Day';
      return [
        { label: 'Teleport', value: () => who()?.name ?? '-', step: (d) => (this.who += d), act: () => this.startPick('teleport'), actLabel: 'Pick a space', off: needBoard, color: '#2f8cff' },
        {
          label: 'When they arrive',
          value: () => (this.land ? 'Land on it' : 'Just stand there'),
          step: () => (this.land = !this.land),
          off: needBoard,
        },
        {
          label: def?.theme === 'court' ? 'Verse (day / night)' : 'Day / night',
          value: () => night,
          act: () => dev.devFlipTime(s!),
          actLabel: def?.theme === 'court' ? 'Flip the verse' : 'Flip',
          off: needBoard,
          color: '#ff8a1f',
        },
        { label: 'Chobglob Chest', act: () => dev.devMoveChest(s!), actLabel: 'Move it', off: needBoard, color: '#e0a800' },
        { label: 'Put the chest on a space', act: () => this.startPick('chest'), actLabel: 'Pick a space', off: needBoard, color: '#e0a800' },
        { label: 'Turn', value: () => (b ? `${b.turn} / ${b.maxTurns}` : '-'), step: (d) => dev.devSetTurn(s!, (b?.turn ?? 1) + d), off: needBoard },
        { label: 'Game length', value: () => (b ? `${b.maxTurns} turns` : '-'), step: (d) => dev.devSetMaxTurns(s!, (b?.maxTurns ?? 10) + d), off: needBoard },
        { label: 'End the game', act: () => (dev.devEndBoard(s!), this.close()), actLabel: 'Go to the finale', off: needBoard, color: '#ff4d5a' },
      ];
    }
    if (tab === 'Events') {
      const next = () => (this.nextIdx < 0 ? 'Random' : GAMES[this.nextIdx].name);
      return [
        {
          label: def?.boss ? `${def.boss.name} now` : 'Board villain now',
          act: () => (dev.devBoss(s!), this.close()),
          actLabel: 'Summon',
          off: () => needIdle() ?? (!def?.boss ? 'Only on Stew Court' : null),
          color: '#ff3b4e',
        },
        { label: 'Mister Chunk now', act: () => (dev.devChunk(s!), this.close()), actLabel: 'Summon', off: needIdle, color: '#ff3b4e' },
        { label: 'Duel now', act: () => (dev.devDuel(s!), this.close()), actLabel: 'Start duel', off: needIdle, color: '#ff9f1c' },
        { label: 'Stew Battle now', act: () => (dev.devStew(s!), this.close()), actLabel: 'Start battle', off: needIdle, color: '#ff9f1c' },
        { label: 'End the round (hazards go off)', act: () => (dev.devRoundEnd(s!), this.close()), actLabel: 'End round', off: needIdle, color: '#9a5bff' },
        {
          label: 'Crust Game',
          value: next,
          step: (d) => (this.nextIdx = this.nextIdx + d < -1 ? GAMES.length - 1 : this.nextIdx + d >= GAMES.length ? -1 : this.nextIdx + d),
          off: needBoard,
        },
        {
          label: 'Play it now, then come back',
          act: () => (dev.devPlayGame(s!, this.nextIdx < 0 ? dev.randomGameId(s!) : GAMES[this.nextIdx].id), this.close()),
          actLabel: 'Play now',
          off: needIdle,
          color: '#2f8cff',
        },
        {
          label: 'Make it the next round',
          value: () => (s?.devNext ? getGame(s.devNext).name : 'Not set'),
          act: () => {
            if (s) s.devNext = this.nextIdx < 0 ? dev.randomGameId(s) : GAMES[this.nextIdx].id;
          },
          actLabel: 'Queue it',
          off: needBoard,
          color: '#21c45a',
        },
      ];
    }
    if (tab === 'Player') {
      return [
        { label: 'Player', value: () => (who() ? `${who()!.name}${s?.board && whoId() === currentPlayer(s.board) ? ' (their turn)' : ''}` : '-'), step: (d) => (this.who += d), off: needLocal },
        { label: 'Pit Coin   ◀ -10   ▶ +10', value: () => `${bp()?.keys ?? '-'}`, step: (d) => dev.devCoins(s!, whoId(), d * 10), act: () => dev.devCoins(s!, whoId(), 100), actLabel: '+100', off: needBoard, color: '#e0a800' },
        { label: 'Chobglobs   ◀ -1   ▶ +1', value: () => `${bp()?.crowns ?? '-'}`, step: (d) => dev.devGlobs(s!, whoId(), d), off: needBoard },
        {
          label: 'HP   ◀ -10 damage   ▶ heal',
          value: () => (bp() ? `${bp()!.hp} / ${b!.preset.maxHp}` : '-'),
          step: (d) => (d < 0 ? dev.devDamage(s!, whoId(), 10) : dev.devHeal(s!, whoId())),
          act: () => dev.devDamage(s!, whoId(), 999),
          actLabel: 'Knock out',
          off: needBoard,
          color: '#ff4d5a',
        },
        {
          label: 'Item',
          value: () => ITEMS[ITEM_IDS[this.item]].name,
          step: (d) => (this.item = wrapI(this.item + d, ITEM_IDS.length)),
          act: () => dev.devGiveItem(s!, whoId(), ITEM_IDS[this.item]),
          actLabel: 'Give it',
          off: needBoard,
          color: '#21c45a',
        },
        { label: 'Bag', value: () => (bp()?.items.map((i) => ITEMS[i].name).join(', ') || 'Empty'), act: () => dev.devFillItems(s!, whoId()), actLabel: 'Fill with random', off: needBoard, color: '#21c45a' },
        {
          label: 'Loaded dice (everyone)',
          value: () => (b?.devDice?.length ? b.devDice.join(' + ') : 'Fair dice'),
          step: (d) => {
            this.dice = wrapI(this.dice + d, 37);
            dev.devDice(s!, this.dice === 0 ? null : [Math.ceil(this.dice / 6), ((this.dice - 1) % 6) + 1]);
          },
          off: needBoard,
        },
        {
          label: 'CPU plays for them',
          value: () => (who()?.bot ? (this.botted.has(whoId()) ? 'On' : 'Always a CPU') : 'Off'),
          step: () => this.toggleBot(),
          off: () => needLocal() ?? (who()?.bot && !this.botted.has(whoId()) ? 'That one is a CPU' : null),
        },
      ];
    }
    if (tab === 'Crust Game') {
      const cur = s?.gameId ? getGame(s.gameId) : null;
      return [
        { label: 'Playing now', value: () => cur?.name ?? 'Nothing', off: needGame },
        { label: 'Switch to', value: () => GAMES[this.gameIdx].name, step: (d) => (this.gameIdx = wrapI(this.gameIdx + d, GAMES.length)), act: () => (dev.devPlayGame(s!, GAMES[this.gameIdx].id), this.close()), actLabel: 'Switch', off: needGame, color: '#2f8cff' },
        { label: 'Switch to a random one', act: () => (dev.devPlayGame(s!, dev.randomGameId(s!, Math.max(2, s!.gamePlayers?.length ?? s!.players.length))), this.close()), actLabel: 'Surprise me', off: needGame, color: '#9a5bff' },
        { label: 'Skip the intro', act: () => (dev.devSkipIntro(s!), this.close()), actLabel: 'Start now', off: () => needGame() ?? (s?.phase !== 'intro' ? 'Already playing' : null), color: '#21c45a' },
        { label: 'Start it over', act: () => (dev.devRestartGame(s!), this.close()), actLabel: 'Restart', off: needGame, color: '#ff8a1f' },
        { label: 'End it now (standings as they are)', act: () => (dev.devEndGame(s!), this.close()), actLabel: 'End now', off: needGame, color: '#ff4d5a' },
      ];
    }
    // View
    return [
      {
        label: 'Game speed',
        value: () => `${SPEEDS[this.speed]}x`,
        step: (d) => {
          this.speed = Math.max(0, Math.min(SPEEDS.length - 1, this.speed + d));
          const l = this.local();
          if (l) l.speed = SPEEDS[this.speed];
        },
        off: needLocal,
      },
      { label: 'Lighting', value: () => LOOK_NAME[lightLook.mode], step: (d) => (lightLook.mode = LOOKS[wrapI(LOOKS.indexOf(lightLook.mode) + d, LOOKS.length)]) },
      { label: 'Hide the HUD (for screenshots)', value: () => (this.hideHud ? 'Hidden' : 'Shown'), step: () => (this.hideHud = !this.hideHud) },
      { label: 'Debug info', value: () => (this.info ? 'On' : 'Off'), step: () => (this.info = !this.info) },
      { label: 'Freeze the game while this is open', value: () => (this.freeze ? 'On' : 'Off'), step: () => ((this.freeze = !this.freeze), this.syncFreeze()) },
      { label: 'Free camera', act: () => (this.close(), this.freeCam()), actLabel: 'Open map view', off: needBoard, color: '#3fa9f5' },
      { label: 'Lock developer mode', act: () => (this.setUnlocked(false), this.close()), actLabel: 'Lock', color: '#6b6f86' },
    ];
  }

  /** Main menu or lobby: start a board with CPUs, straight away. */
  private loadBoard(): void {
    const id = BOARDS[this.boardIdx].id;
    const opt = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === id);
    const st = this.fresh(opt);
    st.autoPick = false;
    startParty(st);
    if (st.board) {
      st.board.maxTurns = this.turns;
      if (this.skipIntro) dev.devSkipBoardIntro(st);
    }
    this.close();
  }

  private loadGame(id: string): void {
    const opt = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === id);
    const st = this.fresh(opt);
    const g = getGame(id);
    // fit the head count to what the game takes
    while (st.players.length < g.minPlayers && addBot(st, 'normal'));
    while (st.players.length > g.maxPlayers && removeBot(st));
    startParty(st);
    dev.devSkipIntro(st);
    this.close();
  }

  private fresh(opt: number): PartyState {
    const ls = new LocalSession(this.input, Math.max(0, opt));
    this.hooks.enter(ls);
    ls.join(this.hooks.device());
    const st = ls.raw();
    st.selection = Math.max(0, opt);
    for (let i = 0; i < this.cpus; i++) addBot(st, 'normal');
    ls.speed = SPEEDS[this.speed];
    this.botted.clear();
    return st;
  }

  private toggleBot(): void {
    const s = this.local()?.raw();
    if (!s) return;
    const p = s.players[wrapI(this.who, s.players.length)];
    if (!p) return;
    if (this.botted.has(p.id)) {
      p.bot = undefined;
      this.botted.delete(p.id);
    } else if (!p.bot) {
      this.botted.set(p.id, p.bot);
      p.bot = 'hard';
    }
  }

  private freeCam(): void {
    openMap();
    this.input.capture = true;
  }

  // ---- picking a space ------------------------------------------------------------------------

  private startPick(purpose: 'teleport' | 'chest'): void {
    const s = this.local()?.raw();
    const b = s?.board;
    if (!b) return;
    const def = getBoard(b.boardId);
    const nodes = Object.keys(def.nodes);
    const from = purpose === 'teleport' ? b.players[s!.players[wrapI(this.who, s!.players.length)]?.id]?.node : b.crowns[0];
    this.open = false;
    this.picking = { purpose, sel: Math.max(0, nodes.indexOf(from ?? '')), nodes };
    this.input.grab = (e) => this.handlePick(e);
    openMap();
    mapCam.pitch = 1.3;
    takeStrayClick();
    sfx.select();
    this.syncFreeze();
  }

  private handlePick(e: GrabEvent): void {
    const pk = this.picking;
    if (!pk) return;
    if (e.kind === 'b') return this.endPick();
    if (e.kind !== 'move') return this.pickSpace(pk.nodes[pk.sel]);
    const mx = e.x, my = e.y;
    // the stick hops to the nearest space in that direction on screen
    const s = this.local()?.raw();
    const def = s?.board ? getBoard(s.board.boardId) : null;
    if (!def) return;
    const here = this.screenOf(def, pk.nodes[pk.sel]);
    let best = -1;
    let bestScore = Infinity;
    pk.nodes.forEach((id, i) => {
      if (i === pk.sel) return;
      const p = this.screenOf(def, id);
      if (!p.visible) return;
      const dx = p.x - here.x, dy = p.y - here.y;
      const along = dx * mx + dy * my;
      if (along <= 4) return;
      const side = Math.abs(dx * my - dy * mx);
      const score = along + side * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      pk.sel = best;
      sfx.move();
    }
  }

  private pickSpace(node: string): void {
    const pk = this.picking;
    const s = this.local()?.raw();
    if (!pk || !s) return;
    if (pk.purpose === 'chest') dev.devMoveChest(s, node);
    else {
      const p = s.players[wrapI(this.who, s.players.length)];
      if (p) dev.devTeleport(s, p.id, node, this.land);
    }
    sfx.join();
    this.endPick();
  }

  private endPick(): void {
    this.picking = null;
    this.input.grab = null;
    closeMap();
    this.syncFreeze();
  }

  private screenOf(def: ReturnType<typeof getBoard>, id: string) {
    const n = def.nodes[id];
    return this.hooks.project(new THREE.Vector3(n.x, n.y + 0.45, n.z));
  }

  // ---- input ------------------------------------------------------------------------------------

  private handle(e: GrabEvent): void {
    if (!this.open) return;
    if (e.kind === 'b') return this.close();
    const rows = this.rows();
    if (e.kind === 'move') {
      if (e.y) {
        this.sel = wrapI(this.sel + 1 + e.y, rows.length + 1) - 1;
        this.bump = 1;
        sfx.move();
      } else if (e.x) {
        if (this.sel < 0) {
          this.tab = wrapI(this.tab + e.x, TABS.length);
          sfx.move();
        } else {
          const r = rows[this.sel];
          if (r?.step && !r.off?.()) {
            r.step(e.x);
            sfx.move();
          }
        }
      }
      return;
    }
    if (this.sel < 0) {
      this.tab = wrapI(this.tab + 1, TABS.length);
      sfx.move();
      return;
    }
    const r = rows[this.sel];
    if (!r || r.off?.()) {
      sfx.back();
      return;
    }
    if (r.act) {
      r.act();
      sfx.select();
    } else if (r.step) {
      r.step(1);
      sfx.move();
    }
  }

  // ---- drawing ----------------------------------------------------------------------------------

  /** Draw whatever is open. Call last, so it sits over everything. */
  draw(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    if (this.info) this.drawInfo(ctx);
    if (this.picking) this.drawPick(ctx, t);
    if (this.entering) this.drawCode(ctx, t, dt);
    if (this.open) this.drawPanel(ctx, t);
    // something replaced the session under the panel
    this.syncFreeze();
  }

  private card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, x + 4, y + 10, w, h, 30);
    ctx.fill();
    ctx.fillStyle = '#1f1640';
    roundRect(ctx, x, y, w, h, 30);
    ctx.fill();
    ctx.strokeStyle = '#39ff88';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  private drawCode(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = Math.sin(t * 60) * 14 * this.shake;
    ctx.fillStyle = 'rgba(14,8,32,0.7)';
    ctx.fillRect(0, 0, 1280, 720);
    const x = 400 + sx, y = 220, w = 480, h = 280;
    this.card(ctx, x, y, w, h);
    text(ctx, 'DEVELOPER MODE', x + w / 2, y + 52, 34, { color: '#39ff88' });
    text(ctx, 'Enter the code to unlock', x + w / 2, y + 92, 17, { color: '#c9c2ea', outline: false, weight: 700 });
    if (this.wrong) text(ctx, this.wrong, x + w / 2, y + 190, 18, { color: '#ff5a5f', outline: false, weight: 800 });
    // the real text box sits over the canvas, so every keyboard (and phone keyboards) can type in it
    const f = this.field;
    if (f) {
      const c = document.getElementById('game') as HTMLCanvasElement | null;
      const r = c?.getBoundingClientRect();
      if (r) {
        const k = r.width / 1280;
        Object.assign(f.style, { left: `${r.left + (x + 60) * k}px`, top: `${r.top + (y + 120) * k}px`, width: `${(w - 120) * k}px`, height: `${48 * k}px`, fontSize: `${22 * k}px` });
      }
    }
    if (button(ctx, 'Unlock', x + w / 2 + 10, y + 214, 150, 46, { color: '#21c45a', size: 19, sound: 'none' })) this.submitCode();
    if (button(ctx, 'Cancel', x + w / 2 - 160, y + 214, 150, 46, { color: '#6b6f86', size: 19, sound: 'none' })) this.cancelCode();
    takeStrayClick();
  }

  private drawPanel(ctx: CanvasRenderingContext2D, t: number): void {
    this.bump = Math.max(0, this.bump - 0.08);
    ctx.fillStyle = 'rgba(8,4,20,0.6)';
    ctx.fillRect(0, 0, 1280, 720);
    this.card(ctx, P.x, P.y, P.w, P.h);
    text(ctx, 'DEVELOPER MODE', P.x + P.w / 2, P.y + 40, 34, { color: '#39ff88' });
    const l = this.local();
    const sub = !this.hooks.session() ? 'Main menu' : !l ? 'Online game: only the Load tab works here' : l.raw().phase === 'board' ? `On ${getBoard(l.raw().board!.boardId).name}` : `In a local game (${l.raw().phase})`;
    text(ctx, sub, P.x + P.w / 2, P.y + 78, 15, { color: '#c9c2ea', outline: false, weight: 700 });
    if (button(ctx, '✕', P.x + P.w - 66, P.y + 18, 46, 42, { color: '#6b6f86', size: 20, sound: 'none' })) return this.close();

    const ptr = pointerAt();
    const mouse = promptKind() === 'mouse' && !isTouch();
    const fresh = performance.now() - this.openedAt < 150;
    // tabs
    const tw = (P.w - 60 - (TABS.length - 1) * 8) / TABS.length;
    TABS.forEach((name, i) => {
      const x = P.x + 30 + i * (tw + 8);
      const on = i === this.tab;
      ctx.fillStyle = on ? '#39ff88' : '#33295e';
      roundRect(ctx, x, TAB_Y - 22, tw, 44, 14);
      ctx.fill();
      if (this.sel < 0 && on) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      text(ctx, name, x + tw / 2, TAB_Y + 1, 18, { color: on ? '#10301c' : '#ffffff', outline: false, weight: 800 });
      if (!on && clicked(x, TAB_Y - 22, tw, 44)) {
        this.tab = i;
        this.sel = -1;
        sfx.move();
      }
    });

    const rows = this.rows();
    if (this.sel >= rows.length) this.sel = rows.length - 1;
    rows.forEach((r, i) => {
      const y = ROW_Y0 + i * ROW_H;
      const on = i === this.sel;
      const why = r.off?.() ?? null;
      if (!fresh && mouse && inside(ptr, P.x + 30, y - 24, P.w - 60, 48) && this.sel !== i) this.sel = i;
      ctx.fillStyle = on ? '#3d3270' : '#2a2150';
      roundRect(ctx, P.x + 30, y - 24, P.w - 60, 48, 14);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.save();
      if (why) ctx.globalAlpha = 0.45;
      text(ctx, r.label, P.x + 52, y + 1, 18, { align: 'left', color: '#ffffff', outline: false, weight: 800 });
      if (r.value && !(why && !r.act)) {
        const v = r.value();
        if (r.step) {
          if (button(ctx, '◀', VAL.x, y - 18, 40, 36, { color: '#6b5aa8', size: 16, sound: 'none', disabled: !!why })) {
            this.sel = i;
            r.step(-1);
            sfx.move();
          }
          if (button(ctx, '▶', VAL.x + VAL.w - 40, y - 18, 40, 36, { color: '#6b5aa8', size: 16, sound: 'none', disabled: !!why })) {
            this.sel = i;
            r.step(1);
            sfx.move();
          }
        }
        text(ctx, fit(ctx, v, VAL.w - 96), VAL.x + VAL.w / 2, y + 1, 17, { color: '#ffd23f', outline: false, weight: 800 });
      }
      ctx.restore();
      if (r.act) {
        if (button(ctx, r.actLabel ?? 'Go', ACT.x, y - 19, ACT.w, 38, { color: r.color ?? '#2f8cff', size: 17, sound: 'none', disabled: !!why, selected: on })) {
          this.sel = i;
          r.act();
          sfx.select();
        }
      }
      if (why) text(ctx, why, r.act ? ACT.x + ACT.w / 2 : VAL.x + VAL.w / 2, y + 1, 14, { color: '#ff9aa0', outline: false, weight: 800 });
    });

    const k = promptKind();
    const hint =
      k === 'pad'
        ? `${STICK()} choose and change   ·   ${A()} press   ·   ${B()} close`
        : k === 'mouse'
          ? `${isTouch() ? 'Tap' : 'Click'} to use   ·   \` opens this panel any time`
          : `Arrows: choose and change   ·   ${A()}: press   ·   Esc or \`: close`;
    text(ctx, hint, P.x + P.w / 2, P.y + P.h - 24, 15, { color: '#8f86c0', outline: false, weight: 700 });
    void t;
    const stray = takeStrayClick();
    if (stray && !fresh && !inside(stray, P.x, P.y, P.w, P.h)) this.close();
  }

  private drawPick(ctx: CanvasRenderingContext2D, t: number): void {
    const pk = this.picking!;
    const s = this.local()?.raw();
    if (!s?.board || s.phase !== 'board') return this.endPick();
    const def = getBoard(s.board.boardId);
    const ptr = pointerAt();
    // the mouse hovers the nearest space
    let hover = -1;
    let hd = 46;
    const spots = pk.nodes.map((id) => this.screenOf(def, id));
    spots.forEach((p, i) => {
      if (!p.visible || !ptr) return;
      const d = Math.hypot(p.x - ptr.x, p.y - ptr.y);
      if (d < hd) {
        hd = d;
        hover = i;
      }
    });
    if (hover >= 0 && promptKind() === 'mouse') pk.sel = hover;
    spots.forEach((p, i) => {
      if (!p.visible) return;
      const on = i === pk.sel;
      ctx.beginPath();
      ctx.arc(p.x, p.y, on ? 16 + Math.sin(t * 8) * 3 : 7, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(57,255,136,0.5)' : 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.lineWidth = on ? 4 : 2;
      ctx.strokeStyle = on ? '#39ff88' : 'rgba(20,10,50,0.8)';
      ctx.stroke();
    });
    const id = pk.nodes[pk.sel];
    const n = def.nodes[id];
    const at = spots[pk.sel];
    if (at?.visible) text(ctx, `${id} · ${n.type}`, at.x, at.y - 34, 17, { color: '#39ff88', weight: 800 });
    const who = s.players[wrapI(this.who, s.players.length)];
    ctx.fillStyle = 'rgba(20,12,40,0.8)';
    roundRect(ctx, 300, 600, 680, 84, 20);
    ctx.fill();
    const title = pk.purpose === 'chest' ? 'PUT THE CHOBGLOB CHEST ON A SPACE' : `TELEPORT ${who?.name.toUpperCase() ?? ''}${this.land ? ' (THEY LAND ON IT)' : ''}`;
    text(ctx, title, 640, 626, 20, { color: '#39ff88', weight: 900 });
    const k = promptKind();
    const hint = k === 'pad' ? `${STICK()} move   ·   ${A()} pick   ·   ${B()} cancel` : k === 'mouse' ? 'Click a space · drag to turn · wheel to zoom' : `Arrows: move · ${A()}: pick · Esc: cancel`;
    text(ctx, hint, 640, 658, 15, { color: '#ffffff', weight: 600 });
    if (button(ctx, 'Cancel', 1110, 668, 150, 40, { color: '#6b6f86', size: 17, sound: 'none' })) return this.endPick();
    const c = takeStrayClick();
    if (c && hover >= 0) this.pickSpace(pk.nodes[hover]);
  }

  private drawInfo(ctx: CanvasRenderingContext2D): void {
    const s = this.hooks.session()?.view();
    const bits: string[] = [`${Math.round(this.fps)} fps`];
    const l = this.local();
    if (l && l.speed !== 1) bits.push(`speed ${l.speed}x`);
    if (s) {
      bits.push(s.phase);
      const b = s.board;
      if (b && s.phase === 'board') {
        const cur = currentPlayer(b);
        const p = b.players[cur];
        const name = s.players.find((q) => q.id === cur)?.name ?? cur;
        bits.push(`${b.sub}`, `turn ${b.turn}/${b.maxTurns}`, `${name} on ${p?.node} (${p ? getBoard(b.boardId).nodes[p.node]?.type : '?'})`);
        if (b.devDice?.length) bits.push(`dice ${b.devDice.join('+')}`);
        if (b.night) bits.push('night');
        if (b.choppy) bits.push('Choppy Verse');
      }
      if (s.gameId && (s.phase === 'play' || s.phase === 'intro')) bits.push(s.gameId);
      if (s.devNext) bits.push(`next: ${s.devNext}`);
    }
    const line = bits.join('  ·  ');
    ctx.save();
    ctx.font = '700 14px system-ui, sans-serif';
    const w = ctx.measureText(line).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 640 - w / 2, 4, w, 26, 10);
    ctx.fill();
    ctx.restore();
    text(ctx, line, 640, 17, 14, { color: '#39ff88', outline: false, weight: 700 });
  }
}

/** Cut a value down to fit, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, s: string, w: number): string {
  ctx.save();
  ctx.font = '800 17px system-ui, sans-serif';
  let out = s;
  while (out.length > 3 && ctx.measureText(out).width > w) out = out.slice(0, -2);
  ctx.restore();
  return out === s ? s : out.trimEnd() + '…';
}
