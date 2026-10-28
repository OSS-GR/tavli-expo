// The invites adapter on a fake Convex client: names, arguments, and how
// results and errors map to the port. The contract checks against the
// real Convex functions run in `apps/server` (`convex/convexInvites.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import type { InviteView } from '@tavli/contracts';

import { INVITE_FUNCTIONS, INVITE_FUNCTION_NAMES } from './functions';
import { createConvexInvites, toInviteError } from './invites';
import type { ConvexInvitesClient } from './invites';

interface Call {
  readonly kind: 'query' | 'mutation';
  readonly name: string;
  readonly args: unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

interface Watch {
  readonly name: string;
  readonly args: unknown;
  readonly onResult: (result: unknown) => unknown;
  readonly onError: (error: Error) => unknown;
  stops: number;
}

/** A fake client: the test answers each call by hand. */
function fakeClient() {
  const calls: Call[] = [];
  const watches: Watch[] = [];
  const pending = (kind: Call['kind'], fn: Parameters<typeof getFunctionName>[0], args: unknown) =>
    new Promise((resolve, reject) => {
      calls.push({ kind, name: getFunctionName(fn), args, resolve, reject });
    });
  const client: ConvexInvitesClient = {
    query: (fn, args) => pending('query', fn, args) as never,
    mutation: (fn, args) => pending('mutation', fn, args) as never,
    onUpdate(query, args, onResult, onError) {
      const watch: Watch = {
        name: getFunctionName(query),
        args,
        onResult: onResult as (result: unknown) => unknown,
        onError,
        stops: 0,
      };
      watches.push(watch);
      return () => {
        watch.stops += 1;
      };
    },
  };
  return {
    client,
    calls,
    watches,
    last(): Call {
      const call = calls[calls.length - 1];
      if (call === undefined) throw new Error('no call');
      return call;
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function reasonOf(call: Promise<unknown>): Promise<unknown> {
  return await call.then(
    () => {
      throw new Error('the call resolved');
    },
    (error: unknown) => error,
  );
}

const VIEW: InviteView = {
  code: 'ABCD2345',
  from: 'alice',
  choice: 'portes',
  targetPoints: 3,
  pace: 'live',
  status: 'open',
  expiresAt: 1,
  gameId: null,
};

describe('function names', () => {
  it('each invite reference has its name', () => {
    for (const [key, name] of Object.entries(INVITE_FUNCTION_NAMES)) {
      expect(getFunctionName(INVITE_FUNCTIONS[key as keyof typeof INVITE_FUNCTIONS])).toBe(name);
    }
  });
});

describe('calls', () => {
  it('createInvite sends only the game fields and resolves with the code', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const game = { choice: 'plakoto', targetPoints: 5, pace: 'async', extra: 1 } as const;
    const made = invites.createInvite(game);
    expect(fake.last()).toMatchObject({
      kind: 'mutation',
      name: 'invites:createInvite',
      args: { choice: 'plakoto', targetPoints: 5, pace: 'async' },
    });
    expect(fake.last().args).not.toHaveProperty('extra');
    fake.last().resolve('ABCD2345');
    await expect(made).resolves.toBe('ABCD2345');
  });

  it('getInvite and listMyInvites run queries, and give copies', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const one = invites.getInvite('abcd2345');
    expect(fake.last()).toMatchObject({
      kind: 'query',
      name: 'invites:getInvite',
      args: { code: 'abcd2345' },
    });
    fake.last().resolve(VIEW);
    const view = await one;
    expect(view).toEqual(VIEW);
    expect(view).not.toBe(VIEW);

    const none = invites.getInvite('ABCD2346');
    fake.last().resolve(null);
    await expect(none).resolves.toBeNull();

    const list = invites.listMyInvites();
    expect(fake.last()).toMatchObject({ name: 'invites:listMyInvites', args: {} });
    fake.last().resolve([VIEW]);
    const mine = await list;
    expect(mine).toEqual([VIEW]);
    expect(mine[0]).not.toBe(VIEW);
  });

  it('accept, decline and cancel call their mutations with the code', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const accepted = invites.acceptInvite('ABCD2345');
    expect(fake.last()).toMatchObject({ name: 'invites:acceptInvite', args: { code: 'ABCD2345' } });
    fake.last().resolve('g1');
    await expect(accepted).resolves.toBe('g1');

    const declined = invites.declineInvite('ABCD2345');
    expect(fake.last().name).toBe('invites:declineInvite');
    fake.last().resolve(null);
    await expect(declined).resolves.toBeUndefined();

    const cancelled = invites.cancelInvite('ABCD2345');
    expect(fake.last().name).toBe('invites:cancelInvite');
    fake.last().resolve(null);
    await expect(cancelled).resolves.toBeUndefined();
  });

  it('a server error rejects with its plain data; any other error as it is', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const closed = invites.acceptInvite('ABCD2345');
    fake.last().reject(new ConvexError({ code: 'INVITE_CLOSED', message: 'answered' }));
    const reason = await reasonOf(closed);
    expect(reason).toEqual({ code: 'INVITE_CLOSED', message: 'answered' });
    expect(reason).not.toBeInstanceOf(Error);

    const signedOut = invites.listMyInvites();
    fake.last().reject(new ConvexError({ code: 'NOT_SIGNED_IN', message: 'sign in' }));
    expect(await reasonOf(signedOut)).toEqual({ code: 'NOT_SIGNED_IN', message: 'sign in' });

    const network = new Error('offline');
    const offline = invites.createInvite({ choice: 'portes', targetPoints: 1, pace: 'live' });
    fake.last().reject(network);
    expect(await reasonOf(offline)).toBe(network);

    // A game error is not an invite error.
    const other = new ConvexError({ code: 'STALE_VERSION', message: 'old' });
    const stale = invites.cancelInvite('ABCD2345');
    fake.last().reject(other);
    expect(await reasonOf(stale)).toBe(other);
  });
});

describe('watchInvite', () => {
  it('watches getInvite and sends each view, a copy, on a later microtask', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const views: (InviteView | null)[] = [];
    const stop = invites.watchInvite('abcd2345', (view) => views.push(view));
    const watch = fake.watches[0] as Watch;
    expect(watch).toMatchObject({ name: 'invites:getInvite', args: { code: 'abcd2345' } });
    watch.onResult(VIEW);
    expect(views).toEqual([]);
    await flush();
    expect(views).toEqual([VIEW]);
    expect(views[0]).not.toBe(VIEW);
    watch.onResult(null);
    await flush();
    expect(views).toEqual([VIEW, null]);
    stop();
  });

  it('maps errors, and stop ends the client watch once and drops what is on its way', async () => {
    const fake = fakeClient();
    const invites = createConvexInvites({ client: fake.client });
    const views: unknown[] = [];
    const errors: unknown[] = [];
    const stop = invites.watchInvite(
      'ABCD2345',
      (view) => views.push(view),
      (error) => errors.push(error),
    );
    const watch = fake.watches[0] as Watch;
    watch.onError(new ConvexError({ code: 'NOT_SIGNED_IN', message: 'sign in' }));
    await flush();
    expect(errors).toEqual([{ code: 'NOT_SIGNED_IN', message: 'sign in' }]);

    watch.onResult(VIEW);
    stop();
    stop();
    expect(watch.stops).toBe(1);
    await flush();
    expect(views).toEqual([]);
  });

  it('works without onError', async () => {
    const fake = fakeClient();
    const views: unknown[] = [];
    createConvexInvites({ client: fake.client }).watchInvite('ABCD2345', (v) => views.push(v));
    const watch = fake.watches[0] as Watch;
    watch.onError(new Error('x'));
    watch.onResult(VIEW);
    await flush();
    expect(views).toEqual([VIEW]);
  });
});

describe('toInviteError', () => {
  it('keeps only code and message of invite data, and leaves other values alone', () => {
    expect(toInviteError(new ConvexError({ code: 'OWN_INVITE', message: 'no', more: 1 }))).toEqual({
      code: 'OWN_INVITE',
      message: 'no',
    });
    const plain = { code: 'OWN_INVITE', message: 'not a ConvexError' };
    expect(toInviteError(plain)).toBe(plain);
  });
});
