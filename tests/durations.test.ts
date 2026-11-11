import { it } from 'vitest';
import { addBot, createParty, OPTIONS, stepParty, startParty } from '../src/shared/party';
import { GAMES } from '../src/shared/games';
import { DT } from '../src/shared/types';

it.runIf(process.env.DUR)('durations (DUR=1 npx vitest run tests/zz-dur.test.ts)', () => {
  const rows: string[] = [];
  for (const g of GAMES) {
    const out: string[] = [];
    for (const n of [2, 4, 8]) {
      if (n < g.minPlayers || n > g.maxPlayers) { out.push('  -  '); continue; }
      let sum = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const s = createParty(seed * 31);
        for (let i = 0; i < n; i++) addBot(s, (['easy', 'normal', 'hard'] as const)[i % 3]);
        s.selection = OPTIONS.findIndex((o) => o.kind === 'game' && o.id === g.id);
        startParty(s);
        let t = 0;
        while (s.phase !== 'play' && t < 60) { stepParty(s, {}, DT); t += DT; }
        let p = 0;
        while (s.phase === 'play' && p < 200) { stepParty(s, {}, DT); p += DT; }
        sum += p;
      }
      out.push((sum / 3).toFixed(0).padStart(5));
    }
    rows.push(`${g.id.padEnd(18)} ${g.mode.padEnd(13)} ${out.join(' ')}`);
  }
  console.log('\n' + rows.join('\n'));
});
