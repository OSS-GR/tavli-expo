import {
  MATCHED_SEEK_KEEP_MS,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  SEEK_RANGE_GROW_MS,
  SEEK_RANGE_MAX,
  SEEK_RANGE_START,
  SEEK_TTL_MS,
} from '@tavli/contracts';
import { describe, expect, it } from 'vitest';

import {
  MatchmakingError,
  candidatePairs,
  checkRankedChoice,
  checkSeekSaved,
  countLooking,
  inRange,
  isMatchedSeekDone,
  isSeekExpired,
  matchedPlayers,
  mayPair,
  PAIR_CHECKS_PER_RUN,
  pickPairs,
  planSeek,
} from './matchmaking';
import type { SeekRecord } from './matchmaking';
import { utcDay } from './ratings';

const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);

function seek(playerId: string, rating: number, createdAt = T0, game = 'portes'): SeekRecord {
  return { playerId, rating, createdAt, game: game as SeekRecord['game'] };
}

function codeOf(step: () => unknown): string | undefined {
  try {
    step();
  } catch (error) {
    if (error instanceof MatchmakingError) return error.code;
    throw error;
  }
  return undefined;
}

describe('the checks of a seek', () => {
  it('needs a saved account', () => {
    expect(codeOf(() => checkSeekSaved(false))).toBe('NOT_SAVED');
    expect(codeOf(() => checkSeekSaved(true))).toBeUndefined();
  });

  it('takes only a ranked game', () => {
    expect(checkRankedChoice('tavli')).toBe('tavli');
    expect(codeOf(() => checkRankedChoice('asodio'))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkRankedChoice('chess'))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkRankedChoice(undefined))).toBe('BAD_REQUEST');
  });
});

describe('planSeek', () => {
  it('inserts with no seek', () => {
    expect(planSeek(null, 'portes', T0)).toBe('insert');
  });

  it('keeps a live waiting seek of the same game', () => {
    const existing = { game: 'portes', status: 'waiting', createdAt: T0 } as const;
    expect(planSeek(existing, 'portes', T0 + 1000)).toBe('keep');
  });

  it('replaces another game, a matched seek, and a seek that ended', () => {
    const waiting = { game: 'portes', status: 'waiting', createdAt: T0 } as const;
    expect(planSeek(waiting, 'fevga', T0)).toBe('replace');
    expect(planSeek({ ...waiting, status: 'matched' }, 'portes', T0)).toBe('replace');
    expect(planSeek(waiting, 'portes', T0 + SEEK_TTL_MS)).toBe('replace');
  });
});

describe('the end of a seek', () => {
  it('ends a waiting seek after SEEK_TTL_MS', () => {
    expect(isSeekExpired({ createdAt: T0 }, T0 + SEEK_TTL_MS - 1)).toBe(false);
    expect(isSeekExpired({ createdAt: T0 }, T0 + SEEK_TTL_MS)).toBe(true);
  });

  it('forgets a matched seek after MATCHED_SEEK_KEEP_MS', () => {
    expect(isMatchedSeekDone(T0, T0 + MATCHED_SEEK_KEEP_MS - 1)).toBe(false);
    expect(isMatchedSeekDone(T0, T0 + MATCHED_SEEK_KEEP_MS)).toBe(true);
  });
});

describe('inRange', () => {
  it('pairs the same game and two players within the start range', () => {
    expect(inRange(seek('a', 1500), seek('b', 1500 + SEEK_RANGE_START), T0)).toBe(true);
    expect(inRange(seek('a', 1500), seek('b', 1500 + SEEK_RANGE_START + 1), T0)).toBe(false);
    expect(inRange(seek('a', 1500), seek('b', 1500, T0, 'fevga'), T0)).toBe(false);
    expect(inRange(seek('a', 1500), seek('a', 1500), T0)).toBe(false);
  });

  it('widens the range over time, up to the widest range', () => {
    const a = seek('a', 1500);
    const b = seek('b', 1500 + 100);
    expect(inRange(a, b, T0)).toBe(false);
    // 50 + 350 · 1/6 ≈ 108 after 10 s.
    expect(inRange(a, b, T0 + SEEK_RANGE_GROW_MS / 6)).toBe(true);
    const far = seek('c', 1500 + SEEK_RANGE_MAX + 1);
    expect(inRange(a, far, T0 + 100 * SEEK_RANGE_GROW_MS)).toBe(false);
  });

  it('needs the gap inside both ranges: a new seek has the narrow one', () => {
    const old = seek('a', 1500, T0);
    const fresh = seek('b', 1600, T0 + SEEK_RANGE_GROW_MS);
    expect(inRange(old, fresh, T0 + SEEK_RANGE_GROW_MS)).toBe(false);
  });

  it('never pairs a seek that ended', () => {
    const a = seek('a', 1500, T0);
    const b = seek('b', 1500, T0 + SEEK_TTL_MS);
    expect(inRange(a, b, T0 + SEEK_TTL_MS)).toBe(false);
  });
});

describe('mayPair', () => {
  it('refuses a block either way', () => {
    expect(mayPair({ blocked: true, pair: null, now: T0 })).toBe(false);
    expect(mayPair({ blocked: false, pair: null, now: T0 })).toBe(true);
  });

  it('refuses a pair at its rated matches for the UTC day, and counts again the next day', () => {
    const today = utcDay(T0);
    const full = { day: today, count: RATED_MATCHES_PER_PAIR_PER_DAY };
    expect(mayPair({ blocked: false, pair: full, now: T0 })).toBe(false);
    expect(mayPair({ blocked: false, pair: { day: today, count: 1 }, now: T0 })).toBe(true);
    expect(mayPair({ blocked: false, pair: { ...full, day: today - 1 }, now: T0 })).toBe(true);
  });
});

describe('picking the pairs', () => {
  it('takes the closest ratings first', async () => {
    const now = T0 + SEEK_RANGE_GROW_MS;
    const a = seek('a', 1500);
    const b = seek('b', 1600);
    const c = seek('c', 1680);
    expect(candidatePairs([a, b, c], now).map(([x, y]) => x.playerId + y.playerId)).toEqual([
      'bc',
      'ab',
      'ac',
    ]);
    const pairs = await pickPairs([a, b, c], now, () => true);
    expect(pairs.map(([x, y]) => [x.playerId, y.playerId])).toEqual([['b', 'c']]);
  });

  it('takes the oldest seek first on equal gaps, and puts the older seek first', async () => {
    const a = seek('a', 1500, T0 + 2000);
    const b = seek('b', 1520, T0);
    const c = seek('c', 1520, T0 + 1000);
    // a–b and a–c are 20 apart, b–c 0: b–c first. Then a waits.
    expect(
      (await pickPairs([a, b, c], T0 + 2000, () => true)).map(([x, y]) => [x.playerId, y.playerId]),
    ).toEqual([['b', 'c']]);
    const d = seek('d', 1500, T0 + 3000);
    const e = seek('e', 1500, T0 + 4000);
    // a–d, a–e and d–e are all 0 apart: the pair with the oldest seek (a) first.
    const pairs = await pickPairs([e, d, a], T0 + 4000, () => true);
    expect(pairs.map(([x, y]) => [x.playerId, y.playerId])).toEqual([['a', 'd']]);
  });

  it('asks about at most PAIR_CHECKS_PER_RUN pairs in one run', async () => {
    // 40 players at one rating: 780 pairs, none allowed.
    const seeks = Array.from({ length: 40 }, (_, i) => seek(`p${i}`, 1500, T0 + i));
    let asked = 0;
    const none = await pickPairs(seeks, T0 + 40, () => {
      asked += 1;
      return false;
    });
    expect(none).toEqual([]);
    expect(asked).toBe(PAIR_CHECKS_PER_RUN);
    // Pairs it may take are still found within the cap.
    expect(await pickPairs(seeks, T0 + 40, () => true)).toHaveLength(20);
  });

  it('skips a pair the server does not allow, and tries the next', async () => {
    const a = seek('a', 1500);
    const b = seek('b', 1510);
    const c = seek('c', 1530);
    const asked: string[] = [];
    const pairs = await pickPairs([a, b, c], T0, (x, y) => {
      asked.push(x.playerId + y.playerId);
      return Promise.resolve(!(x.playerId === 'a' && y.playerId === 'b'));
    });
    expect(pairs.map(([x, y]) => [x.playerId, y.playerId])).toEqual([['b', 'c']]);
    // a–c is never asked: c is taken.
    expect(asked).toEqual(['ab', 'bc']);
  });

  it('gives White to the older seek', () => {
    expect(matchedPlayers(seek('old', 1500, T0), seek('new', 1500, T0 + 1))).toEqual({
      white: 'old',
      black: 'new',
    });
  });
});

describe('countLooking', () => {
  it('counts the other live seeks per game', () => {
    const seeks = [
      seek('me', 1500),
      seek('a', 1500),
      seek('b', 1500, T0, 'tavli'),
      seek('c', 1500, T0 - SEEK_TTL_MS),
    ];
    expect(countLooking(seeks, 'me', T0)).toEqual({ portes: 1, plakoto: 0, fevga: 0, tavli: 1 });
  });
});
