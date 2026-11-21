// The pure friend checks (#406): the order of `planRequest`, and the
// record and recent players. The servers run them in
// `memory-friends.test.ts` and `apps/server/convex/convexFriends.test.ts`.

import { describe, expect, it } from 'vitest';

import {
  FRIEND_REQUEST_WAIT_MS,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
} from '@tavli/contracts';

import { SERVER_ACTOR } from './calls';
import {
  checkFriendTarget,
  checkFriendUsername,
  checkSaved,
  friendStatusOf,
  planRequest,
  playerCardOf,
  recentOpponents,
  recordAfter,
  recordOf,
} from './friends';
import type { PlanRequestInput, PlayerCardInput } from './friends';

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

const BASE: PlanRequestInput = {
  route: 'username',
  self: false,
  savedTarget: true,
  met: true,
  callerBlocks: false,
  targetBlocks: false,
  friends: false,
  mine: null,
  theirs: null,
  openSent: 0,
  openReceived: 0,
  callerFriends: 0,
  targetFriends: 0,
  now: NOW,
};

const OPEN = { status: 'open', createdAt: NOW - 1, declinedAt: null } as const;

describe('who may call', () => {
  it('needs a saved account, and a username for the calls that reach others (#599)', () => {
    expect(() => checkSaved(false)).toThrow(expect.objectContaining({ code: 'NOT_SAVED' }));
    expect(() => checkSaved(true)).not.toThrow();
    expect(() => checkFriendUsername(false)).toThrow(
      expect.objectContaining({ code: 'USERNAME_NEEDED' }),
    );
    expect(() => checkFriendUsername(true)).not.toThrow();
  });
});

function codeOf(input: Partial<PlanRequestInput>): string {
  try {
    return JSON.stringify(planRequest({ ...BASE, ...input }));
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe('planRequest', () => {
  it('sends a new request', () => {
    expect(planRequest(BASE)).toEqual({ kind: 'send' });
  });

  it('hides a guest, a stranger and a block by the other player as NOT_FOUND', () => {
    expect(codeOf({ savedTarget: false })).toBe('NOT_FOUND');
    expect(codeOf({ route: 'met', met: false })).toBe('NOT_FOUND');
    expect(codeOf({ targetBlocks: true })).toBe('NOT_FOUND');
    expect(codeOf({ route: 'met', targetBlocks: true })).toBe('NOT_FOUND');
  });

  it('says BLOCKED only to a caller who blocks a player they met', () => {
    expect(codeOf({ route: 'met', callerBlocks: true })).toBe('BLOCKED');
    expect(codeOf({ route: 'link', callerBlocks: true })).toBe('NOT_FOUND');
    expect(codeOf({ route: 'username', callerBlocks: true })).toBe('NOT_FOUND');
  });

  it('refuses the caller with BAD_REQUEST first', () => {
    expect(codeOf({ self: true, savedTarget: false })).toBe('BAD_REQUEST');
  });

  it('keeps friends and an open request as they are', () => {
    expect(planRequest({ ...BASE, friends: true })).toEqual({ kind: 'status', status: 'friends' });
    expect(planRequest({ ...BASE, mine: OPEN, openSent: MAX_OPEN_FRIEND_REQUESTS })).toEqual({
      kind: 'status',
      status: 'sent',
    });
  });

  it('accepts when the other player asked first, inside the friend caps', () => {
    expect(planRequest({ ...BASE, theirs: OPEN, openSent: MAX_OPEN_FRIEND_REQUESTS })).toEqual({
      kind: 'accept',
    });
    expect(codeOf({ theirs: OPEN, callerFriends: MAX_FRIENDS })).toBe('TOO_MANY_FRIENDS');
    expect(codeOf({ theirs: OPEN, targetFriends: MAX_FRIENDS })).toBe('TOO_MANY_FRIENDS');
  });

  it('adds at once by friend link, inside the friend caps (#638)', () => {
    const link = { ...BASE, route: 'link' } as const;
    expect(planRequest(link)).toEqual({ kind: 'add' });
    const declined = { status: 'declined', createdAt: NOW, declinedAt: NOW } as const;
    expect(planRequest({ ...link, mine: declined })).toEqual({ kind: 'add' });
    expect(planRequest({ ...link, mine: OPEN, openSent: MAX_OPEN_FRIEND_REQUESTS })).toEqual({
      kind: 'add',
    });
    expect(planRequest({ ...link, theirs: OPEN })).toEqual({ kind: 'accept' });
    expect(planRequest({ ...link, friends: true })).toEqual({ kind: 'status', status: 'friends' });
    expect(codeOf({ route: 'link', callerFriends: MAX_FRIENDS })).toBe('TOO_MANY_FRIENDS');
    expect(codeOf({ route: 'link', targetFriends: MAX_FRIENDS })).toBe('TOO_MANY_FRIENDS');
    expect(codeOf({ route: 'link', targetBlocks: true })).toBe('NOT_FOUND');
  });

  it('waits FRIEND_REQUEST_WAIT_MS after a decline', () => {
    const declined = { status: 'declined', createdAt: NOW, declinedAt: NOW } as const;
    expect(codeOf({ mine: declined, now: NOW + FRIEND_REQUEST_WAIT_MS - 1 })).toBe('TRY_LATER');
    expect(codeOf({ mine: declined, now: NOW + FRIEND_REQUEST_WAIT_MS })).toBe('{"kind":"send"}');
  });

  it('checks the caps: sent, the caller friends, then the other side', () => {
    expect(codeOf({ openSent: MAX_OPEN_FRIEND_REQUESTS })).toBe('TOO_MANY_REQUESTS');
    expect(codeOf({ callerFriends: MAX_FRIENDS })).toBe('TOO_MANY_FRIENDS');
    expect(codeOf({ openReceived: MAX_INCOMING_FRIEND_REQUESTS })).toBe('TRY_LATER');
    expect(codeOf({ targetFriends: MAX_FRIENDS })).toBe('TRY_LATER');
  });
});

describe('checkFriendTarget', () => {
  it('refuses an empty id, the server and the caller', () => {
    expect(() => checkFriendTarget('a', ' ')).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(() => checkFriendTarget('a', SERVER_ACTOR)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(() => checkFriendTarget('a', 'a')).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' }),
    );
    expect(() => checkFriendTarget('a', 'b')).not.toThrow();
  });
});

describe('friendStatusOf', () => {
  it('reads self, friends, sent, received, none in this order', () => {
    const none = { self: false, friends: false, mine: null, theirs: null };
    expect(friendStatusOf({ ...none, self: true, friends: true })).toBe('self');
    expect(friendStatusOf({ ...none, friends: true, mine: OPEN })).toBe('friends');
    expect(friendStatusOf({ ...none, mine: OPEN, theirs: OPEN })).toBe('sent');
    expect(friendStatusOf({ ...none, theirs: OPEN })).toBe('received');
    const declined = { ...OPEN, status: 'declined' as const, declinedAt: NOW };
    expect(friendStatusOf({ ...none, mine: declined })).toBe('none');
  });
});

describe('records and recent players', () => {
  const game = (white: string, black: string, winner: 'white' | 'black' | null) => ({
    players: { white, black },
    status: winner === null ? ('active' as const) : ('finished' as const),
    winner,
  });

  it('counts the finished matches between the two only', () => {
    const games = [
      game('a', 'b', 'white'),
      game('b', 'a', 'white'),
      game('b', 'a', 'black'),
      game('a', 'b', null),
      game('a', 'c', 'white'),
    ];
    expect(recordOf(games, 'a', 'b')).toEqual({ wins: 2, losses: 1 });
    expect(recordOf(games, 'b', 'a')).toEqual({ wins: 1, losses: 2 });
    expect(recordAfter({ wins: 2, losses: 1 }, false)).toEqual({ wins: 2, losses: 2 });
  });

  it('lists each opponent once, newest game first', () => {
    const at = (white: string, black: string, updatedAt: number) => ({
      players: { white, black },
      updatedAt,
    });
    expect(
      recentOpponents([at('a', 'b', 1), at('c', 'a', 3), at('a', 'b', 5), at('c', 'd', 9)], 'a'),
    ).toEqual([
      { playerId: 'b', playedAt: 5 },
      { playerId: 'c', playedAt: 3 },
    ]);
  });
});

describe('playerCardOf (#651)', () => {
  const input: PlayerCardInput = {
    callerId: 'a',
    playerId: 'b',
    met: true,
    blockedEither: false,
    name: { kind: 'username', name: 'Bob' },
    saved: true,
    rating: { rating: 1611.6, experience: 40, matches: 48 },
    rank: 12,
    status: 'friends',
    record: { wins: 12, losses: 9 },
  };

  it('gives the rounded rating, the place and the record of a friend', () => {
    expect(playerCardOf(input)).toEqual({
      name: { kind: 'username', name: 'Bob' },
      rating: 1612,
      matches: 48,
      rank: 12,
      status: 'friends',
      record: { wins: 12, losses: 9 },
    });
  });

  it('a saved player with no rated match starts at the first rating', () => {
    const card = playerCardOf({ ...input, rating: null, rank: null, status: 'none', record: null });
    expect([card.rating, card.matches, card.rank, card.record]).toEqual([1500, 0, null, null]);
  });

  it('a guest has no rating, no place and cannot be asked', () => {
    const card = playerCardOf({ ...input, saved: false, status: 'none', record: null });
    expect([card.rating, card.matches, card.rank, card.status]).toEqual([null, 0, null, 'none']);
  });

  it('refuses the caller, a stranger and a block, with codes that hide the block', () => {
    expect(() => playerCardOf({ ...input, playerId: 'a' })).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' }),
    );
    expect(() => playerCardOf({ ...input, met: false })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(() => playerCardOf({ ...input, blockedEither: true })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});
