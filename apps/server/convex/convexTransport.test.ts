// The Convex client adapter (`@tavli/backend-convex`, #253) against the
// real Convex functions, offline. A fake Convex client (`test.network.ts`)
// runs each call through convex-test as one signed-in user
// (`t.withIdentity`). The `GameTransport` contract checks
// (`@tavli/contracts/testing`) then run on top.

import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GAME_FUNCTIONS,
  GAME_FUNCTION_NAMES,
  createConvexGameTransport,
} from '@tavli/backend-convex';
import type { ConvexGameClient, GameFunctions } from '@tavli/backend-convex';
import { isGameTransportErrorData } from '@tavli/contracts';
import type { GameTransport, OnlineGameView } from '@tavli/contracts';
import { gameTransportContract } from '@tavli/contracts/testing';
import type {
  GameTransportContractGame,
  GameTransportContractSubject,
} from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';
import { loadFlow, storeFlow } from '@tavli/online';
import { lastBearOff, motherPin } from '@tavli/online/testing';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import { modules, pickTurn } from './test.setup';

const ALICE = 'alice';
const BOB = 'bob';
const EVE = 'eve';
const PLAYERS = { white: ALICE, black: BOB };

type Tester = ReturnType<typeof setup>;

function setup() {
  return convexTest(schema, modules);
}

// Every game schedules a turn timer. Fake timers keep those checks from
// firing on their own (see games.test.ts).
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

// convex-test types each call from the reference it gets. The fake
// clients take any reference, so they pass it on untyped.
type AnyQuery = FunctionReference<'query'>;
type AnyMutation = FunctionReference<'mutation'>;

/** Game transports on fake Convex clients over one backend (`test.network.ts`). */
function gameNetwork(t: Tester) {
  const network = convexTestNetwork(t);
  return {
    transportFor: (subject: string): GameTransport =>
      createConvexGameTransport({ client: network.clientFor(subject) }),
    settle: network.settle,
  };
}

/** Alice creates a game: she is White, Bob is Black. `createGame` is internal (#274). */
async function createGame(t: Tester, game: GameTransportContractGame): Promise<Id<'games'>> {
  return await t.mutation(internal.games.createGame, {
    callerId: ALICE,
    players: PLAYERS,
    ...game,
  });
}

function contractSubject(): GameTransportContractSubject {
  const t = setup();
  const network = gameNetwork(t);
  const picker = createSeededRng(8);
  return {
    createGame: (game) => createGame(t, game),
    createMotherQuestion: async () => {
      const gameId = await createGame(t, { choice: 'plakoto', targetPoints: 1, pace: 'live' });
      const pin = await t.run(async (ctx) => {
        const doc = await ctx.db.get(gameId);
        if (doc === null) throw new Error('no game');
        const { flow, pin } = motherPin(loadFlow(doc.flow));
        await ctx.db.patch(gameId, { flow: storeFlow(flow, null) });
        return pin;
      });
      await t.withIdentity({ subject: BOB }).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: 1,
        moves: [...pin],
      });
      return gameId;
    },
    createWinningTurn: async () => {
      const gameId = await createGame(t, { choice: 'portes', targetPoints: 3, pace: 'live' });
      await t.run(async (ctx) => {
        const doc = await ctx.db.get(gameId);
        if (doc === null) throw new Error('no game');
        await ctx.db.patch(gameId, { flow: storeFlow(lastBearOff(loadFlow(doc.flow)), null) });
      });
      return gameId;
    },
    createOtherGame: async () =>
      await t.mutation(internal.games.createGame, {
        callerId: BOB,
        players: { white: BOB, black: EVE },
        choice: 'portes',
        targetPoints: 1,
        pace: 'live',
      }),
    missingGameId: async () => {
      const gameId = await createGame(t, { choice: 'portes', targetPoints: 1, pace: 'live' });
      await t.run(async (ctx) => ctx.db.delete(gameId));
      return gameId;
    },
    transportFor: (who) => network.transportFor(who === 'stranger' ? EVE : PLAYERS[who]),
    legalTurn: (view) => pickTurn(view.game, picker),
    settle: network.settle,
    passTime: async (ms) => {
      vi.advanceTimersByTime(ms);
      await t.finishInProgressScheduledFunctions();
    },
  };
}

describe('GameTransport contract (Convex adapter on the real functions)', () => {
  for (const check of gameTransportContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('the adapter on the real functions', () => {
  /** The rejection reason of `call`; throws when it resolves. */
  async function reasonOf(call: Promise<unknown>): Promise<unknown> {
    return await call.then(
      () => {
        throw new Error('the call resolved');
      },
      (error: unknown) => error,
    );
  }

  it('a late turn rejects with TIMED_OUT, and both players see the time out', async () => {
    const t = setup();
    const network = gameNetwork(t);
    const gameId = await createGame(t, { choice: 'portes', targetPoints: 5, pace: 'live' });
    const views: OnlineGameView[] = [];
    const stop = network.transportFor(BOB).subscribe(gameId, (view) => views.push(view));
    await network.settle();
    await network.settle();
    const first = views[0];
    if (first === undefined || first.waitingFor === null) throw new Error('no first view');
    const late = first.waitingFor;

    // Past the deadline, before the scheduled check runs.
    vi.setSystemTime(START + 60 * 1000);
    const reason = await reasonOf(
      network.transportFor(PLAYERS[late]).sendTurn({
        gameId,
        expectedVersion: first.version,
        moves: pickTurn(first.game, createSeededRng(3)),
      }),
    );
    expect(reason).toEqual({ code: 'TIMED_OUT', message: expect.any(String) });
    expect(isGameTransportErrorData(reason)).toBe(true);
    // The time out was saved, and the view of the next game is already here.
    await network.settle();
    const after = views[views.length - 1];
    expect(after?.version).toBe(first.version + 1);
    expect(after?.match.games[0]).toMatchObject({ reason: 'timeout' });
    stop();
  });

  it('a caller with no sign-in gets NOT_SIGNED_IN', async () => {
    const t = setup();
    const gameId = await createGame(t, { choice: 'portes', targetPoints: 1, pace: 'live' });
    // A client with no token: convex-test with no identity.
    let loaded: Promise<unknown> = Promise.resolve();
    const anonymous: ConvexGameClient = {
      onUpdate: (query, args, onResult, onError) => {
        loaded = t.query(query as AnyQuery, args).then(onResult, onError);
        return () => undefined;
      },
      query: (fn, args) => t.query(fn as AnyQuery, args),
      mutation: (fn, args) => t.mutation(fn as AnyMutation, args),
    };
    const transport = createConvexGameTransport({ client: anonymous });
    expect(await reasonOf(transport.resign(gameId))).toEqual({
      code: 'NOT_SIGNED_IN',
      message: expect.any(String),
    });
    expect(await reasonOf(transport.listMyGames({ status: 'active' }))).toEqual({
      code: 'NOT_SIGNED_IN',
      message: expect.any(String),
    });
    const errors: unknown[] = [];
    transport.subscribe(
      gameId,
      () => undefined,
      (error) => errors.push(error),
    );
    await loaded;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ code: 'NOT_SIGNED_IN', message: expect.any(String) });
  });

  it('a string that is no game id fails argument validation: a plain error, not port data', async () => {
    const t = setup();
    const network = gameNetwork(t);
    const transport = network.transportFor(ALICE);
    const reason = await reasonOf(transport.resign('not-a-game-id'));
    expect(reason).toBeInstanceOf(Error);
    expect(isGameTransportErrorData(reason)).toBe(false);
    const errors: unknown[] = [];
    const stop = transport.subscribe(
      'not-a-game-id',
      () => undefined,
      (error) => errors.push(error),
    );
    await network.settle();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(isGameTransportErrorData(errors[0])).toBe(false);
    stop();
  });
});

// The adapter names the functions itself (`GAME_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

/** The adapter's arguments with the game id as the server types it. */
type WithGameId<F extends FunctionReference<'query' | 'mutation'>> = Omit<
  FunctionArgs<F>,
  'gameId'
> & { gameId: Id<'games'> };

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    expect(GAME_FUNCTION_NAMES).toEqual({
      getGame: getFunctionName(api.games.getGame),
      makeMove: getFunctionName(api.games.makeMove),
      answer: getFunctionName(api.games.answer),
      resign: getFunctionName(api.games.resign),
      listMyGames: getFunctionName(api.games.listMyGames),
    });
    for (const key of Object.keys(GAME_FUNCTION_NAMES) as (keyof GameFunctions)[]) {
      expect(getFunctionName(GAME_FUNCTIONS[key])).toBe(getFunctionName(api.games[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.games;
    expectType<Extends<WithGameId<GameFunctions['getGame']>, FunctionArgs<Api['getGame']>>>();
    expectType<Extends<WithGameId<GameFunctions['makeMove']>, FunctionArgs<Api['makeMove']>>>();
    expectType<Extends<WithGameId<GameFunctions['answer']>, FunctionArgs<Api['answer']>>>();
    expectType<Extends<WithGameId<GameFunctions['resign']>, FunctionArgs<Api['resign']>>>();
    expectType<
      Extends<FunctionArgs<GameFunctions['listMyGames']>, FunctionArgs<Api['listMyGames']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['getGame']>, FunctionReturnType<GameFunctions['getGame']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['makeMove']>, FunctionReturnType<GameFunctions['makeMove']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['answer']>, FunctionReturnType<GameFunctions['answer']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['resign']>, FunctionReturnType<GameFunctions['resign']>>
    >();
    expectType<
      Extends<
        FunctionReturnType<Api['listMyGames']>,
        FunctionReturnType<GameFunctions['listMyGames']>
      >
    >();
    // A wrong type fails: the checks above are not always true.
    // @ts-expect-error -- a number is not a view.
    expectType<Extends<number, FunctionReturnType<GameFunctions['getGame']>>>();
  });
});
