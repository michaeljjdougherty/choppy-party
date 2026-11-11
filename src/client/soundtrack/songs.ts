/**
 * The Choppy Party soundtrack: one original song per minigame, board and screen.
 * Every song is composed in the browser from these descriptions (see compose.ts), so there are
 * no audio files and nothing to license.
 *
 * Keys: 60 = C, 62 = D, 64 = E, 65 = F, 67 = G, 69 = A, 70 = Bb, 57 = A (low), 58 = Bb (low).
 */
import type { SongSpec } from './compose';

type S = SongSpec;

// ---- screens ----------------------------------------------------------------------------------

export const SCREEN_SONGS: S[] = [
  {
    id: 'title', title: 'Choppy Party!', mood: 'Main theme: big, bright and bouncy party brass',
    bpm: 132, key: 65, mode: 'major', form: 'AABA', prog: { A: '1 6 4 5 1 6 2 5', B: '4 4 1 1 2 2 5 5' },
    lead: 'brass', melody: 'fanfare', counter: 'strings',
    parts: [{ voice: 'piano', style: 'stab' }, { voice: 'bell', style: 'arp', oct: 1, gain: 0.25, only: 'B' }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'disco', seed: 7,
  },
  {
    id: 'lobby', title: 'Pick Your Choppy', mood: 'Lobby: laid-back, funky hangout groove',
    bpm: 104, key: 62, mode: 'dorian', form: 'AABB', prog: { A: '1 4 1 4', B: '6 7 1 1' }, swing: 0.2,
    lead: 'organ', melody: 'synco', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'synco' }, drums: 'funk', seed: 11,
  },
  {
    id: 'results', title: 'Who Got the Coin?', mood: 'Minigame results: cheery strut',
    bpm: 116, key: 67, mode: 'major', form: 'AB', prog: { A: '1 4 1 5', B: '4 5 3 6' }, swing: 0.25,
    lead: 'pulse', melody: 'bouncy', parts: [{ voice: 'piano', style: 'stab' }, { voice: 'bell', style: 'arp', oct: 1, gain: 0.2 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'shuffle', seed: 3,
  },
  {
    id: 'finale', title: 'Crowned!', mood: 'Final results: triumphant anthem with timpani',
    bpm: 96, key: 70, mode: 'major', form: 'AAB', prog: { A: '1 5 6 4 1 5 4 1', B: '4 5 6 4 2 5 1 1' },
    lead: 'brass', melody: 'march', counter: 'strings', leadOct: -1,
    parts: [{ voice: 'strings', style: 'pad', gain: 0.6 }, { voice: 'bell', style: 'arp', oct: 1, gain: 0.22 }],
    bass: { voice: 'tuba', style: 'root' }, drums: 'march', reverb: 0.3, seed: 21,
  },
  {
    id: 'bonus-reel', title: 'Bonus Chobglob Roulette', mood: 'Bonus Chobglob slot reel: ticking suspense',
    bpm: 150, key: 57, mode: 'harmonic', form: 'AB', prog: { A: '1 1 6 5', B: '4 4 5 5' },
    lead: 'square', melody: 'fast', parts: [{ voice: 'pulse', style: 'arp16', oct: 1, gain: 0.25 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'chase', seed: 5,
  },
  {
    id: 'mr-chop', title: 'You Are Invited to Dinner', mood: 'Mr. Chop appears: cosmic organ and choir',
    bpm: 66, key: 62, mode: 'phrygdom', form: 'AB', prog: { A: '1 2 1 7', B: '6 2 5 1' },
    lead: 'choir', melody: 'lyrical', leadOct: -1,
    parts: [{ voice: 'organ', style: 'pad', oct: -1, gain: 0.6 }, { voice: 'bell', style: 'hits', oct: 1, gain: 0.3 }],
    bass: { voice: 'sub', style: 'pedal' }, drums: 'spooky', reverb: 0.55, seed: 66,
  },
  {
    id: 'duel-intro', title: 'Showdown', mood: 'Duel or Stew Battle announced: rising drums',
    bpm: 120, key: 64, mode: 'phrygdom', form: 'A', prog: { A: '1 1 2 1' },
    lead: 'brass', melody: 'fanfare', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.4 }],
    bass: { voice: 'tuba', style: 'pump' }, drums: 'tribal', seed: 13,
  },
];

// ---- boards -------------------------------------------------------------------------------------

export const BOARD_SONGS: S[] = [
  {
    id: 'board:lantern-hollow', title: 'Lantern Hollow Stroll', mood: 'Spooky-cute lantern festival in the woods',
    bpm: 108, key: 62, mode: 'dorian', form: 'AABA', prog: { A: '1 4 1 5', B: '6 7 1 5' }, swing: 0.3,
    lead: 'harpsi', melody: 'sneaky', counter: 'flute',
    parts: [{ voice: 'musicbox', style: 'arp', oct: 1, gain: 0.25 }], bass: { voice: 'upright', style: 'walking' }, drums: 'spooky', reverb: 0.3, seed: 31,
  },
  {
    id: 'board:cosmo-junction', title: 'Cosmo Junction Lounge', mood: 'Space station lounge, smooth and starry',
    bpm: 104, key: 65, mode: 'lydian', form: 'AABB', prog: { A: '1 2 1 2', B: '4 3 6 5' },
    lead: 'synth', melody: 'lyrical', parts: [{ voice: 'bell', style: 'arp', gain: 0.3 }, { voice: 'strings', style: 'pad', gain: 0.4 }],
    bass: { voice: 'synthbass', style: 'synco' }, drums: 'bossa', echo: 0.25, seed: 41,
  },
  {
    id: 'board:gold-rush-gulch', title: 'Gold Rush Hoedown', mood: 'Saloon piano and banjo on the dusty trail',
    bpm: 126, key: 67, mode: 'mixolydian', form: 'AABA', prog: { A: '1 1 7 1 1 4 5 1', B: '4 4 1 1 2 2 5 5' }, swing: 0.2,
    lead: 'banjo', melody: 'bouncy', counter: 'whistle',
    parts: [{ voice: 'piano', style: 'stab' }], bass: { voice: 'tuba', style: 'oompah' }, drums: 'gallop', seed: 51,
  },
];

// ---- minigames: built ---------------------------------------------------------------------------

export const GAME_SONGS: S[] = [
  {
    id: 'shrinking-rink', title: 'Thin Ice Waltz', mood: 'Glittering ice-skating waltz',
    bpm: 168, meter: 3, key: 67, mode: 'major', form: 'AABA', prog: { A: '1 1 5 5 5 5 1 1', B: '4 4 1 1 2 5 1 1' },
    lead: 'bell', melody: 'waltz', counter: 'strings', parts: [{ voice: 'strings', style: 'waltz', gain: 0.4 }],
    bass: { voice: 'upright', style: 'oompah' }, drums: 'waltz', reverb: 0.3, seed: 101,
  },
  {
    id: 'quick-draw-cactus', title: 'High Noon Cactus', mood: 'Lonely whistle, twangy guitar, a standoff',
    bpm: 92, key: 64, mode: 'phrygdom', form: 'AB', prog: { A: '1 1 2 1', B: '7 6 2 1' },
    lead: 'whistle', melody: 'lyrical', parts: [{ voice: 'guitar', style: 'strum', gain: 0.5 }],
    bass: { voice: 'upright', style: 'root' }, drums: 'spooky', reverb: 0.4, seed: 102,
  },
  {
    id: 'pancake-panic', title: 'Short Stack Swing', mood: 'Hot diner big-band swing',
    bpm: 176, key: 70, mode: 'major', form: 'AABA', prog: { A: '1 6 2 5', B: '4 4 1 1' }, swing: 0.33,
    lead: 'brass', melody: 'bouncy', counter: 'organ', parts: [{ voice: 'piano', style: 'stab' }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'shuffle', seed: 103,
  },
  {
    id: 'coin-cloudburst', title: 'Raining Riches', mood: 'Sunny marimba calypso, coins from the sky',
    bpm: 124, key: 65, mode: 'major', form: 'AABB', prog: { A: '1 4 5 1', B: '4 5 3 6' },
    lead: 'marimba', melody: 'synco', counter: 'steel', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'bass', style: 'synco' }, drums: 'calypso', seed: 104,
  },
  {
    id: 'meteor-shower', title: 'Incoming!', mood: 'Urgent space synths and pulsing arps',
    bpm: 140, key: 57, mode: 'minor', form: 'AABB', prog: { A: '1 6 7 1', B: '6 4 7 5' },
    lead: 'synth', melody: 'driving', parts: [{ voice: 'pulse', style: 'arp16', gain: 0.25 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'techno', echo: 0.2, seed: 105,
  },
  {
    id: 'present-pile-up', title: 'Pile It High', mood: 'Sleigh-bell holiday polka',
    bpm: 160, key: 67, mode: 'major', form: 'AABA', prog: { A: '1 1 5 5 5 5 1 1', B: '4 4 1 1 2 5 1 1' },
    lead: 'bell', melody: 'bouncy', counter: 'flute', parts: [{ voice: 'accordion', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'sleigh', seed: 106,
  },
  {
    id: 'graveyard-shift', title: 'Night Shift Shuffle', mood: 'Creepy-fun graveyard swing with theremin',
    bpm: 120, key: 62, mode: 'harmonic', form: 'AABA', prog: { A: '1 4 1 5', B: '6 6 4 5' }, swing: 0.3,
    lead: 'theremin', melody: 'sneaky', parts: [{ voice: 'harpsi', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'spooky', reverb: 0.4, seed: 107,
  },
  {
    id: 'train-hop', title: 'Full Steam', mood: 'Chugging train shuffle with accordion',
    bpm: 150, key: 64, mode: 'mixolydian', form: 'AABA', prog: { A: '1 1 7 1', B: '4 4 1 5' },
    lead: 'accordion', melody: 'driving', counter: 'whistle', parts: [{ voice: 'banjo', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'bass', style: 'gallop' }, drums: 'train', seed: 108,
  },
  {
    id: 'fuse-draw', title: 'Short Fuse', mood: 'Duel: twangy standoff with a ticking fuse',
    bpm: 112, key: 62, mode: 'phrygdom', form: 'AB', prog: { A: '1 2 1 2', B: '6 7 1 1' },
    lead: 'guitar', melody: 'synco', counter: 'whistle', parts: [{ voice: 'banjo', style: 'pulse8', gain: 0.25 }],
    bass: { voice: 'upright', style: 'pump' }, drums: 'gallop', seed: 109,
  },
  {
    id: 'paddle-clash', title: 'Rally Point', mood: 'Duel: bleepy arcade rock',
    bpm: 148, key: 64, mode: 'minor', form: 'AABB', prog: { A: '1 6 3 7', B: '4 5 1 1' },
    lead: 'square', melody: 'driving', parts: [{ voice: 'pulse', style: 'arp', gain: 0.3 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'rock', seed: 110,
  },
  {
    id: 'rope-pull', title: 'Heave Ho!', mood: 'Stew Battle: stomping brass tug-of-war march',
    bpm: 120, key: 58, mode: 'minor', form: 'AAB', prog: { A: '1 1 5 5 1 1 5 1', B: '6 6 7 7 6 5 1 1' },
    lead: 'brass', melody: 'march', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.4 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'march', seed: 111,
  },
  {
    id: 'crate-grab', title: 'Grab Bag Funk', mood: 'Stew Battle: funky brass stabs',
    bpm: 112, key: 64, mode: 'dorian', form: 'AABB', prog: { A: '1 1 4 4', B: '6 7 1 1' },
    lead: 'organ', melody: 'synco', parts: [{ voice: 'brass', style: 'hits', gain: 0.5 }],
    bass: { voice: 'synthbass', style: 'synco' }, drums: 'funk', seed: 112,
  },
  {
    id: 'hot-potato-bomb', title: 'Pass It On!', mood: 'Frantic accordion polka, faster and faster',
    bpm: 184, key: 62, mode: 'harmonic', form: 'AABB', prog: { A: '1 5 5 1', B: '4 1 5 1' },
    lead: 'accordion', melody: 'fast', parts: [{ voice: 'pluck', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'polka', seed: 113,
  },
  {
    id: 'kitchen-raid', title: 'Tiptoe Through the Pantry', mood: 'Sneaky cartoon pizzicato',
    bpm: 116, key: 65, mode: 'minor', form: 'AABA', prog: { A: '1 5 1 5', B: '4 4 5 5' },
    lead: 'pluck', melody: 'sneaky', counter: 'tuba', parts: [{ voice: 'marimba', style: 'offbeat', gain: 0.25 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'sneaky', seed: 114,
  },
  {
    id: 'lantern-hunt', title: 'Paper Lanterns', mood: 'Night-festival flute and koto',
    bpm: 100, key: 62, mode: 'minor', avoid: [2, 6], form: 'AABB', prog: { A: '1 4 1 5', B: '6 7 4 1' },
    lead: 'flute', melody: 'lyrical', counter: 'koto', parts: [{ voice: 'koto', style: 'arp', gain: 0.3 }],
    bass: { voice: 'sub', style: 'root' }, drums: 'tribal', reverb: 0.35, seed: 115,
  },
  {
    id: 'haunted-memory', title: 'The Music Box Remembers', mood: 'Eerie music-box waltz',
    bpm: 96, meter: 3, key: 69, mode: 'harmonic', form: 'AABA', prog: { A: '1 4 5 1', B: '6 4 5 5' },
    lead: 'musicbox', melody: 'waltz', parts: [{ voice: 'strings', style: 'pad', oct: -1, gain: 0.35 }],
    bass: { voice: 'sub', style: 'root' }, drums: 'none', reverb: 0.5, seed: 116,
  },
  {
    id: 'snowball-scramble', title: 'Snow Day Rock', mood: 'Chilly bells over a snowball-fight rock beat',
    bpm: 152, key: 69, mode: 'major', form: 'AABB', prog: { A: '1 5 6 4', B: '4 5 1 1' },
    lead: 'square', melody: 'driving', counter: 'bell', parts: [{ voice: 'saw', style: 'pulse8', gain: 0.3 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'sleigh', seed: 117,
  },
  {
    id: 'laser-limbo', title: 'Reactor Core', mood: 'Pounding reactor techno that speeds up',
    bpm: 132, key: 62, mode: 'dorian', form: 'AABB', prog: { A: '1 1 7 7', B: '6 6 7 7' },
    lead: 'synth', melody: 'synco', parts: [{ voice: 'pulse', style: 'arp16', gain: 0.28 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'techno', echo: 0.25, seed: 118,
  },

  // ---- minigames: being built -------------------------------------------------------------------
  {
    id: 'treasure-dig', title: 'X Marks the Spot', mood: 'Rollicking island jig',
    bpm: 168, meter: 3, key: 62, mode: 'dorian', form: 'AABB', prog: { A: '1 1 7 7 1 1 5 1', B: '3 3 7 7 1 4 5 1' },
    lead: 'accordion', melody: 'jig', counter: 'whistle', parts: [{ voice: 'guitar', style: 'waltz', gain: 0.35 }],
    bass: { voice: 'upright', style: 'oompah' }, drums: 'jig', seed: 119,
  },
  {
    id: 'cannon-king', title: 'Broadside!', mood: 'Booming pirate battle brass',
    bpm: 132, key: 57, mode: 'harmonic', form: 'AAB', prog: { A: '1 6 4 5', B: '6 7 1 5' },
    lead: 'brass', melody: 'march', counter: 'strings', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'tuba', style: 'pump' }, drums: 'march', seed: 120,
  },
  {
    id: 'raft-rowing', title: 'Row Your Raft', mood: 'Easy-going river calypso',
    bpm: 112, key: 67, mode: 'major', form: 'AABB', prog: { A: '1 4 1 5', B: '4 1 5 1' },
    lead: 'steel', melody: 'synco', counter: 'marimba', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'bass', style: 'synco' }, drums: 'calypso', seed: 121,
  },
  {
    id: 'burger-builder', title: 'Order Up!', mood: 'Fifties diner rock and roll',
    bpm: 168, key: 67, mode: 'mixolydian', form: 'AABA', prog: { A: '1 1 4 1', B: '5 4 1 5' }, swing: 0.3,
    lead: 'brass', melody: 'driving', parts: [{ voice: 'piano', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'upright', style: 'boogie' }, drums: 'shuffle', seed: 122,
  },
  {
    id: 'color-craze', title: 'Paint Splash Disco', mood: 'Colourful four-on-the-floor disco',
    bpm: 122, key: 64, mode: 'dorian', form: 'AABB', prog: { A: '1 4 1 4', B: '6 7 1 1' },
    lead: 'synth', melody: 'synco', counter: 'strings', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'synthbass', style: 'octave' }, drums: 'disco', seed: 123,
  },
  {
    id: 'station-repair', title: 'Bolts and Bleeps', mood: 'Robotic space-station funk',
    bpm: 104, key: 65, mode: 'mixolydian', form: 'AABB', prog: { A: '1 1 7 1', B: '4 4 5 5' },
    lead: 'pulse', melody: 'synco', parts: [{ voice: 'synth', style: 'hits', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'synco' }, drums: 'funk', echo: 0.2, seed: 124,
  },
  {
    id: 'paint-the-plaza', title: 'Piazza Pizzazz', mood: 'Sunny bossa nova in the town square',
    bpm: 116, key: 62, mode: 'major', form: 'AABA', prog: { A: '1 2 5 1', B: '4 4 3 6' },
    lead: 'accordion', melody: 'synco', counter: 'flute', parts: [{ voice: 'guitar', style: 'strum', gain: 0.35 }],
    bass: { voice: 'upright', style: 'root' }, drums: 'bossa', seed: 125,
  },
  {
    id: 'alien-count', title: 'One Alien, Two Alien', mood: 'Quirky theremin counting song',
    bpm: 98, key: 64, mode: 'lydian', form: 'AABA', prog: { A: '1 2 1 2', B: '5 5 4 4' },
    lead: 'theremin', melody: 'sneaky', parts: [{ voice: 'marimba', style: 'arp', gain: 0.3 }],
    bass: { voice: 'synthbass', style: 'root' }, drums: 'sneaky', echo: 0.3, seed: 126,
  },
  {
    id: 'lights-out-freeze', title: 'Freeze Frame', mood: 'Tense stop-and-go suspense',
    bpm: 100, key: 57, mode: 'minor', form: 'AB', prog: { A: '1 1 6 5', B: '4 4 5 5' },
    lead: 'square', melody: 'sneaky', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.4 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'halftime', seed: 127,
  },
  {
    id: 'pumpkin-bowling', title: 'Gutter Ghouls', mood: 'Spooky Halloween bowling-alley swing',
    bpm: 138, key: 62, mode: 'harmonic', form: 'AABA', prog: { A: '1 4 1 5', B: '6 4 2 5' }, swing: 0.33,
    lead: 'organ', melody: 'bouncy', counter: 'theremin', parts: [{ voice: 'harpsi', style: 'stab', gain: 0.35 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'shuffle', reverb: 0.3, seed: 128,
  },
  {
    id: 'capture-the-crown', title: 'Long Live the Crown', mood: 'Royal fanfare march',
    bpm: 126, key: 65, mode: 'major', form: 'AABA', prog: { A: '1 4 5 1', B: '6 4 2 5' },
    lead: 'brass', melody: 'fanfare', counter: 'strings', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'march', seed: 129,
  },
  {
    id: 'last-seat', title: 'Musical Chairs', mood: 'Circus calliope that could stop any second',
    bpm: 176, key: 60, mode: 'major', form: 'AABA', prog: { A: '1 1 5 5 5 5 1 1', B: '4 4 1 1 2 5 1 1' },
    lead: 'calliope', melody: 'bouncy', parts: [{ voice: 'calliope', style: 'offbeat', oct: -1, gain: 0.3 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'polka', seed: 130,
  },
  {
    id: 'zombie-tag', title: 'Brains on the Run', mood: 'Horror chase breakbeat with choir',
    bpm: 150, key: 57, mode: 'harmonic', form: 'AABB', prog: { A: '1 1 6 5', B: '4 6 5 5' },
    lead: 'synth', melody: 'driving', parts: [{ voice: 'choir', style: 'pad', gain: 0.4 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'breakbeat', reverb: 0.3, seed: 131,
  },
  {
    id: 'chili-challenge', title: 'Too Hot to Handle', mood: 'Fiery trumpets and guitar, spicy 3/4',
    bpm: 186, meter: 3, key: 64, mode: 'harmonic', form: 'AABA', prog: { A: '1 1 5 5 5 5 1 1', B: '4 4 1 1 6 5 1 1' },
    lead: 'brass', melody: 'waltz', counter: 'brass', parts: [{ voice: 'guitar', style: 'waltz', gain: 0.4 }],
    bass: { voice: 'upright', style: 'oompah' }, drums: 'waltz', seed: 132,
  },
  {
    id: 'moving-day', title: 'Heavy Lifting', mood: 'Busy, bouncy funk for hauling furniture',
    bpm: 118, key: 67, mode: 'mixolydian', form: 'AABB', prog: { A: '1 4 1 4', B: '5 4 1 1' },
    lead: 'pulse', melody: 'synco', counter: 'brass', parts: [{ voice: 'piano', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'bass', style: 'synco' }, drums: 'funk', seed: 133,
  },
  {
    id: 'moonball', title: 'Low Gravity League', mood: 'Floaty, dreamy moon-sports groove',
    bpm: 92, key: 65, mode: 'lydian', form: 'AABB', prog: { A: '1 2 1 2', B: '4 5 6 5' },
    lead: 'sine', melody: 'lyrical', counter: 'bell', parts: [{ voice: 'synth', style: 'pad', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'root' }, drums: 'halftime', echo: 0.35, seed: 134,
  },
  {
    id: 'shanty-shuffle', title: 'Haul Away, Choppies', mood: 'Stomping sea shanty with choir',
    bpm: 112, key: 62, mode: 'dorian', form: 'AABB', prog: { A: '1 1 7 7 1 1 5 1', B: '3 7 1 5 1 1 5 1' },
    lead: 'accordion', melody: 'march', counter: 'choir', parts: [{ voice: 'guitar', style: 'strum', gain: 0.3 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'stomp', seed: 135,
  },
  {
    id: 'sushi-belt', title: 'Conveyor Cuisine', mood: 'Zippy koto and flute over a rolling belt',
    bpm: 128, key: 64, mode: 'minor', avoid: [2, 6], form: 'AABB', prog: { A: '1 6 7 1', B: '4 5 6 7' },
    lead: 'koto', melody: 'fast', counter: 'flute', parts: [{ voice: 'marimba', style: 'arp16', gain: 0.2 }],
    bass: { voice: 'bass', style: 'pump' }, drums: 'chase', seed: 136,
  },
  {
    id: 'mine-cart-mayhem', title: 'Off the Rails', mood: 'Breakneck banjo bluegrass',
    bpm: 192, key: 67, mode: 'mixolydian', form: 'AABB', prog: { A: '1 1 7 1', B: '4 4 5 1' },
    lead: 'banjo', melody: 'fast', counter: 'whistle', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.35 }],
    bass: { voice: 'upright', style: 'oompah' }, drums: 'gallop', seed: 137,
  },
  {
    id: 'rising-tide-tower', title: 'High Water', mood: 'Climbing strings, water rising fast',
    bpm: 140, key: 57, mode: 'minor', form: 'AABB', prog: { A: '1 6 3 7', B: '4 5 6 5' },
    lead: 'strings', melody: 'driving', parts: [{ voice: 'piano', style: 'arp16', gain: 0.25 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'breakbeat', seed: 138,
  },
  {
    id: 'sled-slalom', title: 'Downhill Dash', mood: 'Whooshing winter rock with sleigh bells',
    bpm: 158, key: 65, mode: 'lydian', form: 'AABB', prog: { A: '1 2 1 2', B: '4 5 6 5' },
    lead: 'square', melody: 'driving', counter: 'bell', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.3 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'sleigh', seed: 139,
  },
  {
    id: 'bumper-saucers', title: 'Saucer Smash', mood: 'Retro sci-fi bumper-car synth pop',
    bpm: 124, key: 62, mode: 'mixolydian', form: 'AABB', prog: { A: '1 7 4 1', B: '4 5 1 1' },
    lead: 'synth', melody: 'bouncy', parts: [{ voice: 'pulse', style: 'arp', gain: 0.3 }],
    bass: { voice: 'synthbass', style: 'octave' }, drums: 'disco', echo: 0.2, seed: 140,
  },
  {
    id: 'mimic-chest', title: 'Something in the Chest', mood: 'Sneaky harpsichord with a bite',
    bpm: 106, key: 64, mode: 'harmonic', form: 'AABA', prog: { A: '1 4 5 1', B: '6 2 5 5' },
    lead: 'harpsi', melody: 'sneaky', counter: 'tuba', parts: [{ voice: 'pluck', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'sneaky', reverb: 0.3, seed: 141,
  },
  {
    id: 'barrel-bands', title: 'Band Together', mood: 'Pirate carnival steel drums and accordion',
    bpm: 118, key: 67, mode: 'major', form: 'AABB', prog: { A: '1 4 5 1', B: '6 4 5 5' },
    lead: 'steel', melody: 'bouncy', counter: 'accordion', parts: [{ voice: 'guitar', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'tuba', style: 'oompah' }, drums: 'calypso', seed: 142,
  },
  // duels
  {
    id: 'road-hopper', title: 'Cross at the Light', mood: 'Duel: hoppy chiptune traffic dash',
    bpm: 162, key: 60, mode: 'major', form: 'AABB', prog: { A: '1 4 5 1', B: '6 4 5 5' },
    lead: 'square', melody: 'bouncy', parts: [{ voice: 'pulse', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'tri', style: 'octave' }, drums: 'chase', seed: 143,
  },
  {
    id: 'crate-stacker', title: 'Steady Hands', mood: 'Duel: careful, ticking marimba balance act',
    bpm: 104, key: 62, mode: 'dorian', form: 'AABB', prog: { A: '1 4 1 4', B: '6 7 1 1' },
    lead: 'marimba', melody: 'sneaky', counter: 'pluck', parts: [{ voice: 'bell', style: 'arp', oct: 1, gain: 0.2 }],
    bass: { voice: 'upright', style: 'root' }, drums: 'halftime', seed: 144,
  },
  {
    id: 'dart-duel', title: 'Ten Paces', mood: 'Duel: foam-dart showdown with timpani',
    bpm: 120, key: 64, mode: 'phrygdom', form: 'AB', prog: { A: '1 1 2 1', B: '6 7 2 1' },
    lead: 'synth', melody: 'lyrical', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'halftime', echo: 0.15, seed: 145,
  },
  // Stew Battles
  {
    id: 'cannon-fort', title: 'Hold the Fort', mood: 'Stew Battle: drum-and-brass siege march',
    bpm: 138, key: 58, mode: 'minor', form: 'AAB', prog: { A: '1 7 6 5', B: '4 5 1 1' },
    lead: 'brass', melody: 'march', counter: 'brass', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'tuba', style: 'pump' }, drums: 'march', seed: 146,
  },
  {
    id: 'stew-relay', title: 'Pass the Ladle', mood: 'Stew Battle: upbeat relay-race rock',
    bpm: 168, key: 64, mode: 'major', form: 'AABB', prog: { A: '1 5 6 4', B: '4 5 1 1' },
    lead: 'square', melody: 'driving', counter: 'brass', parts: [{ voice: 'saw', style: 'pulse8', gain: 0.25 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'rock', seed: 147,
  },
  {
    id: 'stew-squad', title: 'Squad Up', mood: 'Stew Battle: heavy team-battle rock',
    bpm: 156, key: 57, mode: 'minor', form: 'AABB', prog: { A: '1 1 6 7', B: '4 6 5 5' },
    lead: 'saw', melody: 'driving', counter: 'brass', parts: [{ voice: 'brass', style: 'hits', gain: 0.4 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'rock', seed: 148,
  },
  // FPS games
  {
    id: 'scope-snap', title: 'Quick Scope', mood: 'Slick toy-soldier techno',
    bpm: 128, key: 62, mode: 'minor', form: 'AABB', prog: { A: '1 1 6 7', B: '4 4 5 5' },
    lead: 'pulse', melody: 'synco', parts: [{ voice: 'synth', style: 'hits', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'techno', echo: 0.2, seed: 149,
  },
  {
    id: 'zero-g-tag', title: 'Weightless', mood: 'Floating space breakbeat with echoes',
    bpm: 136, key: 65, mode: 'lydian', form: 'AABB', prog: { A: '1 2 1 2', B: '6 5 4 5' },
    lead: 'synth', melody: 'lyrical', counter: 'bell', parts: [{ voice: 'pulse', style: 'arp16', gain: 0.2 }],
    bass: { voice: 'synthbass', style: 'synco' }, drums: 'breakbeat', echo: 0.35, seed: 150,
  },
  {
    id: 'last-dart-standing', title: 'Last One In', mood: 'Pounding battle-royale drums',
    bpm: 150, key: 57, mode: 'harmonic', form: 'AABB', prog: { A: '1 6 7 1', B: '4 4 5 5' },
    lead: 'brass', melody: 'driving', parts: [{ voice: 'strings', style: 'pulse8', gain: 0.35 }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'breakbeat', seed: 151,
  },
  {
    id: 'hide-and-snap', title: 'Ready or Not', mood: 'Hushed hide-and-seek tiptoe',
    bpm: 96, key: 64, mode: 'minor', form: 'AABA', prog: { A: '1 4 1 5', B: '6 6 5 5' },
    lead: 'pluck', melody: 'sneaky', counter: 'flute', parts: [{ voice: 'bell', style: 'hits', oct: 1, gain: 0.2 }],
    bass: { voice: 'upright', style: 'walking' }, drums: 'sneaky', reverb: 0.3, seed: 152,
  },
  {
    id: 'crate-cascade', title: 'Dockside Drop', mood: 'Falling-crate puzzle: brisk, stacking minor-key bounce',
    bpm: 144, key: 64, mode: 'harmonic', form: 'AABB', prog: { A: '1 5 1 5', B: '4 1 5 1' },
    lead: 'square', melody: 'bouncy', counter: 'pulse', parts: [{ voice: 'pluck', style: 'offbeat', gain: 0.3 }],
    bass: { voice: 'bass', style: 'octave' }, drums: 'rock', seed: 153,
  },
  {
    id: 'spark-trails', title: 'Light Cycle Lane', mood: 'Neon hoverboard trails on the station deck',
    bpm: 134, key: 57, mode: 'dorian', form: 'AABB', prog: { A: '1 1 7 7', B: '4 4 6 5' },
    lead: 'synth', melody: 'driving', parts: [{ voice: 'pulse', style: 'arp16', gain: 0.25 }, { voice: 'strings', style: 'pad', gain: 0.3, only: 'B' }],
    bass: { voice: 'synthbass', style: 'pump' }, drums: 'techno', echo: 0.3, seed: 154,
  },
];

export const ALL_SONGS: S[] = [...SCREEN_SONGS, ...BOARD_SONGS, ...GAME_SONGS];
