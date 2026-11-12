import { describe, expect, it } from 'vitest';
import { pancakePanic } from '../src/shared/games/pancakePanic';
import { NO_INPUT } from '../src/shared/types';

describe('mash cap', () => {
  it('an auto clicker scores no more than a very fast human in Pancake Panic', () => {
    const s = pancakePanic.setup([{ id: 'bot', name: 'Bot', color: '#fff' } as never, { id: 'me', name: 'Me', color: '#000' } as never], 1);
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 15; i++) {
      // 'bot' fires 5 taps every tick (150 a second); 'me' taps 10 times a second
      pancakePanic.step(s, { bot: { ...NO_INPUT, aTaps: 5 }, me: { ...NO_INPUT, aTaps: i % 3 === 0 ? 1 : 0 } }, dt);
    }
    expect(s.stacks.bot).toBeLessThanOrEqual(13 * 10 + 4);
    expect(s.stacks.me).toBeGreaterThanOrEqual(99);
  });
});
