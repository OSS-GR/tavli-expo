// The Convex online data adapter (`createConvexOnlineData` in
// `@tavli/backend-convex`, #315) against the real `deleteMyAccount`
// (#302), offline. Fake Convex clients (`test.network.ts`) run each call
// through convex-test as one signed-in user. The `OnlineData` contract
// checks (`@tavli/contracts/testing`) then run on top, with the Convex
// games and invites adapters to read what the server keeps. The players
// are Better Auth users (`authUsers`): the delete removes the user.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_FUNCTIONS,
  ACCOUNT_FUNCTION_NAMES,
  createConvexGameTransport,
  createConvexInvites,
  createConvexOnlineData,
} from '@tavli/backend-convex';
import type { AccountFunctions } from '@tavli/backend-convex';
import { createRecordingPushProvider } from '@tavli/contracts';
import { onlineDataContract } from '@tavli/contracts/testing';
import type { OnlineDataContractSubject } from '@tavli/contracts/testing';

import { api } from './_generated/api';
import { setPushProvider } from './push';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules } from './test.setup';

// The players: new Better Auth users for each test, made by `setup()`.
let ALICE = '';
let BOB = '';

async function setup(): Promise<Tester> {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = ''] = await authUsers(t, 2);
  return t;
}

const START = Date.UTC(2026, 9, 28, 12, 0, 0);

beforeEach(() => {
  // The delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Every invite schedules its expiry, and every game a turn timer. Fake
  // timers keep those (and the scheduled pushes) from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function contractSubject(): Promise<OnlineDataContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { me: ALICE, friend: BOB } as const;
  return {
    dataFor: (player) =>
      createConvexOnlineData({ client: network.clientFor(player === null ? null : ids[player]) }),
    invitesFor: (player) => createConvexInvites({ client: network.clientFor(ids[player]) }),
    gamesFor: (player) => createConvexGameTransport({ client: network.clientFor(ids[player]) }),
  };
}

describe('OnlineData contract (Convex adapter on the real functions)', () => {
  for (const check of onlineDataContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

describe('the adapter on the real functions', () => {
  it('deletes the push tokens too', async () => {
    const t = await setup();
    const network = convexTestNetwork(t);
    await t
      .withIdentity({ subject: ALICE })
      .mutation(api.push.registerPushToken, { token: 'ExponentPushToken[a]', platform: 'ios' });
    await createConvexOnlineData({ client: network.clientFor(ALICE) }).deleteMyData();
    expect(await t.run((ctx) => ctx.db.query('pushTokens').collect())).toEqual([]);
  });
});

// The adapter names the function itself (`ACCOUNT_FUNCTIONS`). It must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the function of the server api', () => {
    expect(ACCOUNT_FUNCTION_NAMES).toEqual({
      deleteMyAccount: getFunctionName(api.account.deleteMyAccount),
    });
    for (const key of Object.keys(ACCOUNT_FUNCTION_NAMES) as (keyof AccountFunctions)[]) {
      expect(getFunctionName(ACCOUNT_FUNCTIONS[key])).toBe(getFunctionName(api.account[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.account;
    type Fns = AccountFunctions;
    expectType<
      Extends<FunctionArgs<Fns['deleteMyAccount']>, FunctionArgs<Api['deleteMyAccount']>>
    >();
    expectType<
      Extends<
        FunctionReturnType<Api['deleteMyAccount']>,
        FunctionReturnType<Fns['deleteMyAccount']>
      >
    >();
    // A wrong type fails: the checks above are not always true.
    // @ts-expect-error -- a number is not what the delete returns.
    expectType<Extends<number, FunctionReturnType<Fns['deleteMyAccount']>>>();
  });
});
