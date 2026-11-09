// Usernames (#405): the Convex usernames adapter (`createConvexUsernames`
// in `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Usernames` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: names in game views and lists, the owner's
// `clearUsername`, and the account delete.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USERNAME_FUNCTIONS,
  USERNAME_FUNCTION_NAMES,
  createConvexInvites,
  createConvexUsernames,
} from '@tavli/backend-convex';
import type { UsernameFunctions } from '@tavli/backend-convex';
import { TERMS_VERSION, createRecordingPushProvider, usernameName } from '@tavli/contracts';
import { usernamesContract } from '@tavli/contracts/testing';
import type { UsernamesContractSubject } from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import { setPushProvider } from './push';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules } from './test.setup';

// The players, made by `setup()`: two saved accounts and a guest.
let SAVED = '';
let OTHER = '';
let GUEST = '';

async function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [SAVED = '', OTHER = ''] = await authUsers(t, 2, true);
  [GUEST = ''] = await authUsers(t, 1);
  return t;
}

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;
const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

beforeEach(() => {
  // The delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Invites schedule their expiry and games a turn timer: fake timers keep
  // them from firing. `passTime` moves the clock.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function contractSubject(): Promise<UsernamesContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { saved: SAVED, other: OTHER, guest: GUEST } as const;
  return {
    usernamesFor: (player) =>
      createConvexUsernames({ client: network.clientFor(player === null ? null : ids[player]) }),
    invitesFor: (player) => createConvexInvites({ client: network.clientFor(ids[player]) }),
    passTime: async (ms) => {
      vi.advanceTimersByTime(ms);
      await t.finishInProgressScheduledFunctions();
    },
  };
}

describe('Usernames contract (Convex adapter on the real functions)', () => {
  for (const check of usernamesContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

/** The tester with this schema's tables (`Tester` has none). */
type SchemaTester = Awaited<ReturnType<typeof setup>>;

async function rowOf(t: SchemaTester, playerId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query('playerNames')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .first(),
  );
}

/** Saved invites Other; Other accepts. Returns the game id. */
async function startGame(t: Tester) {
  const code = await as(t, SAVED).mutation(api.invites.createInvite, GAME);
  return await as(t, OTHER).mutation(api.invites.acceptInvite, { code });
}

describe('usernames on the Convex server', () => {
  it('shows the username in games, the games list and invites; the other side stays a guest', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Νίκος', ...STEP });
    const gameId = await startGame(t);
    const view = await as(t, OTHER).query(api.games.getGame, { gameId });
    expect(view?.names.white).toEqual(usernameName('Νίκος'));
    expect(view?.names.black?.kind).toBe('guest');
    const [summary] = await as(t, OTHER).query(api.games.listMyGames, { status: 'active' });
    expect(summary?.opponentName).toEqual(usernameName('Νίκος'));
    const code = await as(t, SAVED).mutation(api.invites.createInvite, GAME);
    const invite = await as(t, OTHER).query(api.invites.getInvite, { code });
    expect(invite?.fromName).toEqual(usernameName('Νίκος'));
  });

  it('keeps the guest number of a player who picks a name, and makes one for a new row', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.invites.createInvite, GAME);
    const before = (await rowOf(t, SAVED))?.guestNumber;
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alex', ...STEP });
    expect((await rowOf(t, SAVED))?.guestNumber).toBe(before);
    await as(t, OTHER).mutation(api.usernames.setMyUsername, { name: 'Maria', ...STEP });
    expect((await rowOf(t, OTHER))?.guestNumber).toMatch(/^[1-9][0-9]{3}$/);
  });

  it('keeps the age check as a time only, and the terms version', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alex', ...STEP });
    const row = await rowOf(t, SAVED);
    expect(row).toMatchObject({
      username: 'Alex',
      usernameKey: 'aiex',
      ageCheckedAt: START,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: START,
    });
    expect(row?.usernameChangedAt).toBeUndefined();
  });

  it('refuses a user that is gone (a token outlives its user)', async () => {
    const t = await setup();
    await expect(
      as(t, 'no-such-user').query(api.usernames.getMyUsername, {}),
    ).rejects.toMatchObject({ data: { code: 'NOT_SIGNED_IN' } });
  });

  it('the account delete removes the username, and the name is free at once', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alex', ...STEP });
    await as(t, SAVED).mutation(api.account.deleteMyAccount, {});
    expect(await rowOf(t, SAVED)).toBeNull();
    const taken = await as(t, OTHER).mutation(api.usernames.setMyUsername, {
      name: 'ALEX',
      ...STEP,
    });
    expect(taken.name).toBe('ALEX');
  });
});

describe('clearUsername (the owner tool)', () => {
  it('clears a name: the player is a guest name again and may pick at once', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alex', ...STEP });
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alexander' });
    await t.mutation(internal.usernames.clearUsername, { playerId: SAVED });
    const mine = await as(t, SAVED).query(api.usernames.getMyUsername, {});
    expect(mine).toMatchObject({ name: null, nextChangeAt: null, ageChecked: true });
    // The name is free for others, and the player may pick one again.
    await as(t, OTHER).mutation(api.usernames.setMyUsername, { name: 'alexander', ...STEP });
    await expect(
      as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Sandro' }),
    ).resolves.toMatchObject({ name: 'Sandro' });
  });

  it('renames a player; the new name must follow the rules and be free', async () => {
    const t = await setup();
    await as(t, SAVED).mutation(api.usernames.setMyUsername, { name: 'Alex', ...STEP });
    await as(t, OTHER).mutation(api.usernames.setMyUsername, { name: 'Maria', ...STEP });
    await t.mutation(internal.usernames.clearUsername, { playerId: SAVED, name: 'Player_7' });
    expect((await as(t, SAVED).query(api.usernames.getMyUsername, {})).name).toBe('Player_7');
    await expect(
      t.mutation(internal.usernames.clearUsername, { playerId: SAVED, name: 'maria' }),
    ).rejects.toThrow('another player has this name');
    await expect(
      t.mutation(internal.usernames.clearUsername, { playerId: SAVED, name: 'a b' }),
    ).rejects.toThrow('not valid');
  });
});

// The adapter names the functions itself (`USERNAME_FUNCTIONS`). They must
// match the server's `api`, in name and in type.

type Extends<A, B> = [A] extends [B] ? true : false;

/** Fails the type check when `T` is not `true`. */
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('function references', () => {
  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(USERNAME_FUNCTION_NAMES) as (keyof UsernameFunctions)[]) {
      expect(getFunctionName(USERNAME_FUNCTIONS[key])).toBe(getFunctionName(api.usernames[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.usernames;
    type Fns = UsernameFunctions;
    expectType<Extends<FunctionArgs<Fns['getMyUsername']>, FunctionArgs<Api['getMyUsername']>>>();
    expectType<Extends<FunctionArgs<Fns['setMyUsername']>, FunctionArgs<Api['setMyUsername']>>>();
    expectType<
      Extends<FunctionReturnType<Api['getMyUsername']>, FunctionReturnType<Fns['getMyUsername']>>
    >();
    expectType<
      Extends<FunctionReturnType<Api['setMyUsername']>, FunctionReturnType<Fns['setMyUsername']>>
    >();
    // @ts-expect-error -- a number is not what the call returns.
    expectType<Extends<number, FunctionReturnType<Fns['setMyUsername']>>>();
  });
});
