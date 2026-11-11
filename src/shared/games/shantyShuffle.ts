import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, roundRect, text } from '../draw';
import { rand, randRange, type Rng } from '../rng';
import { playerChips } from './hud';
import { press, pressB, type BotCtx } from '../botkit';

/**
 * Shanty Shuffle (Pirate Kit, rhythm): a sea shanty plays and notes slide along the rope toward the
 * marker. Hit A on a HAUL note and B on a BRACE note as it reaches the marker. On-beat hits hoist your
 * sail, misses drop it. The tune speeds up as it goes. Highest sail at the end wins.
 */
const READY = 3;
export const SONG = 40; // seconds of notes
export const PERFECT = 0.07;
export const GOOD = 0.15;
const LEAD = 1.0; // notes start this long after GO, so the first one has time to slide in
export type NoteKind = 'haul' | 'brace';
export interface Note {
  t: number; // seconds after GO
  kind: NoteKind;
}
export type Judge = 'perfect' | 'good' | 'miss';
export interface Sailor {
  id: string;
  sail: number;
  combo: number;
  best: number;
  perfects: number;
  hits: number;
  misses: number;
  judged: (Judge | null)[];
  next: number; // first note index not yet judged
  flash: { judge: Judge | 'oops'; at: number } | null;
}
export interface ShantyState {
  t: number;
  rng: Rng;
  notes: Note[];
  sailors: Sailor[];
}

/** The beat speeds up from 90 to 140 BPM over the song. */
export const bpmAt = (t: number) => 90 + 50 * Math.min(1, Math.max(0, t / SONG));
export const songT = (s: ShantyState) => s.t - READY;

function chart(rng: Rng): Note[] {
  const notes: Note[] = [];
  let t = LEAD;
  let bar = 0;
  while (t < SONG) {
    const beat = 60 / bpmAt(t);
    // four beats a bar; every so often a rest, and later bars get off-beat pickups
    for (let b = 0; b < 4 && t < SONG; b++) {
      const rest = b === 3 && bar % 2 === 1;
      if (!rest) notes.push({ t, kind: rand(rng) < 0.55 ? 'haul' : 'brace' });
      if (bar > 6 && b === 1 && rand(rng) < 0.35) notes.push({ t: t + beat / 2, kind: rand(rng) < 0.5 ? 'haul' : 'brace' });
      t += beat;
    }
    bar++;
  }
  return notes;
}

const SCORE: Record<Judge, number> = { perfect: 4, good: 2, miss: -2 };

function judge(s: ShantyState, p: Sailor, i: number, j: Judge, now: number): void {
  p.judged[i] = j;
  p.sail = Math.max(0, p.sail + SCORE[j] + (j !== 'miss' && p.combo >= 10 ? 1 : 0));
  if (j === 'miss') {
    p.combo = 0;
    p.misses++;
  } else {
    p.combo++;
    p.best = Math.max(p.best, p.combo);
    p.hits++;
    if (j === 'perfect') p.perfects++;
  }
  p.flash = { judge: j, at: now };
  while (p.next < s.notes.length && p.judged[p.next]) p.next++;
}

export const shantyShuffle: Minigame<ShantyState> = {
  id: 'shanty-shuffle',
  name: 'Shanty Shuffle',
  mode: 'Free-for-all',
  ready: READY,
  goWord: 'HEAVE!',
  blurb: 'Keep time with the sea shanty! Press A for HAUL notes and B for BRACE notes as they hit the marker. On the beat raises your sail, misses drop it. It gets faster!',
  controls: 'A: haul   B: brace',
  minPlayers: 1,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): ShantyState {
    const rng = { seed };
    const notes = chart(rng);
    return {
      t: 0,
      rng,
      notes,
      sailors: players.map((p) => ({ id: p.id, sail: 0, combo: 0, best: 0, perfects: 0, hits: 0, misses: 0, judged: notes.map(() => null), next: 0, flash: null })),
    };
  },

  step(s: ShantyState, inputs: Inputs, dt: number): void {
    s.t += dt;
    const now = songT(s);
    if (now < 0) return;
    for (const p of s.sailors) {
      // anything that slid past the window is a miss
      while (p.next < s.notes.length && s.notes[p.next].t < now - GOOD) judge(s, p, p.next, 'miss', now);
      const inp = inputs[p.id] ?? NO_INPUT;
      for (const kind of ['haul', 'brace'] as NoteKind[]) {
        if (!(kind === 'haul' ? inp.aPressed : inp.bPressed)) continue;
        // the closest note still waiting
        let best = -1;
        let bd = Infinity;
        for (let i = p.next; i < s.notes.length && s.notes[i].t < now + GOOD + 0.1; i++) {
          if (p.judged[i]) continue;
          const d = Math.abs(s.notes[i].t - now);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best < 0 || bd > GOOD) {
          // a stray press: the sail slips a touch
          p.sail = Math.max(0, p.sail - 0.5);
          p.combo = 0;
          p.flash = { judge: 'oops', at: now };
          continue;
        }
        if (s.notes[best].kind !== kind) judge(s, p, best, 'miss', now);
        else judge(s, p, best, bd <= PERFECT ? 'perfect' : 'good', now);
      }
    }
  },

  isOver: (s) => songT(s) > SONG + 2,

  results(s): ResultRow[] {
    return s.sailors
      .map((p) => ({ id: p.id, value: p.sail * 1000 + p.perfects, label: `Sail ${p.sail}, ${p.hits}/${s.notes.length} notes, best combo ${p.best}` }))
      .sort((a, b) => b.value - a.value);
  },

  draw(ctx, s, players) {
    const now = songT(s);
    if (now >= 0 && now <= SONG) drawTimer(ctx, SONG - now);
    playerChips(ctx, players, s.sailors.map((p) => ({ id: p.id, label: `${p.sail}${p.combo >= 10 ? ` x${p.combo}` : ''}` })));
    // the rope: notes slide in from the right toward the marker on the left
    const y = 640, mx = 250, speed = 330;
    ctx.save();
    ctx.fillStyle = 'rgba(20,12,4,0.55)';
    roundRect(ctx, 150, y - 46, 1000, 92, 46);
    ctx.fill();
    ctx.strokeStyle = '#c99a5b';
    ctx.lineWidth = 8;
    ctx.setLineDash([18, 8]);
    ctx.beginPath();
    ctx.moveTo(180, y);
    ctx.lineTo(1120, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, y, 36, 0, Math.PI * 2);
    ctx.stroke();
    // a local player's own judgements colour the notes; everyone shares the chart, so use the first human-ish sailor
    for (let i = 0; i < s.notes.length; i++) {
      const n = s.notes[i];
      const x = mx + (n.t - now) * speed;
      if (x < mx - 60 || x > 1130) continue;
      const haul = n.kind === 'haul';
      ctx.fillStyle = haul ? '#21c45a' : '#ff5a5f';
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      text(ctx, haul ? 'A' : 'B', x, y + 1, 26, { color: '#fff', weight: 900 });
    }
    ctx.restore();
    text(ctx, 'A = HAUL', 210, y - 66, 18, { color: '#7dff9a', weight: 800 });
    text(ctx, 'B = BRACE', 340, y - 66, 18, { color: '#ff9a9a', weight: 800 });
    if (now < 0) text(ctx, 'Hit the notes as they reach the ring!', 640, 160, 30, { color: '#ffd23f' });
    else if (now > SONG) text(ctx, 'Land ho!', 640, 160, 56, { color: '#ffd23f' });
  },

  bot(s, id, k: BotCtx) {
    const p = s.sailors.find((q) => q.id === id);
    const now = songT(s);
    if (!p || now < 0 || p.next >= s.notes.length) return NO_INPUT;
    const i = p.next;
    if (k.mem.n !== i) {
      // plan this note: will we get it, how early or late, and do we fumble the button?
      k.mem.n = i;
      const hitRate = k.level === 'hard' ? 0.95 : k.level === 'normal' ? 0.85 : 0.68;
      const jitter = k.level === 'hard' ? 0.04 : k.level === 'normal' ? 0.07 : 0.1;
      k.mem.m = rand(k.r) < hitRate ? 1 : 0;
      k.mem.prev = randRange(k.r, -jitter, jitter);
      k.mem.early = rand(k.r) < (k.level === 'easy' ? 0.1 : 0.02) ? 1 : 0;
    }
    const n = s.notes[i];
    if (k.mem.m && now >= n.t + k.mem.prev) {
      k.mem.m = 0;
      const kind = k.mem.early ? (n.kind === 'haul' ? 'brace' : 'haul') : n.kind;
      return kind === 'haul' ? press() : pressB();
    }
    return NO_INPUT;
  },
};
