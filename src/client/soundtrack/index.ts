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
  'board:stew-court': 'music/stew-court-fucci.mp3',
  'board:stew-court-choppy': 'music/stew-court-choppy.mp3',
  'board:stew-court-pit': 'music/stew-court-pit.mp3',
};
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

/** The id that actually plays for a song: itself if it has a working file or a spec, else its fallback. */
function resolve(id: string): string {
  for (let i = 0; i < 8; i++) {
    if ((RECORDED[id] && !brokenFiles.has(id)) || byId.has(id) || !FALLBACK[id]) return id;
    id = FALLBACK[id];
  }
  return id;
}

function play(id: string): void {
  id = resolve(id);
  if (RECORDED[id] && !brokenFiles.has(id)) {
    engine.playFile(id, RECORDED[id]);
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
    if (id) play(id);
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
  if (engine.current() !== resolve(id)) play(id);
  engine.duck(s?.pause ? 0.35 : s?.phase === 'intro' && !overrideId ? 0.6 : 1);
  const want = hurry && s?.phase === 'play' ? 1.15 : 1;
  tempo += (want - tempo) * Math.min(1, dt * 2);
  engine.tempo = tempo;
  if (s?.phase !== 'play') hurry = false;
}
