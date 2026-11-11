import type { PartyState } from '../shared/party';
import type { SpaceType } from '../shared/board/types';
import { TRAIN_PRICE, WISP_PRICE } from '../shared/board/types';
import { getBoard } from '../shared/board/boards';
import { roundRect, text } from '../shared/draw';
import { SPACE_COLORS, SPACE_ICON } from './three/views/board';

/**
 * Map key: shown in the board's map view, one row per kind of space on this board with what it does.
 * Hidden or shown with a button (or K); the choice is remembered on this device.
 */
let shown = true;
try {
  shown = localStorage.getItem('choppy.mapKey') !== 'off';
} catch {
  /* private mode: just default to shown */
}
export const mapKey = {
  get shown() {
    return shown;
  },
  toggle() {
    shown = !shown;
    try {
      localStorage.setItem('choppy.mapKey', shown ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  },
};

const ORDER: SpaceType[] = ['key', 'thorn', 'heart', 'lucky', 'crate', 'event', 'chunk', 'duel', 'stew', 'shop', 'post', 'fountain', 'spring', 'cannon', 'vent', 'dynamite', 'snare', 'wisp', 'station', 'counter', 'oop', 'camp'];

function describe(type: SpaceType, s: PartyState): [string, string] {
  const b = s.board!;
  const pr = b.preset;
  const theme = getBoard(b.boardId).theme;
  switch (type) {
    case 'key':
      return ['Coin', `+${pr.keySpace} Pit Coin`];
    case 'thorn':
      return ['Thorn', `-${pr.thornSpace} Pit Coin`];
    case 'heart':
      return ['Heart', `+${pr.heartSpace} HP`];
    case 'lucky':
      return ['Lucky', 'Bonus coins, or a rare warp to a chest'];
    case 'crate':
      return ['Item Crate', 'Spin for a random item'];
    case 'event':
      return theme === 'hollow'
        ? ['Bell', 'Swaps day and night']
        : theme === 'cosmo'
          ? ['Warp Pad', 'Zaps you to another warp pad']
          : theme === 'court'
            ? ['Verse Flip', 'Flips Fucci Verse / Choppy Verse']
            : ['Gold Strike', 'Gamble your coins on the reel'];
    case 'chunk':
      return ['Mister Chunk', 'Spins a reel of nasty surprises'];
    case 'duel':
      return ['Duel', 'Pick a rival for a 1v1 minigame'];
    case 'stew':
      return ['Stew Battle', 'Team minigame for the pot'];
    case 'shop':
      return ['Shop', 'Buy items as you pass (free step)'];
    case 'post':
      return ['Claim Post', 'Claim it; others pay you to pass'];
    case 'fountain':
      return ['Heart Fountain', 'Heal passing by, full heal landing'];
    case 'spring':
      return ['Spring', 'Bounce 1 to 5 spaces ahead'];
    case 'cannon':
      return ['Cannon', 'Fire at someone within 6 spaces'];
    case 'vent':
      return ['Airlock Vent', 'Blasted 3 spaces back'];
    case 'dynamite':
      return ['Dynamite', '15 damage to you and anyone close'];
    case 'snare':
      return ['Root Snare', 'At night: next roll capped at 3'];
    case 'wisp':
      return ['Wisp', `Pay ${WISP_PRICE} to rob the leader`];
    case 'station':
      return ['Station', `Ride the train for ${TRAIN_PRICE}`];
    case 'counter':
      return ['Laser Gate', 'Counts down to the laser'];
    case 'oop':
      return ['Alley-Oop Pad', 'Dunk to the hoop (or the Chop Pit)'];
    case 'camp':
      return ['Respawn Camp', 'Where KO’d players come back'];
  }
}

/** Draws the key (when shown) on the right side of the map view. */
export function drawSpaceKey(ctx: CanvasRenderingContext2D, s: PartyState): void {
  if (!shown || !s.board) return;
  const def = getBoard(s.board.boardId);
  const have = new Set(Object.values(def.nodes).map((n) => n.type));
  const rows = ORDER.filter((t) => have.has(t));
  const RH = 31;
  const w = 330, x = 1270 - w, h = 52 + rows.length * RH, y = Math.max(150, 650 - h - 8);
  ctx.save();
  ctx.fillStyle = 'rgba(20,12,40,0.8)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  text(ctx, 'SPACE KEY', x + w / 2, y + 24, 20, { color: '#ffd23f' });
  rows.forEach((t, i) => {
    const cy = y + 52 + i * RH;
    const gold = def.theme === 'gulch' && t === 'event';
    const col = gold ? '#e8a400' : SPACE_COLORS[t];
    // a glowing chip in the space's colour with its icon
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + 24, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, gold ? '?' : SPACE_ICON[t], x + 24, cy + 1, 13, { color: '#ffffff' });
    const [name, what] = describe(t, s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x + 44, cy - 7);
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#d6cdf2';
    ctx.fillText(what, x + 44, cy + 8);
  });
  ctx.restore();
}
