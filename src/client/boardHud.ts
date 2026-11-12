import { coinSlots, hpSlots, shownCoins } from './coinFly';
import { A, B, STICK, X } from './prompts';
import { slam, sunburst, vignette } from './showtime';
import { sfx } from './sfx';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { PROMPT_LOCK, SPIN_STOP, DIE_SHOW, DOUBLES_EXTRA, DOUBLES_KEYS, ROLL_SHOW, CHUNK_EVENTS, CHUNK_INTRO, BOSS_INTRO, bossIn, currentPlayer, TURN_TIME } from '../shared/board/engine';
import { TRAIN_PRICE, WISP_PRICE, type ChunkKind } from '../shared/board/types';
import { ITEMS, ITEM_COLS, ITEM_GRID, SHOP_PRICE, STORES } from '../shared/board/items';
import { WEATHER, WEATHER_COLOR, forecast } from '../shared/board/weather';
import { faceBadge, playerById, popText, richWidth, roundRect, text } from '../shared/draw';
import { Spring } from './uiDepth';
import { itemIcon } from './three/itemIcons';
import { lebronNow } from './three/lebronDance';

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
  turnClock(ctx, s, t);

  // top right: board, turn, turn order and what the board is up to
  const late = b.maxTurns - b.turn < pr.doubleTurns;
  let event =
    def.theme === 'cosmo'
      ? `Laser in ${b.counter}  ·  meteors on red rings`
      : def.theme === 'hollow'
        ? b.night
          ? 'Night: a pine falls at round end'
          : 'Day: ring the bell for night'
        : def.theme === 'court'
          ? (() => {
              const n = bossIn(b, def);
              if (n === null) return 'Fucci Verse: all calm';
              return `Choppy Verse: ${def.boss?.name ?? 'Villain'} ${n === 0 ? 'strikes this round!' : n === 1 ? 'strikes next round' : `strikes in ${n} rounds`}`;
            })()
          : `Boulder in the ${b.hazards.boulderLane ? 'east' : 'west'} canyon`;
  if (late) event = 'Final turns: Coin and Heart pay double!';
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
  pill(130, richWidth(ctx, event, 17) + 20);
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
  const bagOpen = b.sub === 'prompt' && (b.prompt as { kind: string } | null)?.kind === 'items';
  if (!setup && mine && !mapOpen) {
    if (bagOpen) drawItemGrid(ctx, s, cur, t);
    else bagHint(ctx, mine.items.length, b.sub === 'roll' && b.rolls.length === 0);
  }

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
    turnCard(ctx, name, me?.color ?? '#ffd23f', b.t, b.cur === 0 ? 3.6 : 2.8);
    if (b.cur === 0) text(ctx, `Turn ${b.turn}`, 640, 168, 30, { color: '#ffffff' });
    if (b.cur === 0 && b.wonFirst.includes(cur)) text(ctx, 'Turn order follows the last Crust Game\'s finish!', 640, 204, 22, { color: '#ffd23f' });
    if (b.cur === 0) roundWarnings(ctx, s, b.t);
  } else if (b.sub === 'roll') {
    const first = b.rolls.length === 0;
    const n = first ? (mine.rollCap ? 1 : mine.dice) : b.diceN;
    const which = n > 1 ? ` die ${b.rolls.length + 1} of ${n}` : '';
    promptPill(ctx, `${name}: ${A()} to roll${which}${first ? `   ·   ${B()} for items` : ''}`, 104);
    if (first) {
      const bonus = [mine.dice > 2 && !mine.rollCap ? '3 dice!' : '', mine.rollBonus ? `+${mine.rollBonus}` : '', mine.rollCap ? `snared: 1 die, max ${mine.rollCap}` : '', mine.rollMin ? `High Roller: ${mine.rollMin} to 6` : '', mine.slowRoll ? `Slow Roller: ${A()} stops the die` : ''].filter(Boolean).join('  ');
      text(ctx, bonus || `Doubles pay +${DOUBLES_KEYS} Pit Coin`, 640, 146, 22, { color: '#ffd23f' });
    } else text(ctx, `${b.rolls.map((r, i) => `Die ${i + 1}: ${fog ? '?' : r}`).join('   ')}`, 640, 150, 22, { color: '#ffd23f' });
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
      // the sum sits in the top pill, clear of the dice hanging over the player's head
      if (fog && b.t > 0.2) promptPill(ctx, 'Hidden in the Fog Marsh!', 70);
      else if (b.rolls.length > 1 && b.t > 0.2) promptPill(ctx, b.rolls.join('  +  ') + (b.roll !== b.rolls.reduce((x, y) => x + y, 0) ? '  + bonus' : ''), 70);
      if (b.doubles && !fog && b.t > 0.35) {
        const p = Math.min(1, (b.t - 0.35) / 0.25);
        ctx.save();
        ctx.translate(640, 300);
        ctx.rotate(-0.06);
        ctx.scale(0.6 + p * 0.4 + Math.sin(t * 8) * 0.03, 0.6 + p * 0.4 + Math.sin(t * 8) * 0.03);
        text(ctx, `DOUBLES!  +${DOUBLES_KEYS} Pit Coin`, 0, 0, 44, { color: '#7cf3ff' });
        ctx.restore();
      }
      if (b.t > 0.35) text(ctx, fog ? `${name} moves ? spaces...` : `${name} moves ${b.roll} space${b.roll === 1 ? '' : 's'}!`, 640, 600, 30, { color: me?.color ?? '#fff' });
    } else if (b.t > 0.25) promptPill(ctx, `Die ${b.rolls.length}: ${big}`, 70);
  } else if (b.sub === 'branch') {
    promptPill(ctx, `Pick a path: ${STICK()} to aim, ${A()} to go`, 104);
  } else if (b.sub === 'wheel' && b.event?.wheel) {
    // the sit-out wheel flicks between first and last place, slowing down
    const k = Math.floor(Math.pow(b.t, 1.6) * 6) % b.event.wheel.length;
    const p = playerById(s.players, b.event.wheel[k]);
    box('Odd number of players! Who sits out?', '', 170);
    text(ctx, p?.name ?? '', 640, 236, 48, { color: p?.color ?? '#000', outline: false });
    text(ctx, `(sitting out pays +${pr.sitOutKeys} Pit Coin)`, 640, 274, 18, { color: '#6b5aa8', outline: false, weight: 600 });
  } else if (b.sub === 'prompt' && b.prompt) {
    const pm = b.prompt;
    // two-choice prompts: two big buttons with a cursor, so a stray A press can't say yes
    const two = (q: string, opts: [string, string], sub: [string, string] = ['', '']) => {
      const sel = (pm as { sel?: number }).sel ?? 0;
      const locked = (b.promptAge ?? 1) < PROMPT_LOCK;
      box(q, '', 210);
      opts.forEach((label, i) => {
        const on = i === sel;
        const x = 640 + (i === 0 ? -170 : 170);
        const w = 280, h = sub[i] ? 74 : 58;
        const yes = i === 0;
        ctx.save();
        ctx.translate(x, 236);
        if (on) ctx.scale(1.06, 1.06);
        ctx.fillStyle = on ? (yes ? '#21c45a' : '#ff4d5a') : '#e9e4f7';
        roundRect(ctx, -w / 2, -h / 2, w, h, 20);
        ctx.fill();
        ctx.lineWidth = on ? 5 : 2;
        ctx.strokeStyle = on ? '#ffd23f' : '#c9c0e6';
        ctx.stroke();
        ctx.restore();
        text(ctx, label, x, 236 - (sub[i] ? 12 : 0), 26, { color: on ? '#ffffff' : '#6b5aa8', outline: false, weight: 800 });
        if (sub[i]) text(ctx, sub[i], x, 254, 15, { color: on ? '#ffffff' : '#6b5aa8', outline: false, weight: 700 });
        if (on) text(ctx, '▼', x, 236 - h / 2 - 16 + Math.sin(t * 8) * 3, 22, { color: '#ffd23f' });
      });
      ctx.globalAlpha = locked ? 0.4 : 1;
      text(ctx, `${STICK()} choose   ${A()} confirm   ${B()} no`, 640, 300, 18, { color: '#2a1b5e', outline: false, weight: 700 });
      ctx.globalAlpha = 1;
    };
    if (pm.kind === 'crown') two(`Open the Chobglob Chest for ${pr.crownPrice} Pit Coin?`, ['Yes', 'No']);
    else if (pm.kind === 'wisp') two(`Pay the Wisp ${WISP_PRICE} Pit Coin to rob the leader?`, ['Yes, pay', 'No thanks']);
    else if (pm.kind === 'train') two(`Ride the train to the next station for ${TRAIN_PRICE} Pit Coin?`, ['Yes, ride', 'No thanks']);
    else if (pm.kind === 'claim')
      two('Claim this post! Pick its mode', ['Toll Post', 'Sting Post'], [`others pay ${pr.postToll} Pit Coin`, `${pr.postSting} dmg, you heal ${pr.postStingHeal}`]);
    else if (pm.kind === 'steal') two(`Pay ${pr.postStealCost} Pit Coin to take over this post?`, ['Yes, steal', 'No thanks']);
    else if (pm.kind === 'shop') drawShop(ctx, pm, mine.keys);
    else if (pm.kind === 'items') {
      // drawn by drawItemGrid at the bottom
    } else if (pm.kind === 'target') {
      const tp = playerById(s.players, pm.options[pm.sel]);
      const what = pm.purpose === 'duel' ? 'Pick your duel rival' : pm.purpose === 'cannon' ? 'Aim the cannon' : `${ITEMS[pm.item!].name}: pick a target`;
      box(what, `${STICK()} choose   ${A()} confirm` + (pm.purpose === 'item' ? `   ${B()} back` : ''), 200);
      text(ctx, tp?.name ?? '', 640, 230, 44, { color: tp?.color ?? '#000', outline: false });
    }
  } else if (b.sub === 'itemSpin' && b.spin) {
    drawItemReel(ctx, b.spin, b.t, t);
  } else if (b.sub === 'chunk' && b.chunk) {
    const who = playerById(s.players, b.chunk.victim);
    if (b.t < CHUNK_INTRO) {
      const k = Math.min(1, b.t / 0.35);
      ctx.save();
      ctx.translate(640, 200);
      ctx.rotate(Math.sin(b.t * 30) * 0.03 * (1 - k));
      ctx.scale(0.5 + k * 0.5, 0.5 + k * 0.5);
      text(ctx, 'MISTER CHUNK!', 0, 0, 72, { color: '#ff3b4e' });
      ctx.restore();
      if (b.t > 0.6) text(ctx, `${who?.name ?? ''} landed on a CHUNK SPACE...`, 640, 262, 26, { color: '#ffffff' });
    } else drawChunkReel(ctx, b.chunk, b.t - CHUNK_INTRO, t);
  } else if (b.sub === 'boss' && b.boss && def.boss) {
    const name = def.boss.name.toUpperCase();
    if (b.t < BOSS_INTRO) {
      const k = Math.min(1, b.t / 0.35);
      ctx.save();
      ctx.translate(640, 200);
      ctx.rotate(Math.sin(b.t * 30) * 0.03 * (1 - k));
      ctx.scale(0.5 + k * 0.5, 0.5 + k * 0.5);
      text(ctx, `${name}!`, 0, 0, 72, { color: '#ff3b4e' });
      ctx.restore();
      if (b.t > 0.6) text(ctx, b.t < 1.9 ? 'He wants someone off his court...' : '...but first, he has to DANCE.', 640, 262, 26, { color: '#ffffff' });
    } else if (b.boss.dance) {
      // his dance party: goes on until the host skips it
      const beat = lebronNow.beat;
      const pop = 1 + Math.max(0, 1 - (beat - Math.floor(beat)) * 4) * 0.08;
      ctx.save();
      ctx.translate(640, 84);
      ctx.scale(pop, pop);
      ctx.rotate(Math.sin(beat * Math.PI) * 0.03);
      text(ctx, `${name}'S DANCE PARTY`, 0, 0, 34, { color: ['#ff3b4e', '#ffd23f', '#c79bff', '#4cd97b'][Math.floor(beat) % 4] });
      ctx.restore();
      if (lebronNow.name) text(ctx, `Now dancing: ${lebronNow.name}`, 640, 128, 24, { color: '#ffffff', weight: 800 });
      text(ctx, `${X()} (host): skip the dance`, 640, 598, 20, { color: '#ffffff', weight: 700 });
    } else {
      const victim = playerById(s.players, b.boss.pick);
      const boss = b.boss;
      drawReel(
        ctx,
        {
          n: boss.reel.length,
          at: boss.at,
          title: `${name} PICKS...`,
          color: '#ff3b4e',
          result: `${victim?.name ?? ''} gets slammed!`,
          resultColor: '#ff6b6b',
          cell: (i, x, y, sz) => {
            const p = playerById(s.players, boss.reel[i]);
            ctx.fillStyle = p?.color ?? '#4a1a2e';
            roundRect(ctx, x - sz / 2 + 4, y - sz / 2 + 4, sz - 8, sz - 8, 12);
            ctx.fill();
            text(ctx, (p?.name ?? '?').slice(0, 7), x, y, Math.round(sz * 0.2), { color: '#ffffff', weight: 900 });
          },
        },
        b.t - BOSS_INTRO,
        t,
      );
    }
  } else if (b.sub === 'gamble' && b.gamble) {
    drawGambleReel(ctx, b.gamble, b.t, t);
  } else if (b.sub === 'roundEnd') {
    const beat = b.recap?.cur;
    if (beat) {
      // a big title for each hazard or weather beat, then what it did
      const age = b.t - beat.at;
      ribbonTitle(ctx, 'END OF ROUND', 640, 108);
      slam(ctx, beat.title, 640, 180, 64, age, beat.color, 0);
      if (age > 0.45) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (age - 0.45) / 0.3);
        text(ctx, beat.line, 640, 240, 30, { color: '#ffffff', weight: 800 });
        ctx.restore();
      }
    } else if (b.recap?.summary !== undefined) drawRoundSummary(ctx, s, b.t - b.recap.summary);
    else text(ctx, 'End of round', 640, 220, 40, { color: '#ff9f1c' });
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

/** End of a round: where everyone stands before the minigame (Chobglobs, Pit Coin, HP and what changed). */
function drawRoundSummary(ctx: CanvasRenderingContext2D, s: PartyState, age: number): void {
  const b = s.board!;
  const rows = Object.values(b.players).sort((p, q) => q.crowns - p.crowns || q.keys - p.keys);
  const n = rows.length;
  const rh = Math.min(46, 400 / Math.max(1, n));
  const w = 640, h = 112 + n * rh;
  const x0 = 640 - w / 2, y0 = Math.max(70, 360 - h / 2);
  const intro = Math.min(1, age / 0.35);
  const out = Math.max(0, Math.min(1, (age - 3.8) / 0.4));
  ctx.save();
  ctx.globalAlpha = intro * (1 - out);
  ctx.translate(0, (1 - intro) * 30);
  ctx.fillStyle = 'rgba(12,8,36,0.82)';
  roundRect(ctx, x0, y0, w, h, 24);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 4;
  ctx.stroke();
  const left = b.maxTurns - b.turn;
  text(ctx, 'STANDINGS', 640, y0 + 36, 34, { color: '#ffd23f' });
  text(ctx, left <= 0 ? 'Final round! One last Crust Game...' : `Round ${b.turn} of ${b.maxTurns}  ·  ${left} to go`, 640, y0 + 70, 17, { color: '#bfe0ff', weight: 800, outline: false });
  const snap = b.standSnap;
  let place = 0;
  rows.forEach((p, i) => {
    // ties share a place
    if (i === 0 || p.crowns !== rows[i - 1].crowns || p.keys !== rows[i - 1].keys) place = i + 1;
    const y = y0 + 102 + i * rh + rh / 2 - 6;
    const k = Math.min(1, Math.max(0, (age - 0.25 - i * 0.08) / 0.25));
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha *= k;
    const info = playerById(s.players, p.id);
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x0 + 14, y - rh / 2 + 3, w - 28, rh - 6, 10);
      ctx.fill();
    }
    text(ctx, `${place}`, x0 + 40, y, 22, { color: place === 1 ? '#ffd23f' : '#ffffff' });
    ctx.fillStyle = info?.color ?? '#fff';
    ctx.beginPath();
    ctx.arc(x0 + 74, y, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, (info?.name ?? '?').slice(0, 14), x0 + 94, y, 20, { align: 'left', weight: 800, outline: false });
    // Chobglobs and Pit Coin, with what changed since the last card
    crownIcon(ctx, x0 + 330, y, 0.8);
    text(ctx, String(p.crowns), x0 + 352, y, 20, { align: 'left', color: '#ffd23f' });
    keyIcon(ctx, x0 + 430, y);
    text(ctx, String(p.keys), x0 + 446, y, 20, { align: 'left', color: '#ffe27a' });
    const was = snap?.[p.id];
    if (was) {
      const dc = p.crowns - was[0], dk = p.keys - was[1];
      if (dc) text(ctx, `${dc > 0 ? '+' : ''}${dc}`, x0 + 378, y - 9, 13, { align: 'left', color: dc > 0 ? '#9dff8a' : '#ff7a7a' });
      if (dk) text(ctx, `${dk > 0 ? '+' : ''}${dk}`, x0 + 486, y - 9, 13, { align: 'left', color: dk > 0 ? '#9dff8a' : '#ff7a7a' });
    }
    // HP bar
    const hp = Math.max(0, p.hp) / b.preset.maxHp;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, x0 + 530, y - 6, 80, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.ko ? '#777' : hp > 0.5 ? '#4cd97b' : hp > 0.25 ? '#ffb020' : '#ff5a5f';
    roundRect(ctx, x0 + 530, y - 6, Math.max(6, 80 * hp), 12, 6);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

/** Pit Coin: a gold coin with a dimple pressed in the middle. */
export function keyIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffcb2f';
  ctx.strokeStyle = '#a06a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c98a00';
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(-3, -3.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A Chobglob: a golden dollop of goo with two eyes. */
export function crownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#ffc21a';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 9);
  ctx.quadraticCurveTo(-14, -2, -6, -4);
  ctx.quadraticCurveTo(-4, -12, 1, -11);
  ctx.quadraticCurveTo(4, -15, 3, -9);
  ctx.quadraticCurveTo(9, -8, 8, -2);
  ctx.quadraticCurveTo(15, 0, 12, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const ex of [-4, 4]) {
    ctx.beginPath();
    ctx.ellipse(ex, 2, 2.6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1f1d26';
  for (const ex of [-4, 4]) {
    ctx.beginPath();
    ctx.arc(ex, 2.8, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-7, -1, 1.6, 2.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
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



/** Left edge: everyone ranked by crowns then keys, with their keys and an HP bar. */
/** Each row's on-screen y, sprung, so rows slide past each other when the places change. */
const rowY = new Map<string, Spring>();
let rowClock = 0;

function drawStandings(ctx: CanvasRenderingContext2D, s: PartyState, cur: string, setup: boolean): void {
  const b = s.board!;
  const ids = [...b.order].filter((id) => b.players[id]);
  ids.sort((x, y) => b.players[y].crowns - b.players[x].crowns || b.players[y].keys - b.players[x].keys);
  const n = ids.length;
  const rowH = Math.min(62, 600 / Math.max(1, n));
  const W = 250;
  const now = performance.now() / 1000;
  const dt = rowClock ? Math.min(0.05, now - rowClock) : 0;
  rowClock = now;
  const big = rowH > 50;
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
    let sp = rowY.get(id);
    if (!sp) rowY.set(id, (sp = new Spring(10 + i * rowH, 120, 15)));
    sp.target = 10 + i * rowH;
    sp.step(dt);
    const y = sp.v;
    const on = id === cur && !setup;
    const h = rowH - 5;
    const x0 = on ? 8 : 0;
    // card: drop shadow, ink body, a glowing edge for whoever's turn it is
    ctx.save();
    ctx.fillStyle = 'rgba(10,4,30,0.32)';
    roundRect(ctx, x0 - 14, y + 3, W + 14, h, 14);
    ctx.fill();
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, on ? 'rgba(70,46,120,0.92)' : 'rgba(40,24,78,0.86)');
    gr.addColorStop(1, on ? 'rgba(46,28,90,0.92)' : 'rgba(24,12,50,0.86)');
    ctx.fillStyle = gr;
    roundRect(ctx, x0 - 14, y, W + 14, h, 14);
    ctx.fill();
    ctx.lineWidth = on ? 3 : 1.5;
    ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.14)';
    ctx.stroke();
    // a strip of their colour down the left edge
    ctx.fillStyle = p.color;
    roundRect(ctx, x0 - 14, y, 20, h, 10);
    ctx.fill();
    ctx.restore();
    const fr = Math.min(h * 0.4, 21);
    const fx = x0 + 6 + fr, fy = y + h / 2;
    ctx.save();
    if (bp.ko) ctx.globalAlpha = 0.5;
    faceBadge(ctx, p.color, fx, fy, fr);
    ctx.restore();
    // place medal on the face's corner
    const medal = place === 1 ? '#ffd23f' : place === 2 ? '#d7dde8' : place === 3 ? '#e59a5a' : '#6b5aa8';
    ctx.fillStyle = medal;
    ctx.beginPath();
    ctx.arc(fx - fr * 0.8, fy - fr * 0.75, big ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a0c34';
    ctx.stroke();
    text(ctx, String(place), fx - fr * 0.8, fy - fr * 0.75 + 1, big ? 13 : 11, { color: place <= 3 ? '#2a1b5e' : '#ffffff', weight: 900, outline: false });
    const tx = fx + fr + 10;
    const nameY = y + h * 0.3;
    text(ctx, bp.ko ? `${p.name} 💤` : p.name, tx, nameY, big ? 16 : 13, { align: 'left', color: on ? '#ffe680' : '#ffffff', weight: 800 });
    // second line: Chobglobs, coins, HP
    const ly = y + h * 0.72;
    crownIcon(ctx, tx + 8, ly, 0.7);
    popText(ctx, `crowns:${id}`, bp.crowns, tx + 20, ly + 1, big ? 16 : 13, { align: 'left', color: '#ffd23f' });
    keyIcon(ctx, tx + 52, ly);
    coinSlots.set(id, { x: tx + 52, y: ly });
    popText(ctx, `keys:${id}`, shownCoins(id, bp.keys), tx + 65, ly + 1, big ? 16 : 13, { align: 'left', color: '#ffffff' });
    const hx = tx + 100, hw = x0 + W - hx - 10, hh = Math.min(14, rowH * 0.24);
    hpSlots.set(id, { x: hx + hw / 2, y: ly });
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, hx, ly - hh / 2, hw, hh, hh / 2);
    ctx.fill();
    const f = Math.max(0, bp.hp / b.preset.maxHp);
    if (f > 0) {
      ctx.fillStyle = f > 0.5 ? '#4cd97b' : f > 0.25 ? '#ffb020' : '#ff4d5a';
      roundRect(ctx, hx, ly - hh / 2, Math.max(hh, hw * f), hh, hh / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, hx + 2, ly - hh / 2 + 1, Math.max(hh - 4, hw * f - 4), hh * 0.35, hh / 4);
      ctx.fill();
    }
    popText(ctx, `hp:${id}`, bp.hp, hx + hw / 2, ly + 1, big ? 13 : 11, { color: '#ffffff' });
    if (bp.shield) text(ctx, '🛡', hx + hw - 8, ly, 12, { outline: false });
  });
}

/** Bottom centre: every item in the game, with how many the current player holds. */
function drawItemGrid(ctx: CanvasRenderingContext2D, s: PartyState, cur: string, t: number): void {
  const b = s.board!;
  const mine = b.players[cur];
  const cols = ITEM_COLS, cell = 64, gap = 8;
  const rows = Math.ceil(ITEM_GRID.length / cols);
  const w = cols * cell + (cols - 1) * gap;
  const x0 = 640 - w / 2;
  const y0 = 704 - rows * cell - (rows - 1) * gap;
  const pm = b.prompt as { kind: string; sel: number };
  // backing panel
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  roundRect(ctx, x0 - 16, y0 - 44, w + 32, rows * cell + (rows - 1) * gap + 56, 16);
  ctx.fill();
  text(ctx, 'Items', 640, y0 - 22, 20, { color: '#7dff6a' });
  let cx = 0, cy = 0;
  ITEM_GRID.forEach((id, k) => {
    const x = x0 + (k % cols) * (cell + gap);
    const y = y0 + Math.floor(k / cols) * (cell + gap);
    const count = mine.items.filter((it) => it === id).length;
    const on = k === pm.sel;
    if (on) [cx, cy] = [x, y];
    ctx.fillStyle = on ? 'rgba(255,210,63,0.28)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, cell, cell);
    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? '#ffd23f' : count ? '#7dff6a' : 'rgba(255,255,255,0.28)';
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    const icon = itemIcon(id);
    ctx.save();
    ctx.globalAlpha = count ? 1 : 0.35;
    if (icon) ctx.drawImage(icon, x + 3, y + 3, cell - 6, cell - 6);
    else {
      ctx.fillStyle = ITEMS[id].color;
      roundRect(ctx, x + 14, y + 14, cell - 28, cell - 28, 6);
      ctx.fill();
    }
    ctx.restore();
    text(ctx, String(count), x + cell - 8, y + cell - 11, 15, { align: 'right', color: count ? '#ffffff' : 'rgba(255,255,255,0.6)' });
  });
  // the cursor: a bobbing pointer over the selected cell
  const bob = Math.sin(t * 6) * 3;
  ctx.save();
  ctx.translate(cx + cell / 2, cy - 4 + bob);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -14);
  ctx.lineTo(10, -14);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#2a1b5e';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  // tooltip: what the highlighted item does
  const id = ITEM_GRID[pm.sel];
  const info = ITEMS[id];
  const have = mine.items.filter((it) => it === id).length;
  const tw = 540, th = 104;
  const tx = 640 - tw / 2, ty = y0 - 44 - th - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, tx, ty, tw, th, 18);
  ctx.fill();
  ctx.fillStyle = info.color;
  roundRect(ctx, tx, ty, 10, th, 5);
  ctx.fill();
  text(ctx, info.name, tx + 26, ty + 24, 24, { align: 'left', color: '#2a1b5e', outline: false });
  text(ctx, have ? `You have ${have}` : 'You have none', tx + tw - 18, ty + 24, 16, { align: 'right', color: have ? '#1f9d55' : '#9a8fbf', outline: false, weight: 700 });
  text(ctx, info.desc + (info.target ? '. You pick who.' : ''), tx + 26, ty + 56, 18, { align: 'left', color: '#4b3b80', outline: false, weight: 600 });
  const action = !have ? '' : `${A()}: use   `;
  text(ctx, `Stick: move   ${action}${B()}: close`, tx + 26, ty + 86, 15, { align: 'left', color: '#ff4d5a', outline: false, weight: 700 });
}

/** While the bag is shut: a small "B: Items" chip where the grid would be. */
function bagHint(ctx: CanvasRenderingContext2D, count: number, canOpen: boolean): void {
  if (!canOpen) return;
  const label = `${B()}: Items (${count})`;
  ctx.font = `800 18px system-ui, sans-serif`;
  const w = richWidth(ctx, label, 18) + 36;
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  roundRect(ctx, 640 - w / 2, 670, w, 36, 18);
  ctx.fill();
  text(ctx, label, 640, 688, 18, { color: count ? '#7dff6a' : '#d8d2ee', weight: 800 });
}

/**
 * The turn card: the screen dims, a band in the player's colour sweeps across the middle, their name slams in
 * huge and flashes, with IT'S YOUR TURN! under it; then it all slides up and away while the camera arrives.
 */
function turnCard(ctx: CanvasRenderingContext2D, name: string, color: string, age: number, len: number): void {
  const out = Math.max(0, Math.min(1, (age - (len - 0.75)) / 0.55)); // 0 → 1 as it leaves
  const fade = Math.min(1, age / 0.2) * (1 - out);
  vignette(ctx, 0.6 * fade);
  const y = 330 - out * out * 260;
  const k = Math.min(1, age / 0.35);
  const w = 1500 * (1 - Math.pow(1 - k, 3));
  ctx.save();
  ctx.globalAlpha = 0.88 * fade;
  ctx.translate(640, y);
  ctx.transform(1, 0, -0.3, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -92, w, 184);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-w / 2, -92, w, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-w / 2, 82, w, 10);
  const gx = -750 + ((age * 1400) % 1800);
  const g = ctx.createLinearGradient(gx - 90, 0, gx + 90, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(Math.max(-w / 2, gx - 90), -92, Math.min(180, w), 184);
  ctx.restore();
  // the name: slams in big, then flashes white a few times
  const nk = Math.min(1, Math.max(0, age - 0.12) / 0.22);
  if (nk <= 0 || fade <= 0) return;
  const pop = nk < 1 ? 2.1 - 1.1 * nk : 1 + Math.sin(Math.min(1, (age - 0.34) / 0.3) * Math.PI) * 0.08;
  const flash = age > 0.34 && age < 1.5 && Math.floor((age - 0.34) / 0.14) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = fade * nk;
  ctx.translate(640, y - 18);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  ctx.scale(pop, pop);
  const label = name.toUpperCase();
  let size = 104;
  ctx.font = `${size}px 'Kenney Future Narrow', system-ui, sans-serif`;
  while (size > 40 && ctx.measureText(label).width > 1000) {
    size -= 4;
    ctx.font = `${size}px 'Kenney Future Narrow', system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#1a0f2e';
  ctx.strokeText(label, 0, 5);
  ctx.lineWidth = 10;
  ctx.strokeText(label, 0, 0);
  ctx.fillStyle = flash ? '#ffffff' : '#ffe14d';
  ctx.fillText(label, 0, 0);
  ctx.restore();
  const sk = Math.min(1, Math.max(0, age - 0.45) / 0.25);
  if (sk > 0) {
    ctx.save();
    ctx.globalAlpha = fade * sk;
    text(ctx, "IT'S YOUR TURN!", 640, y + 58 + (1 - sk) * 14, 34, { color: '#ffffff' });
    ctx.restore();
  }
}


/** A one-line instruction in a dark pill, sized to fit between the standings and the top-right panel. */
function promptPill(ctx: CanvasRenderingContext2D, msg: string, y: number): void {
  let size = 24;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (size > 15 && richWidth(ctx, msg, size) > 620) {
    size -= 1;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
  const w = richWidth(ctx, msg, size) + 40;
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
const CHUNK_SHORT: Record<ChunkKind, string> = { tax: 'Tax', smash: 'Smash', shake: 'Shake', crown: 'Crown', swap: 'Swap', toss: 'Toss', party: 'Party', stomp: 'Stomp', snack: 'Snack' };
const CHUNK_ICON: Record<ChunkKind, string> = { tax: '−12', smash: '✊', shake: '⇣', crown: '♛', swap: '⇄', toss: '↶', party: '−6', stomp: '✸', snack: '🍩' };
function drawChunkReel(ctx: CanvasRenderingContext2D, c: { reel: ChunkKind[]; at: number; pick: ChunkKind }, age: number, t: number): void {
  const ev = CHUNK_EVENTS[c.pick];
  drawReel(
    ctx,
    {
      n: c.reel.length,
      at: c.at,
      title: "MISTER CHUNK'S SURPRISE",
      color: '#ff3b4e',
      result: `${ev.name}! ${ev.line}`,
      resultColor: c.pick === 'snack' ? '#4cd97b' : '#ff6b6b',
      cell: (i, x, y, sz) => {
        const k = c.reel[i];
        ctx.fillStyle = k === 'snack' ? '#2f9e5a' : k === 'crown' ? '#7a1030' : '#4a1a2e';
        roundRect(ctx, x - sz / 2 + 4, y - sz / 2 + 4, sz - 8, sz - 8, 12);
        ctx.fill();
        text(ctx, CHUNK_ICON[k], x, y - sz * 0.08, Math.round(sz * 0.36), { color: '#ffd9e0', outline: false, weight: 900 });
        text(ctx, CHUNK_SHORT[k], x, y + sz * 0.28, Math.round(sz * 0.16), { color: '#ffffff', outline: false, weight: 800 });
      },
    },
    age,
    t,
  );
}

function drawGambleReel(ctx: CanvasRenderingContext2D, g: { reel: number[]; at: number; pick: number }, age: number, t: number): void {
  drawReel(
    ctx,
    {
      n: g.reel.length,
      at: g.at,
      title: 'GOLD STRIKE!',
      color: '#ffc61a',
      result: g.pick >= 0 ? `Struck gold! +${g.pick} Pit Coin` : `Cave-in! ${g.pick} Pit Coin`,
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
function drawShop(ctx: CanvasRenderingContext2D, pm: { stock: (keyof typeof ITEMS)[]; sel: number; keeper?: 'brian' | 'chunk' }, keys: number): void {
  const rows = pm.stock.length + 1;
  const h = 134 + rows * 58;
  const x0 = 360, w = 560;
  let y0 = 84;
  const store = STORES[pm.keeper === 'chunk' ? 'chunk' : 'brian'];
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(ctx, x0, y0, w, h, 26);
  ctx.fill();
  ctx.strokeStyle = store.color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = store.color;
  roundRect(ctx, x0, y0, w, 62, 26);
  ctx.fill();
  text(ctx, store.name.toUpperCase(), 640, y0 + 30, 30, { color: pm.keeper === 'chunk' ? '#ffffff' : store.accent });
  text(ctx, store.by, 640, y0 + 82, 16, { color: store.color, outline: false, weight: 700 });
  keyIcon(ctx, x0 + w - 70, y0 + 82);
  text(ctx, `${keys}`, x0 + w - 28, y0 + 83, 20, { align: 'right', color: '#2a1b5e', outline: false });
  y0 += 38;
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
  text(ctx, `${STICK()} choose   ${A()} buy   ${B()} leave`, 640, y0 + h - 60, 16, { color: '#ff4d5a', outline: false, weight: 700 });
}

let lastClockSec = -1;
/** The turn clock: hidden until the last 10 seconds, then a big ticking countdown under the turn card. */
function turnClock(ctx: CanvasRenderingContext2D, s: PartyState, t: number): void {
  const b = s.board!;
  const who = playerById(s.players, currentPlayer(b));
  const left = b.clock ?? TURN_TIME;
  const live = (b.sub === 'roll' || b.sub === 'branch' || b.sub === 'prompt') && who && !who.bot && left <= 10;
  if (!live) {
    lastClockSec = -1;
    return;
  }
  const sec = Math.ceil(left);
  if (sec !== lastClockSec) {
    if (lastClockSec >= 0) sfx.tick(1 - left / 10);
    lastClockSec = sec;
  }
  const x = 640, y = 222, r = 40;
  const frac = left / 10;
  const urgent = left <= 3;
  const pulse = 1 + (urgent ? Math.max(0, 1 - (sec - left) * 4) * 0.18 : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(20,10,50,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = urgent ? '#ff3b4e' : '#ffd23f';
  ctx.beginPath();
  ctx.arc(0, 0, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();
  text(ctx, String(sec), 0, 2, 42, { color: urgent && Math.sin(t * 20) > 0 ? '#ff3b4e' : '#ffffff' });
  ctx.restore();
  text(ctx, 'TIME', x, y + r + 16, 16, { color: urgent ? '#ff3b4e' : '#ffd23f', weight: 800 });
}

function ribbonTitle(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(20,10,50,0.75)';
  roundRect(ctx, x - 130, y - 20, 260, 40, 20);
  ctx.fill();
  text(ctx, label, x, y + 1, 20, { color: '#ff9f1c', weight: 800 });
  ctx.restore();
}

/** What this round ends with, so nobody is surprised: shown under the turn card at the top of each round. */
export function roundWarningLines(s: PartyState): { text: string; color: string }[] {
  const b = s.board!;
  const def = getBoard(b.boardId);
  const out: { text: string; color: string }[] = [];
  if (def.theme === 'hollow' && b.night && b.hazards.pine.length) out.push({ text: 'A pine falls on the marked spaces', color: '#7bd36b' });
  if (def.theme === 'cosmo' && b.hazards.meteors.length) out.push({ text: 'Meteors hit the red rings', color: '#ff7a3d' });
  if (def.theme === 'gulch') out.push({ text: `A boulder rolls down the ${b.hazards.boulderLane ? 'east' : 'west'} canyon`, color: '#e0b46a' });
  for (const z of def.weather ?? []) {
    const f = forecast(b, z);
    if (z.kind === 'wind') out.push({ text: `${z.name} blows ${b.weather.wind > 0 ? 'AHEAD' : 'BACK'} ${WEATHER.windPush} spaces at round end`, color: WEATHER_COLOR.wind });
    else if (f.warn) out.push({ text: `${z.name}: ${f.now.replace(/^Round end: /, '')}`, color: WEATHER_COLOR[z.kind] });
  }
  const n = bossIn(b, def);
  if (n === 0) out.push({ text: `${def.boss?.name ?? 'The villain'} strikes!`, color: '#ff3b4e' });
  return out;
}

function roundWarnings(ctx: CanvasRenderingContext2D, s: PartyState, age: number): void {
  const lines = roundWarningLines(s);
  if (!lines.length || age < 1.1) return;
  const k = Math.min(1, (age - 1.1) / 0.3);
  const a = k * Math.max(0, Math.min(1, (3.6 - age) / 0.4));
  const h = 40 + lines.length * 32;
  const y0 = 452 + (1 - k) * 16;
  ctx.font = '800 22px system-ui, sans-serif';
  const w = Math.min(820, Math.max(420, ...lines.map((l) => ctx.measureText(l.text).width + 60)));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(20,10,50,0.82)';
  roundRect(ctx, 640 - w / 2, y0, w, h, 18);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ff9f1c';
  ctx.stroke();
  text(ctx, 'THIS ROUND ENDS WITH', 640, y0 + 22, 18, { color: '#ff9f1c', weight: 800 });
  lines.forEach((l, i) => text(ctx, l.text, 640, y0 + 54 + i * 32, 22, { color: l.color, weight: 800 }));
  ctx.restore();
}
