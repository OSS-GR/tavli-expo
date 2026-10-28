// The adapter on a fake Convex client: how results and errors map to the
// port. The contract checks against the real Convex functions run in
// `apps/server` (`convex/convexTransport.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import type { GameTransportErrorData, OnlineGameView, SendTurnRequest } from '@tavli/contracts';

import { GAME_FUNCTIONS, GAME_FUNCTION_NAMES } from './functions';
import { createConvexGameTransport, toTransportError } from './transport';
import type { ConvexGameClient } from './transport';

interface Subscription {
  readonly name: string;
  readonly args: unknown;
  readonly onResult: (result: unknown) => unknown;
  readonly onError: (error: Error) => unknown;
  stops: number;
}

interface Deferred {
  readonly name: string;
  readonly args: unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

/** A fake Convex client: the test answers each query and mutation by hand. */
function fakeClient() {
  const subscriptions: Subscription[] = [];
  const mutations: Deferred[] = [];
  const client: ConvexGameClient = {
    onUpdate(query, args, onResult, onError) {
      const sub: Subscription = {
        name: getFunctionName(query),
        args,
        onResult: onResult as (result: unknown) => unknown,
        onError,
        stops: 0,
      };
      subscriptions.push(sub);
      return () => {
        sub.stops += 1;
      };
    },
    mutation(fn, args) {
      return new Promise((resolve, reject) => {
        mutations.push({
          name: getFunctionName(fn),
          args,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
      });
    },
  };
  return {
    client,
    subscriptions,
    mutations,
    /** The last mutation call. */
    lastMutation(): Deferred {
      const call = mutations[mutations.length - 1];
      if (call === undefined) throw new Error('no mutation');
      return call;
    },
  };
}

/** Lets the pending microtasks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A view stub: the adapter passes views through without reading them. */
function viewStub(version: number): OnlineGameView {
  return { gameId: 'g1', version } as OnlineGameView;
}

type Move = SendTurnRequest['moves'][number];

const TIMED_OUT: GameTransportErrorData = { code: 'TIMED_OUT', message: 'the turn time ran out' };

function watch(transport: ReturnType<typeof createConvexGameTransport>, gameId = 'g1') {
  const views: OnlineGameView[] = [];
  const errors: unknown[] = [];
  const stop = transport.subscribe(
    gameId,
    (view) => views.push(view),
    (error) => errors.push(error),
  );
  return { views, errors, stop };
}

/** The rejection reason of `call`; throws when it resolves. */
async function reasonOf(call: Promise<unknown>): Promise<unknown> {
  return await call.then(
    () => {
      throw new Error('the call resolved');
    },
    (error: unknown) => error,
  );
}

describe('function names', () => {
  it('each reference has its name', () => {
    for (const [key, name] of Object.entries(GAME_FUNCTION_NAMES)) {
      expect(getFunctionName(GAME_FUNCTIONS[key as keyof typeof GAME_FUNCTIONS])).toBe(name);
    }
  });
});

describe('subscribe', () => {
  it('watches getGame and sends each view on a later microtask', async () => {
    const fake = fakeClient();
    const watcher = watch(createConvexGameTransport({ client: fake.client }), 'g7');
    expect(fake.subscriptions).toHaveLength(1);
    const sub = fake.subscriptions[0] as Subscription;
    expect(sub.name).toBe('games:getGame');
    expect(sub.args).toEqual({ gameId: 'g7' });

    // A client that answers at once (a cached result) still waits a tick.
    sub.onResult(viewStub(1));
    expect(watcher.views).toEqual([]);
    await flush();
    expect(watcher.views).toEqual([viewStub(1)]);

    sub.onResult(viewStub(2));
    await flush();
    expect(watcher.views.map((v) => v.version)).toEqual([1, 2]);
    expect(watcher.errors).toEqual([]);
  });

  it('a null result (no such game) calls onError with NOT_FOUND', async () => {
    const fake = fakeClient();
    const watcher = watch(createConvexGameTransport({ client: fake.client }));
    (fake.subscriptions[0] as Subscription).onResult(null);
    expect(watcher.errors).toEqual([]);
    await flush();
    expect(watcher.views).toEqual([]);
    expect(watcher.errors).toEqual([{ code: 'NOT_FOUND', message: expect.any(String) }]);
  });

  it('a server error becomes its plain data; any other error stays as it is', async () => {
    const fake = fakeClient();
    const watcher = watch(createConvexGameTransport({ client: fake.client }));
    const sub = fake.subscriptions[0] as Subscription;
    sub.onError(new ConvexError({ code: 'NOT_A_PLAYER', message: 'only the players' }));
    const network = new Error('connection lost');
    sub.onError(network);
    expect(watcher.errors).toEqual([]);
    await flush();
    expect(watcher.errors).toHaveLength(2);
    expect(watcher.errors[0]).toEqual({ code: 'NOT_A_PLAYER', message: 'only the players' });
    expect(watcher.errors[0]).not.toBeInstanceOf(Error);
    expect(watcher.errors[1]).toBe(network);
  });

  it('works without onError', async () => {
    const fake = fakeClient();
    const views: OnlineGameView[] = [];
    createConvexGameTransport({ client: fake.client }).subscribe('g1', (view) => views.push(view));
    const sub = fake.subscriptions[0] as Subscription;
    sub.onResult(null);
    sub.onError(new Error('x'));
    sub.onResult(viewStub(3));
    await flush();
    expect(views).toEqual([viewStub(3)]);
  });

  it('stop ends the client subscription once, and drops results not yet sent', async () => {
    const fake = fakeClient();
    const watcher = watch(createConvexGameTransport({ client: fake.client }));
    const sub = fake.subscriptions[0] as Subscription;
    sub.onResult(viewStub(1));
    sub.onError(new Error('late'));
    // Stopped in the same tick: the queued view and error never come.
    watcher.stop();
    watcher.stop();
    expect(sub.stops).toBe(1);
    sub.onResult(viewStub(2));
    await flush();
    expect(watcher.views).toEqual([]);
    expect(watcher.errors).toEqual([]);
  });
});

describe('sendTurn', () => {
  const move: Move = { from: 13, to: 8, die: 5 };

  it('calls makeMove and resolves only after the mutation resolves', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    let done = false;
    const sent = transport
      .sendTurn({ gameId: 'g1', expectedVersion: 4, moves: [move] })
      .then(() => {
        done = true;
      });
    const call = fake.lastMutation();
    expect(call.name).toBe('games:makeMove');
    expect(call.args).toEqual({ gameId: 'g1', expectedVersion: 4, moves: [move] });
    await flush();
    expect(done).toBe(false);
    call.resolve({ ok: true, version: 5 });
    await sent;
    expect(done).toBe(true);
  });

  it('sends a copy with only the move fields the server takes', () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const hit: Move = { from: 8, to: 5, die: 3, capture: 'hit' };
    // A careless caller may pass a move with more fields.
    const moves: Move[] = [{ ...move, extra: 'not for the server' } as Move, hit];
    void transport.sendTurn({ gameId: 'g1', expectedVersion: 1, moves });
    moves.length = 0;
    expect(fake.lastMutation().args).toEqual({
      gameId: 'g1',
      expectedVersion: 1,
      moves: [move, { from: 8, to: 5, die: 3, capture: 'hit' }],
    });
  });

  it('ok: false (the turn time ran out) rejects with the TIMED_OUT data', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const sent = transport.sendTurn({ gameId: 'g1', expectedVersion: 1, moves: [move] });
    fake.lastMutation().resolve({ ok: false, version: 2, error: TIMED_OUT });
    const reason = await reasonOf(sent);
    expect(reason).toEqual(TIMED_OUT);
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('a server error rejects with its plain data', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const sent = transport.sendTurn({ gameId: 'g1', expectedVersion: 1, moves: [move] });
    fake.lastMutation().reject(new ConvexError({ code: 'STALE_VERSION', message: 'load again' }));
    const reason = await reasonOf(sent);
    expect(reason).toEqual({ code: 'STALE_VERSION', message: 'load again' });
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('a network error, or a ConvexError with other data, rejects as it is', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const network = new Error('offline');
    const first = transport.sendTurn({ gameId: 'g1', expectedVersion: 1, moves: [move] });
    fake.lastMutation().reject(network);
    expect(await reasonOf(first)).toBe(network);

    const other = new ConvexError({ code: 'INVITE_EXPIRED', message: 'not a game error' });
    const second = transport.sendTurn({ gameId: 'g1', expectedVersion: 1, moves: [move] });
    fake.lastMutation().reject(other);
    expect(await reasonOf(second)).toBe(other);
  });
});

describe('sendAnswer and resign', () => {
  it('sendAnswer calls answer and maps TIMED_OUT like sendTurn', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const ok = transport.sendAnswer({ gameId: 'g1', expectedVersion: 3, choice: 'playOn' });
    expect(fake.lastMutation()).toMatchObject({
      name: 'games:answer',
      args: { gameId: 'g1', expectedVersion: 3, choice: 'playOn' },
    });
    fake.lastMutation().resolve({ ok: true, version: 4 });
    await expect(ok).resolves.toBeUndefined();

    const late = transport.sendAnswer({ gameId: 'g1', expectedVersion: 3, choice: 'playOn' });
    fake.lastMutation().resolve({ ok: false, version: 4, error: TIMED_OUT });
    expect(await reasonOf(late)).toEqual(TIMED_OUT);
  });

  it('resign calls resign and maps server errors', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const ok = transport.resign('g1');
    expect(fake.lastMutation()).toMatchObject({ name: 'games:resign', args: { gameId: 'g1' } });
    fake.lastMutation().resolve(9);
    await expect(ok).resolves.toBeUndefined();

    const over = transport.resign('g1');
    fake.lastMutation().reject(new ConvexError({ code: 'GAME_OVER', message: 'over' }));
    expect(await reasonOf(over)).toEqual({ code: 'GAME_OVER', message: 'over' });
  });

  it('NOT_SIGNED_IN maps like any server code', async () => {
    const fake = fakeClient();
    const transport = createConvexGameTransport({ client: fake.client });
    const call = transport.resign('g1');
    fake.lastMutation().reject(new ConvexError({ code: 'NOT_SIGNED_IN', message: 'sign in' }));
    expect(await reasonOf(call)).toEqual({ code: 'NOT_SIGNED_IN', message: 'sign in' });
  });
});

describe('toTransportError', () => {
  it('keeps only code and message of server data', () => {
    expect(
      toTransportError(new ConvexError({ code: 'ILLEGAL_MOVE', message: 'no', more: 1 })),
    ).toEqual({ code: 'ILLEGAL_MOVE', message: 'no' });
  });

  it('leaves other values alone', () => {
    const plain = { code: 'NOT_FOUND', message: 'not a ConvexError' };
    expect(toTransportError(plain)).toBe(plain);
    const text = new ConvexError('just text');
    expect(toTransportError(text)).toBe(text);
  });
});
