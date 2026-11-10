import { MIN_BOARD_MATCHES, RATED_MATCHES_PER_PAIR_PER_DAY, START_RATING } from '@tavli/contracts';
import { describe, expect, it } from 'vitest';

import {
  NEW_RATING,
  afterRatedMatch,
  experienceFactor,
  isBoardable,
  pairOf,
  planRatedMatch,
  shownRating,
  utcDay,
  winChance,
} from './ratings';

const SEASONED = { rating: START_RATING, experience: 1000, matches: 100 };

describe('the FIBS formula (#407)', () => {
  it('gives equal players an even chance, and the favourite more', () => {
    expect(winChance(1500, 1500, 5)).toBeCloseTo(0.5, 10);
    expect(winChance(1700, 1500, 1)).toBeGreaterThan(0.5);
    // A longer match favours the better player more.
    expect(winChance(1700, 1500, 9)).toBeGreaterThan(winChance(1700, 1500, 1));
    expect(winChance(1700, 1500, 3) + winChance(1500, 1700, 3)).toBeCloseTo(1, 10);
  });

  it('moves two equal seasoned players 2·√n', () => {
    const { winner, loser } = afterRatedMatch(SEASONED, SEASONED, 9);
    expect(winner.rating).toBeCloseTo(1506, 10);
    expect(loser.rating).toBeCloseTo(1494, 10);
    expect(winner.experience).toBe(1009);
    expect(winner.matches).toBe(101);
    expect(loser.matches).toBe(101);
  });

  it('moves an upset more than an expected win', () => {
    const strong = { ...SEASONED, rating: 1700 };
    const weak = { ...SEASONED, rating: 1500 };
    const expected = afterRatedMatch(strong, weak, 5).winner.rating - 1700;
    const upset = afterRatedMatch(weak, strong, 5).winner.rating - 1500;
    expect(upset).toBeGreaterThan(expected);
    // Seasoned players: what one gains the other loses.
    const both = afterRatedMatch(weak, strong, 5);
    expect(both.winner.rating - 1500).toBeCloseTo(1700 - both.loser.rating, 10);
  });

  it('a new player moves 5 times as fast, down to 1 at 400 points', () => {
    expect(experienceFactor(0)).toBe(5);
    expect(experienceFactor(250)).toBe(2.5);
    expect(experienceFactor(399)).toBeCloseTo(1.01, 10);
    expect(experienceFactor(400)).toBe(1);
    const { winner, loser } = afterRatedMatch(NEW_RATING, SEASONED, 1);
    expect(winner.rating - START_RATING).toBeCloseTo(10, 10);
    expect(START_RATING - loser.rating).toBeCloseTo(2, 10);
  });

  it('takes a match of less than 1 point as 1', () => {
    expect(afterRatedMatch(SEASONED, SEASONED, 0).winner.rating).toBeCloseTo(1502, 10);
  });

  it('shows whole numbers', () => {
    expect(shownRating(1506.4)).toBe(1506);
    expect(shownRating(1506.5)).toBe(1507);
  });
});

describe('which matches count (#407)', () => {
  const NOON = Date.UTC(2026, 10, 10, 12);

  it('never counts a match with a guest', () => {
    expect(planRatedMatch({ saved: false, pair: null, now: NOON })).toEqual({ rated: false });
  });

  it(`counts ${RATED_MATCHES_PER_PAIR_PER_DAY} matches of a pair per UTC day`, () => {
    let pair = null as { day: number; count: number } | null;
    for (let i = 1; i <= RATED_MATCHES_PER_PAIR_PER_DAY; i++) {
      const plan = planRatedMatch({ saved: true, pair, now: NOON });
      expect(plan).toEqual({ rated: true, pair: { day: utcDay(NOON), count: i } });
      if (plan.rated) pair = plan.pair;
    }
    expect(planRatedMatch({ saved: true, pair, now: NOON })).toEqual({ rated: false });
    // The next UTC day starts again.
    const tomorrow = Date.UTC(2026, 10, 11, 0, 0, 1);
    expect(planRatedMatch({ saved: true, pair, now: tomorrow })).toEqual({
      rated: true,
      pair: { day: utcDay(tomorrow), count: 1 },
    });
  });

  it('keeps one order for a pair', () => {
    expect(pairOf('b', 'a')).toEqual(['a', 'b']);
    expect(pairOf('a', 'b')).toEqual(['a', 'b']);
  });

  it(`lists a player who shows and has ${MIN_BOARD_MATCHES} matches`, () => {
    expect(isBoardable({ shown: true, matches: MIN_BOARD_MATCHES })).toBe(true);
    expect(isBoardable({ shown: true, matches: MIN_BOARD_MATCHES - 1 })).toBe(false);
    expect(isBoardable({ shown: false, matches: 100 })).toBe(false);
  });
});
