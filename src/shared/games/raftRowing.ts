import type { Minigame, PlayerInfo, Inputs, ResultRow } from '../types';
import { NO_INPUT } from '../types';
import { drawTimer, text } from '../draw';
import { randRange, type Rng } from '../rng';
import { TEAM_HEX, TEAM_NAME, teamScores } from './hud';
import { teamResults, teamsOf } from './ropePull';
import { notices, type BotCtx } from '../botkit';

/**
 * Raft Rowing (Pirate Kit, team): each team rows its own rowboat down the harbour. A pulls the left oar,
 * B the right one. Alternate them to go straight and fast; pulling one side more turns the boat. Steer
 * round the rocks and buoys; hitting one stops the boat dead. First boat past the lighthouse wins.
 */
export const COURSE = 2400;
export const LANE_W = 220; // the boat drifts between -LANE_W/2 and +LANE_W/2 of its lane
const READY = 3;
const TIME = 60;
const STROKE = 26; // forward push of one well-timed stroke, before the team-size share
const TURN = 0.16;

export interface Rock {
  d: number; // distance down the course
  off: number; // sideways offset in the lane
  r: number;
}
export interface Boat {
  team: number;
  d: number;
  off: number;
  head: number; // heading, radians off straight (+ = to the right)
  v: number;
  stop: number;
  finish: number;
}
export interface Rower {
  id: string;
  team: number;
  last: number; // -1 left, 1 right, 0 none
  pull: number; // oar animation timer
  side: number; // which oar they just pulled
  strokes: number;
}
export interface RaftState {
  t: number;
  rng: Rng;
  boats: [Boat, Boat];
  rowers: Rower[];
  rocks: Rock[];
  bonks: number[]; // teams that hit a rock this tick
}

export const raftRowing: Minigame<RaftState> = {
  id: 'raft-rowing',
  name: 'Raft Rowing',
  mode: 'Team',
  ready: READY,
  goWord: 'ROW!',
  blurb: 'Row your team boat down the harbour! A pulls the left oar, B the right. Alternate to go straight, pull one side to turn round the rocks.',
  controls: 'A: left oar   B: right oar (alternate!)',
  minPlayers: 2,
  maxPlayers: 10,

  setup(players: PlayerInfo[], seed: number): RaftState {
    const teams = teamsOf(players);
    const rng = { seed };
    const rocks: Rock[] = [];
    for (let d = 450; d < COURSE - 200; d += randRange(rng, 300, 430)) rocks.push({ d, off: randRange(rng, -LANE_W / 2 + 25, LANE_W / 2 - 25), r: randRange(rng, 22, 30) });
    const boat = (team: number): Boat => ({ team, d: 0, off: 0, head: 0, v: 0, stop: 0, finish: -1 });
    return {
      t: 0,
      rng,
      rocks,
      bonks: [],
      boats: [boat(0), boat(1)],
      rowers: players.map((p) => ({ id: p.id, team: teams[p.id], last: 0, pull: 0, side: 0, strokes: 0 })),
    };
  },

  step(s: RaftState, inputs: Inputs, dt: number): void {
    s.t += dt;
    s.bonks = [];
    if (s.t < READY) return;
    const live = s.t <= READY + TIME;
    const size = [0, 1].map((k) => Math.max(1, s.rowers.filter((r) => r.team === k).length));
    for (const r of s.rowers) {
      r.pull = Math.max(0, r.pull - dt);
      const inp = inputs[r.id] ?? NO_INPUT;
      const boat = s.boats[r.team];
      if (!live || boat.finish >= 0) continue;
      for (const side of [-1, 1]) {
        if (!(side < 0 ? inp.aPressed : inp.bPressed)) continue;
        // alternating strokes push hard; the same oar twice in a row is a weak flail
        const good = r.last !== side;
        // each stroke counts for its share of the crew, so a team rows at its members' average pace
        boat.v += (STROKE * (good ? 1 : 0.3) * 0.5) / size[r.team];
        // left oar turns the boat right, right oar turns it left
        boat.head += (-side * TURN) / size[r.team];
        r.last = side;
        r.side = side;
        r.pull = 0.28;
        r.strokes++;
      }
    }
    for (const b of s.boats) {
      b.stop = Math.max(0, b.stop - dt);
      b.head *= Math.pow(0.55, dt); // the keel straightens you out slowly
      b.head = Math.max(-0.9, Math.min(0.9, b.head));
      b.v *= Math.pow(0.32, dt); // water drag
      b.v = Math.min(b.v, 520);
      if (b.stop > 0) b.v = 0;
      if (b.finish >= 0) continue;
      b.d += Math.cos(b.head) * b.v * dt;
      // the bow swings you sideways even while the boat is slow, so you can always row round a rock
      b.off += (Math.sin(b.head) * b.v + b.head * 160) * dt;
      if (Math.abs(b.off) > LANE_W / 2) {
        b.off = Math.sign(b.off) * LANE_W / 2;
        b.head *= -0.4;
        b.v *= 0.6;
      }
      for (const rk of s.rocks) {
        if (Math.abs(rk.d - b.d) < rk.r + 34 && Math.abs(rk.off - b.off) < rk.r + 22 && b.v > 40) {
          b.stop = 0.6;
          b.v = 0;
          b.d = rk.d - rk.r - 36;
          s.bonks.push(b.team);
        }
      }
      if (b.d >= COURSE) b.finish = s.t;
    }
  },

  isOver: (s) => s.t >= READY + TIME + 1.5 || s.boats.some((b) => b.finish >= 0 && s.t - b.finish > 1.5),

  results(s): ResultRow[] {
    const [a, b] = s.boats;
    const score = (x: Boat) => (x.finish >= 0 ? 1e6 - x.finish * 100 : x.d);
    const win = Math.abs(score(a) - score(b)) < 1 ? 2 : score(a) > score(b) ? 0 : 1;
    const teams = Object.fromEntries(s.rowers.map((r) => [r.id, r.team]));
    const strokes = (id: string) => s.rowers.find((r) => r.id === id)?.strokes ?? 0;
    return teamResults(
      s.rowers.map((r) => r.id),
      teams,
      win,
      strokes,
      (id) => `${TEAM_NAME[teams[id]]} boat, ${strokes(id)} strokes`,
    );
  },

  draw(ctx, s) {
    if (s.t <= READY + TIME) drawTimer(ctx, READY + TIME - s.t);
    const pct = (b: Boat) => `${Math.min(100, Math.round((b.d / COURSE) * 100))}%`;
    teamScores(ctx, pct(s.boats[0]), pct(s.boats[1]));
    const done = s.boats.find((b) => b.finish >= 0);
    if (done) text(ctx, `${TEAM_NAME[done.team]} boat wins!`, 640, 170, 54, { color: TEAM_HEX[done.team] });
  },

  bot(s, id, k: BotCtx) {
    const me = s.rowers.find((r) => r.id === id);
    if (!me || s.t < READY) return NO_INPUT;
    const boat = s.boats[me.team];
    // stroke at the bot's mash rate, alternating; steer by pulling the side that turns away from the next rock
    k.mem.mash += k.sk.mash * 0.8 * k.dt;
    if (k.mem.mash < 1) return NO_INPUT;
    k.mem.mash -= 1;
    const rock = s.rocks.find((rk) => rk.d > boat.d && rk.d - boat.d < 420 && notices(rk.d, rk.off, k.sk.sense));
    let want = me.last === -1 ? 1 : -1;
    // aim for the side of the rock with more room; otherwise hold the middle of the lane
    const clear = (rk: Rock) => (rk.off > 0 ? rk.off - rk.r - 70 : rk.off + rk.r + 70);
    // a rock ahead: pass it on its roomier side, and once clear, hold that line until it's behind
    const aimOff = !rock ? 0 : Math.abs(rock.off - boat.off) < rock.r + 66 ? clear(rock) : boat.off;
    const err = aimOff - boat.off - boat.head * 120;
    if (Math.abs(err) > 18) want = err > 0 ? -1 : 1; // the left oar turns the boat right
    return want < 0 ? { ...NO_INPUT, a: true, aPressed: true, aTaps: 1 } : { ...NO_INPUT, b: true, bPressed: true, bTaps: 1 };
  },
};
