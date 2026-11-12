import { it } from 'vitest';
import { addBot, createParty, OPTIONS, stepParty, startParty } from '../src/shared/party';
import { DT } from '../src/shared/types';

const IDS = process.env.IDS ? process.env.IDS.split(',') : ['road-hopper', 'crate-stacker', 'cannon-fort', 'stew-relay', 'crate-cascade', 'spark-trails'];
it.runIf(process.env.B5)('batch 5 bot runs', () => {
  for (const id of IDS.filter((x) => !process.env.B5ID || x === process.env.B5ID)) {
    for (const n of (['road-hopper', 'crate-stacker', 'paddle-clash', 'fuse-draw'].includes(id) ? [2] : [2, 4, 10])) {
      const lens: string[] = [];
      const lvl: Record<string, number[]> = { easy: [], normal: [], hard: [] };
      for (let seed = 1; seed <= 3; seed++) {
        const s = createParty(seed * 17 + n);
        const levels = (process.env.LV ? process.env.LV.split(',') : ['easy', 'normal', 'hard']) as ('easy' | 'normal' | 'hard')[];
        for (let i = 0; i < n; i++) addBot(s, levels[i % levels.length]);
        s.selection = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === id);
        if (s.selection < 0) throw new Error('no option ' + id);
        startParty(s);
        let t = 0;
        while (s.phase !== 'play' && t < 60) { stepParty(s, {}, DT); t += DT; }
        let p = 0;
        while (s.phase === 'play' && p < 200) { stepParty(s, {}, DT); p += DT; }
        lens.push(p.toFixed(0) + (process.env.LBL ? '[' + (s.placements ?? []).map((q: any) => q.label).join(',') + ']' : ''));
        for (const pl of s.placements ?? []) { const q = s.players.find((x) => x.id === pl.id); if (q?.bot) lvl[q.bot].push(pl.place); }
      }
      const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
      console.log(`${id.padEnd(18)} n=${String(n).padStart(2)} len ${lens.join('/')}  avg place e/n/h ${avg(lvl.easy)}/${avg(lvl.normal)}/${avg(lvl.hard)}`);
    }
  }
}, 600000);
