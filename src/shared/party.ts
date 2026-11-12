import type { Inputs, PlayerInfo, ResultRow, TickInput } from './types';
import { NO_INPUT } from './types';
import { GAMES, getGame } from './games';
import { CHARACTERS, PLAYER_COLORS, DEFAULT_NAMES } from './players';
import { rand, shuffle, type Rng } from './rng';
import { pickAwards, type Award } from './board/bonus';
import { BOARDS, getBoard, recommendedBoard } from './board/boards';
import { DUEL_GAMES, STEW_GAMES, awardMinigame, boardRanking, createBoard, endBossDance, endTour, finishEvent, BOSS_INTRO, stepBoard, winnerGoesFirst } from './board/engine';
import type { BoardState } from './board/types';
import { addBotInputs, type BotLevel } from './bots';
import type { BotMem } from './botkit';

export const MAX_PLAYERS = 10;
/** Seconds of holding A that ready you up for a minigame. */
export const READY_HOLD = 1;
/** Nobody can stall a minigame intro longer than this. */
export const INTRO_MAX = 90;
export const ROUND_OPTIONS = [3, 5, 10];
/** Minigame Mix flavours: everyone in every game, 1-on-1 duels, or 2-team Stew Battles. */
export const MIX_MODES = ['Classic', 'Duel', 'Stew Battle'] as const;
export const TURN_OPTIONS = [5, 10, 15, 20];

const MODE_RANK: Record<string, number> = { 'Free-for-all': 0, '1-vs-many': 1, Team: 2, Duel: 3 };
/** Everything the host can pick in the lobby, in order. */
export type PartyOption = { kind: 'board'; id: string } | { kind: 'mix' } | { kind: 'game'; id: string };
export const OPTIONS: PartyOption[] = [
  ...BOARDS.map((b) => ({ kind: 'board' as const, id: b.id })),
  { kind: 'mix' },
  // grouped by type, so Free Play reads free-for-all, 1-vs-many, team, then 1v1 duels
  ...GAMES.map((g, i) => ({ g, i }))
    .sort((a, b) => MODE_RANK[a.g.mode] - MODE_RANK[b.g.mode] || a.i - b.i)
    .map(({ g }) => ({ kind: 'game' as const, id: g.id })),
];
export const FIRST_MIX = BOARDS.length;
export const FIRST_GAME = BOARDS.length + 1;
/** Free Play shows the minigames as a grid this many tiles wide. */
export const GRID_COLS = 6;
/** OPTIONS indices of one kind (boards, the mix, or minigames). */
export const optionsOfKind = (kind: PartyOption['kind']): number[] => OPTIONS.flatMap((o, i) => (o.kind === kind ? [i] : []));
const KIND_ORDER: PartyOption['kind'][] = ['board', 'mix', 'game'];
/** Party points by finishing place. Ties share the better place. */
export const PLACE_POINTS = [5, 3, 2, 1];

/** Seconds the finished minigame stays frozen under a FINISH! banner before the results show. */
export const FINISH_T = 1.6;

/** Seconds of 3, 2, 1 before every minigame. */
export const COUNT_IN = 3;
/** How long the party holds a game still before stepping it (games with their own countdown need less). */
export const countLead = (g: { ready?: number }): number => Math.max(0, COUNT_IN - (g.ready ?? 0));
/** Length of the whole 3, 2, 1 count for a game, measured from the start of the play phase. */
export const countTotal = (g: { ready?: number }): number => Math.max(COUNT_IN, g.ready ?? 0);

export type Phase = 'lobby' | 'board' | 'intro' | 'play' | 'results' | 'final';

export interface Placement {
  id: string;
  place: number; // 1-based
  label: string;
  points: number;
}

/** Everything about a party session, as plain JSON so it can be sent as a snapshot. */
export interface PartyState {
  phase: Phase;
  phaseT: number;
  players: PlayerInfo[];
  scores: Record<string, number>;
  /** Index into OPTIONS. */
  selection: number;
  roundsIdx: number;
  /** Index into MIX_MODES. */
  mixMode?: number;
  /** Mix: how many games each player has been in, so duels and sit-outs rotate fairly. */
  mixPlays?: Record<string, number>;
  turnsIdx: number;
  mode: PartyOption['kind'];
  board: BoardState | null;
  /** While true, the lobby keeps picking the best board for the current player count. */
  autoPick: boolean;
  round: number;
  playlist: string[];
  gameId: string | null;
  game: unknown;
  /** Who is in the current minigame (a duel or Stew Battle is only some of the party). Null = everyone. */
  gamePlayers: PlayerInfo[] | null;
  /** The current minigame was started by a board space, not the end of a turn. */
  boardEvent: 'duel' | 'stew' | null;
  /** Result line for a duel or Stew Battle. */
  eventLine: string;
  ready: string[];
  /** Minigame intro: how long each player has held A (1 second readies them). */
  hold: Record<string, number>;
  placements: Placement[];
  navCooldown: number;
  rng: Rng;
  /** Scratch memory for computer players, by player id. */
  botMem: Record<string, BotMem>;
  botRng: Rng;
  /** Pause menu: who opened it and which option is picked. The whole party waits while it's up. */
  /** `settings` counts picks of the Settings row; the pauser's screen opens its own Settings panel. */
  pause: { by: string; sel: number; cool: number; help: boolean; settings?: number } | null;
  /** An online room: each player's pause menu is their own and doesn't stop the game. */
  online?: boolean;
  /** Online pause menus, by player. */
  menus?: Record<string, { by: string; sel: number; cool: number; help: boolean; settings?: number }>;
  /** Last "quit to main menu" from the pause menu; the quitter's screen leaves the room. */
  quit: { id: string; n: number } | null;
  /** Local lobbies stay on the mode picked in the main menu; an online room can switch modes with Start. */
  lockMode?: boolean;
  /** Developer mode: the minigame the next end-of-turn pick is forced to. */
  devNext?: string | null;
  /** Developer mode started this minigame from the board: afterwards, go back to the board mid-turn. */
  devBack?: boolean;
  /** End of a board game: the Bonus Chobglob awards, a drumroll, then the champion. */
  ending?: Ending | null;
}

export interface Ending {
  awards: Award[];
  /** Award being shown (awards.length = the drumroll and champion). */
  i: number;
  /** Seconds into the current award / the drumroll / the champion. */
  t: number;
  stage: 'awards' | 'drum' | 'champ';
  /** How many awards have paid out their Chobglobs. */
  paid: number;
}

/** One Bonus Chobglob: spin (0-1.8s), title and bars (to 3.4s), winner revealed at 3.4s. */
export const AWARD_SPIN = 1.8;
export const AWARD_REVEAL = 3.4;
export const AWARD_T = 6.5;
export const DRUM_T = 3.2;
/** The champion screen can't be skipped for this long, so a mashed A never skips who won. */
export const CHAMP_HOLD = 5;

export const PAUSE_OPTIONS = ['Resume', 'How to play', 'Settings', 'End party (back to lobby)', 'Quit to main menu'] as const;

/** Back to the lobby with everyone still in it. */
export function endParty(s: PartyState): void {
  s.gameId = null;
  s.game = null;
  s.gamePlayers = null;
  s.boardEvent = null;
  s.playlist = [];
  s.board = null;
  s.pause = null;
  s.devBack = false;
  s.devNext = null;
  s.ending = null;
  setPhase(s, 'lobby');
}

/**
 * Start (or Esc) pauses everything for everyone; only the player who paused drives the menu.
 * Returns true while paused, so the rest of the party holds still.
 */
type PauseMenu = NonNullable<PartyState['pause']>;

/** One player's pause menu: returns false once it closes. */
function stepMenu(s: PartyState, p: PauseMenu, inp: TickInput, dt: number): boolean {
  p.cool = Math.max(0, p.cool - dt);
  if (p.help) {
    if (inp.aPressed || inp.bPressed || inp.startPressed) p.help = false;
    return true;
  }
  if (inp.startPressed || inp.bPressed) return false;
  if (p.cool === 0 && Math.abs(inp.y) > 0.6) {
    p.sel = (p.sel + (inp.y > 0 ? 1 : -1) + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
    p.cool = 0.2;
  }
  if (inp.aPressed && p.cool < 0.15) {
    const opt = PAUSE_OPTIONS[p.sel];
    if (opt === 'Resume') return false;
    else if (opt === 'How to play') p.help = true;
    else if (opt === 'Settings') p.settings = (p.settings ?? 0) + 1;
    else if (opt.startsWith('End party')) {
      if (hostId(s) === p.by) endParty(s);
    } else {
      s.quit = { id: p.by, n: (s.quit?.n ?? 0) + 1 };
      return false;
    }
  }
  return true;
}

/**
 * Start (or Esc) pauses everything for everyone in a local game, where everyone shares one screen; only the
 * player who paused drives the menu. Returns true while paused, so the rest of the party holds still.
 */
function stepPause(s: PartyState, inputs: Inputs, dt: number): boolean {
  if (!s.pause) {
    if (s.phase === 'lobby') return false;
    const by = s.players.find((p) => !p.bot && inputs[p.id]?.startPressed);
    if (!by) return false;
    s.pause = { by: by.id, sel: 0, cool: 0.2, help: false };
    return true;
  }
  const p = s.pause;
  // the pauser left: carry on
  if (!s.players.some((q) => q.id === p.by && !q.away)) {
    s.pause = null;
    return false;
  }
  if (!stepMenu(s, p, inputs[p.by] ?? NO_INPUT, dt) && s.pause === p) s.pause = null;
  return true;
}

/**
 * Online, the pause menu is each player's own: the game keeps running for everyone else (and for you, with
 * your hands off the controls while the menu is up). Returns the inputs with menu owners' inputs taken out.
 */
function stepMenus(s: PartyState, inputs: Inputs, dt: number): Inputs {
  s.menus ??= {};
  if (s.phase === 'lobby') {
    s.menus = {};
    return inputs;
  }
  const out: Inputs = { ...inputs };
  for (const pl of s.players) {
    if (pl.bot) continue;
    const inp = inputs[pl.id] ?? NO_INPUT;
    const m = s.menus[pl.id];
    if (!m) {
      if (inp.startPressed && !pl.away) {
        s.menus[pl.id] = { by: pl.id, sel: 0, cool: 0.2, help: false };
        delete out[pl.id];
      }
      continue;
    }
    delete out[pl.id];
    if (pl.away || !stepMenu(s, m, inp, dt)) delete s.menus[pl.id];
    // the host ended the party from their menu
    if ((s.phase as Phase) === 'lobby') {
      s.menus = {};
      break;
    }
  }
  for (const id of Object.keys(s.menus)) if (!s.players.some((q) => q.id === id)) delete s.menus[id];
  return out;
}

export function createParty(seed: number): PartyState {
  return {
    phase: 'lobby',
    phaseT: 0,
    players: [],
    scores: {},
    selection: 0,
    roundsIdx: 1,
    mixMode: 0,
    turnsIdx: 1,
    mode: 'board',
    board: null,
    autoPick: true,
    round: 0,
    playlist: [],
    gameId: null,
    game: null,
    gamePlayers: null,
    boardEvent: null,
    eventLine: '',
    ready: [],
    hold: {},
    placements: [],
    navCooldown: 0,
    rng: { seed },
    botMem: {},
    botRng: { seed: seed ^ 0x5bd1e995 },
    pause: null,
    quit: null,
  };
}

/** The first human player runs the menus (bots never host unless there's nobody else). */
export function hostId(s: PartyState): string | undefined {
  return (s.players.find((p) => !p.bot && !p.away) ?? s.players.find((p) => !p.bot) ?? s.players[0])?.id;
}

export function addPlayer(s: PartyState, id: string, name?: string): PlayerInfo | null {
  if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return null;
  const existing = s.players.find((p) => p.id === id);
  if (existing) return existing;
  const used = new Set(s.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  // start on the first character and colour nobody has
  const chars = new Set(s.players.map((p) => p.char ?? p.slot));
  const colors = new Set(s.players.map((p) => p.color));
  let char = slot % CHARACTERS.length;
  while (chars.has(char)) char = (char + 1) % CHARACTERS.length;
  let ci = slot % PLAYER_COLORS.length;
  while (colors.has(PLAYER_COLORS[ci])) ci = (ci + 1) % PLAYER_COLORS.length;
  const p: PlayerInfo = {
    id,
    slot,
    name: cleanName(name ?? '') || DEFAULT_NAMES[char],
    color: PLAYER_COLORS[ci],
    char,
  };
  s.players.push(p);
  s.scores[id] = 0;
  return p;
}

let botCount = 0;

/** Add a computer player to the lobby. */
export function addBot(s: PartyState, level: BotLevel): PlayerInfo | null {
  if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return null;
  let id: string;
  do id = `bot${++botCount}`;
  while (s.players.some((p) => p.id === id));
  const p = addPlayer(s, id);
  if (p) {
    p.bot = level;
    // CPUs start as the aliens, so the crew is left for the people playing
    const taken = new Set(s.players.filter((q) => q !== p).map((q) => q.char ?? q.slot));
    const alien = CHARACTERS.findIndex((c, i) => !c.folk && !taken.has(i));
    if (alien >= 0) {
      if (p.name === DEFAULT_NAMES[p.char ?? p.slot]) p.name = DEFAULT_NAMES[alien];
      p.char = alien;
    }
  }
  return p;
}

/** Typed names are capped so they fit on every name tag and standings row. */
export const NAME_MAX = 8;
/** Keep a typed name to letters, digits, spaces and a little punctuation, at most NAME_MAX long. */
export function cleanName(name: string): string {
  return [...String(name ?? '').replace(/[^\p{L}\p{N} '!?.\-_]/gu, '').replace(/\s+/g, ' ').trimStart()].slice(0, NAME_MAX).join('').trim();
}
/** Lobby: a player types their own name (empty goes back to their character's name). */
export function renamePlayer(s: PartyState, id: string, name: string): void {
  if (s.phase !== 'lobby') return;
  const p = s.players.find((q) => q.id === id);
  if (!p || p.bot) return;
  p.name = cleanName(name) || DEFAULT_NAMES[p.char ?? p.slot];
}

/** Lobby: switch to the next character nobody else is using (the name follows if it was the default). */
export function cycleCharacter(s: PartyState, p: PlayerInfo): void {
  const taken = new Set(s.players.filter((q) => q !== p).map((q) => q.char ?? q.slot));
  const n = CHARACTERS.length;
  const from = p.char ?? p.slot;
  let c = from;
  do c = (c + 1) % n;
  while (taken.has(c) && c !== from);
  if (p.name === DEFAULT_NAMES[from]) p.name = DEFAULT_NAMES[c];
  p.char = c;
}

/** Lobby: switch to the next colour nobody else is wearing. */
export function cycleColor(s: PartyState, p: PlayerInfo): void {
  const taken = new Set(s.players.filter((q) => q !== p).map((q) => q.color));
  const n = PLAYER_COLORS.length;
  let i = PLAYER_COLORS.indexOf(p.color);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (!taken.has(PLAYER_COLORS[i])) break;
  }
  p.color = PLAYER_COLORS[i];
}

/** Remove the most recently added bot. */
export function removeBot(s: PartyState): boolean {
  const bots = s.players.filter((p) => p.bot);
  const last = bots[bots.length - 1];
  if (!last) return false;
  delete s.botMem[last.id];
  return removePlayer(s, last.id);
}

/** Players can only leave from the lobby; mid-game they stay in with no input. */
export function removePlayer(s: PartyState, id: string): boolean {
  if (s.phase !== 'lobby') return false;
  const before = s.players.length;
  s.players = s.players.filter((p) => p.id !== id);
  delete s.scores[id];
  return s.players.length !== before;
}

export function selectionLabel(s: PartyState): string {
  const o = OPTIONS[s.selection];
  if (o.kind === 'board') return `${getBoard(o.id).name}: ${TURN_OPTIONS[s.turnsIdx]} turns`;
  if (o.kind === 'mix') return `Crust Game Mix (${MIX_MODES[s.mixMode ?? 0]}): ${ROUND_OPTIONS[s.roundsIdx]} rounds`;
  return getGame(o.id).name;
}

function eligibleGames(n: number, players?: PlayerInfo[]): string[] {
  const crowded = !!players && crowdedScreen(players);
  return GAMES.filter((g) => n >= g.minPlayers && n <= g.maxPlayers && g.mode !== 'Duel' && g.mode !== 'Team' && !STEW_GAMES.includes(g.id) && !(crowded && SPLIT_SCREEN_GAMES.includes(g.id))).map((g) => g.id);
}

/** First-person games split one screen at most 4 ways, so random picks skip them when more share a screen. */
export const SPLIT_SCREEN_GAMES = ['scope-snap', 'scope-squad', 'dart-duel'];
export function crowdedScreen(players: PlayerInfo[]): boolean {
  const per = new Map<string, number>();
  for (const p of players) {
    if (p.bot) continue;
    const dot = p.id.indexOf('.');
    const screen = dot < 0 ? 'here' : p.id.slice(0, dot);
    per.set(screen, (per.get(screen) ?? 0) + 1);
  }
  return [...per.values()].some((n) => n > 4);
}

/** The games played least so far (never the one just played, unless it's the only one). */
export function freshGames(pool: string[], played: string[]): string[] {
  if (!pool.length) return pool;
  const count = new Map(pool.map((g) => [g, 0]));
  for (const g of played) if (count.has(g)) count.set(g, count.get(g)! + 1);
  const least = Math.min(...count.values());
  const last = played[played.length - 1];
  const pick = pool.filter((g) => count.get(g) === least && g !== last);
  return pick.length ? pick : pool.filter((g) => g !== last).length ? pool.filter((g) => g !== last) : pool;
}

/** The games a Minigame Mix deals, for its mode. */
export function mixPool(mode: number, n: number, players?: PlayerInfo[]): string[] {
  if (mode === 1) return n >= 2 ? [...DUEL_GAMES] : [];
  if (mode === 2) return n >= 2 ? STEW_GAMES.filter((g) => !(players && crowdedScreen(players) && SPLIT_SCREEN_GAMES.includes(g))) : [];
  return eligibleGames(n, players);
}

/** Who plays this mix round: everyone, or a fair pick of two duellists / two even teams. */
function mixLineup(s: PartyState): PlayerInfo[] | null {
  const mode = s.mixMode ?? 0;
  if (mode === 0 || s.players.length < 2) return null;
  const plays = (s.mixPlays ??= {});
  const n = s.players.length;
  // fewest games played goes first; a shuffle breaks ties so the pairings mix up
  const order = shuffle(s.rng, s.players.map((p) => p.id)).sort((a, b) => (plays[a] ?? 0) - (plays[b] ?? 0));
  const take = mode === 1 ? 2 : n % 2 === 1 ? n - 1 : n;
  const ids = order.slice(0, take);
  for (const id of ids) plays[id] = (plays[id] ?? 0) + 1;
  if (mode === 1) return ids.map((id) => ({ ...s.players.find((p) => p.id === id)! }));
  // Stew Battle: deal by points so far, A B B A, so the teams come out even
  const ranked = [...ids].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  return ranked.map((id, i) => ({ ...s.players.find((p) => p.id === id)!, team: [0, 1, 1, 0][i % 4] }));
}

export function totalRounds(s: PartyState): number {
  return s.playlist.length;
}

/** The players in the current minigame. */
export function inGame(s: PartyState): PlayerInfo[] {
  return s.gamePlayers ?? s.players;
}

export function setPhase(s: PartyState, phase: Phase): void {
  s.phase = phase;
  s.phaseT = 0;
  s.ready = [];
  s.hold = {};
}

export function startParty(s: PartyState): void {
  const n = s.players.length;
  for (const p of s.players) s.scores[p.id] = 0;
  const o = OPTIONS[s.selection];
  s.mode = o.kind;
  s.board = null;
  s.round = 0;
  if (o.kind === 'board') {
    s.rng.seed = (Math.imul(s.rng.seed, 1103515245) + 12345) | 0;
    s.board = createBoard(o.id, s.players.map((p) => p.id), TURN_OPTIONS[s.turnsIdx], s.rng.seed, s.players.some((p) => !p.bot));
    s.playlist = [];
    setPhase(s, 'board');
    return;
  }
  if (o.kind === 'mix') {
    s.mixPlays = {};
    s.playlist = makePlaylist(s, mixPool(s.mixMode ?? 0, n, s.players), ROUND_OPTIONS[s.roundsIdx]);
  } else {
    s.playlist = [o.id];
  }
  beginRound(s);
}

function makePlaylist(s: PartyState, pool: string[], rounds: number): string[] {
  const list: string[] = [];
  if (!pool.length) pool = GAMES.map((g) => g.id);
  while (list.length < rounds) {
    const batch = shuffle(s.rng, [...pool]);
    // avoid the same game twice in a row across batches
    if (list.length && batch[0] === list[list.length - 1] && batch.length > 1) batch.push(batch.shift()!);
    list.push(...batch);
  }
  return list.slice(0, rounds);
}

export function beginRound(s: PartyState): void {
  const id = s.playlist[s.round];
  const g = getGame(id);
  s.gameId = id;
  s.gamePlayers = s.mode === 'mix' ? mixLineup(s) : null;
  s.boardEvent = null;
  s.rng.seed = (Math.imul(s.rng.seed, 1103515245) + 12345) | 0;
  s.game = g.setup(s.gamePlayers ?? s.players, s.rng.seed);
  setPhase(s, 'intro');
}

export function placementsFrom(rows: ResultRow[]): Placement[] {
  const out: Placement[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    const place = prev && rows[i - 1].value === r.value ? prev.place : i + 1;
    out.push({ id: r.id, place, label: r.label, points: rows.length > 1 ? PLACE_POINTS[place - 1] ?? 0 : 0 });
  });
  return out;
}

export function stepParty(s: PartyState, humanInputs: Inputs, dt: number): void {
  s.pause ??= null;
  s.quit ??= null;
  if (s.online) {
    s.pause = null;
    humanInputs = stepMenus(s, humanInputs, dt);
  } else if (stepPause(s, humanInputs, dt)) return;
  s.phaseT += dt;
  const inputs = addBotInputs(s, humanInputs, dt);
  const host = hostId(s);
  const hostIn: TickInput = (host && inputs[host]) || NO_INPUT;

  switch (s.phase) {
    case 'lobby': {
      s.navCooldown = Math.max(0, s.navCooldown - dt);
      const kind = OPTIONS[s.selection].kind;
      if (s.autoPick && kind === 'board' && s.players.length) {
        const want = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === recommendedBoard(s.players.length).id);
        if (want >= 0) s.selection = want;
      }
      // the host only moves through the lobby's own mode: boards, the mix, or the minigames
      const list = optionsOfKind(kind);
      const pos = Math.max(0, list.indexOf(s.selection));
      const dx = Math.abs(hostIn.x) > 0.6 ? Math.sign(hostIn.x) : 0;
      const dy = Math.abs(hostIn.y) > 0.6 ? Math.sign(hostIn.y) : 0;
      if (!s.lockMode && hostIn.startPressed) {
        const next = KIND_ORDER[(KIND_ORDER.indexOf(kind) + 1) % KIND_ORDER.length];
        s.selection = optionsOfKind(next)[0];
        s.autoPick = next === 'board';
        s.navCooldown = 0.22;
      } else if (s.navCooldown === 0 && (dx || dy)) {
        s.navCooldown = 0.22;
        if (kind === 'mix') {
          // left/right: rounds; up/down: Classic, Duel or Stew Battle
          if (dx) s.roundsIdx = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, s.roundsIdx + dx));
          else s.mixMode = ((s.mixMode ?? 0) + dy + MIX_MODES.length) % MIX_MODES.length;
        } else if (kind === 'board') {
          if (dx) {
            s.selection = list[(pos + dx + list.length) % list.length];
            s.autoPick = false;
          } else s.turnsIdx = Math.max(0, Math.min(TURN_OPTIONS.length - 1, s.turnsIdx - dy));
        } else {
          // Free Play grid: left/right steps (wrapping), up/down jumps a row
          let np = dx ? (pos + dx + list.length) % list.length : pos + dy * GRID_COLS;
          if (np >= list.length) np = dy > 0 && Math.floor(pos / GRID_COLS) < Math.floor((list.length - 1) / GRID_COLS) ? list.length - 1 : pos;
          if (np < 0) np = pos;
          s.selection = list[np];
        }
      }
      for (const p of s.players) {
        const inp = inputs[p.id];
        if (inp?.xPressed) cycleCharacter(s, p);
        if (inp?.yPressed) cycleColor(s, p);
      }
      if (hostIn.aPressed && s.players.length > 0) startParty(s);
      break;
    }
    case 'board': {
      const b = s.board!;
      // the host can skip Square Brian's tour with X
      if (b.sub === 'tour' && hostIn.xPressed) endTour(b);
      // and Evil LeBron's dance party (with nobody human to skip it, the CPUs give him 16 seconds)
      if (b.sub === 'boss' && b.boss?.dance && (hostIn.xPressed || (b.t > BOSS_INTRO + 16 && s.players.every((p) => p.bot)))) endBossDance(b);
      stepBoard(b, inputs, dt);
      if (b.sub === 'event' && b.event) {
        // a Duel or Stew Battle space: play that minigame with just those players, then come back
        const ev = b.event;
        const g = getGame(ev.gameId);
        const who = ev.players.map((id) => ({ ...s.players.find((p) => p.id === id)!, team: ev.teams?.[id] }));
        s.gameId = ev.gameId;
        s.gamePlayers = who;
        s.boardEvent = ev.kind;
        s.rng.seed = (Math.imul(s.rng.seed, 1103515245) + 12345) | 0;
        s.game = g.setup(who, s.rng.seed);
        setPhase(s, 'intro');
        break;
      }
      if (b.sub === 'done') {
        // everyone has moved: time for this turn's minigame
        // deal from the whole pool like a deck: nothing repeats until every game has had its turn
        const pickFrom = freshGames(eligibleGames(s.players.length, s.players), s.playlist);
        // developer mode can force the next minigame
        const forced = s.devNext;
        s.devNext = null;
        s.playlist.push(forced || pickFrom[Math.floor(rand(s.rng) * pickFrom.length)]);
        s.round = s.playlist.length - 1;
        beginRound(s);
      }
      break;
    }
    case 'intro': {
      // hold A for a second to ready up (a tap doesn't count, so nobody readies by accident)
      s.hold ??= {};
      for (const p of inGame(s)) {
        if (s.ready.includes(p.id)) continue;
        s.hold[p.id] = inputs[p.id]?.a ? (s.hold[p.id] ?? 0) + dt : 0;
        if (s.hold[p.id] >= READY_HOLD) s.ready.push(p.id);
      }
      const allReady = inGame(s).every((p) => s.ready.includes(p.id));
      // the host can force the start with X; a long safety net covers anyone gone AFK
      const forced = hostIn.xPressed && s.phaseT > 0.3;
      if ((allReady && s.phaseT > 0.5) || forced || s.phaseT > INTRO_MAX) setPhase(s, 'play');
      break;
    }
    case 'play': {
      const g = getGame(s.gameId!);
      // every minigame opens with 3, 2, 1, GO!: hold the game still until the count reaches GO
      if (s.phaseT < countLead(g)) break;
      g.step(s.game, inputs, dt);
      if (g.isOver(s.game)) finishGame(s);
      break;
    }
    case 'results': {
      if ((hostIn.aPressed && s.phaseT > FINISH_T + 1.4) || s.phaseT > FINISH_T + 8) {
        if (s.board && s.devBack) {
          // a minigame developer mode started mid-turn: back to the board right where it was
          s.devBack = false;
          s.gamePlayers = null;
          s.gameId = null;
          s.game = null;
          setPhase(s, 'board');
          break;
        }
        if (s.board && s.boardEvent) {
          // back to the board: the player who landed on the space finishes their turn
          s.boardEvent = null;
          s.gamePlayers = null;
          s.gameId = null;
          s.game = null;
          setPhase(s, 'board');
          break;
        }
        if (s.board) {
          if (s.board.turn >= s.board.maxTurns) {
            startEnding(s);
          } else {
            s.board.turn++;
            s.board.cur = 0;
            s.board.sub = 'turnIntro';
            s.board.t = 0;
            setPhase(s, 'board');
          }
          break;
        }
        s.round++;
        if (s.round >= s.playlist.length) startEnding(s);
        else beginRound(s);
      }
      break;
    }
    case 'final': {
      const e = s.ending;
      if (e) {
        stepEnding(s, e, hostIn.aPressed, dt);
        if (e.stage !== 'champ' || e.t < CHAMP_HOLD) break;
      } else if (s.phaseT < CHAMP_HOLD) break;
      if (hostIn.aPressed) endParty(s);
      break;
    }
  }
}

/** The game is over: a board game hands out its Bonus Chobglobs first, then everyone sees the champion. */
export function startEnding(s: PartyState): void {
  const b = s.board;
  s.ending = null;
  if (b) {
    for (const r of boardRanking(b)) s.scores[r.id] = r.value;
    const awards = pickAwards(b, s.rng);
    s.ending = { awards, i: 0, t: 0, stage: awards.length ? 'awards' : 'drum', paid: 0 };
  } else s.ending = { awards: [], i: 0, t: 0, stage: 'drum', paid: 0 };
  setPhase(s, 'final');
}

function stepEnding(s: PartyState, e: Ending, a: boolean, dt: number): void {
  e.t += dt;
  if (e.stage === 'awards') {
    const aw = e.awards[e.i];
    if (e.paid <= e.i && e.t >= AWARD_REVEAL) {
      e.paid = e.i + 1;
      if (s.board) {
        for (const id of aw.winners) if (s.board.players[id]) s.board.players[id].crowns++;
        for (const r of boardRanking(s.board)) s.scores[r.id] = r.value;
      }
    }
    // A moves on once the winner has had a moment
    if (e.t >= AWARD_T || (a && e.t > AWARD_REVEAL + 1)) {
      e.i++;
      e.t = 0;
      if (e.i >= e.awards.length) e.stage = 'drum';
    }
  } else if (e.stage === 'drum' && e.t >= DRUM_T) {
    e.stage = 'champ';
    e.t = 0;
  }
}

/** The minigame is over (or developer mode ended it): rank everyone and pay out. */
export function finishGame(s: PartyState): void {
  const g = getGame(s.gameId!);
  const rows = g.results(s.game);
  s.placements = placementsFrom(rows);
  if (s.board && s.boardEvent) {
    s.eventLine = finishEvent(s.board, rows);
    for (const pl of s.placements) pl.points = 0;
    for (const p of Object.values(s.board.players)) s.scores[p.id] = p.keys;
  } else if (s.board) {
    // on a board, minigames pay out keys instead of party points
    const keys = awardMinigame(s.board, s.placements);
    if (!s.devBack) winnerGoesFirst(s.board, s.placements);
    for (const pl of s.placements) pl.points = keys[pl.id] ?? 0;
    for (const p of Object.values(s.board.players)) s.scores[p.id] = p.keys;
  } else {
    for (const pl of s.placements) s.scores[pl.id] = (s.scores[pl.id] ?? 0) + pl.points;
  }
  setPhase(s, 'results');
}

/** Final standings, best first, with shared places for ties. */
export function standings(s: PartyState): { id: string; place: number; score: number }[] {
  const rows = [...s.players].map((p) => ({ id: p.id, score: s.scores[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
  return rows.map((r, i) => ({ ...r, place: i > 0 && rows[i - 1].score === r.score ? -1 : i + 1 })).map((r, i, arr) => {
    if (r.place === -1) {
      let j = i;
      while (arr[j].place === -1) j--;
      return { ...r, place: arr[j].place };
    }
    return r;
  });
}
