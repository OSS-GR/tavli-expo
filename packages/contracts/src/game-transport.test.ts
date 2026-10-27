import { describe, expect, it } from 'vitest';

import {
  GAME_IDS,
  GAME_TRANSPORT_ERROR_CODES,
  ONLINE_GAME_CHOICES,
  ONLINE_GAME_PACES,
  TURN_TIME_MS,
  isGameTransportErrorData,
  isOnlineGameChoice,
  isOnlineGamePace,
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

describe('online game paces (owner Q3, Q15)', () => {
  it('are live and async, with 1 minute and 24 hours per turn', () => {
    expect(ONLINE_GAME_PACES).toEqual(['live', 'async']);
    expect(TURN_TIME_MS).toEqual({ live: 60_000, async: 86_400_000 });
  });

  it('isOnlineGamePace accepts only known paces', () => {
    for (const pace of ONLINE_GAME_PACES) expect(isOnlineGamePace(pace)).toBe(true);
    expect(isOnlineGamePace('blitz')).toBe(false);
    expect(isOnlineGamePace(null)).toBe(false);
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
