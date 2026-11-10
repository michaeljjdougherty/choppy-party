import type { Inputs, PlayerInfo, ResultRow, TickInput } from './types';
import { NO_INPUT } from './types';
import { GAMES, getGame } from './games';
import { PLAYER_COLORS, DEFAULT_NAMES } from './players';
import { shuffle, type Rng } from './rng';

export const MAX_PLAYERS = 10;
export const ROUND_OPTIONS = [3, 5, 10];
/** Party points by finishing place. Ties share the better place. */
export const PLACE_POINTS = [5, 3, 2, 1];

export type Phase = 'lobby' | 'intro' | 'play' | 'results' | 'final';

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
  /** 0 = party mode, 1.. = a single game (GAMES[selection - 1]) */
  selection: number;
  roundsIdx: number;
  round: number;
  playlist: string[];
  gameId: string | null;
  game: unknown;
  ready: string[];
  placements: Placement[];
  navCooldown: number;
  rng: Rng;
}

export function createParty(seed: number): PartyState {
  return {
    phase: 'lobby',
    phaseT: 0,
    players: [],
    scores: {},
    selection: 0,
    roundsIdx: 1,
    round: 0,
    playlist: [],
    gameId: null,
    game: null,
    ready: [],
    placements: [],
    navCooldown: 0,
    rng: { seed },
  };
}

export function hostId(s: PartyState): string | undefined {
  return s.players[0]?.id;
}

export function addPlayer(s: PartyState, id: string, name?: string): PlayerInfo | null {
  if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return null;
  const existing = s.players.find((p) => p.id === id);
  if (existing) return existing;
  const used = new Set(s.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  const p: PlayerInfo = {
    id,
    slot,
    name: (name ?? '').trim().slice(0, 12) || DEFAULT_NAMES[slot],
    color: PLAYER_COLORS[slot],
  };
  s.players.push(p);
  s.scores[id] = 0;
  return p;
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
  if (s.selection === 0) return `Party: ${ROUND_OPTIONS[s.roundsIdx]} random rounds`;
  return GAMES[s.selection - 1].name;
}

export function totalRounds(s: PartyState): number {
  return s.playlist.length;
}

function setPhase(s: PartyState, phase: Phase): void {
  s.phase = phase;
  s.phaseT = 0;
  s.ready = [];
}

function startParty(s: PartyState): void {
  const n = s.players.length;
  for (const p of s.players) s.scores[p.id] = 0;
  if (s.selection === 0) {
    const pool = GAMES.filter((g) => n >= g.minPlayers && n <= g.maxPlayers).map((g) => g.id);
    const rounds = ROUND_OPTIONS[s.roundsIdx];
    const list: string[] = [];
    while (list.length < rounds) {
      const batch = shuffle(s.rng, [...pool]);
      // avoid the same game twice in a row across batches
      if (list.length && batch[0] === list[list.length - 1] && batch.length > 1) batch.push(batch.shift()!);
      list.push(...batch);
    }
    s.playlist = list.slice(0, rounds);
  } else {
    s.playlist = [GAMES[s.selection - 1].id];
  }
  s.round = 0;
  beginRound(s);
}

function beginRound(s: PartyState): void {
  const id = s.playlist[s.round];
  const g = getGame(id);
  s.gameId = id;
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

export function stepParty(s: PartyState, inputs: Inputs, dt: number): void {
  s.phaseT += dt;
  const host = hostId(s);
  const hostIn: TickInput = (host && inputs[host]) || NO_INPUT;

  switch (s.phase) {
    case 'lobby': {
      s.navCooldown = Math.max(0, s.navCooldown - dt);
      const options = GAMES.length + 1;
      if (s.navCooldown === 0 && Math.abs(hostIn.x) > 0.6) {
        s.selection = (s.selection + (hostIn.x > 0 ? 1 : -1) + options) % options;
        s.navCooldown = 0.22;
      } else if (s.navCooldown === 0 && s.selection === 0 && Math.abs(hostIn.y) > 0.6) {
        s.roundsIdx = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, s.roundsIdx + (hostIn.y < 0 ? 1 : -1)));
        s.navCooldown = 0.22;
      }
      if (hostIn.aPressed && s.players.length > 0) startParty(s);
      break;
    }
    case 'intro': {
      for (const p of s.players) {
        if (inputs[p.id]?.aPressed && !s.ready.includes(p.id)) s.ready.push(p.id);
      }
      const allReady = s.players.every((p) => s.ready.includes(p.id));
      if ((allReady && s.phaseT > 0.5) || s.phaseT > 10) setPhase(s, 'play');
      break;
    }
    case 'play': {
      const g = getGame(s.gameId!);
      g.step(s.game, inputs, dt);
      if (g.isOver(s.game)) {
        s.placements = placementsFrom(g.results(s.game));
        for (const pl of s.placements) s.scores[pl.id] = (s.scores[pl.id] ?? 0) + pl.points;
        setPhase(s, 'results');
      }
      break;
    }
    case 'results': {
      if ((hostIn.aPressed && s.phaseT > 1.5) || s.phaseT > 8) {
        s.round++;
        if (s.round >= s.playlist.length) setPhase(s, 'final');
        else beginRound(s);
      }
      break;
    }
    case 'final': {
      if (hostIn.aPressed && s.phaseT > 2) {
        s.gameId = null;
        s.game = null;
        s.playlist = [];
        setPhase(s, 'lobby');
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
