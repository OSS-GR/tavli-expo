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
  turnPushTtl,
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
  it('makes one high priority message per token with the fixed text, the game id and the ttl', () => {
    const message = (to: string) => ({
      to,
      title: TURN_PUSH_TEXT.title,
      body: TURN_PUSH_TEXT.body,
      data: { gameId: 'g1' },
      priority: 'high',
      ttlSeconds: 600,
    });
    expect(turnMessages(['a', 'b'], 'g1', 600)).toEqual([message('a'), message('b')]);
  });

  it('keeps the text short', () => {
    expect(TURN_PUSH_TEXT.title.length).toBeLessThanOrEqual(30);
    expect(TURN_PUSH_TEXT.body.length).toBeLessThanOrEqual(80);
  });
});

describe('deadTokens', () => {
  it('picks only the DeviceNotRegistered tokens', () => {
    const messages = turnMessages(['a', 'b', 'c', 'd'], 'g1', 60);
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
    const messages = turnMessages(['a', 'b', 'c', 'd', 'e', 'f'], 'g1', 60);
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

describe('turnPushTtl', () => {
  it('is the whole seconds left until the turn deadline', () => {
    expect(turnPushTtl(100_000, 0)).toBe(100);
    expect(turnPushTtl(100_999, 0)).toBe(100);
    expect(turnPushTtl(1_000, 0)).toBe(1);
  });

  it('is null with no full second left, or no deadline: no push', () => {
    expect(turnPushTtl(999, 0)).toBeNull();
    expect(turnPushTtl(1_000, 1_000)).toBeNull();
    expect(turnPushTtl(1_000, 5_000)).toBeNull();
    expect(turnPushTtl(null, 0)).toBeNull();
  });
});

describe('tokensOverCap', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ token: `t${i}` }));
  const names = (picked: readonly { token: string }[]) => picked.map((row) => row.token);

  it(`drops the oldest rows over ${MAX_PUSH_TOKENS_PER_PLAYER}`, () => {
    const all = rows(MAX_PUSH_TOKENS_PER_PLAYER + 2);
    const newest = `t${MAX_PUSH_TOKENS_PER_PLAYER + 1}`;
    expect(names(tokensOverCap(all, newest))).toEqual(['t0', 't1']);
    expect(tokensOverCap(all.slice(0, MAX_PUSH_TOKENS_PER_PLAYER), 't0')).toEqual([]);
    expect(tokensOverCap([], 't0')).toEqual([]);
  });

  it('never drops the token just registered, even when it sorts as the oldest', () => {
    // A tie on `updatedAt`, or another call's clock ahead, can put it first.
    const all = rows(MAX_PUSH_TOKENS_PER_PLAYER + 1);
    expect(names(tokensOverCap(all, 't0'))).toEqual(['t1']);
    expect(names(tokensOverCap(all, 't1'))).toEqual(['t0']);
  });
});
