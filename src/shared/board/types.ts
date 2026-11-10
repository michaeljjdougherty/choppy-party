import type { Rng } from '../rng';

export type SpaceType = 'blue' | 'red' | 'event' | 'lucky' | 'wisp' | 'station' | 'counter';

export interface BoardNode {
  id: string;
  x: number; // world units
  z: number;
  type: SpaceType;
  next: string[];
  /** Lantern Hollow: different exits by day and by night. */
  gate?: { day: string[]; night: string[] };
  /** Laser Lane spaces on Cosmo Junction. */
  lane?: boolean;
}

export interface BoardDef {
  id: string;
  name: string;
  /** Recommended player range, shown in board select. */
  players: [number, number];
  tagline: string;
  gimmick: string;
  theme: 'hollow' | 'cosmo' | 'gulch';
  nodes: Record<string, BoardNode>;
  start: string;
  crownSpots: string[];
  /** How many crowns are on the board at once. */
  crownsActive: number;
  /** Stations in train order (Gold Rush Gulch). */
  stations?: string[];
}

export interface BoardPlayer {
  id: string;
  node: string;
  coins: number;
  crowns: number;
}

export type Prompt =
  | { kind: 'crown'; node: string }
  | { kind: 'wisp' }
  | { kind: 'train'; to: string };

export type BoardSub = 'turnIntro' | 'roll' | 'rolled' | 'move' | 'branch' | 'prompt' | 'land' | 'done';

export interface BoardState {
  boardId: string;
  turn: number; // 1-based
  maxTurns: number;
  order: string[];
  cur: number;
  sub: BoardSub;
  t: number;
  roll: number;
  stepsLeft: number;
  hop: { from: string; to: string; t: number } | null;
  branch: { options: string[]; sel: number } | null;
  prompt: Prompt | null;
  players: Record<string, BoardPlayer>;
  crowns: string[]; // nodes with an active crown
  night: boolean;
  counter: number;
  banner: { text: string; color: string; t: number } | null;
  log: string[];
  rng: Rng;
}

export const CROWN_PRICE = 20;
export const WISP_PRICE = 10;
export const TRAIN_PRICE = 5;
export const COUNTER_START = 8;
export const HOP_TIME = 0.28;
