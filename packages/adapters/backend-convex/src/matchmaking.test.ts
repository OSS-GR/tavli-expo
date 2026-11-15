// The matchmaking adapter on a fake Convex client: the names, the
// arguments, the watch and how errors map to the port. The contract
// checks against the real Convex functions run in `apps/server`
// (`convex/convexMatchmaking.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import type { MySeek } from '@tavli/contracts';

import { MATCH_FUNCTIONS, MATCH_FUNCTION_NAMES } from './functions';
import { createConvexMatchmaking } from './matchmaking';
import type { ConvexMatchmakingClient } from './matchmaking';

interface Watch {
  readonly name: string;
  readonly args: unknown;
  readonly onResult: (result: unknown) => unknown;
  readonly onError: (error: Error) => unknown;
  stopped: boolean;
}

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const watches: Watch[] = [];
  const client: ConvexMatchmakingClient = {
    query: (fn, args) => {
      calls.push({ kind: 'query', name: getFunctionName(fn), args });
      return answer() as never;
    },
    mutation: (fn, args) => {
      calls.push({ kind: 'mutation', name: getFunctionName(fn), args });
      return answer() as never;
    },
    onUpdate: (fn, args, onResult, onError) => {
      const watch: Watch = {
        name: getFunctionName(fn),
        args,
        onResult: onResult as (result: unknown) => unknown,
        onError,
        stopped: false,
      };
      watches.push(watch);
      return () => {
        watch.stopped = true;
      };
    },
  };
  return { client, calls, watches };
}

const flush = () => Promise.resolve().then(() => undefined);

describe('createConvexMatchmaking', () => {
  it('names every function in matchmaking.ts', () => {
    for (const [key, name] of Object.entries(MATCH_FUNCTION_NAMES)) {
      expect(name).toBe(`matchmaking:${key}`);
      expect(getFunctionName(MATCH_FUNCTIONS[key as keyof typeof MATCH_FUNCTIONS])).toBe(name);
    }
  });

  it('never sends the caller', async () => {
    const { client, calls } = fakeClient(() => Promise.resolve({ kind: 'none' }));
    const matchmaking = createConvexMatchmaking({ client });
    await expect(matchmaking.seek({ game: 'portes' })).resolves.toBeUndefined();
    await expect(matchmaking.cancel()).resolves.toBeUndefined();
    await matchmaking.mySeek();
    await matchmaking.lookingCounts();
    expect(calls).toEqual([
      { kind: 'mutation', name: 'matchmaking:seek', args: { game: 'portes' } },
      { kind: 'mutation', name: 'matchmaking:cancelSeek', args: {} },
      { kind: 'query', name: 'matchmaking:mySeek', args: {} },
      { kind: 'query', name: 'matchmaking:lookingCounts', args: {} },
    ]);
  });

  it('watches mySeek: never inside the call, a copy each time, nothing after stop', async () => {
    const { client, watches } = fakeClient();
    const seen: MySeek[] = [];
    const stop = createConvexMatchmaking({ client }).watchMySeek((seek) => seen.push(seek));
    expect(watches.map((watch) => [watch.name, watch.args])).toEqual([['matchmaking:mySeek', {}]]);
    const shared: MySeek = { kind: 'waiting', game: 'fevga', since: 1, rating: 1500 };
    watches[0]?.onResult(shared);
    expect(seen).toEqual([]);
    await flush();
    expect(seen).toEqual([shared]);
    expect(seen[0]).not.toBe(shared);
    watches[0]?.onResult({ kind: 'none' });
    stop();
    await flush();
    expect(seen).toHaveLength(1);
    expect(watches[0]?.stopped).toBe(true);
  });

  it('turns a server error into its data, and keeps any other error', async () => {
    const server = new ConvexError({ code: 'NOT_SAVED', message: 'save first' });
    await expect(
      createConvexMatchmaking({ client: fakeClient(() => Promise.reject(server)).client }).seek({
        game: 'tavli',
      }),
    ).rejects.toEqual({ code: 'NOT_SAVED', message: 'save first' });
    const network = new Error('offline');
    await expect(
      createConvexMatchmaking({
        client: fakeClient(() => Promise.reject(network)).client,
      }).lookingCounts(),
    ).rejects.toBe(network);

    const { client, watches } = fakeClient();
    const errors: unknown[] = [];
    createConvexMatchmaking({ client }).watchMySeek(
      () => undefined,
      (error) => errors.push(error),
    );
    watches[0]?.onError(server);
    await flush();
    expect(errors).toEqual([{ code: 'NOT_SAVED', message: 'save first' }]);
  });
});
