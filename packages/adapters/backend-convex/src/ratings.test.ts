// The ratings adapter on a fake Convex client: the names, the arguments,
// and how errors map to the port. The contract checks against the real
// Convex functions run in `apps/server` (`convex/convexRatings.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { RATING_FUNCTIONS, RATING_FUNCTION_NAMES } from './functions';
import { createConvexRatings } from './ratings';
import type { ConvexRatingsClient } from './ratings';

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const client: ConvexRatingsClient = {
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

describe('createConvexRatings', () => {
  it('names every function in ratings.ts', () => {
    for (const [key, name] of Object.entries(RATING_FUNCTION_NAMES)) {
      expect(name).toBe(`ratings:${key}`);
      expect(getFunctionName(RATING_FUNCTIONS[key as keyof typeof RATING_FUNCTIONS])).toBe(name);
    }
  });

  it('never sends the caller', async () => {
    const { client, calls } = fakeClient();
    const ratings = createConvexRatings({ client });
    await ratings.mine();
    await ratings.friendsBoard();
    await ratings.globalBoard();
    await expect(ratings.setShown(false)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { kind: 'query', name: 'ratings:myRating', args: {} },
      { kind: 'query', name: 'ratings:friendsBoard', args: {} },
      { kind: 'query', name: 'ratings:globalBoard', args: {} },
      { kind: 'mutation', name: 'ratings:setShowOnBoard', args: { shown: false } },
    ]);
  });

  it('turns a server error into its data, and keeps any other error', async () => {
    const server = new ConvexError({ code: 'NOT_SAVED', message: 'save first' });
    await expect(
      createConvexRatings({ client: fakeClient(() => Promise.reject(server)).client }).mine(),
    ).rejects.toEqual({ code: 'NOT_SAVED', message: 'save first' });
    const network = new Error('offline');
    await expect(
      createConvexRatings({ client: fakeClient(() => Promise.reject(network)).client }).mine(),
    ).rejects.toBe(network);
  });
});
