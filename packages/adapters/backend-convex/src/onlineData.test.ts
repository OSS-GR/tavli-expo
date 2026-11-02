// The online data adapter on a fake Convex client: the name, the
// arguments, and how errors map to the port. The contract checks against
// the real Convex function run in `apps/server`
// (`convex/convexOnlineData.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_FUNCTIONS, ACCOUNT_FUNCTION_NAMES } from './functions';
import { createConvexOnlineData } from './onlineData';
import type { ConvexOnlineDataClient } from './onlineData';

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { name: string; args: unknown }[] = [];
  const client: ConvexOnlineDataClient = {
    mutation: (fn, args) => {
      calls.push({ name: getFunctionName(fn), args });
      return answer() as never;
    },
  };
  return { client, calls };
}

describe('createConvexOnlineData', () => {
  it('names the account function', () => {
    expect(ACCOUNT_FUNCTION_NAMES).toEqual({ deleteMyAccount: 'account:deleteMyAccount' });
    expect(getFunctionName(ACCOUNT_FUNCTIONS.deleteMyAccount)).toBe('account:deleteMyAccount');
  });

  it('calls deleteMyAccount with no arguments: never a player id', async () => {
    const { client, calls } = fakeClient();
    await expect(createConvexOnlineData({ client }).deleteMyData()).resolves.toBeUndefined();
    expect(calls).toEqual([{ name: 'account:deleteMyAccount', args: {} }]);
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'NOT_SIGNED_IN', message: 'this account does not exist' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const reason = await createConvexOnlineData({ client })
      .deleteMyData()
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(reason).toEqual(data);
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('keeps any other error as it is', async () => {
    const network = new Error('offline');
    const { client } = fakeClient(() => Promise.reject(network));
    await expect(createConvexOnlineData({ client }).deleteMyData()).rejects.toBe(network);
  });
});
