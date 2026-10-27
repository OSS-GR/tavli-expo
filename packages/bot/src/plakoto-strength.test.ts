/**
 * How far apart the Plakoto levels are (bot-ai.md, section 4.1). Fixed
 * seeds, so the numbers never change between runs. Each match is played
 * twice with the colours swapped, on the same seed.
 *
 * CI runs `GAMES` games per match (small, so the test stays fast on a
 * 2-vCPU machine). Raise `GAMES` locally for tighter numbers; the README has
 * the 1,000-game results.
 */

import { describe, expect, it } from 'vitest';

import { plakoto } from '@tavli/engine';

import { createBot, simulate } from './index';
import type { BotLevel } from './index';

const bot = createBot();
/** Games per match. 200 in CI; try 1,000 locally. */
const GAMES = 200;
const TIMEOUT = 120_000;

/** Games won by `a` against `b` over `GAMES` games, half with each colour. Draws count for neither. */
function winsOf(a: BotLevel, b: BotLevel, seed: number): number {
  const half = GAMES / 2;
  const first = simulate({
    variant: plakoto,
    bots: [
      { bot, difficulty: a },
      { bot, difficulty: b },
    ],
    games: half,
    seed,
  });
  const second = simulate({
    variant: plakoto,
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

describe(`plakoto level strength (${GAMES} games each)`, () => {
  it('medium beats random at least 85% of the time', { timeout: TIMEOUT }, () => {
    expect(winsOf('medium', 'random', 2026)).toBeGreaterThanOrEqual(0.85 * GAMES);
  });

  it('easy beats random at least 70% of the time', { timeout: TIMEOUT }, () => {
    expect(winsOf('easy', 'random', 2027)).toBeGreaterThanOrEqual(0.7 * GAMES);
  });

  it('medium beats easy at least 70% of the time', { timeout: TIMEOUT }, () => {
    expect(winsOf('medium', 'easy', 2028)).toBeGreaterThanOrEqual(0.7 * GAMES);
  });

  // The Plakoto net (#156). A draw is not a win. The epic target is 70 %.
  it('hard beats medium at least 60% of the time', { timeout: TIMEOUT }, () => {
    expect(winsOf('hard', 'medium', 2029)).toBeGreaterThanOrEqual(0.6 * GAMES);
  });
});
