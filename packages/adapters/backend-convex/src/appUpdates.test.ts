// The update policy adapter on a fake Convex client: the name and the
// arguments. The check against the real Convex query runs in `apps/server`
// (`convex/convexAppUpdates.test.ts`).

import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { createConvexAppUpdates } from './appUpdates';
import type { ConvexAppUpdatesClient } from './appUpdates';
import { APP_UPDATE_FUNCTIONS, APP_UPDATE_FUNCTION_NAMES } from './functions';

function fakeClient(answer: () => Promise<unknown>) {
  const calls: { name: string; args: unknown }[] = [];
  const client: ConvexAppUpdatesClient = {
    query: (fn, args) => {
      calls.push({ name: getFunctionName(fn), args });
      return answer() as never;
    },
  };
  return { client, calls };
}

describe('createConvexAppUpdates', () => {
  it('names the update policy query', () => {
    expect(APP_UPDATE_FUNCTION_NAMES).toEqual({ updatePolicy: 'appUpdate:updatePolicy' });
    expect(getFunctionName(APP_UPDATE_FUNCTIONS.updatePolicy)).toBe('appUpdate:updatePolicy');
  });

  it('sends the phone system only, and resolves with a copy of the policy', async () => {
    const policy = { minBuild: 13, force: true, updateUrl: 'itms-beta://', extra: 1 };
    const { client, calls } = fakeClient(() => Promise.resolve(policy));
    await expect(createConvexAppUpdates({ client }).updatePolicy('android')).resolves.toEqual({
      minBuild: 13,
      force: true,
      updateUrl: 'itms-beta://',
    });
    expect(calls).toEqual([{ name: 'appUpdate:updatePolicy', args: { platform: 'android' } }]);
  });

  it('rejects when the call fails', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('offline')));
    await expect(createConvexAppUpdates({ client }).updatePolicy('ios')).rejects.toThrow('offline');
  });
});
