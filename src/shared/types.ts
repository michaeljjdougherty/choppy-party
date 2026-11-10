/** Logical arena size. The canvas is scaled to fit the window. */
export const VIEW_W = 1280;
export const VIEW_H = 720;
/** Simulation rate, shared by local play and the server. */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** Raw controller state as a device reports it. Counters let quick taps survive the network. */
export interface RawInput {
  x: number; // -1..1
  y: number; // -1..1
  a: boolean;
  b: boolean;
  aCount: number; // total A presses ever
  bCount: number;
}

/** Input as a minigame sees it on one tick. */
export interface TickInput {
  x: number;
  y: number;
  a: boolean; // held
  b: boolean;
  aPressed: boolean; // pressed since last tick
  bPressed: boolean;
  aTaps: number; // presses since last tick (for mashing)
  bTaps: number;
}

export const NO_INPUT: TickInput = { x: 0, y: 0, a: false, b: false, aPressed: false, bPressed: false, aTaps: 0, bTaps: 0 };
export const EMPTY_RAW: RawInput = { x: 0, y: 0, a: false, b: false, aCount: 0, bCount: 0 };

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  slot: number; // 0..9, picks colour and face
  /** Team games: 0 or 1. Set by the board for Stew Battles. */
  team?: number;
  /** Computer player and how good it is. */
  bot?: 'easy' | 'normal' | 'hard';
}

export type Inputs = Record<string, TickInput>;

export type GameMode = 'Free-for-all' | 'Team' | '1-vs-many' | 'Duel';

export interface ResultRow {
  id: string;
  /** Higher is better. Equal values tie. */
  value: number;
  /** What to show next to the player on the results screen. */
  label: string;
}

/**
 * Every minigame is one of these. State must be plain JSON so the server can send it as a snapshot.
 * `step` may mutate the state it is given; `draw` must not.
 */
export interface Minigame<S = any> {
  id: string;
  name: string;
  mode: GameMode;
  /** One-line rule shown on the instructions card. */
  blurb: string;
  controls: string;
  minPlayers: number;
  maxPlayers: number;
  /** Seconds of countdown at the start (state.t runs through it). The HUD shows 3, 2, 1, GO! over it. */
  ready?: number;
  /** Word shown when the countdown ends (default GO!). */
  goWord?: string;
  setup(players: PlayerInfo[], seed: number): S;
  step(state: S, inputs: Inputs, dt: number): void;
  isOver(state: S): boolean;
  results(state: S): ResultRow[];
  /** 2D HUD (timer, scores, callouts) drawn on top of the 3D view. The 3D scene lives in src/client/three/views. */
  draw(ctx: CanvasRenderingContext2D, state: S, players: PlayerInfo[]): void;
}

export function toTickInput(raw: RawInput, prev: RawInput | undefined): TickInput {
  const aTaps = Math.max(0, raw.aCount - (prev?.aCount ?? raw.aCount));
  const bTaps = Math.max(0, raw.bCount - (prev?.bCount ?? raw.bCount));
  return {
    x: clamp(raw.x, -1, 1),
    y: clamp(raw.y, -1, 1),
    a: raw.a,
    b: raw.b,
    aPressed: aTaps > 0,
    bPressed: bTaps > 0,
    aTaps: Math.min(aTaps, 4),
    bTaps: Math.min(bTaps, 4),
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
