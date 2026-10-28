// The Convex push tokens adapter (`createConvexPushTokens` in
// `@tavli/backend-convex`, #285) against the real Convex functions,
// offline. Fake Convex clients (`test.network.ts`) run each call through
// convex-test as one signed-in user. The `PushTokens` contract checks
// (`@tavli/contracts/testing`) then run on top. No push is sent: only
// the token calls run. The players are Better Auth users (`authUsers`):
// `registerPushToken` checks that the account exists (#306, #307).

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { PUSH_FUNCTIONS, PUSH_FUNCTION_NAMES, createConvexPushTokens } from '@tavli/backend-convex';
import type { PushFunctions } from '@tavli/backend-convex';
import { pushTokensContract } from '@tavli/contracts/testing';
import type { PushTokensContractSubject } from '@tavli/contracts/testing';

import { api } from './_generated/api';
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

/** The tokens the server keeps for `playerId`. */
async function savedFor(t: Tester, playerId: string): Promise<string[]> {
  const rows = await t.run((ctx) => ctx.db.query('pushTokens').collect());
  return rows.filter((row) => row.playerId === playerId).map((row) => row.token);
}

async function contractSubject(): Promise<PushTokensContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { me: ALICE, other: BOB } as const;
  return {
    tokensFor: (player) =>
      createConvexPushTokens({ client: network.clientFor(player === null ? null : ids[player]) }),
    token: (i) => `ExponentPushToken[phone-${i}]`,
    savedFor: (player) => savedFor(t, ids[player]),
  };
}

describe('PushTokens contract (Convex adapter on the real functions)', () => {
  for (const check of pushTokensContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

describe('the adapter on the real functions', () => {
  it('saves the platform the app sends', async () => {
    const t = await setup();
    const network = convexTestNetwork(t);
    await createConvexPushTokens({ client: network.clientFor(ALICE) }).register(
      'ExponentPushToken[a]',
      'android',
    );
    const rows = await t.run((ctx) => ctx.db.query('pushTokens').collect());
    expect(rows.map(({ playerId, token, platform }) => ({ playerId, token, platform }))).toEqual([
      { playerId: ALICE, token: 'ExponentPushToken[a]', platform: 'android' },
    ]);
  });

  it('a deleted (or never made) account cannot register a token', async () => {
    const t = await setup();
    const network = convexTestNetwork(t);
    const reason = await createConvexPushTokens({ client: network.clientFor('nobody') })
      .register('ExponentPushToken[a]', 'ios')
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(reason).toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(await t.run((ctx) => ctx.db.query('pushTokens').collect())).toEqual([]);
  });

  it('a platform that is not one fails argument validation: a plain error, not port data', async () => {
    const network = convexTestNetwork(await setup());
    const tokens = createConvexPushTokens({ client: network.clientFor(ALICE) });
    const reason = await tokens.register('ExponentPushToken[a]', 'web' as never).then(
      () => null,
      (error: unknown) => error,
    );
    expect(reason).toBeInstanceOf(Error);
  });
});

// The adapter names the functions itself (`PUSH_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    expect(PUSH_FUNCTION_NAMES).toEqual({
      registerPushToken: getFunctionName(api.push.registerPushToken),
      removePushToken: getFunctionName(api.push.removePushToken),
    });
    for (const key of Object.keys(PUSH_FUNCTION_NAMES) as (keyof PushFunctions)[]) {
      expect(getFunctionName(PUSH_FUNCTIONS[key])).toBe(getFunctionName(api.push[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.push;
    type Fns = PushFunctions;
    expectType<
      Extends<FunctionArgs<Fns['registerPushToken']>, FunctionArgs<Api['registerPushToken']>>
    >();
    expectType<
      Extends<FunctionArgs<Fns['removePushToken']>, FunctionArgs<Api['removePushToken']>>
    >();
    expectType<
      Extends<
        FunctionReturnType<Api['registerPushToken']>,
        FunctionReturnType<Fns['registerPushToken']>
      >
    >();
    expectType<
      Extends<
        FunctionReturnType<Api['removePushToken']>,
        FunctionReturnType<Fns['removePushToken']>
      >
    >();
    // A wrong type fails: the checks above are not always true.
    // @ts-expect-error -- a number is not what remove returns.
    expectType<Extends<number, FunctionReturnType<Fns['removePushToken']>>>();
  });
});
