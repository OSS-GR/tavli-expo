import { describe, expect, it } from 'vitest';

import {
  ASYNC_TURN_TIME_MS,
  GAME_IDS,
  GAME_TRANSPORT_ERROR_CODES,
  ONLINE_GAME_CHOICES,
  isGameTransportErrorData,
  isOnlineGameChoice,
  turnDeadlineMs,
} from './index';

describe('online game choices', () => {
  it('are the four games plus the Tavli rotation', () => {
    expect(ONLINE_GAME_CHOICES).toEqual([...GAME_IDS, 'tavli']);
  });

  it('isOnlineGameChoice accepts only known choices', () => {
    for (const choice of ONLINE_GAME_CHOICES) expect(isOnlineGameChoice(choice)).toBe(true);
    expect(isOnlineGameChoice('chess')).toBe(false);
    expect(isOnlineGameChoice(1)).toBe(false);
    expect(isOnlineGameChoice(null)).toBe(false);
  });
});

describe('turn time (owner Q15, #183)', () => {
  it('is 24 hours by default, an hour for 60 minutes', () => {
    expect(ASYNC_TURN_TIME_MS).toBe(24 * 60 * 60 * 1000);
    expect(turnDeadlineMs(null)).toBe(ASYNC_TURN_TIME_MS);
    expect(turnDeadlineMs(60)).toBe(60 * 60 * 1000);
  });

  it('turnDeadlineMs gives minutes in ms', () => {
    expect(turnDeadlineMs(1)).toBe(60 * 1000);
    expect(turnDeadlineMs(5)).toBe(5 * 60 * 1000);
  });
});

describe('isGameTransportErrorData', () => {
  it('accepts every error code with a message', () => {
    for (const code of GAME_TRANSPORT_ERROR_CODES) {
      expect(isGameTransportErrorData({ code, message: 'x' })).toBe(true);
    }
  });

  it('rejects other values', () => {
    expect(isGameTransportErrorData({ code: 'NOPE', message: 'x' })).toBe(false);
    expect(isGameTransportErrorData({ code: 'NOT_FOUND' })).toBe(false);
    expect(isGameTransportErrorData('NOT_FOUND')).toBe(false);
    expect(isGameTransportErrorData(null)).toBe(false);
  });
});
