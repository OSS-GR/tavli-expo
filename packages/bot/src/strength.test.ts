/**
 * How far apart the levels are (bot-ai.md, section 4.1). Fixed seeds, so the
 * numbers never change between runs. 300 games per match keep the test fast;
 * the README has the 1,000-game numbers from `pnpm --filter @tavli/bot simulate`.
 *
 * Each match is played twice with the colours swapped, on the same seed.
 */

import { describe, expect, it } from 'vitest';

import { portes } from '@tavli/engine';

import { createBot, simulate } from './index';
import type { BotLevel } from './index';

const bot = createBot();
const GAMES = 300;

/** Games won by `a` against `b` over `GAMES` games, half with each colour. */
function winsOf(a: BotLevel, b: BotLevel, seed: number): number {
  const half = GAMES / 2;
  const first = simulate({
    variant: portes,
    bots: [
      { bot, difficulty: a },
      { bot, difficulty: b },
    ],
    games: half,
    seed,
  });
  const second = simulate({
    variant: portes,
    bots: [
      { bot, difficulty: b },
      { bot, difficulty: a },
    ],
    games: half,
    seed,
  });
  for (const result of [first, second]) {
    expect(result.failures).toEqual([]);
    expect(result.illegalTurns).toBe(0);
  }
  return first.wins[0] + second.wins[1];
}

describe('level strength (300 games each)', () => {
  it('medium beats random at least 90% of the time', { timeout: 30_000 }, () => {
    expect(winsOf('medium', 'random', 2026)).toBeGreaterThanOrEqual(0.9 * GAMES);
  });

  it('easy beats random at least 70% of the time', { timeout: 30_000 }, () => {
    expect(winsOf('easy', 'random', 2027)).toBeGreaterThanOrEqual(0.7 * GAMES);
  });

  it('medium beats easy at least 70% of the time', { timeout: 30_000 }, () => {
    expect(winsOf('medium', 'easy', 2028)).toBeGreaterThanOrEqual(0.7 * GAMES);
  });
});
