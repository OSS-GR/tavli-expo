// Friends (#406): the Convex adapter (`createConvexFriends` in
// `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Friends` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: the caps, the search limit, the wait after a decline,
// the push of a friend invite, the record on the rows and the paged
// account delete.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FRIEND_FUNCTIONS,
  FRIEND_FUNCTION_NAMES,
  createConvexFriends,
  createConvexGameTransport,
  createConvexInvites,
  createConvexOnlineData,
  createConvexSafety,
  createConvexUsernames,
} from '@tavli/backend-convex';
import type { FriendFunctions } from '@tavli/backend-convex';
import {
  FRIEND_REQUEST_WAIT_MS,
  FRIEND_SEARCHES_PER_HOUR,
  FRIEND_SEARCH_WINDOW_MS,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
  createRecordingPushProvider,
} from '@tavli/contracts';
import type { RecordingPushProvider } from '@tavli/contracts';
import { friendsContract } from '@tavli/contracts/testing';
import type { FriendsContractPlayer, FriendsContractSubject } from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import { FRIEND_DELETE_PAGE } from './friends';
import { FRIEND_INVITE_PUSH_TEXT } from './model/push';
import { setPushProvider } from './push';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules } from './test.setup';

// The players, made by `setup()`.
let ALICE = '';
let BOB = '';
let CAROL = '';
let GUEST = '';

async function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = '', CAROL = ''] = await authUsers(t, 3, true);
  [GUEST = ''] = await authUsers(t, 1);
  return t;
}

/** The tester with this schema's tables (`Tester` has none). */
type SchemaTester = Awaited<ReturnType<typeof setup>>;

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

let push: RecordingPushProvider;

beforeEach(() => {
  // The delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Invites schedule their expiry and games a turn timer: fake timers keep
  // them from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  push = createRecordingPushProvider();
  setPushProvider(push);
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Runs the functions scheduled now (pushes, the pages of an account delete). */
async function runScheduled(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

async function contractSubject(): Promise<FriendsContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { alice: ALICE, bob: BOB, carol: CAROL, guest: GUEST } as const;
  const clientOf = (player: FriendsContractPlayer) => network.clientFor(ids[player]);
  return {
    idOf: (player) => ids[player],
    friendsFor: (player) =>
      createConvexFriends({ client: network.clientFor(player === null ? null : ids[player]) }),
    invitesFor: (player) => createConvexInvites({ client: clientOf(player) }),
    gamesFor: (player) => createConvexGameTransport({ client: clientOf(player) }),
    safetyFor: (player) => createConvexSafety({ client: clientOf(player) }),
    usernamesFor: (player) => createConvexUsernames({ client: clientOf(player) }),
    onlineDataFor: (player) => createConvexOnlineData({ client: clientOf(player) }),
    settle: () => runScheduled(t),
  };
}

describe('Friends contract (Convex adapter on the real functions)', () => {
  for (const check of friendsContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

/** `from` asks `to` by `to`'s friend link. */
async function ask(t: Tester, from: string, to: string) {
  const token = await as(t, to).mutation(api.friends.myFriendLink, {});
  return await as(t, from).mutation(api.friends.requestByLink, { token });
}

/** `from` asks `to` and `to` accepts. */
async function befriend(t: Tester, from: string, to: string) {
  await ask(t, from, to);
  await as(t, to).mutation(api.friends.acceptFriendRequest, { playerId: from });
}

async function friendRows(t: SchemaTester) {
  return await t.run(async (ctx) => ({
    friends: await ctx.db.query('friends').collect(),
    requests: await ctx.db.query('friendRequests').collect(),
    links: await ctx.db.query('friendLinks').collect(),
    searches: await ctx.db.query('friendSearches').collect(),
    invites: await ctx.db.query('invites').collect(),
  }));
}

describe('friends on the Convex server', () => {
  it('caps open requests sent at MAX_OPEN_FRIEND_REQUESTS; a cancel frees a place', async () => {
    const t = await setup();
    const others = await authUsers(t, MAX_OPEN_FRIEND_REQUESTS + 1, true);
    for (const other of others.slice(0, -1)) await ask(t, ALICE, other);
    const last = others.at(-1) ?? '';
    await expect(ask(t, ALICE, last)).rejects.toMatchObject({
      data: { code: 'TOO_MANY_REQUESTS' },
    });
    await as(t, ALICE).mutation(api.friends.cancelFriendRequest, { playerId: others[0] ?? '' });
    await expect(ask(t, ALICE, last)).resolves.toBe('sent');
  });

  it('a full inbox refuses new requests with TRY_LATER', async () => {
    const t = await setup();
    // Rows put in directly: making that many real users is slow.
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_INCOMING_FRIEND_REQUESTS; i += 1) {
        await ctx.db.insert('friendRequests', {
          fromId: `p${i}`,
          toId: ALICE,
          status: 'open',
          createdAt: START,
          declinedAt: null,
        });
      }
    });
    await expect(ask(t, BOB, ALICE)).rejects.toMatchObject({ data: { code: 'TRY_LATER' } });
  });

  it('caps friends at MAX_FRIENDS, on both sides', async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_FRIENDS; i += 1) {
        await ctx.db.insert('friends', {
          playerId: ALICE,
          friendId: `p${i}`,
          since: START,
          wins: 0,
          losses: 0,
        });
      }
    });
    await expect(ask(t, ALICE, BOB)).rejects.toMatchObject({
      data: { code: 'TOO_MANY_FRIENDS' },
    });
    await expect(ask(t, BOB, ALICE)).rejects.toMatchObject({ data: { code: 'TRY_LATER' } });
  });

  it('limits username searches per hour; a failed request by username still counts', async () => {
    const t = await setup();
    const friends = createConvexFriends({ client: convexTestNetwork(t).clientFor(ALICE) });
    for (let i = 0; i < FRIEND_SEARCHES_PER_HOUR - 1; i += 1) await friends.findPlayer(`n${i}`);
    await expect(friends.requestByUsername('nobody')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(friends.findPlayer('one_more')).rejects.toMatchObject({
      code: 'TOO_MANY_SEARCHES',
    });
    vi.advanceTimersByTime(FRIEND_SEARCH_WINDOW_MS);
    await expect(friends.findPlayer('one_more')).resolves.toBeNull();
    // The rows keep only the time, and old rows go at the next search.
    const { searches } = await friendRows(t);
    expect(searches.map(({ playerId, at }) => ({ playerId, at }))).toEqual([
      { playerId: ALICE, at: START + FRIEND_SEARCH_WINDOW_MS },
    ]);
  });

  it('a declined sender may ask again after FRIEND_REQUEST_WAIT_MS, on the same row', async () => {
    const t = await setup();
    await ask(t, ALICE, BOB);
    await as(t, BOB).mutation(api.friends.declineFriendRequest, { playerId: ALICE });
    vi.advanceTimersByTime(FRIEND_REQUEST_WAIT_MS - 1);
    await expect(ask(t, ALICE, BOB)).rejects.toMatchObject({ data: { code: 'TRY_LATER' } });
    vi.advanceTimersByTime(1);
    await expect(ask(t, ALICE, BOB)).resolves.toBe('sent');
    const { requests } = await friendRows(t);
    expect(requests.map(({ fromId, toId, status }) => ({ fromId, toId, status }))).toEqual([
      { fromId: ALICE, toId: BOB, status: 'open' },
    ]);
  });

  it('a friend invite sends the friend a push with only the code', async () => {
    const t = await setup();
    await befriend(t, ALICE, BOB);
    await as(t, BOB).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[bob]',
      platform: 'ios',
    });
    const code = await as(t, ALICE).mutation(api.friends.inviteFriend, { playerId: BOB, ...GAME });
    await runScheduled(t);
    expect(push.sent).toEqual([
      {
        to: 'ExponentPushToken[bob]',
        ...FRIEND_INVITE_PUSH_TEXT,
        data: { inviteCode: code },
        priority: 'high',
        ttlSeconds: expect.any(Number) as number,
      },
    ]);
    for (const id of [ALICE, BOB]) {
      expect(JSON.stringify(push.sent)).not.toContain(id);
    }
  });

  it('a friend invite answered before the push goes out sends nothing', async () => {
    const t = await setup();
    await befriend(t, ALICE, BOB);
    await as(t, BOB).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[bob]',
      platform: 'ios',
    });
    const code = await as(t, ALICE).mutation(api.friends.inviteFriend, { playerId: BOB, ...GAME });
    await as(t, ALICE).mutation(api.invites.cancelInvite, { code });
    await runScheduled(t);
    expect(push.sent).toEqual([]);
  });

  it('keeps the record on the rows: counted at the start, then one more per match', async () => {
    const t = await setup();
    const one = { ...GAME, targetPoints: 1 };
    // A match before the friendship: Bob resigns, Alice wins.
    const before = await as(t, ALICE).mutation(api.invites.createInvite, one);
    const gameId = await as(t, BOB).mutation(api.invites.acceptInvite, { code: before });
    await as(t, BOB).mutation(api.games.resign, { gameId });
    await befriend(t, ALICE, BOB);
    const record = async () =>
      Object.fromEntries(
        (await friendRows(t)).friends.map((row) => [row.playerId, [row.wins, row.losses]]),
      );
    expect(await record()).toEqual({ [ALICE]: [1, 0], [BOB]: [0, 1] });
    // A match after: Alice resigns.
    const after = await as(t, BOB).mutation(api.invites.createInvite, one);
    const next = await as(t, ALICE).mutation(api.invites.acceptInvite, { code: after });
    await as(t, ALICE).mutation(api.games.resign, { gameId: next });
    expect(await record()).toEqual({ [ALICE]: [1, 1], [BOB]: [1, 1] });
  });

  it('the account delete ends the friendships at once and the rest in pages', async () => {
    const t = await setup();
    await befriend(t, ALICE, BOB);
    await ask(t, CAROL, BOB);
    // Alice's link stays: only Bob's rows go.
    await as(t, ALICE).mutation(api.friends.myFriendLink, {});
    await as(t, BOB).mutation(api.friends.findPlayer, { username: 'someone' });
    await as(t, ALICE).mutation(api.friends.inviteFriend, { playerId: BOB, ...GAME });
    // More rows than one page: old declined requests to Bob.
    await t.run(async (ctx) => {
      for (let i = 0; i < FRIEND_DELETE_PAGE + 5; i += 1) {
        await ctx.db.insert('friendRequests', {
          fromId: `p${i}`,
          toId: BOB,
          status: 'declined',
          createdAt: START,
          declinedAt: START,
        });
      }
    });
    await as(t, BOB).mutation(api.account.deleteMyAccount, {});
    expect((await friendRows(t)).friends).toEqual([]);
    await runScheduled(t);
    await runScheduled(t);
    const left = await friendRows(t);
    expect(left.requests).toEqual([]);
    expect(left.searches).toEqual([]);
    expect(left.links.map((row) => row.playerId)).toEqual([ALICE]);
    expect(left.invites.filter((invite) => invite.to === BOB)).toEqual([]);
  });

  it('deleteFriendRows with nothing left schedules nothing more', async () => {
    const t = await setup();
    await t.mutation(internal.friends.deleteFriendRows, { playerId: BOB });
    await runScheduled(t);
    const { friends, requests } = await friendRows(t);
    expect({ friends, requests }).toEqual({ friends: [], requests: [] });
  });

  it('refuses a caller whose account is gone (a token outlives its user)', async () => {
    const t = await setup();
    await expect(
      as(t, 'no-such-user').mutation(api.friends.myFriendLink, {}),
    ).rejects.toMatchObject({ data: { code: 'NOT_SIGNED_IN' } });
  });
});

// The adapter names the functions itself (`FRIEND_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

type Api = typeof api.friends;
type Fns = FriendFunctions;

/** The adapter's arguments fit the server, and the server's result fits the adapter. */
type Fits<K extends keyof Fns> =
  Extends<FunctionArgs<Fns[K]>, FunctionArgs<Api[K]>> extends true
    ? Extends<FunctionReturnType<Api[K]>, FunctionReturnType<Fns[K]>>
    : false;

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(FRIEND_FUNCTION_NAMES) as (keyof FriendFunctions)[]) {
      expect(getFunctionName(FRIEND_FUNCTIONS[key])).toBe(getFunctionName(api.friends[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    expectType<Fits<'listFriends'>>();
    expectType<Fits<'listFriendRequests'>>();
    expectType<Fits<'recentPlayers'>>();
    expectType<Fits<'findPlayer'>>();
    expectType<Fits<'myFriendLink'>>();
    expectType<Fits<'resetFriendLink'>>();
    expectType<Fits<'openFriendLink'>>();
    expectType<Fits<'requestByLink'>>();
    expectType<Fits<'requestByUsername'>>();
    expectType<Fits<'sendFriendRequest'>>();
    expectType<Fits<'acceptFriendRequest'>>();
    expectType<Fits<'declineFriendRequest'>>();
    expectType<Fits<'cancelFriendRequest'>>();
    expectType<Fits<'removeFriend'>>();
    expectType<Fits<'inviteFriend'>>();
    expectType<Fits<'listFriendInvites'>>();
    // @ts-expect-error -- a number is not what the call returns.
    expectType<Extends<number, FunctionReturnType<Fns['listFriends']>>>();
  });
});
