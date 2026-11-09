// The block and report adapter on a fake Convex client: the names, the
// arguments, and how errors map to the port. The contract checks against
// the real Convex functions run in `apps/server`
// (`convex/convexSafety.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { SAFETY_FUNCTIONS, SAFETY_FUNCTION_NAMES } from './functions';
import { createConvexSafety } from './safety';
import type { ConvexSafetyClient } from './safety';

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const client: ConvexSafetyClient = {
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

describe('createConvexSafety', () => {
  it('names the block and report functions', () => {
    expect(SAFETY_FUNCTION_NAMES).toEqual({
      blockPlayer: 'safety:blockPlayer',
      unblockPlayer: 'safety:unblockPlayer',
      listMyBlocks: 'safety:listMyBlocks',
      reportPlayer: 'safety:reportPlayer',
    });
    expect(getFunctionName(SAFETY_FUNCTIONS.reportPlayer)).toBe('safety:reportPlayer');
  });

  it('sends only the other player and the reason, never the caller', async () => {
    const { client, calls } = fakeClient();
    const safety = createConvexSafety({ client });
    await expect(safety.block('p2')).resolves.toBeUndefined();
    await expect(safety.unblock('p2')).resolves.toBeUndefined();
    await safety.listBlocked();
    await expect(safety.report({ playerId: 'p2', reason: 'name' })).resolves.toBeUndefined();
    expect(calls).toEqual([
      { kind: 'mutation', name: 'safety:blockPlayer', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'safety:unblockPlayer', args: { playerId: 'p2' } },
      { kind: 'query', name: 'safety:listMyBlocks', args: {} },
      { kind: 'mutation', name: 'safety:reportPlayer', args: { playerId: 'p2', reason: 'name' } },
    ]);
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'UNKNOWN_PLAYER', message: 'you have not played this player' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const reason = await createConvexSafety({ client })
      .block('p2')
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
    await expect(createConvexSafety({ client }).listBlocked()).rejects.toBe(network);
  });
});
