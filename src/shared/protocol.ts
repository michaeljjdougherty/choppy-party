import type { RawInput } from './types';
import type { PartyState } from './party';

/** Browser -> server */
export type ClientMsg =
  | { t: 'create'; clientId?: string }
  | { t: 'join'; code: string; clientId?: string }
  | { t: 'add'; deviceKey: string; name?: string }
  | { t: 'remove'; deviceKey: string }
  | { t: 'bot'; level: 'easy' | 'normal' | 'hard' }
  | { t: 'unbot' }
  | { t: 'input'; raws: Record<string, RawInput> };

/** Server -> browser */
export type ServerMsg =
  | { t: 'welcome'; code: string; clientId: string }
  | { t: 'error'; message: string }
  | { t: 'state'; s: PartyState };

export const MAX_DEVICES_PER_CLIENT = 4;

/** Player ids online are "<clientId>.<deviceKey>" so the server knows whose input is whose. */
export function onlinePlayerId(clientId: string, deviceKey: string): string {
  return `${clientId}.${deviceKey}`;
}
