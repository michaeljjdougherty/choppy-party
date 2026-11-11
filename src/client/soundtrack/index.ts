/**
 * Choppy Party soundtrack: music is always playing.
 *
 *   title / main menu / lobby -> 'menu' (the recorded menu track, music/menu.mp3; 'title' if it is missing)
 *   board                     -> that board's theme (a recorded one from RECORDED when there is one;
 *                                Lantern Hollow plays 'board:lantern-hollow-night' after dark)
 *   minigame intro + play     -> that minigame's own song (quieter during the intro)
 *   results                   -> 'results'
 *   final                     -> 'finale' (or whatever override the finale sequence sets)
 *
 * Use: call `syncMusic(state, dt)` once per frame and `music.unlock()` on the first key/click/pad
 * press. Use `music.override('mr-chop')` / `music.override(null)` for scripted moments.
 */
import type { PartyState } from '../../shared/party';
import { getBoard } from '../../shared/board/boards';
import type { BoardState } from '../../shared/board/types';
import { hashString, type SongSpec } from './compose';
import { MusicEngine } from './engine';
import { ALL_SONGS, GAME_SONGS } from './songs';

export { ALL_SONGS } from './songs';
export type { SongSpec } from './compose';

/**
 * Recorded tracks (files in public/music) that take the place of a generated song. If a file
 * fails to load, the generated song with the same id plays instead ('title' for the menu).
 */
const RECORDED: Record<string, string> = {
  menu: 'music/menu.mp3',
  'board:lantern-hollow': 'music/lantern-hollow-day.mp3',
  'board:lantern-hollow-night': 'music/lantern-hollow-night.mp3',
  'board:cosmo-junction': 'music/cosmo-junction.mp3',
  'board:gold-rush-gulch': 'music/gold-rush-gulch.mp3',
  'board:stew-court': 'music/stew-court-fucci.mp3',
  'board:stew-court-choppy': 'music/stew-court-choppy.mp3',
  'board:stew-court-pit': 'music/stew-court-pit.mp3',
  'mister-chunk': 'music/mister-chunk.mp3',
  'mr-chop': 'music/mr-chop.mp3',
  'duel-space': 'music/duel-space.mp3',
};
/** The composer, as the OST screen credits him. */
export const COMPOSER = 'DJ Tuna (on the beat)';

/** A track on the OST screen: the song id it plays, its name, and where you hear it in the game. */
export interface OstTrack {
  id: string;
  title: string;
  where: string;
}

/** The recorded tracks, in album order. */
const RECORDED_TRACKS: OstTrack[] = [
  { id: 'menu', title: 'The Brass Goes Wild', where: 'Main Menu' },
  { id: 'board:lantern-hollow', title: 'Tiptoe at Golden Hour', where: 'Lantern Hollow (day)' },
  { id: 'board:lantern-hollow-night', title: 'Lanterns in the Mist', where: 'Lantern Hollow (night)' },
  { id: 'board:cosmo-junction', title: 'View from the Observation Deck', where: 'Cosmo Junction' },
  { id: 'board:gold-rush-gulch', title: 'High Noon Gallop', where: 'Gold Rush Gulch' },
  { id: 'board:stew-court', title: 'Full Court Press', where: 'Stew Court (Fucci Verse)' },
  { id: 'board:stew-court-choppy', title: 'Slamming Through Orbit', where: 'Stew Court (Choppy Verse)' },
  { id: 'board:stew-court-pit', title: 'The Iron Latch', where: 'The Chop Pit' },
  { id: 'mister-chunk', title: "The Bully's Heavy Step", where: 'Mister Chunk' },
  { id: 'mr-chop', title: 'A Seat at the Infinite Table', where: 'Mister Chop' },
  { id: 'duel-space', title: 'Six Seconds to Draw', where: 'Duel Space' },
];

/** Generated screen songs and where they play ('title' and 'lobby' only stand in for the menu mp3). */
const SCREEN_WHERE: Record<string, string> = {
  results: 'Minigame Results',
  finale: 'Final Results',
  'bonus-reel': 'Bonus Chobglobs',
  'duel-intro': 'Duels and Stew Battles',
};

/**
 * Every track on the OST screen: the recorded ones first, then the generated screen songs, then
 * one per minigame that's in the game (in the order the games are listed).
 */
export function ostTracks(games: { id: string; name: string }[]): OstTrack[] {
  const out = [...RECORDED_TRACKS];
  for (const [id, where] of Object.entries(SCREEN_WHERE)) {
    const s = byId.get(id);
    if (s) out.push({ id, title: s.title, where });
  }
  const seen = new Set(out.map((x) => x.id));
  for (const g of games) {
    const s = songForGame(g.id, g.name);
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, title: s.title, where: g.name });
  }
  return out;
}

/** Where a song with no working file and no spec of its own falls back to (followed until one plays). */
const FALLBACK: Record<string, string> = {
  menu: 'title',
  'board:lantern-hollow-night': 'board:lantern-hollow',
  'board:stew-court-choppy': 'board:stew-court',
  'board:stew-court-pit': 'board:stew-court-choppy',
};
const VOL_KEY = 'choppy.musicVolume';

const engine = new MusicEngine();
const brokenFiles = new Set<string>();
engine.onFileError = (id) => {
  brokenFiles.add(id);
  // the broken track was on screen: put its stand-in on straight away
  if (engine.current() === null) play(id);
};
const byId = new Map(ALL_SONGS.map((s) => [s.id, s]));
let overrideId: string | null = null;
let hurry = false;
/** The OST player's pause: nothing plays until it is lifted. */
let paused = false;
/** Lifting the pause carries on a recorded track from where it stopped. */
let resumeFile = false;
let analyserNode: AnalyserNode | null = null;

try {
  const v = localStorage.getItem(VOL_KEY);
  if (v !== null) engine.volume = Math.max(0, Math.min(1, Number(v)));
} catch {
  /* storage blocked: keep the default */
}

const slug = (s: string): string => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The song for a minigame. Matches by id first, then by name (so 'Zero-G Tag' finds 'zero-g-tag'
 * even if the code id differs), then by id with 'stew-' or a '-duel' suffix dropped. An unknown
 * game still gets its own song: a built-in one is re-seeded from its id so it sounds different.
 */
export function songForGame(id: string, name?: string): SongSpec {
  const tries = [id, name ? slug(name) : '', id.replace(/^stew-/, ''), id.replace(/-(duel|battle)$/, '')];
  for (const t of tries) {
    const s = t && byId.get(t);
    if (s) return s;
  }
  const h = hashString(id);
  const base = GAME_SONGS[h % GAME_SONGS.length];
  const keys = [57, 58, 60, 62, 64, 65, 67];
  const fresh: SongSpec = { ...base, id: `game:${id}`, title: name ?? id, seed: h, key: keys[(h >>> 8) % keys.length], bpm: Math.round(base.bpm * (0.92 + ((h >>> 16) % 17) / 100)) };
  byId.set(fresh.id, fresh);
  return fresh;
}

/** A recorded track that is listed and hasn't failed to load. */
function hasFile(id: string): boolean {
  return !!RECORDED[id] && !brokenFiles.has(id);
}

/** The id that actually plays for a song: itself if it has a working file or a spec, else its fallback. */
function resolve(id: string): string {
  for (let i = 0; i < 8; i++) {
    if ((RECORDED[id] && !brokenFiles.has(id)) || byId.has(id) || !FALLBACK[id]) return id;
    id = FALLBACK[id];
  }
  return id;
}

/**
 * Board songs pick up where they left off when you come back to them (after Mister Chunk or a
 * minigame); everything else starts from the top.
 */
function play(id: string, restart?: boolean): void {
  id = resolve(id);
  restart ??= !id.startsWith('board:');
  if (RECORDED[id] && !brokenFiles.has(id)) {
    engine.playFile(id, RECORDED[id], 1, 0.8, restart);
    return;
  }
  const s = byId.get(id);
  if (s) engine.playSong(s);
}

export const music = {
  /** Start audio after the first user gesture (browsers block it before that). */
  unlock(): void {
    engine.unlock();
  },
  /** 0..1, remembered between visits. */
  setVolume(v: number): void {
    engine.setVolume(v);
    try {
      localStorage.setItem(VOL_KEY, String(engine.volume));
    } catch {
      /* ignore */
    }
  },
  volume(): number {
    return engine.volume;
  },
  /** Force a song (by id) regardless of the screen, e.g. 'mr-chop' or 'bonus-reel'. null hands control back. */
  override(id: string | null): void {
    overrideId = id;
    paused = false;
    if (id) play(id, true);
  },
  /** Pause (true) or carry on (false). While paused, syncMusic plays nothing. */
  setPaused(p: boolean): void {
    if (p === paused) return;
    paused = p;
    if (p) engine.stopAll(0.25);
    else resumeFile = true;
  },
  paused(): boolean {
    return paused;
  },
  /** Seconds into the recorded track on now, and its length (null for a generated song). */
  progress(): { t: number; dur: number } | null {
    return engine.fileProgress();
  },
  /** Jump the recorded track on now to a point, 0..1. */
  seek(frac: number): void {
    engine.seekFile(frac);
  },
  /** A frequency analyser on the music (made once, for the OST screen's visualizer). */
  analyser(): AnalyserNode | null {
    if (!analyserNode) analyserNode = engine.analyser();
    return analyserNode;
  },
  /** Speed the current song up (last seconds of a timed game). */
  setHurry(on: boolean): void {
    hurry = on;
  },
  /** Play any song directly (jukebox). */
  play,
  stop(): void {
    engine.stopAll();
  },
  current(): string | null {
    return engine.current();
  },
  /** The menu mp3 failed to load: fall back to the generated title theme. */
  menuFileMissing(): void {
    brokenFiles.add('menu');
  },
};

/** Which song belongs on screen right now. */
export function trackFor(s: PartyState | null | undefined): string {
  if (!s || s.phase === 'lobby') return 'menu';
  switch (s.phase) {
    case 'board':
      if (!s.board) return 'results';
      return boardTrack(s.board);
    case 'intro':
    case 'play':
      return s.gameId ? songForGame(s.gameId).id : 'results';
    case 'results':
      return 'results';
    case 'final':
      return 'finale';
  }
  return 'menu';
}

/** A board's song. Boards that transform swap songs with them. */
function boardTrack(b: BoardState): string {
  // Mister Chunk brings his own theme when he stomps in
  if (b.sub === 'chunk' && hasFile('mister-chunk')) return 'mister-chunk';
  // landing on a Duel or Stew Battle space: from picking a rival until the battle starts
  const duel = (b.prompt?.kind === 'target' && b.prompt.purpose === 'duel') || b.event?.kind === 'duel';
  if (duel && hasFile('duel-space')) return 'duel-space';
  if (b.event?.kind === 'stew' && hasFile('stew-space')) return 'stew-space';
  if (b.boardId === 'lantern-hollow' && b.night) return 'board:lantern-hollow-night';
  if (b.boardId === 'stew-court' && b.choppy) {
    // the Chop Pit cue plays while the player taking their turn is locked in the cage
    const me = b.players[b.order[b.cur]];
    const pit = getBoard(b.boardId).pit;
    return me && pit?.includes(me.node) ? 'board:stew-court-pit' : 'board:stew-court-choppy';
  }
  return `board:${b.boardId}`;
}

let tempo = 1;
/**
 * Call once per frame. Picks the song for the current screen, crossfades when it changes, ducks
 * the music under the pause menu and the minigame intro, and eases the tempo for hurry mode.
 */
export function syncMusic(s: PartyState | null | undefined, dt: number): void {
  const id = overrideId ?? trackFor(s);
  if (paused) return;
  if (engine.current() !== resolve(id)) play(id, resumeFile ? false : undefined);
  resumeFile = false;
  engine.duck(s?.pause ? 0.35 : s?.phase === 'intro' && !overrideId ? 0.6 : 1);
  const want = hurry && s?.phase === 'play' ? 1.15 : 1;
  tempo += (want - tempo) * Math.min(1, dt * 2);
  engine.tempo = tempo;
  if (s?.phase !== 'play') hurry = false;
}
