import { describe, expect, it } from 'vitest';

import { ONLINE_GAME_CHOICES } from './game-transport';
import {
  RANKED_GAMES,
  SEEK_RANGE_GROW_MS,
  SEEK_RANGE_MAX,
  SEEK_RANGE_START,
  isMatchmakingErrorData,
  isRankedGame,
  seekRange,
} from './matchmaking';

describe('ranked games', () => {
  it('are the online games but Asodio', () => {
    expect(RANKED_GAMES).toEqual(ONLINE_GAME_CHOICES.filter((game) => game !== 'asodio'));
    for (const game of RANKED_GAMES) expect(isRankedGame(game)).toBe(true);
    expect(isRankedGame('asodio')).toBe(false);
    expect(isRankedGame('chess')).toBe(false);
    expect(isRankedGame(1)).toBe(false);
  });
});

describe('seekRange', () => {
  it('starts at the start range and grows in a line to the widest range', () => {
    expect(seekRange(1000, 1000)).toBe(SEEK_RANGE_START);
    expect(seekRange(1000, 1000 + SEEK_RANGE_GROW_MS / 2)).toBe(
      (SEEK_RANGE_START + SEEK_RANGE_MAX) / 2,
    );
    expect(seekRange(1000, 1000 + SEEK_RANGE_GROW_MS)).toBe(SEEK_RANGE_MAX);
    expect(seekRange(1000, 1000 + 10 * SEEK_RANGE_GROW_MS)).toBe(SEEK_RANGE_MAX);
  });

  it('never goes below the start range when the clock is behind', () => {
    expect(seekRange(1000, 0)).toBe(SEEK_RANGE_START);
  });

  it('is a whole number', () => {
    expect(Number.isInteger(seekRange(0, 1234))).toBe(true);
  });
});

describe('isMatchmakingErrorData', () => {
  it('accepts only known codes with a message', () => {
    expect(isMatchmakingErrorData({ code: 'NOT_SAVED', message: 'save first' })).toBe(true);
    expect(isMatchmakingErrorData({ code: 'NOPE', message: 'x' })).toBe(false);
    expect(isMatchmakingErrorData({ code: 'NOT_SAVED' })).toBe(false);
    expect(isMatchmakingErrorData(null)).toBe(false);
  });
});
