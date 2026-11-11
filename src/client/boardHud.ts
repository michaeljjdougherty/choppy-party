import { A, B, STICK, X } from './prompts';
import { slam, sunburst } from './showtime';
import { sfx } from './sfx';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { currentPlayer } from '../shared/board/engine';
import { TRAIN_PRICE, WISP_PRICE } from '../shared/board/types';
import { ITEMS } from '../shared/board/items';
import { playerById, popText, roundRect, text } from '../shared/draw';

/** Moving the highlight in a board menu (items, targets, forks) ticks like the main menu. */
let menuWas = '';
function menuSounds(s: PartyState): void {
  const b = s.board!;
  const pm = b.prompt as { kind: string; sel?: number } | null;
  const ctxKey = `${b.turn}:${b.cur}:${b.sub}:${pm?.kind ?? ''}`;
  const sel = b.sub === 'branch' ? b.branch?.sel : pm?.sel;
  const now = sel === undefined ? '' : `${ctxKey}#${sel}`;
  if (now && menuWas && now !== menuWas && menuWas.split('#')[0] === ctxKey) sfx.move();
  menuWas = now;
}

export function drawBoardHud(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  menuSounds(s);
  const b = s.board!;
  const def = getBoard(b.boardId);
  const pr = b.preset;
  const cur = currentPlayer(b);
  const me = playerById(s.players, cur);
  const mine = b.players[cur];

  // top-left: board, turn and what the map is up to
  ctx.fillStyle = 'rgba(20,12,40,0.6)';
  roundRect(ctx, 16, 14, 330, 92, 18);
  ctx.fill();
  text(ctx, def.name, 32, 36, 22, { align: 'left', color: '#ffd23f' });
  let extra = '';
  if (def.theme === 'hollow') extra = b.night ? '  ·  Night' : '  ·  Day';
  if (def.theme === 'cosmo') extra = `  ·  Laser in ${b.counter}`;
  text(ctx, `Turn ${b.turn} / ${b.maxTurns}${extra}`, 32, 62, 18, { align: 'left', weight: 600 });
  const late = b.maxTurns - b.turn < pr.doubleTurns;
  const warn =
    def.theme === 'cosmo'
      ? 'Meteors hit the red rings this round'
      : def.theme === 'hollow'
        ? b.night
          ? 'A pine falls at round end!'
          : 'Ring the bell for night'
        : `Boulder in the ${b.hazards.boulderLane ? 'east' : 'west'} canyon`;
  text(ctx, late ? 'Final turns: Key and Heart Spaces pay double!' : warn, 32, 88, 15, { align: 'left', weight: 600, color: late ? '#ffd23f' : '#ffb3a8' });

  // bottom: player cards in turn order: crowns, keys, HP and items
  const n = b.order.length;
  const w = Math.min(150, (1240 - (n - 1) * 8) / n);
  const x0 = 640 - (n * w + (n - 1) * 8) / 2;
  b.order.forEach((id, i) => {
    const p = playerById(s.players, id);
    const bp = b.players[id];
    if (!p || !bp) return;
    const x = x0 + i * (w + 8);
    const on = id === cur && b.sub !== 'orderRoll' && b.sub !== 'orderShow';
    const y = on ? 600 : 612;
    ctx.fillStyle = on ? 'rgba(255,225,77,0.95)' : 'rgba(20,12,40,0.72)';
    roundRect(ctx, x, y, w, 104, 16);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + 18, y + 20, 9, 0, Math.PI * 2);
    ctx.fill();
    const ink = on ? '#2a1b5e' : '#ffffff';
    text(ctx, bp.ko ? `${p.name} 💤` : p.name, x + 32, y + 20, w < 120 ? 13 : 16, { align: 'left', color: ink, outline: false });
    crownIcon(ctx, x + 16, y + 46, 0.85);
    popText(ctx, `crowns:${id}`, bp.crowns, x + 30, y + 47, 18, { align: 'left', color: ink, outline: false });
    keyIcon(ctx, x + w / 2 + 6, y + 46);
    popText(ctx, `keys:${id}`, bp.keys, x + w / 2 + 20, y + 47, 18, { align: 'left', color: ink, outline: false });
    // HP bar
    const bw = w - 20;
    ctx.fillStyle = on ? 'rgba(42,27,94,0.25)' : 'rgba(255,255,255,0.15)';
    roundRect(ctx, x + 10, y + 64, bw, 10, 5);
    ctx.fill();
    const f = Math.max(0, bp.hp / pr.maxHp);
    ctx.fillStyle = f > 0.5 ? '#4cd97b' : f > 0.25 ? '#ffb020' : '#ff4d5a';
    roundRect(ctx, x + 10, y + 64, Math.max(6, bw * f), 10, 5);
    ctx.fill();
    text(ctx, `${bp.hp}`, x + w - 12, y + 69, 11, { align: 'right', color: ink, outline: false, weight: 800 });
    // items
    bp.items.forEach((it, k) => {
      ctx.fillStyle = ITEMS[it].color;
      roundRect(ctx, x + 10 + k * 22, y + 80, 18, 18, 5);
      ctx.fill();
      text(ctx, ITEMS[it].name[0], x + 19 + k * 22, y + 89, 12, { color: '#fff', weight: 900 });
    });
    if (bp.shield) text(ctx, '🛡', x + w - 16, y + 89, 14, { outline: false });
  });

  // centre callouts
  const name = me?.name ?? '';
  const box = (q: string, a: string, h = 150) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 290, 120, 700, h, 28);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.stroke();
    text(ctx, q, 640, 170, 28, { color: '#2a1b5e', outline: false });
    text(ctx, a, 640, 120 + h - 40, 26, { color: '#ff4d5a', outline: false });
  };
  if (b.sub === 'tour' && b.tour) {
    const st = b.tour.steps[b.tour.i];
    const n = b.tour.steps.length;
    ctx.fillStyle = 'rgba(20,12,40,0.72)';
    roundRect(ctx, 360, 470, 560, 112, 24);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 4;
    ctx.stroke();
    const a = Math.min(1, b.t * 4);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, st?.title ?? '', 640, 508 - (1 - a) * 10, 34, { color: '#ffd23f' });
    ctx.restore();
    text(ctx, `Board tour  ${b.tour.i + 1} / ${n}`, 640, 544, 16, { color: '#c9bdf5', weight: 700 });
    text(ctx, `${A()}: next   ·   ${B()}: back   ·   ${X()} (host): skip tour`, 640, 568, 17, { color: '#ffffff', weight: 700 });
  } else if (b.sub === 'orderRoll' || b.sub === 'orderShow') {
    drawOrderRoll(ctx, s, t);
  } else if (b.sub === 'turnIntro') {
    if (b.cur === 0) text(ctx, `Turn ${b.turn}`, 640, 220, 40, { color: '#ffffff' });
    if (b.cur === 0 && b.wonFirst.includes(cur)) text(ctx, 'Won the minigame, so they go first!', 640, 336, 26, { color: '#ffd23f' });
    text(ctx, `${name}'s turn!`, 640, 280, 64, { color: me?.color ?? '#fff' });
  } else if (b.sub === 'roll') {
    const canItem = mine.items.length > 0 && mine.usedItemTurn !== b.turn;
    text(ctx, `${name}: ${A()} to roll${canItem ? `   ·   ${B()} to use an item` : ''}`, 640, 110, 32, { color: '#ffffff' });
    const bonus = [mine.dice > 1 ? '2 dice' : '', mine.rollBonus ? `+${mine.rollBonus}` : '', mine.rollCap ? `max ${mine.rollCap}` : ''].filter(Boolean).join('  ');
    if (bonus) text(ctx, bonus, 640, 150, 26, { color: '#ffd23f' });
  } else if (b.sub === 'rolling') {
    text(ctx, `${name} is rolling...`, 640, 110, 32, { color: '#ffffff' });
  } else if (b.sub === 'rolled') {
    // the number slams in big, with a sunburst behind it
    sunburst(ctx, 640, 190, 260, b.t * 3, me?.color ?? '#ffd23f', 0.45 * Math.max(0, 1 - b.t / 1.6), 16);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (1.7 - b.t) * 3));
    slam(ctx, String(b.roll), 640, 190, 170, b.t, '#ffd23f');
    ctx.restore();
    if (b.t > 0.35) text(ctx, `${name} moves ${b.roll} space${b.roll === 1 ? '' : 's'}!`, 640, 300, 28, { color: me?.color ?? '#fff' });
  } else if (b.sub === 'branch') {
    text(ctx, `Pick a path: ${STICK()} to aim, ${A()} to go`, 640, 110, 32, { color: '#ffffff' });
  } else if (b.sub === 'wheel' && b.event?.wheel) {
    // the sit-out wheel flicks between first and last place, slowing down
    const k = Math.floor(Math.pow(b.t, 1.6) * 6) % b.event.wheel.length;
    const p = playerById(s.players, b.event.wheel[k]);
    box('Odd number of players! Who sits out?', '', 170);
    text(ctx, p?.name ?? '', 640, 236, 48, { color: p?.color ?? '#000', outline: false });
    text(ctx, `(sitting out pays +${pr.sitOutKeys} keys)`, 640, 274, 18, { color: '#6b5aa8', outline: false, weight: 600 });
  } else if (b.sub === 'prompt' && b.prompt) {
    const pm = b.prompt;
    if (pm.kind === 'crown') box(`Open the Crown Chest for ${pr.crownPrice} keys?`, 'A: Yes      B: No');
    else if (pm.kind === 'wisp') box(`Pay the Wisp ${WISP_PRICE} keys to rob the leader?`, 'A: Yes      B: No');
    else if (pm.kind === 'train') box(`Ride the train to the next station for ${TRAIN_PRICE} keys?`, 'A: Yes      B: No');
    else if (pm.kind === 'claim') {
      box('Claim this post! Pick its mode', '', 190);
      text(ctx, `A: Toll Post  (others pay ${pr.postToll} keys)`, 640, 224, 22, { color: '#2a1b5e', outline: false, weight: 700 });
      text(ctx, `B: Sting Post  (${pr.postSting} damage, you heal ${pr.postStingHeal})`, 640, 262, 22, { color: '#2a1b5e', outline: false, weight: 700 });
    } else if (pm.kind === 'steal') box(`Pay ${pr.postStealCost} keys to take over this post?`, 'A: Yes      B: No');
    else if (pm.kind === 'items') {
      const h = 110 + mine.items.length * 44;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(ctx, 340, 110, 600, h, 26);
      ctx.fill();
      text(ctx, 'Use an item (1 per turn)', 640, 146, 26, { color: '#2a1b5e', outline: false });
      mine.items.forEach((it, k) => {
        const y = 192 + k * 44;
        const sel = k === pm.sel;
        if (sel) {
          ctx.fillStyle = 'rgba(255,210,63,0.6)';
          roundRect(ctx, 360, y - 20, 560, 40, 14);
          ctx.fill();
        }
        ctx.fillStyle = ITEMS[it].color;
        roundRect(ctx, 372, y - 14, 28, 28, 7);
        ctx.fill();
        text(ctx, ITEMS[it].name, 412, y, 22, { align: 'left', color: '#2a1b5e', outline: false });
        text(ctx, ITEMS[it].desc, 908, y, 15, { align: 'right', color: '#5b4a91', outline: false, weight: 600 });
      });
      text(ctx, 'Stick: choose   A: use   B: back', 640, 110 + h - 26, 18, { color: '#ff4d5a', outline: false, weight: 700 });
    } else if (pm.kind === 'target') {
      const tp = playerById(s.players, pm.options[pm.sel]);
      const what = pm.purpose === 'duel' ? 'Pick your duel rival' : pm.purpose === 'cannon' ? 'Aim the cannon' : `${ITEMS[pm.item!].name}: pick a target`;
      box(what, '◀ Stick ▶   A: confirm' + (pm.purpose === 'item' ? '   B: back' : ''), 180);
      text(ctx, tp?.name ?? '', 640, 226, 48, { color: tp?.color ?? '#000', outline: false });
    }
  } else if (b.sub === 'roundEnd') {
    text(ctx, 'End of round', 640, 220, 40, { color: '#ff9f1c' });
  } else if (b.sub === 'event' && b.event) {
    text(ctx, b.event.kind === 'duel' ? 'DUEL!' : 'STEW BATTLE!', 640, 260, 80, { color: '#ff9f1c' });
  }
  if (b.banner) {
    const a = Math.min(1, b.banner.t * 3);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, b.banner.text, 640, 380 - (1 - a) * 20, 38, { color: b.banner.color });
    ctx.restore();
  }
  void t;
}

export function keyIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffcb2f';
  ctx.strokeStyle = '#a06a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(1, -2, 10, 4);
  ctx.fillRect(7, 1, 2, 4);
  ctx.fillRect(10, 1, 2, 3);
  ctx.fillStyle = '#7a4d00';
  ctx.beginPath();
  ctx.arc(-4, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function crownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#ffcc33';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, 8);
  ctx.lineTo(-12, -7);
  ctx.lineTo(-5, -1);
  ctx.lineTo(0, -10);
  ctx.lineTo(5, -1);
  ctx.lineTo(12, -7);
  ctx.lineTo(11, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffcb2f';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(x - 1.5, y - 5, 3, 10);
}

/** Game start: everyone's die in a row, then the turn order it made. */
function drawOrderRoll(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const b = s.board!;
  const show = b.sub === 'orderShow';
  const ids = show ? b.order : [...b.order].sort((x, y) => s.players.findIndex((p) => p.id === x) - s.players.findIndex((p) => p.id === y));
  const n = ids.length;
  const size = Math.min(104, (1100 - (n - 1) * 14) / n);
  const x0 = 640 - (n * size + (n - 1) * 14) / 2;
  ctx.fillStyle = 'rgba(20,12,40,0.62)';
  roundRect(ctx, x0 - 30, 150, n * size + (n - 1) * 14 + 60, size + 190, 28);
  ctx.fill();
  text(ctx, show ? 'Turn order' : 'Roll for turn order!', 640, 190, 40, { color: '#ffd23f' });
  text(ctx, show ? 'Highest roll goes first' : `Everyone press ${A()} to roll`, 640, 230, 20, { color: '#ffffff', weight: 600 });
  ids.forEach((id, i) => {
    const p = playerById(s.players, id);
    if (!p) return;
    const x = x0 + i * (size + 14);
    const y = 260;
    const v = b.orderRolls[id];
    const wob = v ? 0 : Math.sin(t * 14 + i) * 0.12;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(wob);
    ctx.fillStyle = v ? '#fff7c2' : '#ffd23f';
    roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.2);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 6;
    ctx.stroke();
    const face = v ? String(v) : String(1 + (Math.floor(t * 18 + i * 3) % 10));
    text(ctx, face, 0, 2, size * 0.55, { color: v ? '#ff3b4e' : 'rgba(255,59,78,0.45)', outline: false, weight: 900 });
    ctx.restore();
    text(ctx, p.name, x + size / 2, y + size + 22, size < 80 ? 13 : 17, { color: p.color });
    if (show) text(ctx, ['1st', '2nd', '3rd'][i] ?? `${i + 1}th`, x + size / 2, y + size + 48, 18, { color: '#ffffff', weight: 800 });
  });
}
