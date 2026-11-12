import { DEFAULT_LOOK, decodeLook, encodeLook, type Look } from './three/cosmetics';

/**
 * Saved outfits. Each crew member keeps their own look (hat, shirt, accessory) on this device.
 * Online, the room can send each player's look as a short string (see encodeLook) and call
 * setLooks so everyone sees the same outfits; until then each screen shows its own saved looks.
 */
const KEY = 'choppy.looks.v1';

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/** Starting outfits for the extra KGs, so each one reads as his own character. */
const STARTER: Record<string, Look> = {
  'kg-king': { hat: 'crown', shirt: 'tux', acc: 'cape' },
  'kg-evil': { hat: 'devil', shirt: 'leather', acc: 'bat' },
  'kg-space': { hat: 'space', shirt: 'spacesuit', acc: 'jetpack' },
  'kg-chef': { hat: 'chef', shirt: 'chef', acc: 'cleaver' },
  // the boss's biggest fan: party hat, varsity jacket and a foam finger
  regs: { hat: 'party', shirt: 'varsity', acc: 'foamfinger' },
};

export function savedLook(folkId: string): Look {
  const s = read()[folkId];
  return s ? decodeLook(s) : { ...(STARTER[folkId] ?? DEFAULT_LOOK) };
}

export function saveLook(folkId: string, look: Look): void {
  const all = read();
  all[folkId] = encodeLook(look);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: looks last until reload */
  }
  cache.set(folkId, { ...look });
}

const cache = new Map<string, Look>();

/** Looks sent by the room, by player colour (online). Wins over this device's saved looks. */
export const COLOR_LOOK = new Map<string, Look>();
export function setLooks(players: { color: string; look?: string }[]): void {
  for (const p of players) {
    if (p.look) COLOR_LOOK.set(p.color, decodeLook(p.look));
    else COLOR_LOOK.delete(p.color);
  }
}

/** The look a model should wear: the room's, else the one saved for this character. */
export function lookFor(color: string, folkId: string): Look {
  return COLOR_LOOK.get(color) ?? cache.get(folkId) ?? savedLook(folkId);
}

/** Remembers where the Customize screen was left. */
export function customizePrefs(): { char: number; color: number } {
  try {
    const p = JSON.parse(localStorage.getItem('choppy.customize') ?? '{}');
    return { char: p.char ?? 0, color: p.color ?? 0 };
  } catch {
    return { char: 0, color: 0 };
  }
}
export function saveCustomizePrefs(char: number, color: number): void {
  try {
    localStorage.setItem('choppy.customize', JSON.stringify({ char, color }));
  } catch {
    /* ignore */
  }
}
