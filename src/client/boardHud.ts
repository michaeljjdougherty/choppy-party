import { A, B, STICK, X } from './prompts';
import { slam, sunburst } from './showtime';
import { sfx } from './sfx';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { SPIN_STOP, DIE_SHOW, DOUBLES_EXTRA, DOUBLES_KEYS, ROLL_SHOW, currentPlayer } from '../shared/board/engine';
import { TRAIN_PRICE, WISP_PRICE } from '../shared/board/types';
import { ITEMS, SHOP_PRICE } from '../shared/board/items';
import { WEATHER_COLOR, forecast } from '../shared/board/weather';
import { playerById, popText, roundRect, text } from '../shared/draw';
import { itemIcon } from './three/itemIcons';

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

export function drawBoardHud(ctx: CanvasRenderingContext2D, s: PartyState, t: number, mapOpen = false): void {
  menuSounds(s);
  const b = s.board!;
  const def = getBoard(b.boardId);
  const pr = b.preset;
  const cur = currentPlayer(b);
  const me = playerById(s.players, cur);
  const mine = b.players[cur];
  const fog = !!b.weather?.hiddenRoll;

  const setup = b.sub === 'tour' || b.sub === 'orderRoll' || b.sub === 'orderShow';
  if (b.sub !== 'orderRoll' && b.sub !== 'orderShow') drawStandings(ctx, s, cur, setup);

  // top right: board, turn, turn order and what the board is up to
  const late = b.maxTurns - b.turn < pr.doubleTurns;
  let event =
    def.theme === 'cosmo'
      ? `Laser in ${b.counter}  ·  meteors on red rings`
      : def.theme === 'hollow'
        ? b.night
          ? 'Night: a pine falls at round end'
          : 'Day: ring the bell for night'
        : `Boulder in the ${b.hazards.boulderLane ? 'east' : 'west'} canyon`;
  if (late) event = 'Final turns: Key and Heart pay double!';
  const pill = (y: number, w: number) => {
    ctx.fillStyle = 'rgba(20,12,40,0.62)';
    ctx.beginPath();
    ctx.moveTo(1268 - w, y - 15);
    ctx.lineTo(1270, y - 15);
    ctx.lineTo(1270, y + 15);
    ctx.lineTo(1258 - w, y + 15);
    ctx.closePath();
    ctx.fill();
  };
  pill(28, 250);
  text(ctx, def.name, 1258, 29, 20, { align: 'right', color: '#ffd23f' });
  pill(62, 170);
  text(ctx, `Turn  ${b.turn} / ${b.maxTurns}`, 1258, 63, 20, { align: 'right', color: '#ffffff' });
  const order = b.order;
  const sq = Math.min(18, 170 / Math.max(1, order.length) - 3);
  pill(96, 130 + order.length * (sq + 3));
  text(ctx, 'Turn Order', 1250 - order.length * (sq + 3), 97, 20, { align: 'right', color: '#ffffff' });
  order.forEach((id, i) => {
    const p = playerById(s.players, id);
    const x = 1258 - (order.length - i) * (sq + 3) + 3;
    const on = id === cur && !setup;
    ctx.fillStyle = p?.color ?? '#888';
    ctx.fillRect(x, 96 - sq / 2 - (on ? 3 : 0), sq, sq);
    if (on) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, 96 - sq / 2 - 4, sq + 2, sq + 2);
    }
  });
  ctx.font = '700 17px system-ui, sans-serif';
  pill(130, ctx.measureText(event).width + 20);
  text(ctx, event, 1258, 131, 17, { align: 'right', color: late ? '#ffd23f' : '#ffd9cf' });

  // weather forecast under it: each zone, what it's doing now and next round
  const zones = def.weather ?? [];
  if (zones.length && !setup) {
    const h = 30 + zones.length * 46;
    const x0 = 1270 - 300;
    ctx.fillStyle = 'rgba(20,12,40,0.62)';
    roundRect(ctx, x0, 156, 290, h, 14);
    ctx.fill();
    text(ctx, 'Weather', x0 + 14, 174, 15, { align: 'left', color: '#c9bdf5', weight: 700 });
    zones.forEach((z, i) => {
      const f = forecast(b, z);
      const y = 198 + i * 46;
      ctx.fillStyle = WEATHER_COLOR[z.kind];
      ctx.beginPath();
      ctx.arc(x0 + 20, y, 7, 0, Math.PI * 2);
      ctx.fill();
      const pulse = f.warn ? 0.75 + Math.sin(t * 6) * 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = pulse;
      text(ctx, z.name, x0 + 34, y, 16, { align: 'left', color: WEATHER_COLOR[z.kind] });
      ctx.restore();
      if (f.next) text(ctx, f.next, x0 + 280, y, 13, { align: 'right', color: '#ffffff', weight: 600 });
      text(ctx, f.now, x0 + 34, y + 20, 12, { align: 'left', color: f.warn ? '#ffd9a0' : '#d8d2ee', weight: 600 });
    });
  }

  // bottom: the item grid for whoever's turn it is
  if (!setup && mine && !mapOpen) drawItemGrid(ctx, s, cur);

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
    roundRect(ctx, 280, 470, 520, 112, 24);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 4;
    ctx.stroke();
    const a = Math.min(1, b.t * 4);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, st?.title ?? '', 540, 508 - (1 - a) * 10, 34, { color: '#ffd23f' });
    ctx.restore();
    text(ctx, `Board tour  ${b.tour.i + 1} / ${n}`, 540, 544, 16, { color: '#c9bdf5', weight: 700 });
    text(ctx, `${A()}: next   ·   ${B()}: back   ·   ${X()} (host): skip tour`, 540, 568, 17, { color: '#ffffff', weight: 700 });
  } else if (b.sub === 'orderRoll' || b.sub === 'orderShow') {
    drawOrderRoll(ctx, s, t);
  } else if (b.sub === 'turnIntro') {
    startBanner(ctx, `${name} start turn!`, b.t);
    if (b.cur === 0) text(ctx, `Turn ${b.turn}`, 640, 168, 30, { color: '#ffffff' });
    if (b.cur === 0 && b.wonFirst.includes(cur)) text(ctx, 'Turn order follows the last minigame\'s finish!', 640, 204, 22, { color: '#ffd23f' });
  } else if (b.sub === 'roll') {
    const first = b.rolls.length === 0;
    const canItem = first && mine.items.length > 0 && mine.usedItemTurn !== b.turn;
    const n = first ? (mine.rollCap ? 1 : mine.dice) : b.diceN;
    const which = n > 1 ? ` die ${b.rolls.length + 1} of ${n}` : '';
    promptPill(ctx, `${name}: ${A()} to roll${which}${canItem ? `   ·   ${B()} to use an item` : ''}`, 104);
    if (first) {
      const bonus = [mine.dice > 2 && !mine.rollCap ? '3 dice!' : '', mine.rollBonus ? `+${mine.rollBonus}` : '', mine.rollCap ? `snared: 1 die, max ${mine.rollCap}` : ''].filter(Boolean).join('  ');
      text(ctx, bonus || `Doubles pay +${DOUBLES_KEYS} keys`, 640, 146, 22, { color: '#ffd23f' });
    } else text(ctx, `${b.rolls.map((r, i) => `Die ${i + 1}: ${fog ? '?' : r}`).join('   ')}`, 640, 146, 22, { color: '#ffd23f' });
  } else if (b.sub === 'rolling') {
    promptPill(ctx, `${name} is rolling...`, 104);
  } else if (b.sub === 'rolled') {
    const final = b.rolls.length === 0 || b.rolls.length >= b.diceN;
    const big = fog ? '?' : final ? b.roll : b.rolls[b.rolls.length - 1];
    const col = b.doubles && final ? '#7cf3ff' : '#ffd23f';
    // the number slams in big, with a sunburst behind it
    sunburst(ctx, 640, 190, final ? 260 : 180, b.t * 3, final && b.doubles ? '#7cf3ff' : me?.color ?? '#ffd23f', 0.45 * Math.max(0, 1 - b.t / 1.6), 16);
    ctx.save();
    const hold = final ? ROLL_SHOW + (b.doubles ? DOUBLES_EXTRA : 0) : DIE_SHOW;
    ctx.globalAlpha = Math.min(1, Math.max(0, (hold - b.t) * 3));
    slam(ctx, String(big), 640, 190, final ? 170 : 120, b.t, col);
    ctx.restore();
    if (final) {
      if (fog && b.t > 0.2) text(ctx, 'Hidden in the Fog Marsh!', 640, 290, 26, { color: '#c9d6e8' });
      else if (b.rolls.length > 1 && b.t > 0.2) text(ctx, b.rolls.join('  +  ') + (b.roll !== b.rolls.reduce((x, y) => x + y, 0) ? '  + bonus' : ''), 640, 290, 26, { color: '#ffffff' });
      if (b.doubles && !fog && b.t > 0.35) {
        const p = Math.min(1, (b.t - 0.35) / 0.25);
        ctx.save();
        ctx.translate(640, 350);
        ctx.rotate(-0.06);
        ctx.scale(0.6 + p * 0.4 + Math.sin(t * 8) * 0.03, 0.6 + p * 0.4 + Math.sin(t * 8) * 0.03);
        text(ctx, `DOUBLES!  +${DOUBLES_KEYS} keys`, 0, 0, 44, { color: '#7cf3ff' });
        ctx.restore();
      }
      if (b.t > 0.35) text(ctx, fog ? `${name} moves ? spaces...` : `${name} moves ${b.roll} space${b.roll === 1 ? '' : 's'}!`, 640, b.doubles && !fog ? 404 : 330, 28, { color: me?.color ?? '#fff' });
    } else if (b.t > 0.25) text(ctx, `Die ${b.rolls.length}: ${big}`, 640, 290, 26, { color: '#ffffff' });
  } else if (b.sub === 'branch') {
    promptPill(ctx, `Pick a path: ${STICK()} to aim, ${A()} to go`, 104);
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
    else if (pm.kind === 'shop') drawShop(ctx, pm, mine.keys);
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
  } else if (b.sub === 'itemSpin' && b.spin) {
    drawItemReel(ctx, b.spin, b.t, t);
  } else if (b.sub === 'gamble' && b.gamble) {
    drawGambleReel(ctx, b.gamble, b.t, t);
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
  roundRect(ctx, x0 - 30, 150, n * size + (n - 1) * 14 + 60, size + 210, 28);
  ctx.fill();
  text(ctx, show ? 'Turn order' : 'Roll for turn order!', 640, 190, 40, { color: '#ffd23f' });
  text(ctx, show ? 'Highest roll goes first' : `Everyone press ${A()} to roll`, 640, 230, 20, { color: '#ffffff', weight: 600 });
  ids.forEach((id, i) => {
    const p = playerById(s.players, id);
    if (!p) return;
    const x = x0 + i * (size + 14);
    const y = 260;
    const v = b.orderRolls[id];
    // the 12-sided die itself is drawn in 3D over this spot; a glow behind it and the number under it
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (v) text(ctx, String(v), x + size / 2, y + size + 2, size * 0.32, { color: '#ffd23f', weight: 900 });
    text(ctx, p.name, x + size / 2, y + size + 34, size < 80 ? 13 : 17, { color: p.color });
    if (show) text(ctx, ['1st', '2nd', '3rd'][i] ?? `${i + 1}th`, x + size / 2, y + size + 58, 18, { color: '#ffffff', weight: 800 });
  });
}


const ORD = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/** Left edge: everyone ranked by crowns then keys, with their keys and an HP bar. */
function drawStandings(ctx: CanvasRenderingContext2D, s: PartyState, cur: string, setup: boolean): void {
  const b = s.board!;
  const ids = [...b.order].filter((id) => b.players[id]);
  ids.sort((x, y) => b.players[y].crowns - b.players[x].crowns || b.players[y].keys - b.players[x].keys);
  const n = ids.length;
  const rowH = Math.min(62, 600 / Math.max(1, n));
  const W = 250;
  ids.forEach((id, i) => {
    const p = playerById(s.players, id);
    const bp = b.players[id];
    if (!p) return;
    // ties share a place
    let place = i + 1;
    while (place > 1) {
      const o = b.players[ids[place - 2]];
      if (o.crowns === bp.crowns && o.keys === bp.keys) place--;
      else break;
    }
    const y = 10 + i * rowH;
    const on = id === cur && !setup;
    // name strip: a slanted tab in the player's colour fading into dark
    const gr = ctx.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, p.color);
    gr.addColorStop(0.35, on ? 'rgba(255,225,77,0.55)' : 'rgba(20,12,40,0.7)');
    gr.addColorStop(1, on ? 'rgba(255,225,77,0.35)' : 'rgba(20,12,40,0.55)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W + 10, y);
    ctx.lineTo(W, y + rowH * 0.46);
    ctx.lineTo(0, y + rowH * 0.46);
    ctx.closePath();
    ctx.fill();
    const big = rowH > 50;
    const nameY = y + rowH * 0.23;
    text(ctx, bp.ko ? `${p.name} 💤` : p.name, 36, nameY, big ? 17 : 14, { align: 'left', color: '#ffffff' });
    text(ctx, `${place}${ORD(place)}`, W - 4, nameY, big ? 17 : 14, { align: 'right', color: place === 1 ? '#ffd23f' : '#ffffff' });
    if (on) text(ctx, '▶', 14, nameY, big ? 16 : 13, { color: '#ffd23f' });
    // second line: crowns, keys, HP
    const ly = y + rowH * 0.7;
    ctx.fillStyle = 'rgba(20,12,40,0.62)';
    ctx.fillRect(0, ly - rowH * 0.2, W, rowH * 0.4);
    crownIcon(ctx, 16, ly, 0.75);
    popText(ctx, `crowns:${id}`, bp.crowns, 30, ly + 1, big ? 17 : 14, { align: 'left', color: '#ffd23f' });
    keyIcon(ctx, 62, ly);
    popText(ctx, `keys:${id}`, bp.keys, 76, ly + 1, big ? 17 : 14, { align: 'left', color: '#ffffff' });
    const hx = 120, hw = W - hx - 8, hh = Math.min(20, rowH * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(hx, ly - hh / 2, hw, hh);
    const f = Math.max(0, bp.hp / b.preset.maxHp);
    ctx.fillStyle = f > 0.5 ? '#4cd97b' : f > 0.25 ? '#ffb020' : '#ff4d5a';
    ctx.fillRect(hx, ly - hh / 2, hw * f, hh);
    popText(ctx, `hp:${id}`, bp.hp, hx + hw / 2, ly + 1, big ? 16 : 13, { color: '#ffffff' });
    if (bp.shield) text(ctx, '🛡', hx + hw - 10, ly, 12, { outline: false });
  });
}

/** Bottom centre: every item in the game, with how many the current player holds. */
function drawItemGrid(ctx: CanvasRenderingContext2D, s: PartyState, cur: string): void {
  const b = s.board!;
  const mine = b.players[cur];
  const ids = Object.keys(ITEMS) as (keyof typeof ITEMS)[];
  const cols = 5, cell = 56, gap = 6;
  const rows = Math.ceil(ids.length / cols);
  const w = cols * cell + (cols - 1) * gap;
  const x0 = 640 - w / 2;
  const y0 = 712 - rows * cell - (rows - 1) * gap;
  const pm = b.prompt as { kind: string; sel?: number } | null;
  const picking = b.sub === 'prompt' && pm?.kind === 'items' ? mine.items[pm.sel ?? 0] : null;
  text(ctx, 'Items', 640, y0 - 16, 20, { color: '#7dff6a' });
  ids.forEach((id, k) => {
    const x = x0 + (k % cols) * (cell + gap);
    const y = y0 + Math.floor(k / cols) * (cell + gap);
    const count = mine.items.filter((it) => it === id).length;
    ctx.fillStyle = 'rgba(20,12,40,0.62)';
    ctx.fillRect(x, y, cell, cell);
    ctx.lineWidth = picking === id ? 4 : 2;
    ctx.strokeStyle = picking === id ? '#ffd23f' : count ? '#7dff6a' : 'rgba(255,255,255,0.28)';
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    const icon = itemIcon(id);
    ctx.save();
    ctx.globalAlpha = count ? 1 : 0.4;
    if (icon) ctx.drawImage(icon, x + 3, y + 3, cell - 6, cell - 6);
    else {
      ctx.fillStyle = ITEMS[id].color;
      roundRect(ctx, x + 12, y + 12, cell - 24, cell - 24, 6);
      ctx.fill();
    }
    ctx.restore();
    text(ctx, String(count), x + cell - 8, y + cell - 11, 15, { align: 'right', color: count ? '#ffffff' : 'rgba(255,255,255,0.6)' });
  });
}

/** The big "<name> start turn!" banner that slams in at the top of each turn. */
function startBanner(ctx: CanvasRenderingContext2D, msg: string, age: number): void {
  const k = Math.min(1, age / 0.25);
  const s = k < 1 ? 1.6 - 0.6 * k : 1 + Math.sin(Math.min(1, (age - 0.25) / 0.3) * Math.PI) * 0.06;
  ctx.save();
  ctx.translate(640, 110);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  ctx.scale(s, s);
  ctx.globalAlpha = k;
  ctx.font = `56px 'Kenney Future Narrow', system-ui, sans-serif`;
  const label = msg.toUpperCase();
  let size = 56;
  while (size > 30 && ctx.measureText(label).width > 900) {
    size -= 2;
    ctx.font = `${size}px 'Kenney Future Narrow', system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#123d12';
  ctx.strokeText(label, 0, 4);
  ctx.lineWidth = 8;
  ctx.strokeText(label, 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#c8ff7a');
  g.addColorStop(1, '#3fd94a');
  ctx.fillStyle = g;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** A one-line instruction in a dark pill, sized to fit between the standings and the top-right panel. */
function promptPill(ctx: CanvasRenderingContext2D, msg: string, y: number): void {
  let size = 24;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (size > 15 && ctx.measureText(msg).width > 620) {
    size -= 1;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
  const w = ctx.measureText(msg).width + 40;
  ctx.fillStyle = 'rgba(20,12,40,0.7)';
  roundRect(ctx, 640 - w / 2, y - 22, w, 44, 22);
  ctx.fill();
  text(ctx, msg, 640, y, size, { color: '#ffffff', weight: 800 });
}

/** A reel that whizzes past a pointer, slows down and stops on the prize (Item Crates, Gold Strikes). */
let reelTick = -1;
function drawReel(
  ctx: CanvasRenderingContext2D,
  o: { n: number; at: number; title: string; color: string; cell: (i: number, x: number, y: number, size: number, prize: boolean) => void; result: string; resultColor: string },
  age: number,
  t: number,
): void {
  const cell = 92, vis = 7, cx = 640, cy = 236;
  const w = cell * vis;
  const k = Math.min(1, age / SPIN_STOP);
  const pos = o.at * (1 - Math.pow(1 - k, 4));
  const idx = Math.floor(pos + 0.5);
  if (age < 0.05) reelTick = -1;
  if (idx !== reelTick && reelTick !== 1e9) {
    if (reelTick >= 0 && idx > reelTick) sfx.move();
    reelTick = idx;
  }
  const done = k >= 1;
  if (done && reelTick !== 1e9) {
    sfx.gem();
    reelTick = 1e9;
  }
  const enter = Math.min(1, age / 0.2);
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.fillStyle = 'rgba(20,12,40,0.82)';
  roundRect(ctx, cx - w / 2 - 14, cy - cell / 2 - 46, w + 28, cell + 92, 20);
  ctx.fill();
  ctx.strokeStyle = o.color;
  ctx.lineWidth = 4;
  ctx.stroke();
  text(ctx, o.title, cx, cy - cell / 2 - 22, 26, { color: o.color });
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, cy - cell / 2, w, cell);
  ctx.clip();
  const first = Math.floor(pos) - Math.ceil(vis / 2) - 1;
  for (let i = first; i <= first + vis + 3; i++) {
    if (i < 0 || i >= o.n) continue;
    const x = cx + (i - pos) * cell;
    const prize = done && i === o.at;
    const edge = 1 - Math.min(1, Math.abs(x - cx) / (w / 2)) * 0.7;
    ctx.globalAlpha = enter * edge;
    ctx.fillStyle = prize ? 'rgba(255,179,71,0.35)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - cell / 2 + 4, cy - cell / 2 + 4, cell - 8, cell - 8);
    const sc = prize ? 1 + Math.sin(Math.min(1, (age - SPIN_STOP) / 0.3) * Math.PI) * 0.18 : 1;
    o.cell(i, x, cy, (cell - 16) * sc, prize);
  }
  ctx.restore();
  ctx.globalAlpha = enter;
  ctx.strokeStyle = done ? '#ffd23f' : '#ffffff';
  ctx.lineWidth = done ? 5 + Math.sin(t * 10) * 1.5 : 3;
  ctx.strokeRect(cx - cell / 2 + 2, cy - cell / 2 + 2, cell - 4, cell - 4);
  ctx.fillStyle = '#ffd23f';
  for (const dir of [-1, 1]) {
    const y = cy + dir * (cell / 2 + 2);
    ctx.beginPath();
    ctx.moveTo(cx - 12, y + dir * 12);
    ctx.lineTo(cx + 12, y + dir * 12);
    ctx.lineTo(cx, y - dir * 2);
    ctx.closePath();
    ctx.fill();
  }
  if (done) text(ctx, o.result, cx, cy + cell / 2 + 24, 22, { color: o.resultColor });
  ctx.restore();
}

function drawItemReel(ctx: CanvasRenderingContext2D, spin: { reel: (keyof typeof ITEMS)[]; at: number }, age: number, t: number): void {
  drawReel(
    ctx,
    {
      n: spin.reel.length,
      at: spin.at,
      title: 'ITEM CRATE!',
      color: '#ffb347',
      result: ITEMS[spin.reel[spin.at]].name,
      resultColor: '#ffd23f',
      cell: (i, x, y, sz) => {
        const id = spin.reel[i];
        const icon = itemIcon(id);
        if (icon) ctx.drawImage(icon, x - sz / 2, y - sz / 2, sz, sz);
        else {
          ctx.fillStyle = ITEMS[id].color;
          roundRect(ctx, x - sz / 3, y - sz / 3, (sz * 2) / 3, (sz * 2) / 3, 8);
          ctx.fill();
        }
      },
    },
    age,
    t,
  );
}

/** Gold Strike: nuggets and cave-ins flick past; where it stops is what you get. */
function drawGambleReel(ctx: CanvasRenderingContext2D, g: { reel: number[]; at: number; pick: number }, age: number, t: number): void {
  drawReel(
    ctx,
    {
      n: g.reel.length,
      at: g.at,
      title: 'GOLD STRIKE!',
      color: '#ffc61a',
      result: g.pick >= 0 ? `Struck gold! +${g.pick} keys` : `Cave-in! ${g.pick} keys`,
      resultColor: g.pick >= 0 ? '#ffd23f' : '#ff6b6b',
      cell: (i, x, y, sz) => {
        const v = g.reel[i];
        const win = v >= 0;
        ctx.fillStyle = win ? '#ffc61a' : '#8a5a3a';
        roundRect(ctx, x - sz / 2 + 4, y - sz / 2 + 4, sz - 8, sz - 8, 12);
        ctx.fill();
        if (win) {
          // a little nugget pile
          ctx.fillStyle = '#fff1a8';
          for (const [dx, dy, r] of [[-10, 8, 8], [6, 10, 7], [-2, -2, 9]] as [number, number, number][]) {
            ctx.beginPath();
            ctx.arc(x + dx * (sz / 76), y - sz * 0.12 + dy * (sz / 76), r * (sz / 76), 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#5b3a24';
          for (const [dx, dy, r] of [[-12, 6, 9], [8, 4, 10], [-1, -8, 8]] as [number, number, number][]) {
            ctx.beginPath();
            ctx.arc(x + dx * (sz / 76), y - sz * 0.12 + dy * (sz / 76), r * (sz / 76), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        text(ctx, win ? `+${v}` : `${v}`, x, y + sz * 0.26, Math.round(sz * 0.3), { color: win ? '#5a3a00' : '#ffd0c0', outline: false, weight: 900 });
      },
    },
    age,
    t,
  );
}

/** Shop counter: the stock with prices, and a Leave row. */
function drawShop(ctx: CanvasRenderingContext2D, pm: { stock: (keyof typeof ITEMS)[]; sel: number }, keys: number): void {
  const rows = pm.stock.length + 1;
  const h = 96 + rows * 58;
  const x0 = 360, w = 560, y0 = 96;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(ctx, x0, y0, w, h, 26);
  ctx.fill();
  ctx.strokeStyle = '#0ea5a4';
  ctx.lineWidth = 6;
  ctx.stroke();
  text(ctx, 'SHOP', 640, y0 + 34, 32, { color: '#0ea5a4' });
  keyIcon(ctx, 640 + 120, y0 + 34);
  text(ctx, `${keys}`, 640 + 134, y0 + 35, 20, { align: 'left', color: '#2a1b5e', outline: false });
  pm.stock.forEach((it, k) => {
    const y = y0 + 84 + k * 58;
    const sel = k === pm.sel;
    const price = SHOP_PRICE[it];
    const can = keys >= price;
    if (sel) {
      ctx.fillStyle = 'rgba(255,210,63,0.6)';
      roundRect(ctx, x0 + 16, y - 26, w - 32, 52, 14);
      ctx.fill();
    }
    const icon = itemIcon(it);
    if (icon) ctx.drawImage(icon, x0 + 26, y - 24, 48, 48);
    ctx.save();
    ctx.globalAlpha = can ? 1 : 0.45;
    text(ctx, ITEMS[it].name, x0 + 86, y - 8, 22, { align: 'left', color: '#2a1b5e', outline: false });
    text(ctx, ITEMS[it].desc, x0 + 86, y + 14, 13, { align: 'left', color: '#5b4a91', outline: false, weight: 600 });
    keyIcon(ctx, x0 + w - 70, y);
    text(ctx, `${price}`, x0 + w - 28, y + 1, 22, { align: 'right', color: can ? '#2a1b5e' : '#ff4d5a', outline: false });
    ctx.restore();
  });
  const ly = y0 + 84 + pm.stock.length * 58;
  if (pm.sel === pm.stock.length) {
    ctx.fillStyle = 'rgba(255,210,63,0.6)';
    roundRect(ctx, x0 + 16, ly - 22, w - 32, 44, 14);
    ctx.fill();
  }
  text(ctx, 'Leave the shop', 640, ly, 20, { color: '#2a1b5e', outline: false });
  text(ctx, 'Stick: choose   A: buy   B: leave', 640, y0 + h - 22, 16, { color: '#ff4d5a', outline: false, weight: 700 });
}
