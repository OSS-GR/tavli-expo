// Play ranked (#531): the Convex adapter (`createConvexMatchmaking` in
// `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Matchmaking` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: the scheduled jobs (the matching chain, the expiry, the
// forget), and the guest move.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MATCH_FUNCTIONS,
  MATCH_FUNCTION_NAMES,
  createConvexGameTransport,
  createConvexInvites,
  createConvexMatchmaking,
  createConvexOnlineData,
  createConvexSafety,
} from '@tavli/backend-convex';
import type { MatchFunctions } from '@tavli/backend-convex';
import {
  MATCHED_SEEK_KEEP_MS,
  RANKED_GAMES,
  SEEK_RANGE_GROW_MS,
  SEEK_TTL_MS,
  createRecordingPushProvider,
} from '@tavli/contracts';
import { matchmakingContract } from '@tavli/contracts/testing';
import type {
  MatchmakingContractPlayer,
  MatchmakingContractSubject,
} from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import { MATCH_TICK_MS } from './matchmaking';
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

const START = Date.UTC(2026, 10, 13, 12, 0, 0);

beforeEach(() => {
  // The delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Seeks schedule their jobs and games a turn timer: fake timers run
  // them only when a test moves the clock.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Moves the clock by `ms` and runs the functions scheduled by then. */
async function passTime(t: Tester, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

async function contractSubject(): Promise<MatchmakingContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { alice: ALICE, bob: BOB, carol: CAROL, guest: GUEST } as const;
  const clientOf = (player: MatchmakingContractPlayer) => network.clientFor(ids[player]);
  return {
    idOf: (player) => ids[player],
    matchmakingFor: (player) =>
      createConvexMatchmaking({
        client: network.clientFor(player === null ? null : ids[player]),
      }),
    gamesFor: (player) => createConvexGameTransport({ client: clientOf(player) }),
    invitesFor: (player) => createConvexInvites({ client: clientOf(player) }),
    safetyFor: (player) => createConvexSafety({ client: clientOf(player) }),
    onlineDataFor: (player) => createConvexOnlineData({ client: clientOf(player) }),
    setRating: async (player, rating) => {
      const playerId = ids[player];
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query('ratings')
          .withIndex('by_player', (q) => q.eq('playerId', playerId))
          .first();
        if (row === null) {
          await ctx.db.insert('ratings', {
            playerId,
            rating,
            experience: 0,
            matches: 0,
            shown: true,
            boardable: false,
          });
        } else {
          await ctx.db.patch(row._id, { rating });
        }
      });
    },
    advance: async (ms) => {
      await passTime(t, ms);
      await network.refreshAll();
    },
    runMatching: async () => {
      await passTime(t, 0);
      for (const game of RANKED_GAMES) await t.mutation(internal.matchmaking.matchGame, { game });
      await network.refreshAll();
    },
  };
}

describe('Matchmaking contract (Convex adapter on the real functions)', () => {
  for (const check of matchmakingContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

async function seekRows(t: Tester) {
  return await t.run(async (ctx) => await ctx.db.query('seeks').collect());
}

describe('matchmaking on Convex', () => {
  it('matches on the scheduled job as the range grows, then stops the job', async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert('ratings', {
        playerId: BOB,
        rating: 1600,
        experience: 0,
        matches: 0,
        shown: true,
        boardable: false,
      });
    });
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'portes' });
    await as(t, BOB).mutation(api.matchmaking.seek, { game: 'portes' });
    expect((await as(t, ALICE).query(api.matchmaking.mySeek, {})).kind).toBe('waiting');
    // 100 apart: the job matches them once both ranges reach 100.
    for (let waited = 0; waited < SEEK_RANGE_GROW_MS; waited += MATCH_TICK_MS) {
      await passTime(t, MATCH_TICK_MS);
      if ((await as(t, ALICE).query(api.matchmaking.mySeek, {})).kind === 'matched') break;
    }
    const alice = await as(t, ALICE).query(api.matchmaking.mySeek, {});
    const bob = await as(t, BOB).query(api.matchmaking.mySeek, {});
    expect(alice.kind).toBe('matched');
    expect(bob).toMatchObject({ kind: 'matched', me: { rating: 1600 } });
    expect(alice).toMatchObject({ opponent: { rating: 1600 }, me: { rating: 1500 } });
  });

  it('stops the job once the range is at its widest; nothing runs with no seek', async () => {
    const t = await setup();
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'fevga' });
    await passTime(t, SEEK_RANGE_GROW_MS + MATCH_TICK_MS);
    // Only the expiry is left.
    const left = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.state.kind === 'pending',
      ),
    );
    expect(left.map((job) => job.name)).toEqual(['matchmaking:expireSeek']);
    await passTime(t, SEEK_TTL_MS);
    expect(await seekRows(t)).toEqual([]);
  });

  it('pushes White, the older seek, when the match starts', async () => {
    const t = await setup();
    const push = createRecordingPushProvider();
    setPushProvider(push);
    for (const [id, token] of [
      [ALICE, 'ExponentPushToken[alice-phone]'],
      [BOB, 'ExponentPushToken[bob-phone]'],
    ] as const) {
      await as(t, id).mutation(api.push.registerPushToken, { token, platform: 'ios' });
    }
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'portes' });
    await as(t, BOB).mutation(api.matchmaking.seek, { game: 'portes' });
    expect((await as(t, ALICE).query(api.matchmaking.mySeek, {})).kind).toBe('matched');
    await passTime(t, 0);
    // The opening waits for White's die: Alice hears, Bob is in the app.
    expect(push.sent.map((message) => message.to)).toEqual(['ExponentPushToken[alice-phone]']);
  });

  it('keeps a matched seek for a while, then forgets it; the game goes on', async () => {
    const t = await setup();
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'plakoto' });
    await as(t, BOB).mutation(api.matchmaking.seek, { game: 'plakoto' });
    const mine = await as(t, ALICE).query(api.matchmaking.mySeek, {});
    if (mine.kind !== 'matched') throw new Error('no match');
    // The waiting seek's expiry finds a matched row and leaves it.
    await passTime(t, SEEK_TTL_MS);
    expect((await as(t, ALICE).query(api.matchmaking.mySeek, {})).kind).toBe('matched');
    await passTime(t, MATCHED_SEEK_KEEP_MS - SEEK_TTL_MS);
    expect(await seekRows(t)).toEqual([]);
    expect(await as(t, ALICE).query(api.matchmaking.mySeek, {})).toEqual({ kind: 'none' });
  });

  it('never lets an old job end a new seek', async () => {
    const t = await setup();
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'portes' });
    await passTime(t, SEEK_TTL_MS - 1000);
    // Another game replaces the seek; the old expiry runs on a gone row.
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'tavli' });
    await passTime(t, 2000);
    expect(await as(t, ALICE).query(api.matchmaking.mySeek, {})).toMatchObject({
      kind: 'waiting',
      game: 'tavli',
    });
  });

  it('shows a waiting seek as none at its time, before the expiry runs', async () => {
    const t = await setup();
    await as(t, ALICE).mutation(api.matchmaking.seek, { game: 'portes' });
    vi.setSystemTime(START + SEEK_TTL_MS);
    expect(await as(t, ALICE).query(api.matchmaking.mySeek, {})).toEqual({ kind: 'none' });
    expect((await as(t, BOB).query(api.matchmaking.lookingCounts, {})).portes).toBe(0);
  });

  it('refuses a caller whose account is gone (a token outlives its user)', async () => {
    const t = await setup();
    await expect(
      as(t, 'no-such-user').mutation(api.matchmaking.seek, { game: 'portes' }),
    ).rejects.toMatchObject({ data: { code: 'NOT_SIGNED_IN' } });
  });

  it('a guest move deletes any seek row of the guest', async () => {
    const t = await setup();
    // A guest cannot seek; a row made by hand stands for one left over.
    await t.run(async (ctx) => {
      await ctx.db.insert('seeks', {
        playerId: GUEST,
        game: 'portes',
        rating: 1500,
        createdAt: Date.now(),
        status: 'waiting',
      });
    });
    await t.mutation(internal.guestMove.startGuestMove, { source: GUEST, target: ALICE });
    expect(await seekRows(t)).toEqual([]);
  });
});

// The adapter names the functions itself (`MATCH_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

type Api = typeof api.matchmaking;
type Fns = MatchFunctions;

/** The adapter's arguments fit the server, and the server's result fits the adapter. */
type Fits<K extends keyof Fns> =
  Extends<FunctionArgs<Fns[K]>, FunctionArgs<Api[K]>> extends true
    ? Extends<FunctionReturnType<Api[K]>, FunctionReturnType<Fns[K]>>
    : false;

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(MATCH_FUNCTION_NAMES) as (keyof MatchFunctions)[]) {
      expect(getFunctionName(MATCH_FUNCTIONS[key])).toBe(getFunctionName(api.matchmaking[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    expectType<Fits<'seek'>>();
    expectType<Fits<'cancelSeek'>>();
    expectType<Fits<'mySeek'>>();
    expectType<Fits<'lookingCounts'>>();
  });
});
