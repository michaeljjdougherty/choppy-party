/**
 * Background music. "The Brass Goes Wild" plays on the title screen, main menu and lobby, and
 * fades out when a party starts. Browsers only allow audio after a key, click or button press,
 * so the first attempt may wait for one.
 */
const VOLUME = 0.42;
const FADE = 1.2; // seconds

let el: HTMLAudioElement | null = null;
let want = false;
let level = 0;

function audio(): HTMLAudioElement | null {
  if (el) return el;
  try {
    el = new Audio('music/menu.mp3');
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
  } catch {
    el = null;
  }
  return el;
}

/** Call every frame with whether the menu music should be playing. */
export function menuMusic(on: boolean, dt: number): void {
  const a = audio();
  if (!a) return;
  want = on;
  level = Math.max(0, Math.min(1, level + (on ? dt : -dt) / FADE));
  a.volume = VOLUME * level * level;
  if (want && a.paused) {
    a.play().catch(() => {
      /* waiting for the first key, click or button press */
    });
  } else if (!want && level === 0 && !a.paused) {
    a.pause();
    a.currentTime = 0;
  }
}

/** Retry after a user gesture (called with the audio unlock). */
export function kickMusic(): void {
  if (want && el?.paused) el.play().catch(() => {});
}
