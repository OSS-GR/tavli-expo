// Block and report (#320): the Convex adapter (`createConvexSafety` in
// `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Safety` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: the caps, what a report row keeps, and the paged
// account delete.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SAFETY_FUNCTIONS,
  SAFETY_FUNCTION_NAMES,
  createConvexGameTransport,
  createConvexInvites,
  createConvexOnlineData,
  createConvexSafety,
} from '@tavli/backend-convex';
import type { SafetyFunctions } from '@tavli/backend-convex';
import {
  MAX_BLOCKS,
  MAX_REPORTS_PER_DAY,
  REPORT_WINDOW_MS,
  TERMS_VERSION,
  createRecordingPushProvider,
} from '@tavli/contracts';
import { safetyContract } from '@tavli/contracts/testing';
import type { SafetyContractSubject } from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import { setPushProvider } from './push';
import { SAFETY_DELETE_PAGE } from './safety';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules } from './test.setup';

// The players, made by `setup()`.
let ALICE = '';
let BOB = '';
let CAROL = '';

async function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = '', CAROL = ''] = await authUsers(t, 3, true);
  return t;
}

/** The tester with this schema's tables (`Tester` has none). */
type SchemaTester = Awaited<ReturnType<typeof setup>>;

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
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

/** Runs the functions scheduled now (the pages of an account delete). */
async function runScheduled(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

async function contractSubject(): Promise<SafetyContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { alice: ALICE, bob: BOB, carol: CAROL } as const;
  return {
    idOf: (player) => ids[player],
    safetyFor: (player) =>
      createConvexSafety({ client: network.clientFor(player === null ? null : ids[player]) }),
    invitesFor: (player) => createConvexInvites({ client: network.clientFor(ids[player]) }),
    gamesFor: (player) => createConvexGameTransport({ client: network.clientFor(ids[player]) }),
    onlineDataFor: (player) => createConvexOnlineData({ client: network.clientFor(ids[player]) }),
    settle: () => runScheduled(t),
  };
}

describe('Safety contract (Convex adapter on the real functions)', () => {
  for (const check of safetyContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

/** `from` invites `to`, and `to` declines: now they met. */
async function meet(t: Tester, from: string, to: string) {
  const code = await as(t, from).mutation(api.invites.createInvite, GAME);
  await as(t, to).mutation(api.invites.declineInvite, { code });
}

async function rows(t: SchemaTester) {
  return await t.run(async (ctx) => ({
    blocks: await ctx.db.query('blocks').collect(),
    reports: await ctx.db.query('reports').collect(),
  }));
}

describe('block and report on the Convex server', () => {
  it('a report row keeps the reason and the username at the time, and no more', async () => {
    const t = await setup();
    await as(t, BOB).mutation(api.usernames.setMyUsername, {
      name: 'BadName',
      acceptTerms: TERMS_VERSION,
      ageChecked: true,
    });
    await meet(t, BOB, ALICE);
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'name' });
    await as(t, BOB).mutation(api.usernames.setMyUsername, { name: 'Nicer' });
    // A second report of a kept one adds no row.
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'other' });
    const { reports, blocks } = await rows(t);
    expect(
      reports.map(({ reporterId, reportedId, reason, username, createdAt }) => ({
        reporterId,
        reportedId,
        reason,
        username,
        createdAt,
      })),
    ).toEqual([
      { reporterId: ALICE, reportedId: BOB, reason: 'name', username: 'BadName', createdAt: START },
    ]);
    expect(blocks.map((row) => [row.blockerId, row.blockedId])).toEqual([[ALICE, BOB]]);
  });

  it('a guest report keeps no username; after the owner deletes it, a new report may come', async () => {
    const t = await setup();
    await meet(t, BOB, ALICE);
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'cheating' });
    const [first] = (await rows(t)).reports;
    expect(first?.username).toBeUndefined();
    // The owner deletes the row in the dashboard after the review.
    await t.run((ctx) => ctx.db.delete(first!._id));
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'harassment' });
    expect((await rows(t)).reports.map((row) => row.reason)).toEqual(['harassment']);
  });

  it('caps reports per day and counts only the last 24 hours', async () => {
    const t = await setup();
    const others = await authUsers(t, MAX_REPORTS_PER_DAY + 1, true);
    for (const other of others) await meet(t, other, ALICE);
    for (const other of others.slice(0, MAX_REPORTS_PER_DAY)) {
      await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: other, reason: 'other' });
    }
    const last = { playerId: others[MAX_REPORTS_PER_DAY]!, reason: 'other' };
    await expect(as(t, ALICE).mutation(api.safety.reportPlayer, last)).rejects.toMatchObject({
      data: { code: 'TOO_MANY_REPORTS' },
    });
    vi.advanceTimersByTime(REPORT_WINDOW_MS);
    await as(t, ALICE).mutation(api.safety.reportPlayer, last);
    expect((await rows(t)).reports).toHaveLength(MAX_REPORTS_PER_DAY + 1);
  });

  it('caps blocks at MAX_BLOCKS', async () => {
    const t = await setup();
    // Rows put in directly: making MAX_BLOCKS real users is slow.
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_BLOCKS; i += 1) {
        await ctx.db.insert('blocks', { blockerId: ALICE, blockedId: `p${i}`, createdAt: START });
      }
    });
    await meet(t, BOB, ALICE);
    await expect(
      as(t, ALICE).mutation(api.safety.blockPlayer, { playerId: BOB }),
    ).rejects.toMatchObject({ data: { code: 'TOO_MANY_BLOCKS' } });
    // A report still goes in with a full block list.
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'name' });
    const { reports, blocks } = await rows(t);
    expect(reports).toHaveLength(1);
    expect(blocks).toHaveLength(MAX_BLOCKS);
  });

  it('refuses a caller whose account is gone (a token outlives its user)', async () => {
    const t = await setup();
    await meet(t, BOB, ALICE);
    await expect(
      as(t, 'no-such-user').mutation(api.safety.blockPlayer, { playerId: BOB }),
    ).rejects.toMatchObject({ data: { code: 'NOT_SIGNED_IN' } });
  });

  it('the account delete removes blocks both ways and reports by and about the player, in pages', async () => {
    const t = await setup();
    await meet(t, BOB, ALICE);
    await meet(t, CAROL, BOB);
    await as(t, ALICE).mutation(api.safety.reportPlayer, { playerId: BOB, reason: 'name' });
    await as(t, BOB).mutation(api.safety.reportPlayer, { playerId: CAROL, reason: 'other' });
    await meet(t, CAROL, ALICE);
    await as(t, ALICE).mutation(api.safety.blockPlayer, { playerId: CAROL });
    // More rows than one page: others who blocked Bob.
    await t.run(async (ctx) => {
      for (let i = 0; i < SAFETY_DELETE_PAGE + 5; i += 1) {
        await ctx.db.insert('blocks', { blockerId: `p${i}`, blockedId: BOB, createdAt: START });
      }
    });
    await as(t, BOB).mutation(api.account.deleteMyAccount, {});
    // Runs each page, and the page it schedules.
    await runScheduled(t);
    await runScheduled(t);
    const left = await rows(t);
    expect(left.blocks.map((row) => [row.blockerId, row.blockedId])).toEqual([[ALICE, CAROL]]);
    expect(left.reports).toEqual([]);
  });

  it('deleteSafetyRows schedules the next page only while a page is full', async () => {
    const t = await setup();
    await t.mutation(internal.safety.deleteSafetyRows, { playerId: BOB });
    await runScheduled(t);
    expect(await rows(t)).toEqual({ blocks: [], reports: [] });
  });
});

// The adapter names the functions itself (`SAFETY_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(SAFETY_FUNCTION_NAMES) as (keyof SafetyFunctions)[]) {
      expect(getFunctionName(SAFETY_FUNCTIONS[key])).toBe(getFunctionName(api.safety[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.safety;
    type Fns = SafetyFunctions;
    expectType<Extends<FunctionArgs<Fns['blockPlayer']>, FunctionArgs<Api['blockPlayer']>>>();
    expectType<Extends<FunctionArgs<Fns['unblockPlayer']>, FunctionArgs<Api['unblockPlayer']>>>();
    expectType<Extends<FunctionArgs<Fns['listMyBlocks']>, FunctionArgs<Api['listMyBlocks']>>>();
    expectType<Extends<FunctionArgs<Fns['reportPlayer']>, FunctionArgs<Api['reportPlayer']>>>();
    expectType<
      Extends<FunctionReturnType<Api['listMyBlocks']>, FunctionReturnType<Fns['listMyBlocks']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['blockPlayer']>, FunctionReturnType<Fns['blockPlayer']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['reportPlayer']>, FunctionReturnType<Fns['reportPlayer']>>
    >();
    // @ts-expect-error -- a number is not what the call returns.
    expectType<Extends<number, FunctionReturnType<Fns['listMyBlocks']>>>();
  });
});
