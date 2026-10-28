// The push tokens adapter on a fake Convex client: names, arguments, and
// how errors map to the port. The contract checks against the real Convex
// functions run in `apps/server` (`convex/convexPushTokens.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { PUSH_FUNCTIONS, PUSH_FUNCTION_NAMES } from './functions';
import { createConvexPushTokens } from './pushTokens';
import type { ConvexPushTokensClient } from './pushTokens';

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { name: string; args: unknown }[] = [];
  const client: ConvexPushTokensClient = {
    mutation: (fn, args) => {
      calls.push({ name: getFunctionName(fn), args });
      return answer() as never;
    },
  };
  return { client, calls };
}

const TOKEN = 'ExponentPushToken[abc]';

describe('createConvexPushTokens', () => {
  it('names the push functions', () => {
    expect(PUSH_FUNCTION_NAMES).toEqual({
      registerPushToken: 'push:registerPushToken',
      removePushToken: 'push:removePushToken',
    });
    expect(getFunctionName(PUSH_FUNCTIONS.registerPushToken)).toBe('push:registerPushToken');
    expect(getFunctionName(PUSH_FUNCTIONS.removePushToken)).toBe('push:removePushToken');
  });

  it('sends the token and the platform, and only those', async () => {
    const { client, calls } = fakeClient();
    const tokens = createConvexPushTokens({ client });
    await expect(tokens.register(TOKEN, 'android')).resolves.toBeUndefined();
    await expect(tokens.remove(TOKEN)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { name: 'push:registerPushToken', args: { token: TOKEN, platform: 'android' } },
      { name: 'push:removePushToken', args: { token: TOKEN } },
    ]);
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'NOT_SIGNED_IN', message: 'sign in first' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const tokens = createConvexPushTokens({ client });
    const reason = await tokens.remove(TOKEN).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(reason).toEqual(data);
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('keeps any other error as it is', async () => {
    const network = new Error('offline');
    const { client } = fakeClient(() => Promise.reject(network));
    await expect(createConvexPushTokens({ client }).register(TOKEN, 'ios')).rejects.toBe(network);
  });
});
