// Ratings (#407): the Convex adapter (`createConvexRatings` in
// `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Ratings` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: the next UTC day, the rows kept and the paged account
// delete.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RATING_FUNCTIONS,
  RATING_FUNCTION_NAMES,
  createConvexFriends,
  createConvexGameTransport,
  createConvexInvites,
  createConvexOnlineData,
  createConvexRatings,
  createConvexSafety,
  createConvexUsernames,
} from '@tavli/backend-convex';
import type { RatingFunctions } from '@tavli/backend-convex';
import {
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  START_RATING,
  TERMS_VERSION,
  createRecordingPushProvider,
} from '@tavli/contracts';
import { ratingsContract } from '@tavli/contracts/testing';
import type { RatingsContractPlayer, RatingsContractSubject } from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import { setPushProvider } from './push';
import { RATED_PAIR_DELETE_PAGE } from './ratings';
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

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

beforeEach(() => {
  // The delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Invites schedule their expiry and games a turn timer: fake timers keep
  // them from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
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

async function contractSubject(): Promise<RatingsContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { alice: ALICE, bob: BOB, carol: CAROL, guest: GUEST } as const;
  const clientOf = (player: RatingsContractPlayer) => network.clientFor(ids[player]);
  return {
    idOf: (player) => ids[player],
    ratingsFor: (player) =>
      createConvexRatings({ client: network.clientFor(player === null ? null : ids[player]) }),
    invitesFor: (player) => createConvexInvites({ client: clientOf(player) }),
    gamesFor: (player) => createConvexGameTransport({ client: clientOf(player) }),
    friendsFor: (player) => createConvexFriends({ client: clientOf(player) }),
    safetyFor: (player) => createConvexSafety({ client: clientOf(player) }),
    usernamesFor: (player) => createConvexUsernames({ client: clientOf(player) }),
    onlineDataFor: (player) => createConvexOnlineData({ client: clientOf(player) }),
    settle: () => runScheduled(t),
  };
}

describe('Ratings contract (Convex adapter on the real functions)', () => {
  for (const check of ratingsContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

/** `winner` beats `loser`: the loser resigns. */
async function win(t: Tester, winner: string, loser: string) {
  const code = await as(t, winner).mutation(api.invites.createInvite, GAME);
  const gameId = await as(t, loser).mutation(api.invites.acceptInvite, { code });
  await as(t, loser).mutation(api.games.resign, { gameId });
  await runScheduled(t);
}

describe('ratings on Convex', () => {
  it('counts the pair again on the next UTC day, in the same row', async () => {
    const t = await setup();
    for (let i = 0; i <= RATED_MATCHES_PER_PAIR_PER_DAY; i += 1) await win(t, ALICE, BOB);
    expect((await as(t, ALICE).query(api.ratings.myRating, {})).matches).toBe(
      RATED_MATCHES_PER_PAIR_PER_DAY,
    );
    vi.setSystemTime(START + DAY);
    await win(t, ALICE, BOB);
    expect((await as(t, ALICE).query(api.ratings.myRating, {})).matches).toBe(
      RATED_MATCHES_PER_PAIR_PER_DAY + 1,
    );
    const pairs = await t.run(async (ctx) => await ctx.db.query('ratedPairs').collect());
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.count).toBe(1);
  });

  it('keeps no row for a guest, and keeps the rating unrounded', async () => {
    const t = await setup();
    await win(t, ALICE, GUEST);
    await win(t, ALICE, BOB);
    const rows = await t.run(async (ctx) => await ctx.db.query('ratings').collect());
    expect(rows.map((row) => row.playerId).sort()).toEqual([ALICE, BOB].sort());
    const alice = rows.find((row) => row.playerId === ALICE);
    expect(alice?.rating).toBeCloseTo(START_RATING + 10 * Math.sqrt(3), 10);
    expect(alice?.boardable).toBe(false);
  });

  it('deletes the rating at once and the pair counts in pages on an account delete', async () => {
    const t = await setup();
    await win(t, ALICE, BOB);
    // More pair rows than one page.
    await t.run(async (ctx) => {
      for (let i = 0; i < RATED_PAIR_DELETE_PAGE + 5; i += 1) {
        await ctx.db.insert('ratedPairs', { a: ALICE, b: `z${i}`, day: 0, count: 1 });
      }
    });
    await as(t, ALICE).mutation(api.account.deleteMyAccount, {});
    const ratings = await t.run(async (ctx) => await ctx.db.query('ratings').collect());
    expect(ratings.map((row) => row.playerId)).toEqual([BOB]);
    // The first page schedules the second.
    await runScheduled(t);
    expect(
      (await t.run(async (ctx) => await ctx.db.query('ratedPairs').collect())).length,
    ).toBeGreaterThan(0);
    await runScheduled(t);
    const pairs = await t.run(async (ctx) => await ctx.db.query('ratedPairs').collect());
    expect(pairs).toEqual([]);
  });

  it('keeps "has a username" in the board index, so the board never skips rows', async () => {
    const t = await setup();
    for (let i = 0; i < MIN_BOARD_MATCHES; i += 1) {
      await win(t, ALICE, i < RATED_MATCHES_PER_PAIR_PER_DAY ? BOB : CAROL);
    }
    const boardable = async () =>
      (
        await t.run(async (ctx) =>
          ctx.db
            .query('ratings')
            .withIndex('by_player', (q) => q.eq('playerId', ALICE))
            .first(),
        )
      )?.boardable;
    // Enough matches, but no username: not in the index.
    expect(await boardable()).toBe(false);
    await as(t, ALICE).mutation(api.usernames.setMyUsername, {
      name: 'AliceIndexed',
      acceptTerms: TERMS_VERSION,
      ageChecked: true,
    });
    expect(await boardable()).toBe(true);
    // The owner clears it: off the index again.
    await t.mutation(internal.usernames.clearUsername, { playerId: ALICE });
    expect(await boardable()).toBe(false);
    await t.mutation(internal.usernames.clearUsername, { playerId: ALICE, name: 'AliceAgain' });
    expect(await boardable()).toBe(true);
    // A rated match keeps it.
    await win(t, ALICE, CAROL);
    expect(await boardable()).toBe(true);
  });

  it('refuses a caller whose account is gone (a token outlives its user)', async () => {
    const t = await setup();
    await expect(as(t, 'no-such-user').query(api.ratings.myRating, {})).rejects.toMatchObject({
      data: { code: 'NOT_SIGNED_IN' },
    });
  });
});

// The adapter names the functions itself (`RATING_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

type Api = typeof api.ratings;
type Fns = RatingFunctions;

/** The adapter's arguments fit the server, and the server's result fits the adapter. */
type Fits<K extends keyof Fns> =
  Extends<FunctionArgs<Fns[K]>, FunctionArgs<Api[K]>> extends true
    ? Extends<FunctionReturnType<Api[K]>, FunctionReturnType<Fns[K]>>
    : false;

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(RATING_FUNCTION_NAMES) as (keyof RatingFunctions)[]) {
      expect(getFunctionName(RATING_FUNCTIONS[key])).toBe(getFunctionName(api.ratings[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    expectType<Fits<'myRating'>>();
    expectType<Fits<'friendsBoard'>>();
    expectType<Fits<'globalBoard'>>();
    expectType<Fits<'setShowOnBoard'>>();
  });
});
