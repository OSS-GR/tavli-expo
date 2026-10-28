import { describe, expect, it } from 'vitest';

import type { PushResult } from '@tavli/contracts';

import {
  MAX_PUSH_TOKENS_PER_PLAYER,
  TURN_PUSH_TEXT,
  deadTokens,
  tokensOverCap,
  turnMessages,
  turnPushSide,
} from './push';

describe('turnPushSide', () => {
  it('tells the other side in an async game', () => {
    expect(turnPushSide('async', 'white', 'black')).toBe('black');
    expect(turnPushSide('async', 'black', 'white')).toBe('white');
    expect(turnPushSide('async', null, 'white')).toBe('white');
  });

  it('tells nobody when the same side waits again (an Asodio extra roll)', () => {
    expect(turnPushSide('async', 'white', 'white')).toBeNull();
    expect(turnPushSide('async', 'black', 'black')).toBeNull();
  });

  it('tells nobody when the match is over', () => {
    expect(turnPushSide('async', 'white', null)).toBeNull();
  });

  it('never pushes in a live game', () => {
    expect(turnPushSide('live', 'white', 'black')).toBeNull();
    expect(turnPushSide('live', null, 'white')).toBeNull();
  });
});

describe('turnMessages', () => {
  it('makes one message per token with the fixed text and the game id', () => {
    expect(turnMessages(['a', 'b'], 'g1')).toEqual([
      { to: 'a', title: TURN_PUSH_TEXT.title, body: TURN_PUSH_TEXT.body, data: { gameId: 'g1' } },
      { to: 'b', title: TURN_PUSH_TEXT.title, body: TURN_PUSH_TEXT.body, data: { gameId: 'g1' } },
    ]);
  });

  it('keeps the text short', () => {
    expect(TURN_PUSH_TEXT.title.length).toBeLessThanOrEqual(30);
    expect(TURN_PUSH_TEXT.body.length).toBeLessThanOrEqual(80);
  });
});

describe('deadTokens', () => {
  it('picks only the DeviceNotRegistered tokens', () => {
    const messages = turnMessages(['a', 'b', 'c', 'd'], 'g1');
    const results: PushResult[] = [
      { ok: true },
      { ok: false, error: 'DeviceNotRegistered', message: 'gone' },
      { ok: false, error: 'Failed', message: 'network' },
    ];
    expect(deadTokens(messages, results)).toEqual(['b']);
  });
});

describe('tokensOverCap', () => {
  it(`drops the oldest rows over ${MAX_PUSH_TOKENS_PER_PLAYER}`, () => {
    const rows = Array.from({ length: MAX_PUSH_TOKENS_PER_PLAYER + 2 }, (_, i) => i);
    expect(tokensOverCap(rows)).toEqual([0, 1]);
    expect(tokensOverCap(rows.slice(0, MAX_PUSH_TOKENS_PER_PLAYER))).toEqual([]);
    expect(tokensOverCap([])).toEqual([]);
  });
});
