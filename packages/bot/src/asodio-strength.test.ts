/**
 * How far apart the Asodio levels are (bot-ai.md, section 4.1), in the owner
 * version (`asodio.kafeneio`). Fixed seeds, so the numbers never change
 * between runs. Each match is played twice with the colours swapped, on the
 * same seed.
 *
 * Many Asodio games end in a deadlock draw (A5, open question Q28): both
 * armies freeze behind pinned lagging checkers. A draw counts as a non-win
 * here. So the bars are lower than the Plakoto ones (85 % / 70 %); they
 * come from the measured numbers with a margin. The README ("Asodio
 * strength and speed") has the 1,000-game results and the reasons.
 *
 * CI runs `GAMES` games per match. Raise `GAMES` locally for tighter
 * numbers.
 *
 * Hard (the Asodio net, #164) has its own bar, set by the owner: at least
 * 60 % of the games that someone wins, and more points than medium. About
 * a quarter of the games end in a lock draw, so the 60 %-of-all-games bar
 * of the other games does not fit (README, "The Asodio net").
 */

import { describe, expect, it } from 'vitest';

import { asodio } from '@tavli/engine';

import { createBot, simulate } from './index';
import type { BotLevel } from './index';

const bot = createBot();
/** Games per match. 200 in CI; try 1,000 locally. */
const GAMES = 200;
const TIMEOUT = 180_000;

/*
 * The bars, as shares of `GAMES`. Measured over 1,000 games (seed 1, README):
 * medium vs random 68.8 % wins, 4.0 % losses; easy vs random 52.8 % / 6.0 %;
 * medium vs easy 49.2 % / 18.1 %, so medium wins 73 % of the games that do
 * not end in a draw. With these seeds (200 games): 151 / 8, 103 / 17 and
 * 92 / 32.
 */
const MEDIUM_VS_RANDOM = 0.6;
const EASY_VS_RANDOM = 0.4;
const MEDIUM_VS_EASY = 0.35;
/** Medium's share of the medium-vs-easy games that someone wins. */
const DECIDED_MEDIUM_VS_EASY = 0.65;
/**
 * Hard's share of the hard-vs-medium games that someone wins (#164). With
 * the seed below (200 games): 102 wins, 43 losses (70 %), 55 draws, and
 * 187 points against 73.
 */
const DECIDED_HARD_VS_MEDIUM = 0.6;

interface Score {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** Points won by `a` and by `b`. */
  readonly points: readonly [number, number];
}

/** `a` against `b` over `GAMES` games, half with each colour. */
function match(a: BotLevel, b: BotLevel, seed: number): Score {
  const half = GAMES / 2;
  const first = simulate({
    variant: asodio,
    bots: [
      { bot, difficulty: a },
      { bot, difficulty: b },
    ],
    games: half,
    seed,
  });
  const second = simulate({
    variant: asodio,
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
  return {
    wins: first.wins[0] + second.wins[1],
    losses: first.wins[1] + second.wins[0],
    draws: first.draws + second.draws,
    points: [first.points[0] + second.points[1], first.points[1] + second.points[0]],
  };
}

describe(`asodio level strength (${GAMES} games each)`, () => {
  it('medium beats random', { timeout: TIMEOUT }, () => {
    const score = match('medium', 'random', 2026);
    expect(score.wins).toBeGreaterThanOrEqual(MEDIUM_VS_RANDOM * GAMES);
    // Random almost never wins: the rest are draws.
    expect(score.losses).toBeLessThanOrEqual(0.1 * GAMES);
  });

  it('easy beats random', { timeout: TIMEOUT }, () => {
    const score = match('easy', 'random', 2027);
    expect(score.wins).toBeGreaterThanOrEqual(EASY_VS_RANDOM * GAMES);
    expect(score.losses).toBeLessThanOrEqual(0.15 * GAMES);
  });

  it('medium beats easy', { timeout: TIMEOUT }, () => {
    const score = match('medium', 'easy', 2028);
    expect(score.wins).toBeGreaterThanOrEqual(MEDIUM_VS_EASY * GAMES);
    // Of the games that do not end in a draw, medium wins most.
    expect(score.wins).toBeGreaterThanOrEqual(DECIDED_MEDIUM_VS_EASY * (score.wins + score.losses));
  });

  // The Asodio net (#164). Draws are reported but do not count.
  it('hard wins most decided games against medium, and more points', { timeout: TIMEOUT }, () => {
    const score = match('hard', 'medium', 2029);
    expect(score.wins).toBeGreaterThanOrEqual(DECIDED_HARD_VS_MEDIUM * (score.wins + score.losses));
    expect(score.points[0]).toBeGreaterThan(score.points[1]);
  });
});
