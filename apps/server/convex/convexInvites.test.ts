// The Convex invites adapter (`createConvexInvites` in
// `@tavli/backend-convex`, #281) against the real Convex functions,
// offline. Fake Convex clients (`test.network.ts`) run each call through
// convex-test as one signed-in user. The `Invites` contract checks
// (`@tavli/contracts/testing`) then run on top. The players are Better
// Auth users (`authUsers`): the calls that save the caller's id check
// that the account exists (#306).

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INVITE_FUNCTIONS,
  INVITE_FUNCTION_NAMES,
  createConvexInvites,
} from '@tavli/backend-convex';
import type { InviteFunctions } from '@tavli/backend-convex';
import { INVITE_TIME_MS, isInviteErrorData } from '@tavli/contracts';
import type { InviteView, Invites } from '@tavli/contracts';
import { invitesContract } from '@tavli/contracts/testing';
import type { InvitesContractSubject } from '@tavli/contracts/testing';
import { MAX_OPEN_INVITES } from '@tavli/online';

import { api } from './_generated/api';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules } from './test.setup';

// The players: new Better Auth users for each test, made by `setup()`.
let ALICE = '';
let BOB = '';
let CAROL = '';

async function setup(): Promise<Tester> {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = '', CAROL = ''] = await authUsers(t, 3);
  return t;
}

// Every invite schedules its expiry, and every game a turn timer. Fake
// timers keep those from firing on their own; `passTime` moves the clock.
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The adapter for each user, on one backend, and the server clock. */
function inviteNetwork(t: Tester) {
  const network = convexTestNetwork(t);
  return {
    invitesFor: (subject: string | null): Invites =>
      createConvexInvites({ client: network.clientFor(subject) }),
    /** Moves the clock, runs the scheduled functions that are due, and the watched queries. */
    passTime: async (ms: number) => {
      vi.advanceTimersByTime(ms);
      await t.finishInProgressScheduledFunctions();
      await network.refreshAll();
    },
    settle: network.settle,
  };
}

async function contractSubject(): Promise<InvitesContractSubject> {
  const network = inviteNetwork(await setup());
  const ids = { inviter: ALICE, friend: BOB, other: CAROL } as const;
  return {
    inviterId: ALICE,
    invitesFor: (who) => network.invitesFor(ids[who]),
    passTime: network.passTime,
    settle: network.settle,
  };
}

describe('Invites contract (Convex adapter on the real functions)', () => {
  for (const check of invitesContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

describe('the adapter on the real functions', () => {
  async function reasonOf(call: Promise<unknown>): Promise<unknown> {
    return await call.then(
      () => {
        throw new Error('the call resolved');
      },
      (error: unknown) => error,
    );
  }

  it('a caller with no sign-in gets NOT_SIGNED_IN, as plain data', async () => {
    const network = inviteNetwork(await setup());
    const code = await network
      .invitesFor(ALICE)
      .createInvite({ choice: 'portes', targetPoints: 1, turnTimeMinutes: 1 });
    const anonymous = network.invitesFor(null);
    const calls: Promise<unknown>[] = [
      anonymous.createInvite({ choice: 'portes', targetPoints: 1, turnTimeMinutes: 1 }),
      anonymous.getInvite(code),
      anonymous.acceptInvite(code),
      anonymous.declineInvite(code),
      anonymous.cancelInvite(code),
      anonymous.listMyInvites(),
    ];
    for (const call of calls) {
      const reason = await reasonOf(call);
      expect(reason).toEqual({ code: 'NOT_SIGNED_IN', message: expect.any(String) });
      expect(reason).not.toBeInstanceOf(Error);
    }
    const errors: unknown[] = [];
    const stop = anonymous.watchInvite(
      code,
      () => undefined,
      (error) => errors.push(error),
    );
    await network.settle();
    await network.settle();
    expect(errors).toEqual([{ code: 'NOT_SIGNED_IN', message: expect.any(String) }]);
    stop();
  });

  it('a game that is not a game fails argument validation: a plain error, not port data', async () => {
    const network = inviteNetwork(await setup());
    const bad = { choice: 'backgammon', targetPoints: 1, turnTimeMinutes: 1 } as never;
    const reason = await reasonOf(network.invitesFor(ALICE).createInvite(bad));
    expect(reason).toBeInstanceOf(Error);
    expect(isInviteErrorData(reason)).toBe(false);
  });

  it('the inviter watches the invite: the accept brings the game id, then the game opens', async () => {
    const network = inviteNetwork(await setup());
    const alice = network.invitesFor(ALICE);
    const code = await alice.createInvite({
      choice: 'plakoto',
      targetPoints: 3,
      turnTimeMinutes: null,
    });
    const views: (InviteView | null)[] = [];
    const stop = alice.watchInvite(code, (view) => views.push(view));
    await network.settle();
    await network.settle();
    expect(views.map((view) => view?.status)).toEqual(['open']);
    const gameId = await network.invitesFor(BOB).acceptInvite(code);
    await network.settle();
    await network.settle();
    expect(views.at(-1)).toMatchObject({ status: 'accepted', gameId });
    stop();
  });

  it('one invite over the cap gives TOO_MANY_INVITES, as plain data (#275)', async () => {
    const network = inviteNetwork(await setup());
    const alice = network.invitesFor(ALICE);
    const game = { choice: 'portes', targetPoints: 1, turnTimeMinutes: 1 } as const;
    for (let i = 0; i < MAX_OPEN_INVITES; i += 1) await alice.createInvite(game);
    const reason = await reasonOf(alice.createInvite(game));
    expect(reason).toEqual({ code: 'TOO_MANY_INVITES', message: expect.any(String) });
    expect(reason).not.toBeInstanceOf(Error);
    await expect(alice.listMyInvites()).resolves.toHaveLength(MAX_OPEN_INVITES);
  });

  it('the scheduled expiry reaches a watcher', async () => {
    const network = inviteNetwork(await setup());
    const alice = network.invitesFor(ALICE);
    const code = await alice.createInvite({ choice: 'fevga', targetPoints: 1, turnTimeMinutes: 1 });
    const views: (string | undefined)[] = [];
    const stop = alice.watchInvite(code, (view) => views.push(view?.status));
    await network.settle();
    await network.settle();
    await network.passTime(INVITE_TIME_MS);
    await network.settle();
    await network.settle();
    expect(views).toEqual(['open', 'expired']);
    stop();
  });
});

// The adapter names the functions itself (`INVITE_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    expect(INVITE_FUNCTION_NAMES).toEqual({
      createInvite: getFunctionName(api.invites.createInvite),
      getInvite: getFunctionName(api.invites.getInvite),
      acceptInvite: getFunctionName(api.invites.acceptInvite),
      declineInvite: getFunctionName(api.invites.declineInvite),
      cancelInvite: getFunctionName(api.invites.cancelInvite),
      listMyInvites: getFunctionName(api.invites.listMyInvites),
    });
    for (const key of Object.keys(INVITE_FUNCTION_NAMES) as (keyof InviteFunctions)[]) {
      expect(getFunctionName(INVITE_FUNCTIONS[key])).toBe(getFunctionName(api.invites[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.invites;
    type Fns = InviteFunctions;
    expectType<Extends<FunctionArgs<Fns['createInvite']>, FunctionArgs<Api['createInvite']>>>();
    expectType<Extends<FunctionArgs<Fns['getInvite']>, FunctionArgs<Api['getInvite']>>>();
    expectType<Extends<FunctionArgs<Fns['acceptInvite']>, FunctionArgs<Api['acceptInvite']>>>();
    expectType<Extends<FunctionArgs<Fns['declineInvite']>, FunctionArgs<Api['declineInvite']>>>();
    expectType<Extends<FunctionArgs<Fns['cancelInvite']>, FunctionArgs<Api['cancelInvite']>>>();
    expectType<Extends<FunctionArgs<Fns['listMyInvites']>, FunctionArgs<Api['listMyInvites']>>>();
    expectType<
      Extends<FunctionReturnType<Api['createInvite']>, FunctionReturnType<Fns['createInvite']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['getInvite']>, FunctionReturnType<Fns['getInvite']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['acceptInvite']>, FunctionReturnType<Fns['acceptInvite']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['declineInvite']>, FunctionReturnType<Fns['declineInvite']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['cancelInvite']>, FunctionReturnType<Fns['cancelInvite']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['listMyInvites']>, FunctionReturnType<Fns['listMyInvites']>>
    >();
    // A wrong type fails: the checks above are not always true.
    // @ts-expect-error -- a number is not a view.
    expectType<Extends<number, FunctionReturnType<Fns['getInvite']>>>();
  });
});
