/**
 * How far apart the Fevga levels are (#105). Fixed seeds, so the numbers
 * never change between runs. Each match is played twice with the colours
 * swapped, on the same seed.
 *
 * CI has 2 vCPUs, so `GAMES` is small. Raise it for a local check (the
 * README has the 1,000-game numbers from
 * `pnpm --filter @tavli/bot simulate -- --variant fevga`).
 */

import { describe, expect, it } from 'vitest';

import { fevga } from '@tavli/engine';

import { createBot, simulate } from './index';
import type { BotLevel } from './index';

const bot = createBot();
/** Games per match. 200 take about 2 s in Node for medium vs easy. */
const GAMES = 200;

/** Games won by `a` against `b` over `GAMES` games, half with each colour. */
function winsOf(a: BotLevel, b: BotLevel, seed: number): number {
  const half = GAMES / 2;
  const first = simulate({
    variant: fevga,
    bots: [
      { bot, difficulty: a },
      { bot, difficulty: b },
    ],
    games: half,
    seed,
  });
  const second = simulate({
    variant: fevga,
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

describe(`fevga level strength (${GAMES} games each)`, () => {
  it('medium beats random at least 85% of the time', { timeout: 60_000 }, () => {
    expect(winsOf('medium', 'random', 3026)).toBeGreaterThanOrEqual(0.85 * GAMES);
  });

  it('easy beats random at least 60% of the time', { timeout: 60_000 }, () => {
    expect(winsOf('easy', 'random', 3027)).toBeGreaterThanOrEqual(0.6 * GAMES);
  });

  it('medium beats easy at least 70% of the time', { timeout: 60_000 }, () => {
    expect(winsOf('medium', 'easy', 3028)).toBeGreaterThanOrEqual(0.7 * GAMES);
  });
});
