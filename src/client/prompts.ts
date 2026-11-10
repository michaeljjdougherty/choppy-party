import type { InputKind } from './input';

/**
 * Button names for on-screen prompts. Controller players see A / B / Stick; keyboard players see
 * the keys; mouse players see "Click" where a click does the same thing.
 */
let kind: InputKind = 'keys';
let solo = true;

export function setPromptKind(k: InputKind, soloKeys: boolean): void {
  kind = k;
  solo = soloKeys;
}

export function promptKind(): InputKind {
  return kind;
}

/** "A", "Space" or "Click": the confirm button. */
export function A(): string {
  return kind === 'pad' ? 'A' : kind === 'mouse' ? 'Click' : solo ? 'Space' : 'Space / Enter';
}

/** "B", "Shift" or "Esc": the back/second button. */
export function B(): string {
  return kind === 'pad' ? 'B' : solo ? 'Shift' : 'Shift';
}

/** "Stick" or "WASD". */
export function STICK(): string {
  return kind === 'pad' ? 'Stick' : solo ? 'WASD / Arrows' : 'WASD / Arrows';
}

/** Short glyph for a button chip: A, B, ✥ on a pad; SPC, SHF, WASD on keys. */
export function glyph(btn: 'a' | 'b' | 'stick' | 'mash'): string {
  if (kind === 'pad') return btn === 'a' ? 'A' : btn === 'b' ? 'B' : btn === 'mash' ? 'A!' : '✥';
  return btn === 'a' ? 'SPC' : btn === 'b' ? 'SHF' : btn === 'mash' ? 'SPC!' : 'WASD';
}
