// The usernames adapter on a fake Convex client: the names, the
// arguments, and how errors map to the port. The contract checks against
// the real Convex functions run in `apps/server`
// (`convex/convexUsernames.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { USERNAME_FUNCTIONS, USERNAME_FUNCTION_NAMES } from './functions';
import { createConvexUsernames } from './usernames';
import type { ConvexUsernamesClient } from './usernames';

const MINE = {
  saved: true,
  name: 'Alex',
  nextChangeAt: null,
  ageChecked: true,
  termsVersion: '2026-11-09',
};

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(MINE)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const client: ConvexUsernamesClient = {
    query: (fn, args) => {
      calls.push({ kind: 'query', name: getFunctionName(fn), args });
      return answer() as never;
    },
    mutation: (fn, args) => {
      calls.push({ kind: 'mutation', name: getFunctionName(fn), args });
      return answer() as never;
    },
  };
  return { client, calls };
}

describe('createConvexUsernames', () => {
  it('names the username functions', () => {
    expect(USERNAME_FUNCTION_NAMES).toEqual({
      getMyUsername: 'usernames:getMyUsername',
      setMyUsername: 'usernames:setMyUsername',
    });
    expect(getFunctionName(USERNAME_FUNCTIONS.setMyUsername)).toBe('usernames:setMyUsername');
  });

  it('sends no player id, and only the answers given', async () => {
    const { client, calls } = fakeClient();
    const usernames = createConvexUsernames({ client });
    await expect(usernames.mine()).resolves.toEqual(MINE);
    await usernames.setMine({ name: 'Alex' });
    await usernames.setMine({ name: 'Alex', acceptTerms: '2026-11-09', ageChecked: true });
    expect(calls).toEqual([
      { kind: 'query', name: 'usernames:getMyUsername', args: {} },
      { kind: 'mutation', name: 'usernames:setMyUsername', args: { name: 'Alex' } },
      {
        kind: 'mutation',
        name: 'usernames:setMyUsername',
        args: { name: 'Alex', acceptTerms: '2026-11-09', ageChecked: true },
      },
    ]);
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'TAKEN', message: 'another player has this name' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const reason = await createConvexUsernames({ client })
      .setMine({ name: 'Alex' })
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
    await expect(createConvexUsernames({ client }).mine()).rejects.toBe(network);
  });
});
