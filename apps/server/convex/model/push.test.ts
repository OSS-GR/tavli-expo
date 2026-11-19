import { describe, expect, it } from 'vitest';

import { PUSH_LOCALES } from '@tavli/contracts';
import type { PlayerName, PushResult } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { PlayerId } from '@tavli/engine';
import { createOnlineMatch, resign, rollDice, timeOut, waitingFor } from '@tavli/online';
import { openFlow } from '@tavli/online/testing';

import {
  FRIEND_INVITE_PUSH_TEXT,
  FRIEND_PUSH_TTL_SECONDS,
  friendInviteMessages,
  friendMessages,
  MATCH_END_PUSH_TEXT,
  MATCH_END_PUSH_TTL_SECONDS,
  MAX_PUSH_TOKENS_PER_PLAYER,
  MAX_PUSH_RETRIES,
  NEW_MATCH_WAIT,
  PUSH_RETRY_MS,
  PUSH_TEXTS,
  TURN_PUSH_TEXT,
  deadTokens,
  matchEndMessages,
  matchEndPushSides,
  pushMessages,
  pushNameText,
  pushStillDue,
  pushText,
  retryTokens,
  tokensOverCap,
  turnMessages,
  turnPushSide,
  turnPushTtl,
  turnWait,
} from './push';
import type { PushTarget, TurnWait } from './push';

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
  it('waits for the side still to roll its opening die (#379)', () => {
    const rng = createSeededRng(1);
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 3, players: { white: 'a', black: 'b' } },
      rng,
    );
    expect(turnWait(flow)).toEqual({ side: 'white', game: 0, over: false });
    // Black rolls first: the wait stays on White, so Black's roll sends no push.
    expect(turnWait(rollDice(flow, 'black', rng))).toEqual({ side: 'white', game: 0, over: false });
    // White rolls first: now Black is waited for.
    expect(turnWait(rollDice(flow, 'white', rng))).toEqual({ side: 'black', game: 0, over: false });
  });

  it('reads the waited side and the game number of a flow', () => {
    const rng = createSeededRng(1);
    const flow = openFlow(
      createOnlineMatch(
        { choice: 'portes', targetPoints: 3, players: { white: 'a', black: 'b' } },
        rng,
      ),
      rng,
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

const en = (...tokens: string[]): PushTarget[] => tokens.map((token) => ({ token, locale: 'en' }));
const guest: PlayerName = { kind: 'guest', number: '4821' };
const named: PlayerName = { kind: 'username', name: 'nikos' };

describe('push texts (#631)', () => {
  it('has every kind in English and Greek, short', () => {
    for (const locale of PUSH_LOCALES) {
      for (const forms of Object.values(PUSH_TEXTS[locale])) {
        expect(forms.title.length).toBeLessThanOrEqual(30);
        expect(forms.unnamed.length).toBeLessThanOrEqual(80);
        // A 20 letter username still fits.
        expect(forms.named('x'.repeat(20)).length).toBeLessThanOrEqual(90);
      }
    }
    expect(Object.keys(PUSH_TEXTS.el).sort()).toEqual(Object.keys(PUSH_TEXTS.en).sort());
  });

  it('names a username, or a guest in the phone language', () => {
    expect(pushNameText(named, 'en')).toBe('nikos');
    expect(pushNameText(named, 'el')).toBe('nikos');
    expect(pushNameText(guest, 'en')).toBe('Guest 4821');
    expect(pushNameText(guest, 'el')).toBe('Επισκέπτης 4821');
  });

  it('puts the name first in Greek, with no article', () => {
    expect(pushText('turn', 'el', named)).toEqual({
      title: 'Σειρά σου',
      body: 'nikos περιμένει την κίνησή σου.',
    });
    expect(pushText('friendRequest', 'en', guest)).toEqual({
      title: 'Friend request',
      body: 'Guest 4821 wants to be your friend.',
    });
  });

  it('names no one without a name', () => {
    for (const locale of PUSH_LOCALES) {
      for (const kind of Object.keys(PUSH_TEXTS[locale]) as (keyof typeof PUSH_TEXTS.en)[]) {
        expect(pushText(kind, locale, null).body).not.toMatch(/Guest|Επισκέπτης|@/);
      }
    }
  });
});

describe('turnMessages', () => {
  it('makes one high priority message per token with the text, the game id and the ttl', () => {
    const message = (to: string) => ({
      to,
      title: TURN_PUSH_TEXT.title,
      body: TURN_PUSH_TEXT.body,
      data: { gameId: 'g1' },
      priority: 'high',
      ttlSeconds: 600,
    });
    expect(turnMessages(en('a', 'b'), 'g1', 600)).toEqual([message('a'), message('b')]);
  });

  it('writes each phone in its own language, with the name', () => {
    const targets: PushTarget[] = [
      { token: 'a', locale: 'en' },
      { token: 'b', locale: 'el' },
    ];
    expect(turnMessages(targets, 'g1', 60, named).map((m) => m.body)).toEqual([
      'nikos is waiting for your move.',
      'nikos περιμένει την κίνησή σου.',
    ]);
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
    expect(matchEndMessages(en('a', 'b'), 'g1')).toEqual([message('a'), message('b')]);
  });
});

describe('pushMessages', () => {
  it('a turn push lives until the turn deadline; none with no time left', () => {
    expect(pushMessages('turn', en('a'), 'g1', 60_000, 0)).toEqual(turnMessages(en('a'), 'g1', 60));
    expect(pushMessages('turn', en('a'), 'g1', 500, 0)).toEqual([]);
    expect(pushMessages('turn', en('a'), 'g1', null, 0)).toEqual([]);
  });

  it('a "game over" push needs no deadline', () => {
    expect(pushMessages('matchEnd', en('a'), 'g1', null, 0)).toEqual(
      matchEndMessages(en('a'), 'g1'),
    );
  });

  it('a new match says the game started; a ranked one says a match was found (#631)', () => {
    const [friend] = pushMessages('matchStart', en('a'), 'g1', 60_000, 0, {
      name: named,
      ranked: false,
    });
    expect(friend).toMatchObject({
      title: 'New game',
      body: 'Your game with nikos has started. Your roll.',
      data: { gameId: 'g1' },
      priority: 'high',
      ttlSeconds: 60,
    });
    const [ranked] = pushMessages('matchStart', en('a'), 'g1', 60_000, 0, {
      name: named,
      ranked: true,
    });
    expect(ranked).toMatchObject({ title: 'Match found' });
    // A later turn of a ranked game is a plain turn push.
    const [turn] = pushMessages('turn', en('a'), 'g1', 60_000, 0, { name: named, ranked: true });
    expect(turn?.title).toBe('Your turn');
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

  it('a match start push is like a turn push (#631)', () => {
    expect(pushStillDue('matchStart', game(3, 'active'), 3)).toBe(true);
    expect(pushStillDue('matchStart', game(3, 'finished'), 3)).toBe(false);
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
    const messages = turnMessages(en('a', 'b', 'c', 'd'), 'g1', 60);
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
    const messages = turnMessages(en('a', 'b', 'c', 'd', 'e', 'f'), 'g1', 60);
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

describe('friendInviteMessages (#406)', () => {
  const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

  it('sends only the invite code, high, until the invite ends', () => {
    expect(friendInviteMessages(en('t1', 't2'), 'ABCD2345', NOW + 90_500, NOW)).toEqual([
      {
        to: 't1',
        ...FRIEND_INVITE_PUSH_TEXT,
        data: { inviteCode: 'ABCD2345' },
        priority: 'high',
        ttlSeconds: 90,
      },
      {
        to: 't2',
        ...FRIEND_INVITE_PUSH_TEXT,
        data: { inviteCode: 'ABCD2345' },
        priority: 'high',
        ttlSeconds: 90,
      },
    ]);
  });

  it('sends nothing with less than a second left', () => {
    expect(friendInviteMessages(en('t1'), 'ABCD2345', NOW + 999, NOW)).toEqual([]);
  });

  it('names the inviter (#631)', () => {
    const [message] = friendInviteMessages(
      [{ token: 't1', locale: 'el' }],
      'ABCD2345',
      NOW + 60_000,
      NOW,
      named,
    );
    expect(message?.body).toBe('nikos σε προσκαλεί σε παιχνίδι.');
  });
});

describe('friendMessages (#631)', () => {
  it('opens Friends, normal priority, for one day', () => {
    expect(FRIEND_PUSH_TTL_SECONDS).toBe(86_400);
    expect(friendMessages('friendRequest', en('t1'), named)).toEqual([
      {
        to: 't1',
        title: 'Friend request',
        body: 'nikos wants to be your friend.',
        data: { screen: 'friends' },
        priority: 'normal',
        ttlSeconds: 86_400,
      },
    ]);
    expect(friendMessages('friendAccepted', en('t1'), null)[0]?.body).toBe(
      'A player accepted your friend request.',
    );
  });

  it('says a friend link added you, in both languages (#638)', () => {
    expect(friendMessages('friendAdded', en('t1'), named)[0]).toMatchObject({
      title: 'New friend',
      body: 'nikos added you as a friend. You are friends now.',
      data: { screen: 'friends' },
    });
    expect(friendMessages('friendAdded', [{ token: 't2', locale: 'el' }], named)[0]?.body).toBe(
      'nikos σε πρόσθεσε στους φίλους. Είστε πλέον φίλοι.',
    );
  });
});
