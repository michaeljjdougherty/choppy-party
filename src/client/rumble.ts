/**
 * Controller rumble. View-only: things that happen to a player on this screen give their pad a
 * short buzz. Players are found by model colour (what the 3D views know) or by player id.
 * Off with the Settings switch (saved in localStorage).
 */
const KEY = 'choppy.rumble';
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== '0';
} catch {
  /* private mode: default on */
}
export const rumbleOn = (): boolean => enabled;
export function setRumble(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (on) rumblePads(allPads(), 0.6, 0.4, 160);
}

/** colour -> pad keys for the human players on this screen */
const byColor = new Map<string, string[]>();
const byId = new Map<string, string[]>();

/** Called each frame by main with the local human players. */
export function setRumbleOwners(players: { id: string; color: string; bot?: unknown }[], local: Set<string>, live = true): void {
  byColor.clear();
  byId.clear();
  // menus, intros and previews use stand-in models in players' colours: no buzz there
  if (!live) return;
  const mine = players.filter((p) => !p.bot && local.has(p.id));
  for (const p of mine) {
    const dev = p.id.slice(p.id.lastIndexOf('.') + 1);
    // a lone player can drive with any device, so their buzz goes to every pad
    const pads = dev.startsWith('pad') ? [dev] : mine.length === 1 ? allPads() : [];
    byColor.set(p.color, pads);
    byId.set(p.id, pads);
  }
}

function allPads(): string[] {
  const out: string[] = [];
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of list) if (gp?.connected) out.push(`pad${gp.index}`);
  return out;
}

/** Last time each pad buzzed, so a flood of events doesn't stack into one long drone. */
const last = new Map<string, number>();

function rumblePads(keys: string[], strong: number, weak: number, ms: number): void {
  if (!enabled || !keys.length) return;
  const list = navigator.getGamepads?.() ?? [];
  const now = performance.now();
  for (const k of keys) {
    if (now - (last.get(k) ?? -1e9) < 45) continue;
    last.set(k, now);
    const gp = list[Number(k.slice(3))];
    const act = (gp as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
    act?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => undefined);
  }
}

/** Buzz the pad of whoever owns the model in this colour (no-op for CPUs and other screens). */
export function rumbleColor(color: string, strong: number, weak: number, ms: number): void {
  const pads = byColor.get(color);
  if (pads) rumblePads(pads, strong, weak, ms);
}
export function rumblePlayer(id: string, strong: number, weak: number, ms: number): void {
  const pads = byId.get(id);
  if (pads) rumblePads(pads, strong, weak, ms);
}
/** Everyone on this screen feels it (a big shared moment: the champion, a boss slam). */
export function rumbleEveryone(strong: number, weak: number, ms: number): void {
  const seen = new Set<string>();
  for (const pads of byId.values()) for (const p of pads) seen.add(p);
  rumblePads([...seen], strong, weak, ms);
}

/** Named feels so the same event always feels the same. */
export const RUMBLE = {
  tap: [0.15, 0.35, 60],
  bump: [0.35, 0.5, 110],
  hit: [0.7, 0.6, 180],
  ko: [1, 0.8, 380],
  win: [0.45, 0.7, 260],
  coin: [0, 0.25, 50],
} as const satisfies Record<string, readonly [number, number, number]>;
export type RumbleKind = keyof typeof RUMBLE;
export const buzzColor = (color: string, k: RumbleKind): void => rumbleColor(color, RUMBLE[k][0], RUMBLE[k][1], RUMBLE[k][2]);
export const buzzPlayer = (id: string, k: RumbleKind): void => rumblePlayer(id, RUMBLE[k][0], RUMBLE[k][1], RUMBLE[k][2]);
