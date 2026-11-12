import type { PartyState } from './party';
import { beginRound, finishGame, inGame, setPhase, startEnding } from './party';
import { GAMES, getGame } from './games';
import { getBoard } from './board/boards';
import { STEW_GAMES, beginStew, chunkSpace, currentPlayer, hurt, placeChest, roundEnd, startDuel } from './board/engine';
import type { BoardState, ItemId } from './board/types';
import { ITEM_IDS } from './board/items';

/**
 * Developer mode: shortcuts for testing a party by hand. Every function changes the party state
 * directly, so they only make sense on a local game (this screen runs the party).
 */

/** Board moments where it's safe to start something new: someone is about to roll. */
export function boardIdle(b: BoardState | null): boolean {
  return !!b && (b.sub === 'roll' || b.sub === 'turnIntro') && b.rolls.length === 0;
}

const reseed = (s: PartyState) => (s.rng.seed = (Math.imul(s.rng.seed, 1103515245) + 12345) | 0);

/** The players a minigame can take: duels get two, Stew Battles get two even teams. */
function lineup(s: PartyState, id: string, from = s.players) {
  const g = getGame(id);
  let who = from.map((p) => ({ ...p, team: undefined as number | undefined }));
  // the player whose turn it is goes first, so a duel always has them in it
  const cur = s.board ? currentPlayer(s.board) : null;
  if (cur) who.sort((a, b) => (a.id === cur ? -1 : b.id === cur ? 1 : 0));
  if (who.length > g.maxPlayers) who = who.slice(0, g.maxPlayers);
  if (STEW_GAMES.includes(id) || g.mode === 'Team') {
    if (who.length % 2 === 1 && who.length > 2) who = who.slice(0, who.length - 1);
    who = who.map((p, i) => ({ ...p, team: [0, 1, 1, 0][i % 4] }));
  }
  return who;
}

/** Play minigame `id` right now. From a board, the party comes back to the same spot afterwards. */
export function devPlayGame(s: PartyState, id: string): void {
  if (s.phase === 'board') {
    if (!boardIdle(s.board)) return;
    s.devBack = true;
  }
  if (s.phase === 'play' || s.phase === 'intro') {
    // switching from one minigame to another: keep this round's slot, swap the game
    const g = getGame(id);
    s.playlist[s.round] = id;
    s.gameId = id;
    // the same players stay in (a board duel stays between the same two)
    s.gamePlayers = lineup(s, id, inGame(s));
    reseed(s);
    s.game = g.setup(s.gamePlayers, s.rng.seed);
    setPhase(s, 'intro');
    return;
  }
  if (s.phase !== 'board' && s.phase !== 'results' && s.phase !== 'final') return;
  s.playlist.push(id);
  s.round = s.playlist.length - 1;
  beginRound(s);
  // beginRound gives everyone a seat; small games get a fair lineup instead
  const g = getGame(id);
  if (s.players.length > g.maxPlayers || STEW_GAMES.includes(id) || g.mode === 'Team') {
    s.gamePlayers = lineup(s, id);
    reseed(s);
    s.game = g.setup(s.gamePlayers, s.rng.seed);
  }
}

/** A random minigame that fits this many players (any kind). */
export function randomGameId(s: PartyState, n = s.players.length): string {
  const pool = GAMES.filter((g) => n >= g.minPlayers);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** End the minigame now, with the standings as they are. */
export function devEndGame(s: PartyState): void {
  if (s.phase === 'intro') setPhase(s, 'play');
  if (s.phase === 'play' && s.gameId) finishGame(s);
}

/** Start this minigame over from its intro. */
export function devRestartGame(s: PartyState): void {
  if ((s.phase !== 'play' && s.phase !== 'intro') || !s.gameId) return;
  reseed(s);
  s.game = getGame(s.gameId).setup(inGame(s), s.rng.seed);
  setPhase(s, 'intro');
}

/** Skip the intro screen and start playing. */
export function devSkipIntro(s: PartyState): void {
  if (s.phase === 'intro') setPhase(s, 'play');
}

// ---- the board ----------------------------------------------------------------------------------

/** Skip Square Brian's tour and the turn-order roll: the first player is about to roll. */
export function devSkipBoardIntro(s: PartyState): void {
  const b = s.board;
  if (!b || (b.sub !== 'tour' && b.sub !== 'orderRoll' && b.sub !== 'orderShow')) return;
  b.tour = null;
  b.order.forEach((id, i) => (b.orderRolls[id] = 12 - i));
  b.baseOrder = [...b.order];
  b.cur = 0;
  b.sub = 'turnIntro';
  b.t = 0;
}

/**
 * Put a player on any space. With `land`, the current player lands there as if they had walked
 * there (the space does its thing and their turn ends); otherwise they're just moved.
 */
export function devTeleport(s: PartyState, id: string, node: string, land: boolean): void {
  const b = s.board;
  if (!b || !b.players[id]) return;
  const def = getBoard(b.boardId);
  if (!def.nodes[node]) return;
  const me = b.players[id];
  me.node = node;
  me.ko = false;
  b.fx.push({ n: ++b.fxSeq, kind: 'warp', node, id, t: 0 });
  if (land && currentPlayer(b) === id && boardIdle(b)) {
    // walk zero steps: the move ends right here and the space goes off
    b.rolls = [0];
    b.diceN = 1;
    b.roll = 0;
    b.stepsLeft = 0;
    b.hop = null;
    b.branch = null;
    b.prompt = null;
    b.sub = 'move';
    b.t = 0;
  }
}

export function devCoins(s: PartyState, id: string, n: number): void {
  const p = s.board?.players[id];
  if (!p) return;
  p.keys = Math.max(0, p.keys + n);
  s.scores[id] = p.keys;
}

export function devGlobs(s: PartyState, id: string, n: number): void {
  const p = s.board?.players[id];
  if (p) p.crowns = Math.max(0, p.crowns + n);
}

export function devHeal(s: PartyState, id: string): void {
  const b = s.board;
  const p = b?.players[id];
  if (b && p) p.hp = b.preset.maxHp;
}

export function devDamage(s: PartyState, id: string, n: number): void {
  const b = s.board;
  const p = b?.players[id];
  if (!b || !p) return;
  p.fresh = 0;
  p.shield = false;
  hurt(b, getBoard(b.boardId), id, n);
}

export function devGiveItem(s: PartyState, id: string, item: ItemId): void {
  const b = s.board;
  const p = b?.players[id];
  if (!b || !p) return;
  // the bag holds maxItems: the oldest item makes room
  if (p.items.length >= b.preset.maxItems) p.items.shift();
  p.items.push(item);
}

export function devFillItems(s: PartyState, id: string): void {
  const b = s.board;
  const p = b?.players[id];
  if (!b || !p) return;
  p.items = [...ITEM_IDS].sort(() => Math.random() - 0.5).slice(0, b.preset.maxItems);
}

/** Lantern Hollow: day and night. Stew Court: the Fucci Verse and the Choppy Verse. */
export function devFlipTime(s: PartyState): void {
  const b = s.board;
  if (!b) return;
  const def = getBoard(b.boardId);
  if (def.theme === 'court') {
    b.choppy = !b.choppy;
    b.chopRounds = 0;
  } else b.night = !b.night;
}

/** Move the Chobglob Chest somewhere new (or onto a chosen space). */
export function devMoveChest(s: PartyState, node?: string): void {
  const b = s.board;
  if (!b) return;
  const def = getBoard(b.boardId);
  b.lastChest = [...b.crowns];
  b.crowns = [];
  if (node && def.nodes[node]) b.crowns.push(node);
  else placeChest(b, def);
  if (!b.crowns.length) b.crowns = b.lastChest;
}

/** The map's villain drops in at once (Stew Court's Evil LeBron). This ends the round. */
export function devBoss(s: PartyState): boolean {
  const b = s.board;
  if (!b || !boardIdle(b)) return false;
  const def = getBoard(b.boardId);
  if (!def.boss) return false;
  b.choppy = true;
  b.bossTurn = undefined;
  b.bossLast = undefined;
  b.chopRounds = def.boss.every - 1;
  roundEnd(b, def);
  return true;
}

/** Mister Chunk shows up for whoever's turn it is (uses up their turn). */
export function devChunk(s: PartyState): void {
  const b = s.board;
  if (!b || !boardIdle(b)) return;
  chunkSpace(b, currentPlayer(b));
}

/** A duel between whoever's turn it is and someone at random. */
export function devDuel(s: PartyState): void {
  const b = s.board;
  if (!b || !boardIdle(b) || b.order.length < 2) return;
  const me = currentPlayer(b);
  const others = b.order.filter((o) => o !== me);
  startDuel(b, me, others[Math.floor(Math.random() * others.length)]);
}

export function devStew(s: PartyState): void {
  const b = s.board;
  if (!b || !boardIdle(b)) return;
  beginStew(b, getBoard(b.boardId), currentPlayer(b));
}

/** Skip everyone else's turn: the round's hazards go off, then the minigame. */
export function devRoundEnd(s: PartyState): void {
  const b = s.board;
  if (!b || !boardIdle(b)) return;
  roundEnd(b, getBoard(b.boardId));
}

/** Jump the turn counter (the board's last turns pay double, the last turn ends the game). */
export function devSetTurn(s: PartyState, turn: number): void {
  const b = s.board;
  if (!b) return;
  b.turn = Math.max(1, Math.min(b.maxTurns, turn));
}

export function devSetMaxTurns(s: PartyState, n: number): void {
  const b = s.board;
  if (!b) return;
  b.maxTurns = Math.max(b.turn, Math.min(99, n));
}

/** Straight to the end of the game: standings, bonus awards and the finale. */
export function devEndBoard(s: PartyState): void {
  const b = s.board;
  if (!b) return;
  s.devBack = false;
  s.gameId = null;
  s.game = null;
  s.gamePlayers = null;
  s.boardEvent = null;
  startEnding(s);
}

/** Loaded dice: both dice show these faces until cleared (null = fair dice). */
export function devDice(s: PartyState, faces: number[] | null): void {
  if (s.board) s.board.devDice = faces ?? [];
}
