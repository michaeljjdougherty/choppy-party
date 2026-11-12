import type { BoardDef, BoardState } from './types';

/**
 * Weather zones: each map has areas with their own weather. The zone is tinted on the board,
 * and the HUD shows what it's doing this round and next so players can decide whether to cross it.
 *
 * Lantern Hollow: Fog Marsh (low south lane) and Will-o'-Wind (the hilltop Chapel Path).
 * Cosmo Junction: Solar Flare (outer ring, domes are safe) and Low Gravity (the Command Core).
 * Gold Rush Gulch: Sandstorm (west dunes), Flash Flood (east riverbed) and Heatwave (south salt flats).
 */
export type WeatherKind = 'fog' | 'wind' | 'flare' | 'lowgrav' | 'sandstorm' | 'flood' | 'heat';

export interface WeatherZone {
  kind: WeatherKind;
  name: string;
  /** Where it is, in words ("the low south lane"). */
  area: string;
  nodes: string[];
  /** Brian's tour line for this zone, when the kind's usual line names another map's places. */
  tour?: string;
  /** Solar Flare: dome spaces on the ring that are safe from it. */
  shelters?: string[];
}

export interface WeatherState {
  /** Will-o'-Wind: 1 blows along the path, -1 blows back. */
  wind: number;
  windNext: number;
  /** Gulch: rain this round floods the riverbed at round end. */
  rain: boolean;
  rainNext: boolean;
  /** Gulch: the salt flats bake this round. */
  heat: boolean;
  heatNext: boolean;
  /** Keys washed out by a flood, waiting on a space for someone to pick up. */
  loose: Record<string, number>;
  /** Players blinded by the sandstorm: they can't see the Crown Chests until they leave the dunes. */
  blind: string[];
  /** The current roll is hidden in the fog until the move is over. */
  hiddenRoll: boolean;
}

export const WEATHER = {
  windPush: 2,
  flareEvery: 3,
  flareDamage: 10,
  lowGravBonus: 2,
  stormEvery: 3,
  stormDamage: 5,
  stormPush: 2,
  floodPush: 4,
  floodDrop: 3,
  rainChance: 0.35,
  heatChance: 0.45,
  heatDamage: 2,
};

export const WEATHER_COLOR: Record<WeatherKind, string> = {
  fog: '#c9d6e8',
  wind: '#a8f0ff',
  flare: '#ffb02e',
  lowgrav: '#b48cff',
  sandstorm: '#e0b46a',
  flood: '#3fa9f5',
  heat: '#ff6a3d',
};

export function newWeather(): WeatherState {
  return { wind: 1, windNext: -1, rain: false, rainNext: false, heat: false, heatNext: false, loose: {}, blind: [], hiddenRoll: false };
}

/** The zone of this kind a space is in, if any. */
export function zoneAt(def: BoardDef, node: string, kind?: WeatherKind): WeatherZone | null {
  for (const z of def.weather ?? []) if ((!kind || z.kind === kind) && z.nodes.includes(node)) return z;
  return null;
}

export const inZone = (def: BoardDef, node: string, kind: WeatherKind) => !!zoneAt(def, node, kind);

/** Flares and sandstorms come every few rounds; this says whether this round ends with one. */
export const flareThisRound = (s: BoardState) => s.turn % WEATHER.flareEvery === 0;
export const stormThisRound = (s: BoardState) => s.turn % WEATHER.stormEvery === 0;

/** Is this zone doing something right now (for the tint and particles)? */
export function zoneActive(s: BoardState, z: WeatherZone): boolean {
  switch (z.kind) {
    case 'fog':
      return s.night;
    case 'wind':
    case 'lowgrav':
      return true;
    case 'flare':
      return flareThisRound(s);
    case 'sandstorm':
      return stormThisRound(s);
    case 'flood':
      return s.weather.rain;
    case 'heat':
      return s.weather.heat;
  }
}

/** One line per zone for the forecast panel: what it does this round, and what's coming next. */
export function forecast(s: BoardState, z: WeatherZone): { now: string; next: string; warn: boolean } {
  const w = s.weather;
  const last = s.turn >= s.maxTurns;
  const next = (txt: string) => (last ? '' : txt);
  switch (z.kind) {
    case 'fog':
      return { now: s.night ? 'Fogged in: hidden rolls, items can\'t target you' : 'At night: hidden rolls, safe from items', next: next(s.night ? 'Until day' : 'Fogs in at night'), warn: s.night };
    case 'wind':
      return { now: `Round end: blows everyone ${w.wind > 0 ? 'ahead' : 'back'} 2`, next: next(`Next: ${w.windNext > 0 ? 'ahead' : 'back'}`), warn: true };
    case 'flare':
      return {
        now: flareThisRound(s) ? `Round end: ${WEATHER.flareDamage} damage! Get under a dome` : 'Calm sun',
        next: next(flareThisRound(s) ? 'Next: calm' : s.turn % WEATHER.flareEvery === WEATHER.flareEvery - 1 ? 'Next: FLARE!' : `Flare in ${WEATHER.flareEvery - (s.turn % WEATHER.flareEvery)} rounds`),
        warn: flareThisRound(s),
      };
    case 'lowgrav':
      return { now: `Rolls +${WEATHER.lowGravBonus}, but you drift at forks`, next: '', warn: false };
    case 'sandstorm':
      return {
        now: stormThisRound(s) ? `Round end: ${WEATHER.stormDamage} damage, pushed, blinded` : 'Dunes are still',
        next: next(stormThisRound(s) ? 'Next: calm' : s.turn % WEATHER.stormEvery === WEATHER.stormEvery - 1 ? 'Next: SANDSTORM!' : `Storm in ${WEATHER.stormEvery - (s.turn % WEATHER.stormEvery)} rounds`),
        warn: stormThisRound(s),
      };
    case 'flood':
      return { now: w.rain ? `Raining! Floods at round end` : 'Dry riverbed', next: next(w.rainNext ? 'Next: rain!' : 'Next: dry'), warn: w.rain };
    case 'heat':
      return { now: w.heat ? `-${WEATHER.heatDamage} HP a step, hearts don't heal` : 'Mild day', next: next(w.heatNext ? 'Next: heatwave!' : 'Next: mild'), warn: w.heat };
  }
}

export const WEATHER_TOUR: Record<WeatherKind, string> = {
  fog: `At night fog fills the Fog Marsh. Rolls in there stay hidden until you're done moving, and nobody can target you with items. Good for hiding.`,
  wind: `Up on the hilltop the Will-o'-Wind blows. At the end of each round it pushes everyone up there ${WEATHER.windPush} spaces, and it changes direction every round.`,
  flare: `Every ${WEATHER.flareEvery} rounds a Solar Flare scorches the outer ring for ${WEATHER.flareDamage}. Stand under one of the glass domes and you're safe.`,
  lowgrav: `The Docking Arm has low gravity. Roll from out there and you get +${WEATHER.lowGravBonus}, but at every fork you float off down a random path.`,
  sandstorm: `Every ${WEATHER.stormEvery} rounds a sandstorm sweeps the dunes: ${WEATHER.stormDamage} damage, a push of ${WEATHER.stormPush}, and you can't see the Chobglob Chests until you get out.`,
  flood: `When it rains, the dry riverbed floods. Anyone in it gets washed ${WEATHER.floodPush} spaces downstream and drops ${WEATHER.floodDrop} Pit Coin for someone else to grab.`,
  heat: `On a heatwave the salt flats bake. Every step there costs ${WEATHER.heatDamage} HP and Heart Spaces heal nothing. The panel top left says when it's coming.`,
};
