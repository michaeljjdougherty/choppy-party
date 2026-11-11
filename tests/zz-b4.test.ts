import { it } from 'vitest';
import { addBot, createParty, OPTIONS, stepParty, startParty } from '../src/shared/party';
import { DT } from '../src/shared/types';

const IDS = ['mine-cart-mayhem', 'rising-tide-tower', 'sled-slalom', 'bumper-saucers', 'mimic-chest', 'barrel-bands'];
it.runIf(process.env.B4)('batch 4 bot runs', () => {
  for (const id of IDS.filter((x) => !process.env.B4ID || x === process.env.B4ID)) {
    for (const n of [2, 4, 10]) {
      const lens: string[] = [];
      const lvl: Record<string, number[]> = { easy: [], normal: [], hard: [] };
      for (let seed = 1; seed <= 3; seed++) {
        const s = createParty(seed * 17 + n);
        const levels = (['easy', 'normal', 'hard'] as const);
        for (let i = 0; i < n; i++) addBot(s, levels[i % 3]);
        s.selection = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === id);
        if (s.selection < 0) throw new Error('no option ' + id);
        startParty(s);
        let t = 0;
        while (s.phase !== 'play' && t < 60) { stepParty(s, {}, DT); t += DT; }
        let p = 0;
        while (s.phase === 'play' && p < 200) { stepParty(s, {}, DT); p += DT; }
        lens.push(p.toFixed(0));
        for (const pl of s.placements ?? []) { const q = s.players.find((x) => x.id === pl.id); if (q?.bot) lvl[q.bot].push(pl.place); }
      }
      const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
      console.log(`${id.padEnd(18)} n=${String(n).padStart(2)} len ${lens.join('/')}  avg place e/n/h ${avg(lvl.easy)}/${avg(lvl.normal)}/${avg(lvl.hard)}`);
    }
  }
}, 600000);
