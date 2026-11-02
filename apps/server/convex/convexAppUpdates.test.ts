// "Update needed" (#390): the `updatePolicy` query, and the Convex
// adapter (`createConvexAppUpdates` in `@tavli/backend-convex`) on it,
// offline. The query reads the deployment's env vars and needs no
// sign-in: an old build may have no session.

import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APP_UPDATE_FUNCTIONS,
  APP_UPDATE_FUNCTION_NAMES,
  createConvexAppUpdates,
} from '@tavli/backend-convex';
import type { AppUpdateFunctions } from '@tavli/backend-convex';

import { api } from './_generated/api';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import { modules } from './test.setup';

const UPDATE_VARS = [
  'MIN_APP_BUILD_IOS',
  'MIN_APP_BUILD_ANDROID',
  'FORCE_APP_UPDATE',
  'APP_UPDATE_URL_IOS',
  'APP_UPDATE_URL_ANDROID',
] as const;

/** No update env var set, whatever the machine has. */
function clearUpdateVars(): void {
  for (const name of UPDATE_VARS) vi.stubEnv(name, undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('updatePolicy', () => {
  it('blocks no build when no env var is set', async () => {
    clearUpdateVars();
    const t = convexTest(schema, modules);
    const none = { minBuild: null, force: false, updateUrl: null };
    expect(await t.query(api.appUpdate.updatePolicy, { platform: 'ios' })).toEqual(none);
    expect(await t.query(api.appUpdate.updatePolicy, { platform: 'android' })).toEqual(none);
  });

  it('answers the env vars of each phone system, with nobody signed in', async () => {
    clearUpdateVars();
    vi.stubEnv('MIN_APP_BUILD_IOS', '13');
    vi.stubEnv('MIN_APP_BUILD_ANDROID', '4');
    vi.stubEnv('FORCE_APP_UPDATE', 'true');
    vi.stubEnv(
      'APP_UPDATE_URL_ANDROID',
      'https://play.google.com/store/apps/details?id=com.tavlaki',
    );
    const t = convexTest(schema, modules);
    expect(await t.query(api.appUpdate.updatePolicy, { platform: 'ios' })).toEqual({
      minBuild: 13,
      force: true,
      updateUrl: null,
    });
    expect(await t.query(api.appUpdate.updatePolicy, { platform: 'android' })).toEqual({
      minBuild: 4,
      force: true,
      updateUrl: 'https://play.google.com/store/apps/details?id=com.tavlaki',
    });
  });

  it('takes only the phone system', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.appUpdate.updatePolicy, { platform: 'web' as 'ios' }),
    ).rejects.toThrow();
    await expect(
      t.query(api.appUpdate.updatePolicy, { platform: 'ios', playerId: 'x' } as never),
    ).rejects.toThrow();
  });

  it('works through the Convex adapter, signed in or not', async () => {
    clearUpdateVars();
    vi.stubEnv('MIN_APP_BUILD_IOS', '13');
    const t = convexTest(schema, modules);
    const network = convexTestNetwork(t);
    const policy = { minBuild: 13, force: false, updateUrl: null };
    for (const subject of [null, 'someone']) {
      const updates = createConvexAppUpdates({ client: network.clientFor(subject) });
      await expect(updates.updatePolicy('ios')).resolves.toEqual(policy);
    }
  });
});

// The adapter names the query itself (`APP_UPDATE_FUNCTIONS`). It must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the query of the server api', () => {
    expect(APP_UPDATE_FUNCTION_NAMES).toEqual({
      updatePolicy: getFunctionName(api.appUpdate.updatePolicy),
    });
    expect(getFunctionName(APP_UPDATE_FUNCTIONS.updatePolicy)).toBe(
      getFunctionName(api.appUpdate.updatePolicy),
    );
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.appUpdate;
    type Fns = AppUpdateFunctions;
    expectType<Extends<FunctionArgs<Fns['updatePolicy']>, FunctionArgs<Api['updatePolicy']>>>();
    expectType<
      Extends<FunctionReturnType<Api['updatePolicy']>, FunctionReturnType<Fns['updatePolicy']>>
    >();
    // A wrong type fails: the checks above are not always true.
    // @ts-expect-error -- a number is not the policy.
    expectType<Extends<number, FunctionReturnType<Fns['updatePolicy']>>>();
  });
});
