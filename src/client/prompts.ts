import type { InputKind, PadStyle } from './input';
import { glyphToken } from '../shared/draw';

/**
 * Button names for on-screen prompts. Controller players see their own controller's buttons
 * (Xbox colours, PlayStation shapes, Nintendo letters) drawn as glyphs; keyboard players see keycaps;
 * mouse players see "Click" where a click does the same thing.
 */
let kind: InputKind = 'keys';
let solo = true;
let style: PadStyle = 'x';

export function setPromptKind(k: InputKind, soloKeys: boolean, padStyle: PadStyle = 'x'): void {
  kind = k;
  solo = soloKeys;
  style = padStyle;
}

export function promptKind(): InputKind {
  return kind;
}

export function padStyle(): PadStyle {
  return style;
}

const pad = (btn: string) => glyphToken(style, btn);
const key = (label: string) => glyphToken('k', label);

/** The confirm button. */
export function A(): string {
  return kind === 'pad' ? pad('a') : kind === 'mouse' ? 'Click' : solo ? key('Space') : `${key('Space')} / ${key('Enter')}`;
}

/** The back / second button. */
export function B(): string {
  return kind === 'pad' ? pad('b') : key('Shift');
}

/** The force-start / change-character button: X on a pad, C on the keyboard. */
export function X(): string {
  return kind === 'pad' ? pad('x') : key('C');
}

/** The map / change-colour button: Y on a pad, M on the keyboard (V also works). */
export function Y(): string {
  return kind === 'pad' ? pad('y') : key('M');
}

/** Start / pause. */
export function START(): string {
  return kind === 'pad' ? pad('start') : key('P');
}

/** Stick or WASD. */
export function STICK(): string {
  return kind === 'pad' ? pad('stick') : 'WASD / Arrows';
}

/** Plain-letter name of a pad button for the current controller (for places that can't draw glyphs). */
export function padName(btn: 'a' | 'b' | 'x' | 'y'): string {
  if (style === 'p') return { a: 'Cross', b: 'Circle', x: 'Square', y: 'Triangle' }[btn];
  if (style === 'n') return { a: 'B', b: 'A', x: 'Y', y: 'X' }[btn];
  return btn.toUpperCase();
}

/** Glyph for a control chip ('a', 'b', 'x', 'y', 'stick'): a token on a pad, a keycap on keys. */
export function glyph(btn: 'a' | 'b' | 'x' | 'y' | 'stick' | 'mash'): string {
  const b = btn === 'mash' ? 'a' : btn;
  if (kind === 'pad') return pad(b);
  return key(b === 'a' ? 'Space' : b === 'b' ? 'Shift' : b === 'x' ? 'C' : b === 'y' ? 'M' : 'WASD');
}

/**
 * A game's control line ("Stick: move   A: jump") with its buttons swapped for this player's glyphs.
 * Only stand-alone capital A/B/X/Y and the word Stick are touched.
 */
export function localizeControls(line: string): string {
  return line
    .replace(/\bStick\b/g, () => STICK())
    .replace(/(^|[\s(/])([ABXY])(?=$|[\s:/,)!])/g, (_, pre: string, b: string) => pre + (b === 'A' ? A() : b === 'B' ? B() : b === 'X' ? X() : Y()));
}

/** The confirm button as a plain word, for speech bubbles that can't draw glyphs. */
export function aWord(): string {
  return kind === 'pad' ? padName('a') : kind === 'mouse' ? 'the mouse' : 'Space';
}
