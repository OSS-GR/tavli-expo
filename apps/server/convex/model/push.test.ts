import { describe, expect, it } from 'vitest';

import type { PushResult } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { PlayerId } from '@tavli/engine';
import { createOnlineMatch, resign, timeOut, waitingFor } from '@tavli/online';

import {
  MATCH_END_PUSH_TEXT,
  MATCH_END_PUSH_TTL_SECONDS,
  MAX_PUSH_TOKENS_PER_PLAYER,
  MAX_PUSH_RETRIES,
  NEW_MATCH_WAIT,
  PUSH_RETRY_MS,
  TURN_PUSH_TEXT,
  deadTokens,
  matchEndMessages,
  matchEndPushSides,
  pushMessages,
  pushStillDue,
  retryTokens,
  tokensOverCap,
  turnMessages,
  turnPushSide,
  turnPushTtl,
  turnWait,
} from './push';
import type { TurnWait } from './push';

const at = (side: PlayerId | null, game = 0): TurnWait => ({ side, game, over: false });
/** The match is over after `game` games: nobody is waited for. */
const over = (game = 1): TurnWait => ({ side: null, game, over: true });

describe('turnPushSide', () => {
  it('tells the other side', () => {
    expect(turnPushSide(at('white'), at('black'), 'white')).toBe('black');
    expect(turnPushSide(at('black'), at('white'), 'black')).toBe('white');
    // A new game: nobody was waited for, and the other player starts.
    expect(turnPushSide(at(null), at('white'), 'black')).toBe('white');
  });

  it('tells nobody when the same side waits again in the same game (an Asodio extra roll)', () => {
    expect(turnPushSide(at('white'), at('white'), 'white')).toBeNull();
    expect(turnPushSide(at('black', 2), at('black', 2), null)).toBeNull();
  });

  it('tells the same side when a new game of the match waits for it', () => {
    // White ran out of time (the server saved it) and starts the next game.
    expect(turnPushSide(at('white', 0), at('white', 1), null)).toBe('white');
    expect(turnPushSide(at('black', 1), at('black', 2), 'white')).toBe('black');
  });

  it('never tells the caller: they are in the app', () => {
    // A new game the caller started, with the caller to move.
    expect(turnPushSide(at(null), at('white'), 'white')).toBeNull();
    // The caller ended a game and starts the next one.
    expect(turnPushSide(at('black', 0), at('black', 1), 'black')).toBeNull();
    expect(turnPushSide(at('white', 0), at('black', 1), 'black')).toBeNull();
  });

  it('tells nobody when the match is over', () => {
    expect(turnPushSide(at('white'), over(), 'white')).toBeNull();
    expect(turnPushSide(at('white', 2), over(3), null)).toBeNull();
    // Even with a side (it cannot happen: `waitingFor` is null then).
    expect(turnPushSide(at('white'), { ...over(), side: 'black' }, 'white')).toBeNull();
  });
});

describe('matchEndPushSides', () => {
  it('tells the other player when the caller ends a match', () => {
    // A winning move or a resign by the caller.
    expect(matchEndPushSides(at('white'), over(), 'white')).toEqual(['black']);
    expect(matchEndPushSides(at('white', 2), over(3), 'black')).toEqual(['white']);
  });

  it('tells both players after a time out (the server ended it)', () => {
    expect(matchEndPushSides(at('white'), over(), null)).toEqual(['white', 'black']);
  });

  it('tells nobody while the match goes on: the turn push covers a new game', () => {
    expect(matchEndPushSides(at('white'), at('black'), 'white')).toEqual([]);
    expect(matchEndPushSides(at('white', 0), at('white', 1), null)).toEqual([]);
    expect(matchEndPushSides(NEW_MATCH_WAIT, at('white'), 'black')).toEqual([]);
  });

  it('tells nobody when the match was over before the save', () => {
    expect(matchEndPushSides(over(), over(), null)).toEqual([]);
  });

  it('never overlaps the turn push: one save, one kind of push', () => {
    const waits = [
      NEW_MATCH_WAIT,
      at('white'),
      at('black'),
      at('white', 1),
      at('black', 1),
      over(),
      over(2),
    ];
    for (const before of waits) {
      for (const after of waits) {
        for (const caller of ['white', 'black', null] as const) {
          const turn = turnPushSide(before, after, caller);
          const end = matchEndPushSides(before, after, caller);
          expect(turn !== null && end.length > 0).toBe(false);
          if (caller !== null) expect(end).not.toContain(caller);
        }
      }
    }
  });
});

describe('turnWait', () => {
  it('reads the waited side and the game number of a flow', () => {
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 3, players: { white: 'a', black: 'b' } },
      createSeededRng(1),
    );
    expect(turnWait(flow)).toEqual({ side: flow.game.state.toMove, game: 0, over: false });
    const next = timeOut(flow, createSeededRng(2));
    expect(next.match.games).toHaveLength(1);
    expect(turnWait(next)).toEqual({ side: waitingFor(next), game: 1, over: false });
  });

  it('says when the match is over', () => {
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 3, players: { white: 'a', black: 'b' } },
      createSeededRng(1),
    );
    const ended = resign(flow, 'white', createSeededRng(2));
    // A match resign adds no game to `match.games`.
    expect(turnWait(ended)).toEqual({ side: null, game: 0, over: true });
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
    for (const text of [TURN_PUSH_TEXT, MATCH_END_PUSH_TEXT]) {
      expect(text.title.length).toBeLessThanOrEqual(30);
      expect(text.body.length).toBeLessThanOrEqual(80);
    }
  });
});

describe('matchEndMessages', () => {
  it('makes one normal priority message per token that lives one day', () => {
    const message = (to: string) => ({
      to,
      title: MATCH_END_PUSH_TEXT.title,
      body: MATCH_END_PUSH_TEXT.body,
      data: { gameId: 'g1' },
      priority: 'normal',
      ttlSeconds: 24 * 60 * 60,
    });
    expect(MATCH_END_PUSH_TTL_SECONDS).toBe(86_400);
    expect(matchEndMessages(['a', 'b'], 'g1')).toEqual([message('a'), message('b')]);
  });
});

describe('pushMessages', () => {
  it('a turn push lives until the turn deadline; none with no time left', () => {
    expect(pushMessages('turn', ['a'], 'g1', 60_000, 0)).toEqual(turnMessages(['a'], 'g1', 60));
    expect(pushMessages('turn', ['a'], 'g1', 500, 0)).toEqual([]);
    expect(pushMessages('turn', ['a'], 'g1', null, 0)).toEqual([]);
  });

  it('a "game over" push needs no deadline', () => {
    expect(pushMessages('matchEnd', ['a'], 'g1', null, 0)).toEqual(matchEndMessages(['a'], 'g1'));
  });
});

describe('pushStillDue', () => {
  const game = (version: number, status: 'active' | 'finished') => ({ version, status });

  it('a turn push: the game is still at the version and the match runs', () => {
    expect(pushStillDue('turn', game(3, 'active'), 3)).toBe(true);
    expect(pushStillDue('turn', game(4, 'active'), 3)).toBe(false);
    expect(pushStillDue('turn', game(3, 'finished'), 3)).toBe(false);
    expect(pushStillDue('turn', null, 3)).toBe(false);
  });

  it('a "game over" push: the match at the version is over', () => {
    expect(pushStillDue('matchEnd', game(3, 'finished'), 3)).toBe(true);
    expect(pushStillDue('matchEnd', game(3, 'active'), 3)).toBe(false);
    expect(pushStillDue('matchEnd', game(4, 'finished'), 3)).toBe(false);
    expect(pushStillDue('matchEnd', null, 3)).toBe(false);
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
