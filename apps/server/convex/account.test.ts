// Delete my account (#302), run offline with convex-test and the Better
// Auth component's test helper. Alice and Bob are real guests (signed in
// through the HTTP routes), so the test can check the component's tables.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INVITE_TIME_MS, TURN_TIME_MS, createRecordingPushProvider } from '@tavli/contracts';
import type {
  GameTransportErrorCode,
  InviteErrorCode,
  OnlineGamePace,
  RecordingPushProvider,
} from '@tavli/contracts';

import { api, components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { GAME_RESIGN_PAGE, INVITE_DELETE_PAGE } from './account';
import { setPushProvider } from './push';
import schema from './schema';
import { modules } from './test.setup';

type Tester = ReturnType<typeof setup>;

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

const START = Date.UTC(2026, 9, 28, 12, 0, 0);
let push: RecordingPushProvider;

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Every game schedules a turn timer; fake timers keep it from firing.
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

async function rejectsWith(call: Promise<unknown>, code: GameTransportErrorCode | InviteErrorCode) {
  await expect(call).rejects.toMatchObject({ data: { code } });
}

/** Signs in a new guest through the Better Auth routes. Returns the player id. */
async function guest(t: Tester): Promise<string> {
  const response = await t.fetch('/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'tavlaki://' },
    body: '{}',
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  return body.user.id;
}

type AuthModel = 'user' | 'session' | 'account';

/** The rows of `model` in the Better Auth component that belong to `userId`. */
async function authRows(t: Tester, model: AuthModel, userId: string): Promise<unknown[]> {
  const field = model === 'user' ? '_id' : 'userId';
  const result = await t.run(
    async (ctx) =>
      (await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model,
        where: [{ field, value: userId }],
        paginationOpts: { cursor: null, numItems: 100 },
      })) as { page: unknown[] },
  );
  return result.page;
}

/** Links an Apple account to `userId`, as a later sign-in issue will. */
async function linkAccount(t: Tester, userId: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'account',
        data: {
          accountId: `apple-${userId}`,
          providerId: 'apple',
          userId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    });
  });
}

async function createGame(
  t: Tester,
  white: string,
  black: string,
  pace: OnlineGamePace = 'async',
): Promise<Id<'games'>> {
  return await t.mutation(internal.games.createGame, {
    callerId: white,
    players: { white, black },
    choice: 'portes',
    targetPoints: 1,
    pace,
  });
}

async function register(t: Tester, id: string, token: string) {
  await as(t, id).mutation(api.push.registerPushToken, { token, platform: 'ios' });
}

async function createInvite(t: Tester, id: string): Promise<string> {
  return await as(t, id).mutation(api.invites.createInvite, {
    choice: 'portes',
    targetPoints: 3,
    pace: 'async',
  });
}

async function rawGame(t: Tester, gameId: Id<'games'>) {
  return await t.run(async (ctx) => await ctx.db.get(gameId));
}

async function inviteCodes(t: Tester): Promise<string[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query('invites').collect()).map((invite) => invite.code),
  );
}

/** Runs the scheduled functions that are due now (each `runAfter(0)`). */
async function flush(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

describe('deleteMyAccount', () => {
  it('resigns active games, keeps finished ones, and deletes invites, tokens and the user', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    await linkAccount(t, alice);

    // An active game, and a finished one (Bob resigned it: Alice won).
    const active = await createGame(t, alice, bob);
    const finished = await createGame(t, bob, alice);
    await as(t, bob).mutation(api.games.resign, { gameId: finished });
    const finishedBefore = await rawGame(t, finished);

    // An open invite and a cancelled one from Alice, an open one from Bob.
    await createInvite(t, alice);
    const cancelled = await createInvite(t, alice);
    await as(t, alice).mutation(api.invites.cancelInvite, { code: cancelled });
    const bobsInvite = await createInvite(t, bob);

    // Two phones for Alice, one for Bob.
    await register(t, alice, 'ExponentPushToken[alice-phone]');
    await register(t, alice, 'ExponentPushToken[alice-tablet]');
    await register(t, bob, 'ExponentPushToken[bob-phone]');

    expect(await authRows(t, 'user', alice)).toHaveLength(1);
    expect(await authRows(t, 'session', alice)).toHaveLength(1);
    expect(await authRows(t, 'account', alice)).toHaveLength(1);

    await flush(t);
    push.clear();

    await as(t, alice).mutation(api.account.deleteMyAccount, {});

    // Bob sees the active game won by Alice's resign.
    const resigned = await as(t, bob).query(api.games.getGame, { gameId: active });
    expect(resigned?.status).toBe('finished');
    expect(resigned?.match.winner).toBe('black');
    expect(resigned?.match.resignedBy).toBe('white');
    expect(resigned?.turnDeadline).toBeNull();

    // The finished game is kept as it was, for Bob.
    expect(await rawGame(t, finished)).toEqual(finishedBefore);
    const kept = await as(t, bob).query(api.games.getGame, { gameId: finished });
    expect(kept?.status).toBe('finished');
    expect(kept?.match.winner).toBe('black');
    expect(kept?.players).toEqual({ white: bob, black: alice });
    expect(await as(t, bob).query(api.games.listMyGames, { status: 'finished' })).toHaveLength(2);

    // Alice's open invite is gone at once. The cancelled one goes in the
    // scheduled `deleteSentInvites`, after the call. Bob's stays.
    expect((await inviteCodes(t)).sort()).toEqual([bobsInvite, cancelled].sort());
    await flush(t);
    expect(await inviteCodes(t)).toEqual([bobsInvite]);

    // Alice's push tokens are gone; Bob's stays.
    const tokens = await t.run(async (ctx) => await ctx.db.query('pushTokens').collect());
    expect(tokens.map((row) => row.token)).toEqual(['ExponentPushToken[bob-phone]']);

    // The Better Auth user, its session and its account are gone; Bob's stay.
    expect(await authRows(t, 'user', alice)).toEqual([]);
    expect(await authRows(t, 'session', alice)).toEqual([]);
    expect(await authRows(t, 'account', alice)).toEqual([]);
    expect(await authRows(t, 'user', bob)).toHaveLength(1);
    expect(await authRows(t, 'session', bob)).toHaveLength(1);

    // The resign ended the match: nobody gets "your turn", and the turn
    // timer and the invite expiry find nothing to do.
    vi.advanceTimersByTime(TURN_TIME_MS.async + 1);
    await t.finishInProgressScheduledFunctions();
    expect(push.sent).toEqual([]);
    expect((await as(t, bob).query(api.games.getGame, { gameId: active }))?.version).toBe(
      resigned?.version,
    );
  });

  it('a second call gets NOT_SIGNED_IN: the token outlives the user', async () => {
    const t = setup();
    const alice = await guest(t);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    await rejectsWith(as(t, alice).mutation(api.account.deleteMyAccount, {}), 'NOT_SIGNED_IN');
  });

  it('works for a guest with no games, invites or tokens', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    expect(await authRows(t, 'user', alice)).toEqual([]);
    expect(await authRows(t, 'user', bob)).toHaveLength(1);
  });

  it('resigns a live game too, and every active game', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const carol = await guest(t);
    const live = await createGame(t, bob, alice, 'live');
    const other = await createGame(t, alice, carol);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    const liveView = await as(t, bob).query(api.games.getGame, { gameId: live });
    expect(liveView?.status).toBe('finished');
    expect(liveView?.match.winner).toBe('white');
    const otherView = await as(t, carol).query(api.games.getGame, { gameId: other });
    expect(otherView?.status).toBe('finished');
    expect(otherView?.match.winner).toBe('black');
  });

  it('does not touch the games of other players', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const carol = await guest(t);
    const theirs = await createGame(t, bob, carol);
    const before = await rawGame(t, theirs);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    expect(await rawGame(t, theirs)).toEqual(before);
  });

  it('is the only way to delete a guest: the Better Auth delete routes are off', async () => {
    const t = setup();
    const signIn = await t.fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'tavlaki://' },
      body: '{}',
    });
    const { user } = (await signIn.json()) as { user: { id: string } };
    const cookie = signIn.headers.get('set-cookie') ?? '';
    for (const path of ['/api/auth/delete-anonymous-user', '/api/auth/delete-user']) {
      const response = await t.fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'tavlaki://', cookie },
        body: '{}',
      });
      expect(response.status).toBe(404);
    }
    expect(await authRows(t, 'user', user.id)).toHaveLength(1);
  });

  it('throws NOT_SIGNED_IN without a sign-in', async () => {
    const t = setup();
    await rejectsWith(t.mutation(api.account.deleteMyAccount, {}), 'NOT_SIGNED_IN');
  });

  it('throws NOT_SIGNED_IN for a token whose user does not exist', async () => {
    const t = setup();
    await rejectsWith(as(t, 'nobody').mutation(api.account.deleteMyAccount, {}), 'NOT_SIGNED_IN');
  });
});

describe('after the delete, the old token is refused (#306)', () => {
  // The token stays valid for up to 15 minutes; convex-test keeps the
  // identity, as a client that kept the old token would.
  it('createInvite, registerPushToken, acceptInvite and declineInvite get NOT_SIGNED_IN, and save nothing', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const bobsInvite = await createInvite(t, bob);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    await flush(t);

    await rejectsWith(createInvite(t, alice), 'NOT_SIGNED_IN');
    await rejectsWith(register(t, alice, 'ExponentPushToken[alice-phone]'), 'NOT_SIGNED_IN');
    const caller = as(t, alice);
    await rejectsWith(
      caller.mutation(api.invites.acceptInvite, { code: bobsInvite }),
      'NOT_SIGNED_IN',
    );
    await rejectsWith(
      caller.mutation(api.invites.declineInvite, { code: bobsInvite }),
      'NOT_SIGNED_IN',
    );

    const invites = await t.run(async (ctx) => await ctx.db.query('invites').collect());
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ code: bobsInvite, status: 'open', answeredBy: null });
    expect(await t.run(async (ctx) => await ctx.db.query('pushTokens').collect())).toEqual([]);
    expect(await t.run(async (ctx) => await ctx.db.query('games').collect())).toEqual([]);
  });

  it('an open invite whose time is up stays until deleteSentInvites, and nobody can accept it', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const code = await createInvite(t, alice);
    // The time is up, but `expireInvite` has not run yet: still `open`.
    vi.setSystemTime(START + INVITE_TIME_MS + 1);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});

    // It is out of the open range (`expiresAt > now`), so the call
    // leaves it to `deleteSentInvites`.
    const left = await t.run(async (ctx) => await ctx.db.query('invites').collect());
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ code, status: 'open' });
    await rejectsWith(as(t, bob).mutation(api.invites.acceptInvite, { code }), 'INVITE_EXPIRED');
    expect(await t.run(async (ctx) => await ctx.db.query('games').collect())).toEqual([]);

    await flush(t);
    expect(await inviteCodes(t)).toEqual([]);
  });

  it('nobody can accept an open invite of the deleted account', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const code = await createInvite(t, alice);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    await rejectsWith(as(t, bob).mutation(api.invites.acceptInvite, { code }), 'INVITE_NOT_FOUND');
  });
});

describe('resignActiveGames (#309)', () => {
  /** The ids of the active games of `playerId`, on both sides. */
  async function activeGames(t: Tester, playerId: string): Promise<Id<'games'>[]> {
    return await t.run(async (ctx) =>
      (await ctx.db.query('games').collect())
        .filter(
          (game) =>
            game.status === 'active' &&
            (game.players.white === playerId || game.players.black === playerId),
        )
        .map((game) => game._id),
    );
  }

  async function pendingResigns(t: Tester): Promise<number> {
    return await t.run(
      async (ctx) =>
        (await ctx.db.system.query('_scheduled_functions').collect()).filter(
          (job) => job.name.includes('resignActiveGames') && job.state.kind === 'pending',
        ).length,
    );
  }

  it('resigns more games than one page, after the call, and the turn timer still works', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    const carol = await guest(t);
    // Alice plays on both sides, against two players, in live games.
    // The call resigns one page and a timer ends one game, so the first
    // run gets a full page and the second run a part of one.
    const count = 2 * GAME_RESIGN_PAGE + 2;
    const all: Id<'games'>[] = [];
    for (let i = 0; i < count; i++) {
      const other = i % 3 === 0 ? carol : bob;
      const white = i % 2 === 0 ? alice : other;
      const black = i % 2 === 0 ? other : alice;
      all.push(await createGame(t, white, black, 'live'));
    }
    const theirs = await createGame(t, bob, carol, 'live');

    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    // The call resigned one page; the rest wait for the scheduled pages.
    expect(await activeGames(t, alice)).toHaveLength(count - GAME_RESIGN_PAGE);
    expect(await authRows(t, 'user', alice)).toEqual([]);
    expect(await pendingResigns(t)).toBe(1);

    // Meanwhile a turn runs out in a game Alice still plays. The turn
    // timer ends it as usual (a 1-point match), though her user is gone.
    const [waiting] = await activeGames(t, alice);
    if (waiting === undefined) throw new Error('no active game left');
    const before = await rawGame(t, waiting);
    if (before?.turnDeadline == null) throw new Error('no turn deadline');
    vi.setSystemTime(before.turnDeadline + 1);
    await t.mutation(internal.games.checkTimeout, { gameId: waiting, version: before.version });
    const timedOut = await rawGame(t, waiting);
    expect(timedOut?.status).toBe('finished');
    expect(timedOut?.version).toBe(before.version + 1);

    // The first run resigns a full page and schedules the next one.
    await flush(t);
    expect(await activeGames(t, alice)).toHaveLength(1);
    expect(await pendingResigns(t)).toBe(1);
    // The second run resigns the last game: a page that is not full, so
    // it stops.
    await flush(t);
    expect(await activeGames(t, alice)).toEqual([]);
    expect(await pendingResigns(t)).toBe(0);

    // Every game is over. Alice resigned each one but the timed-out
    // one, so the other player won it.
    for (const gameId of all) {
      const game = await rawGame(t, gameId);
      expect(game?.status).toBe('finished');
      expect(game?.turnDeadline).toBeNull();
      if (gameId === waiting) continue;
      expect(game?.winner).toBe(game?.players.white === alice ? 'black' : 'white');
    }
    // The game of Bob and Carol is not touched.
    expect((await rawGame(t, theirs))?.status).toBe('active');
  });

  it('schedules no page when the first page holds every game', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    for (let i = 0; i < GAME_RESIGN_PAGE - 1; i++) await createGame(t, alice, bob);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    expect(await activeGames(t, alice)).toEqual([]);
    expect(await pendingResigns(t)).toBe(0);
  });

  it('with exactly one page of games, the call resigns all and one empty run stops', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    for (let i = 0; i < GAME_RESIGN_PAGE; i++) await createGame(t, alice, bob);
    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    expect(await activeGames(t, alice)).toEqual([]);
    // The page was full, so the call could not know it was the last one.
    expect(await pendingResigns(t)).toBe(1);
    const before = await t.run(async (ctx) => await ctx.db.query('games').collect());

    await flush(t);
    // The run found nothing to resign and scheduled nothing more.
    expect(await t.run(async (ctx) => await ctx.db.query('games').collect())).toEqual(before);
    expect(await pendingResigns(t)).toBe(0);
  });
});

describe('deleteSentInvites (#306)', () => {
  /** Saves `count` cancelled invites from `from`, as if made over the months. */
  async function closedInvites(t: Tester, from: string, count: number): Promise<void> {
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert('invites', {
          code: `C${String(i).padStart(7, '0')}`,
          from,
          choice: 'portes',
          targetPoints: 3,
          pace: 'async',
          status: 'cancelled',
          expiresAt: START - 1,
          gameId: null,
          answeredBy: null,
        });
      }
    });
  }

  async function invitesFrom(t: Tester, from: string): Promise<number> {
    return await t.run(
      async (ctx) =>
        (await ctx.db.query('invites').collect()).filter((invite) => invite.from === from).length,
    );
  }

  it('deletes many invites in pages, after the call, and leaves other players’ invites', async () => {
    const t = setup();
    const alice = await guest(t);
    const bob = await guest(t);
    await closedInvites(t, alice, 2 * INVITE_DELETE_PAGE + 1);
    await createInvite(t, alice);
    await createInvite(t, bob);

    await as(t, alice).mutation(api.account.deleteMyAccount, {});
    // The open invite is gone with the call; the closed ones wait.
    expect(await invitesFrom(t, alice)).toBe(2 * INVITE_DELETE_PAGE + 1);
    await flush(t);
    expect(await invitesFrom(t, alice)).toBe(INVITE_DELETE_PAGE + 1);
    await flush(t);
    expect(await invitesFrom(t, alice)).toBe(1);
    await flush(t);
    expect(await invitesFrom(t, alice)).toBe(0);
    expect(await invitesFrom(t, bob)).toBe(1);

    // The last page was not full: nothing more is scheduled for it.
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.name.includes('deleteSentInvites') && job.state.kind === 'pending',
      ),
    );
    expect(pending).toEqual([]);
  });
});
