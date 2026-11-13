import { it } from 'vitest';
import { addBot, createParty, OPTIONS, stepParty, startParty } from '../src/shared/party';
import { GAMES } from '../src/shared/games';
import { DT } from '../src/shared/types';

it.runIf(process.env.AUDIT)('audit', () => {
  const rows: string[] = [];
  for (const g of GAMES) {
    const out: string[] = [];
    for (const n of [2, 4, 8]) {
      if (n < g.minPlayers || n > g.maxPlayers) { out.push('-'); continue; }
      const cells: string[] = [];
      for (let seed = 1; seed <= 2; seed++) {
        try {
          const s = createParty(seed * 31);
          for (let i = 0; i < n; i++) addBot(s, (['easy', 'normal', 'hard'] as const)[i % 3]);
          s.selection = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === g.id);
          startParty(s);
          let t = 0;
          while (s.phase !== 'play' && t < 60) { stepParty(s, {}, DT); t += DT; }
          if (s.phase !== 'play') { cells.push(`NOPLAY(${s.phase})`); continue; }
          const gs = (s as any).game;
          let p = 0;
          while (s.phase === 'play' && p < 200) { stepParty(s, {}, DT); p += DT; }
          const res = g.results(gs);
          const vals = res.map((r) => r.value);
          const ranks = new Set(res.map((r: any) => r.rank ?? r.value));
          cells.push(`${p.toFixed(0)}s v=[${vals.slice(0, 8).map((v) => Math.round(v)).join(',')}]${ranks.size === 1 ? ' ALLTIE' : ''}${p >= 199 ? ' STUCK' : ''}`);
        } catch (e) { cells.push('ERR ' + (e as Error).message.slice(0, 60)); }
      }
      out.push(`${n}p: ${cells.join(' | ')}`);
    }
    rows.push(`${g.id.padEnd(18)} ${g.mode.padEnd(10)} ${out.join('  ')}`);
  }
  console.log('\n' + rows.join('\n'));
}, 600000);
