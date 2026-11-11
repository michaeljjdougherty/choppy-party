import type { Inputs, PlayerInfo, ResultRow, TickInput } from './types';
import { NO_INPUT } from './types';
import { GAMES, getGame } from './games';
import { PLAYER_COLORS, DEFAULT_NAMES } from './players';
import { shuffle, type Rng } from './rng';
import { BOARDS, getBoard, recommendedBoard } from './board/boards';
import { awardMinigame, boardRanking, createBoard, endTour, finishEvent, stepBoard, winnerGoesFirst } from './board/engine';
import type { BoardState } from './board/types';
import { addBotInputs, type BotLevel, type BotMem } from './bots';

export const MAX_PLAYERS = 10;
/** Seconds of holding A that ready you up for a minigame. */
export const READY_HOLD = 1;
/** Nobody can stall a minigame intro longer than this. */
export const INTRO_MAX = 90;
export const ROUND_OPTIONS = [3, 5, 10];
export const TURN_OPTIONS = [5, 10, 15, 20];

/** Everything the host can pick in the lobby, in order. */
export type PartyOption = { kind: 'board'; id: string } | { kind: 'mix' } | { kind: 'game'; id: string };
export const OPTIONS: PartyOption[] = [
  ...BOARDS.map((b) => ({ kind: 'board' as const, id: b.id })),
  { kind: 'mix' },
  ...GAMES.map((g) => ({ kind: 'game' as const, id: g.id })),
];
export const FIRST_MIX = BOARDS.length;
export const FIRST_GAME = BOARDS.length + 1;
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
  pause: { by: string; sel: number; cool: number; help: boolean } | null;
  /** Last "quit to main menu" from the pause menu; the quitter's screen leaves the room. */
  quit: { id: string; n: number } | null;
}

export const PAUSE_OPTIONS = ['Resume', 'How to play', 'End party (back to lobby)', 'Quit to main menu'] as const;

/** Back to the lobby with everyone still in it. */
export function endParty(s: PartyState): void {
  s.gameId = null;
  s.game = null;
  s.gamePlayers = null;
  s.boardEvent = null;
  s.playlist = [];
  s.board = null;
  s.pause = null;
  setPhase(s, 'lobby');
}

/**
 * Start (or Esc) pauses everything for everyone; only the player who paused drives the menu.
 * Returns true while paused, so the rest of the party holds still.
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
  const inp = inputs[p.by] ?? NO_INPUT;
  p.cool = Math.max(0, p.cool - dt);
  if (p.help) {
    if (inp.aPressed || inp.bPressed || inp.startPressed) p.help = false;
    return true;
  }
  if (inp.startPressed || inp.bPressed) {
    s.pause = null;
    return true;
  }
  if (p.cool === 0 && Math.abs(inp.y) > 0.6) {
    p.sel = (p.sel + (inp.y > 0 ? 1 : -1) + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
    p.cool = 0.2;
  }
  if (inp.aPressed && p.cool < 0.15) {
    const opt = PAUSE_OPTIONS[p.sel];
    if (opt === 'Resume') s.pause = null;
    else if (opt === 'How to play') p.help = true;
    else if (opt.startsWith('End party')) {
      if (hostId(s) === p.by) endParty(s);
    } else {
      s.quit = { id: p.by, n: (s.quit?.n ?? 0) + 1 };
      s.pause = null;
    }
  }
  return true;
}

export function createParty(seed: number): PartyState {
  return {
    phase: 'lobby',
    phaseT: 0,
    players: [],
    scores: {},
    selection: 0,
    roundsIdx: 1,
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
  let char = slot;
  while (chars.has(char)) char = (char + 1) % PLAYER_COLORS.length;
  let ci = char;
  while (colors.has(PLAYER_COLORS[ci])) ci = (ci + 1) % PLAYER_COLORS.length;
  const p: PlayerInfo = {
    id,
    slot,
    name: (name ?? '').trim().slice(0, 12) || DEFAULT_NAMES[char],
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
  if (p) p.bot = level;
  return p;
}

/** Lobby: switch to the next character nobody else is using (the name follows if it was the default). */
export function cycleCharacter(s: PartyState, p: PlayerInfo): void {
  const taken = new Set(s.players.filter((q) => q !== p).map((q) => q.char ?? q.slot));
  const n = PLAYER_COLORS.length;
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
  if (o.kind === 'mix') return `Minigame Mix: ${ROUND_OPTIONS[s.roundsIdx]} rounds`;
  return getGame(o.id).name;
}

function eligibleGames(n: number): string[] {
  return GAMES.filter((g) => n >= g.minPlayers && n <= g.maxPlayers && (g.mode === 'Free-for-all' || g.mode === '1-vs-many')).map((g) => g.id);
}

export function totalRounds(s: PartyState): number {
  return s.playlist.length;
}

/** The players in the current minigame. */
export function inGame(s: PartyState): PlayerInfo[] {
  return s.gamePlayers ?? s.players;
}

function setPhase(s: PartyState, phase: Phase): void {
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
    s.rng.seed = (s.rng.seed * 1103515245 + 12345) | 0;
    s.board = createBoard(o.id, s.players.map((p) => p.id), TURN_OPTIONS[s.turnsIdx], s.rng.seed, s.players.some((p) => !p.bot));
    s.playlist = [];
    setPhase(s, 'board');
    return;
  }
  if (o.kind === 'mix') {
    s.playlist = makePlaylist(s, eligibleGames(n), ROUND_OPTIONS[s.roundsIdx]);
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

function beginRound(s: PartyState): void {
  const id = s.playlist[s.round];
  const g = getGame(id);
  s.gameId = id;
  s.gamePlayers = null;
  s.boardEvent = null;
  s.rng.seed = (s.rng.seed * 1103515245 + 12345) | 0;
  s.game = g.setup(s.players, s.rng.seed);
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
  if (stepPause(s, humanInputs, dt)) return;
  s.phaseT += dt;
  const inputs = addBotInputs(s, humanInputs, dt);
  const host = hostId(s);
  const hostIn: TickInput = (host && inputs[host]) || NO_INPUT;

  switch (s.phase) {
    case 'lobby': {
      s.navCooldown = Math.max(0, s.navCooldown - dt);
      const options = OPTIONS.length;
      const kind = OPTIONS[s.selection].kind;
      if (s.autoPick && kind === 'board' && s.players.length) {
        const want = OPTIONS.findIndex((o) => o.kind === 'board' && o.id === recommendedBoard(s.players.length).id);
        if (want >= 0) s.selection = want;
      }
      if (s.navCooldown === 0 && Math.abs(hostIn.x) > 0.6) {
        s.selection = (s.selection + (hostIn.x > 0 ? 1 : -1) + options) % options;
        s.navCooldown = 0.22;
        s.autoPick = false;
      } else if (s.navCooldown === 0 && kind !== 'game' && Math.abs(hostIn.y) > 0.6) {
        const d = hostIn.y < 0 ? 1 : -1;
        if (kind === 'mix') s.roundsIdx = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, s.roundsIdx + d));
        else s.turnsIdx = Math.max(0, Math.min(TURN_OPTIONS.length - 1, s.turnsIdx + d));
        s.navCooldown = 0.22;
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
      stepBoard(b, inputs, dt);
      if (b.sub === 'event' && b.event) {
        // a Duel or Stew Battle space: play that minigame with just those players, then come back
        const ev = b.event;
        const g = getGame(ev.gameId);
        const who = ev.players.map((id) => ({ ...s.players.find((p) => p.id === id)!, team: ev.teams?.[id] }));
        s.gameId = ev.gameId;
        s.gamePlayers = who;
        s.boardEvent = ev.kind;
        s.rng.seed = (s.rng.seed * 1103515245 + 12345) | 0;
        s.game = g.setup(who, s.rng.seed);
        setPhase(s, 'intro');
        break;
      }
      if (b.sub === 'done') {
        // everyone has moved: time for this turn's minigame
        const pool = eligibleGames(s.players.length);
        const recent = s.playlist.slice(-2);
        const fresh = pool.filter((g) => !recent.includes(g));
        const pickFrom = fresh.length ? fresh : pool;
        s.rng.seed = (s.rng.seed * 1103515245 + 12345) | 0;
        s.playlist.push(pickFrom[Math.abs(s.rng.seed) % pickFrom.length]);
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
      if (g.isOver(s.game)) {
        const rows = g.results(s.game);
        s.placements = placementsFrom(rows);
        if (s.board && s.boardEvent) {
          s.eventLine = finishEvent(s.board, rows);
          for (const pl of s.placements) pl.points = 0;
          for (const p of Object.values(s.board.players)) s.scores[p.id] = p.keys;
        } else if (s.board) {
          // on a board, minigames pay out keys instead of party points
          const keys = awardMinigame(s.board, s.placements);
          winnerGoesFirst(s.board, s.placements);
          for (const pl of s.placements) pl.points = keys[pl.id] ?? 0;
          for (const p of Object.values(s.board.players)) s.scores[p.id] = p.keys;
        } else {
          for (const pl of s.placements) s.scores[pl.id] = (s.scores[pl.id] ?? 0) + pl.points;
        }
        setPhase(s, 'results');
      }
      break;
    }
    case 'results': {
      if ((hostIn.aPressed && s.phaseT > FINISH_T + 1.4) || s.phaseT > FINISH_T + 8) {
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
            for (const r of boardRanking(s.board)) s.scores[r.id] = r.value;
            setPhase(s, 'final');
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
        if (s.round >= s.playlist.length) setPhase(s, 'final');
        else beginRound(s);
      }
      break;
    }
    case 'final': {
      if (hostIn.aPressed && s.phaseT > 2) {
        endParty(s);
      }
      break;
    }
  }
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
