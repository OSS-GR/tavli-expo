import { describe, expect, it } from 'vitest';

import type { PushResult } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { PlayerId } from '@tavli/engine';
import { createOnlineMatch, timeOut, waitingFor } from '@tavli/online';

import {
  MAX_PUSH_TOKENS_PER_PLAYER,
  MAX_PUSH_RETRIES,
  PUSH_RETRY_MS,
  TURN_PUSH_TEXT,
  deadTokens,
  retryTokens,
  tokensOverCap,
  turnMessages,
  turnPushSide,
  turnWait,
} from './push';
import type { TurnWait } from './push';

describe('turnPushSide', () => {
  const at = (side: PlayerId | null, game = 0): TurnWait => ({ side, game });

  it('tells the other side in an async game', () => {
    expect(turnPushSide('async', at('white'), at('black'), 'white')).toBe('black');
    expect(turnPushSide('async', at('black'), at('white'), 'black')).toBe('white');
    // A new game: nobody was waited for, and the other player starts.
    expect(turnPushSide('async', at(null), at('white'), 'black')).toBe('white');
  });

  it('tells nobody when the same side waits again in the same game (an Asodio extra roll)', () => {
    expect(turnPushSide('async', at('white'), at('white'), 'white')).toBeNull();
    expect(turnPushSide('async', at('black', 2), at('black', 2), null)).toBeNull();
  });

  it('tells the same side when a new game of the match waits for it', () => {
    // White ran out of time (the server saved it) and starts the next game.
    expect(turnPushSide('async', at('white', 0), at('white', 1), null)).toBe('white');
    expect(turnPushSide('async', at('black', 1), at('black', 2), 'white')).toBe('black');
  });

  it('never tells the caller: they are in the app', () => {
    // A new game the caller started, with the caller to move.
    expect(turnPushSide('async', at(null), at('white'), 'white')).toBeNull();
    // The caller ended a game and starts the next one.
    expect(turnPushSide('async', at('black', 0), at('black', 1), 'black')).toBeNull();
    expect(turnPushSide('async', at('white', 0), at('black', 1), 'black')).toBeNull();
  });

  it('tells nobody when the match is over', () => {
    expect(turnPushSide('async', at('white'), at(null), 'white')).toBeNull();
    expect(turnPushSide('async', at('white', 2), at(null, 3), null)).toBeNull();
  });

  it('never pushes in a live game', () => {
    expect(turnPushSide('live', at('white'), at('black'), 'white')).toBeNull();
    expect(turnPushSide('live', at(null), at('white'), 'black')).toBeNull();
    expect(turnPushSide('live', at('white', 0), at('white', 1), null)).toBeNull();
  });
});

describe('turnWait', () => {
  it('reads the waited side and the game number of a flow', () => {
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 3, players: { white: 'a', black: 'b' } },
      createSeededRng(1),
    );
    expect(turnWait(flow)).toEqual({ side: flow.game.state.toMove, game: 0 });
    const next = timeOut(flow, createSeededRng(2));
    expect(next.match.games).toHaveLength(1);
    expect(turnWait(next)).toEqual({ side: waitingFor(next), game: 1 });
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

describe('retryTokens', () => {
  it('picks the Failed and MessageRateExceeded tokens, no others', () => {
    const messages = turnMessages(['a', 'b', 'c', 'd', 'e', 'f'], 'g1');
    const results: PushResult[] = [
      { ok: true },
      { ok: false, error: 'DeviceNotRegistered', message: 'gone' },
      { ok: false, error: 'Failed', message: 'network' },
      { ok: false, error: 'MessageRateExceeded', message: 'slow down' },
      { ok: false, error: 'MessageTooBig', message: 'too big' },
    ];
    expect(retryTokens(messages, results)).toEqual(['c', 'd']);
  });

  it('tries once more, 30 seconds later', () => {
    expect(MAX_PUSH_RETRIES).toBe(1);
    expect(PUSH_RETRY_MS).toBe(30_000);
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
