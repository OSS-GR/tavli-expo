// The invite functions (#252), run offline with convex-test. Codes come
// from the server's own RNG (Web Crypto). Each call is signed in with a
// convex-test identity (#131): `as(t, id)` calls as the user `id`.

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INVITE_CODE_ALPHABET,
  INVITE_TIME_MS,
  TURN_TIME_MS,
  isGameTransportErrorData,
  isInviteErrorData,
} from '@tavli/contracts';
import type {
  InviteErrorCode,
  InviteView,
  Invites,
  OnlineGameChoice,
  OnlineGamePace,
} from '@tavli/contracts';
import { invitesContract } from '@tavli/contracts/testing';
import type { InvitesContractPlayer, InvitesContractSubject } from '@tavli/contracts/testing';

import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';

type Tester = ReturnType<typeof setup>;

function setup() {
  return convexTest(schema, modules);
}

/** Calls as the signed-in user `id` (the token `subject`, the player id). */
function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

// Every invite schedules its expiry, and every game a turn timer. Fake
// timers keep those from firing on their own; the expiry tests move the
// clock by hand.
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Moves the clock and runs the scheduled functions that are due. */
async function wait(t: Tester, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

async function createInvite(
  t: Tester,
  from = ALICE,
  choice: OnlineGameChoice = 'portes',
  targetPoints = 3,
  pace: OnlineGamePace = 'live',
) {
  return await as(t, from).mutation(api.invites.createInvite, { choice, targetPoints, pace });
}

/** The invite as Carol (neither inviter nor answerer) sees it. */
async function invite(t: Tester, code: string): Promise<InviteView> {
  const view = await as(t, CAROL).query(api.invites.getInvite, { code });
  if (view === null) throw new Error('no invite');
  return view;
}

/** Expects a rejected call with this invite error code. */
async function rejectsWith(call: Promise<unknown>, code: InviteErrorCode) {
  const error: unknown = await call.then(
    () => {
      throw new Error(`expected ${code}, but the call passed`);
    },
    (e: unknown) => e,
  );
  const data = (error as { data?: unknown }).data;
  expect(isInviteErrorData(data)).toBe(true);
  expect(data).toMatchObject({ code });
}

/** An unknown code that is still well formed. */
function otherCode(code: string): string {
  const last = code.at(-1) === '2' ? '3' : '2';
  return code.slice(0, -1) + last;
}

describe('createInvite', () => {
  it('returns a code of 8 characters from the alphabet', async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) {
      const code = await createInvite(t);
      expect(code).toMatch(/^[2-9A-Z]{8}$/);
      for (const char of code) expect(INVITE_CODE_ALPHABET).toContain(char);
    }
  });

  it('makes an open invite that expires in 24 hours', async () => {
    const t = setup();
    const code = await createInvite(t, ALICE, 'plakoto', 5, 'async');
    expect(await invite(t, code)).toEqual({
      code,
      from: ALICE,
      choice: 'plakoto',
      targetPoints: 5,
      pace: 'async',
      status: 'open',
      expiresAt: START + INVITE_TIME_MS,
      gameId: null,
    });
  });

  it('tries again when a code is taken', async () => {
    const t = setup();
    // The first call reads zeros: its first code is 22222222. The second
    // call gives zeros again for the first code (a clash), then ones.
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    spy.mockImplementationOnce((array) => {
      (array as Uint32Array).fill(0);
      return array;
    });
    spy.mockImplementationOnce((array) => {
      const values = array as Uint32Array;
      values.fill(0, 0, 8);
      values.fill(1, 8);
      return array;
    });
    expect(await createInvite(t, ALICE)).toBe('22222222');
    expect(await createInvite(t, BOB)).toBe('33333333');
    expect((await invite(t, '22222222')).from).toBe(ALICE);
    expect((await invite(t, '33333333')).from).toBe(BOB);
  });

  it('rejects a bad match length and the player id "server"', async () => {
    const t = setup();
    await rejectsWith(createInvite(t, ALICE, 'portes', 0), 'BAD_REQUEST');
    await rejectsWith(createInvite(t, ALICE, 'portes', 2.5), 'BAD_REQUEST');
    await rejectsWith(createInvite(t, 'server'), 'BAD_REQUEST');
    const rows = await t.run(async (ctx) => ctx.db.query('invites').collect());
    expect(rows).toHaveLength(0);
  });
});

describe('getInvite', () => {
  it('finds a code in any case, with spaces at the ends', async () => {
    const t = setup();
    const code = await createInvite(t);
    expect((await invite(t, code.toLowerCase())).code).toBe(code);
    expect((await invite(t, ` ${code} `)).code).toBe(code);
  });

  it('returns null for an unknown or malformed code', async () => {
    const t = setup();
    const code = await createInvite(t);
    expect(await as(t, BOB).query(api.invites.getInvite, { code: otherCode(code) })).toBeNull();
    expect(await as(t, BOB).query(api.invites.getInvite, { code: code.slice(1) })).toBeNull();
    expect(await as(t, BOB).query(api.invites.getInvite, { code: 'ABCD234O' })).toBeNull();
    expect(await as(t, BOB).query(api.invites.getInvite, { code: '' })).toBeNull();
  });
});

describe('acceptInvite', () => {
  it('starts the game: the inviter plays white, and getGame shows it', async () => {
    const t = setup();
    const code = await createInvite(t, ALICE, 'fevga', 3, 'async');
    const gameId = await as(t, BOB).mutation(api.invites.acceptInvite, { code });
    const game = await as(t, BOB).query(api.games.getGame, { gameId });
    expect(game).not.toBeNull();
    expect(game?.players).toEqual({ white: ALICE, black: BOB });
    expect(await as(t, ALICE).query(api.games.getGame, { gameId })).toEqual(game);
    expect(game?.choice).toBe('fevga');
    expect(game?.pace).toBe('async');
    expect(game?.match.targetPoints).toBe(3);
    expect(game?.status).toBe('active');
    expect(game?.version).toBe(1);
    // The opening roll is done and the first player's clock runs.
    expect(game?.game.phase).toBe('moving');
    expect(game?.turnDeadline).toBe(START + TURN_TIME_MS.async);

    expect(await invite(t, code)).toMatchObject({ status: 'accepted', gameId });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query('invites')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique(),
    );
    expect(row?.answeredBy).toBe(BOB);
  });

  it('accepts a code in any case', async () => {
    const t = setup();
    const code = await createInvite(t);
    const gameId = await as(t, BOB).mutation(api.invites.acceptInvite, {
      code: code.toLowerCase(),
    });
    expect((await invite(t, code)).gameId).toBe(gameId);
  });

  it('fails the second time, for the same and for another player', async () => {
    const t = setup();
    const code = await createInvite(t);
    await as(t, BOB).mutation(api.invites.acceptInvite, { code });
    await rejectsWith(as(t, BOB).mutation(api.invites.acceptInvite, { code }), 'INVITE_CLOSED');
    await rejectsWith(as(t, CAROL).mutation(api.invites.acceptInvite, { code }), 'INVITE_CLOSED');
    const games = await t.run(async (ctx) => ctx.db.query('games').collect());
    expect(games).toHaveLength(1);
  });

  it('rejects your own invite, and makes no game', async () => {
    const t = setup();
    const code = await createInvite(t);
    await rejectsWith(as(t, ALICE).mutation(api.invites.acceptInvite, { code }), 'OWN_INVITE');
    expect((await invite(t, code)).status).toBe('open');
    const games = await t.run(async (ctx) => ctx.db.query('games').collect());
    expect(games).toHaveLength(0);
  });

  it('rejects an unknown code and a malformed code', async () => {
    const t = setup();
    const code = await createInvite(t);
    await rejectsWith(
      as(t, BOB).mutation(api.invites.acceptInvite, { code: otherCode(code) }),
      'INVITE_NOT_FOUND',
    );
    await rejectsWith(
      as(t, BOB).mutation(api.invites.acceptInvite, { code: code.slice(1) }),
      'BAD_REQUEST',
    );
    await rejectsWith(
      as(t, BOB).mutation(api.invites.acceptInvite, { code: 'ABCDEFG0' }),
      'BAD_REQUEST',
    );
  });

  it('rejects the token subject "server" and an empty one in every call', async () => {
    const t = setup();
    const code = await createInvite(t);
    for (const id of ['server', '', '  ']) {
      const caller = as(t, id);
      await rejectsWith(caller.mutation(api.invites.acceptInvite, { code }), 'BAD_REQUEST');
      await rejectsWith(caller.mutation(api.invites.declineInvite, { code }), 'BAD_REQUEST');
      await rejectsWith(caller.mutation(api.invites.cancelInvite, { code }), 'BAD_REQUEST');
      await rejectsWith(caller.query(api.invites.getInvite, { code }), 'BAD_REQUEST');
      await rejectsWith(caller.query(api.invites.listMyInvites, {}), 'BAD_REQUEST');
    }
    await rejectsWith(createInvite(t, '  '), 'BAD_REQUEST');
    expect((await invite(t, code)).status).toBe('open');
  });

  it('a game error rolls the whole call back', async () => {
    const t = setup();
    const code = await createInvite(t);
    // A bad match length can only get in by hand: createInvite rejects it.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('invites')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique();
      if (row !== null) await ctx.db.patch(row._id, { targetPoints: 0 });
    });
    const error: unknown = await as(t, BOB)
      .mutation(api.invites.acceptInvite, { code })
      .catch((e: unknown) => e);
    expect(isGameTransportErrorData((error as { data?: unknown }).data)).toBe(true);
    expect((await invite(t, code)).status).toBe('open');
    const games = await t.run(async (ctx) => ctx.db.query('games').collect());
    expect(games).toHaveLength(0);
  });
});

describe('declineInvite and cancelInvite', () => {
  it('a friend declines: the invite closes and cannot be accepted', async () => {
    const t = setup();
    const code = await createInvite(t);
    await as(t, BOB).mutation(api.invites.declineInvite, { code });
    expect((await invite(t, code)).status).toBe('declined');
    await rejectsWith(as(t, CAROL).mutation(api.invites.acceptInvite, { code }), 'INVITE_CLOSED');
    await rejectsWith(as(t, BOB).mutation(api.invites.declineInvite, { code }), 'INVITE_CLOSED');
    await rejectsWith(as(t, ALICE).mutation(api.invites.cancelInvite, { code }), 'INVITE_CLOSED');
  });

  it('the inviter cannot decline, and another player cannot cancel', async () => {
    const t = setup();
    const code = await createInvite(t);
    await rejectsWith(as(t, ALICE).mutation(api.invites.declineInvite, { code }), 'OWN_INVITE');
    await rejectsWith(as(t, BOB).mutation(api.invites.cancelInvite, { code }), 'NOT_YOUR_INVITE');
    expect((await invite(t, code)).status).toBe('open');
  });

  it('the inviter cancels: the invite closes and cannot be accepted', async () => {
    const t = setup();
    const code = await createInvite(t);
    await as(t, ALICE).mutation(api.invites.cancelInvite, { code: code.toLowerCase() });
    expect((await invite(t, code)).status).toBe('cancelled');
    await rejectsWith(as(t, BOB).mutation(api.invites.acceptInvite, { code }), 'INVITE_CLOSED');
  });

  it('rejects an unknown code', async () => {
    const t = setup();
    await rejectsWith(
      as(t, BOB).mutation(api.invites.declineInvite, { code: 'ABCD2345' }),
      'INVITE_NOT_FOUND',
    );
    await rejectsWith(
      as(t, ALICE).mutation(api.invites.cancelInvite, { code: 'ABCD2345' }),
      'INVITE_NOT_FOUND',
    );
  });
});

describe('expiry (24 hours)', () => {
  it('an invite is open until 24 hours, then the server marks it expired', async () => {
    const t = setup();
    const code = await createInvite(t);
    await wait(t, INVITE_TIME_MS - 1);
    expect((await invite(t, code)).status).toBe('open');
    await wait(t, 1);
    expect((await invite(t, code)).status).toBe('expired');
    const row = await t.run(async (ctx) =>
      ctx.db
        .query('invites')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique(),
    );
    expect(row?.status).toBe('expired');
  });

  it('accept, decline and cancel fail on an expired invite', async () => {
    const t = setup();
    const code = await createInvite(t);
    await wait(t, INVITE_TIME_MS);
    await rejectsWith(as(t, BOB).mutation(api.invites.acceptInvite, { code }), 'INVITE_EXPIRED');
    await rejectsWith(as(t, BOB).mutation(api.invites.declineInvite, { code }), 'INVITE_EXPIRED');
    await rejectsWith(as(t, ALICE).mutation(api.invites.cancelInvite, { code }), 'INVITE_EXPIRED');
    const games = await t.run(async (ctx) => ctx.db.query('games').collect());
    expect(games).toHaveLength(0);
  });

  it('at expiresAt the invite is expired, also before the scheduler runs', async () => {
    const t = setup();
    const code = await createInvite(t);
    // The clock reaches the time, but the scheduled expiry has not run.
    vi.setSystemTime(START + INVITE_TIME_MS);
    expect((await invite(t, code)).status).toBe('expired');
    await rejectsWith(as(t, BOB).mutation(api.invites.acceptInvite, { code }), 'INVITE_EXPIRED');
    expect(await as(t, ALICE).query(api.invites.listMyInvites, {})).toEqual([]);
  });

  it('an accept just in time works, and the expiry later does nothing', async () => {
    const t = setup();
    const code = await createInvite(t, ALICE, 'portes', 3, 'async');
    vi.setSystemTime(START + INVITE_TIME_MS - 1);
    const gameId = await as(t, BOB).mutation(api.invites.acceptInvite, { code });
    await wait(t, 1);
    expect(await invite(t, code)).toMatchObject({ status: 'accepted', gameId });
  });

  it('the expiry leaves a declined or cancelled invite as it is', async () => {
    const t = setup();
    const declined = await createInvite(t);
    const cancelled = await createInvite(t);
    await as(t, BOB).mutation(api.invites.declineInvite, { code: declined });
    await as(t, ALICE).mutation(api.invites.cancelInvite, { code: cancelled });
    await wait(t, INVITE_TIME_MS);
    expect((await invite(t, declined)).status).toBe('declined');
    expect((await invite(t, cancelled)).status).toBe('cancelled');
  });
});

describe('listMyInvites', () => {
  it('lists the open invites the caller sent, newest first', async () => {
    const t = setup();
    const first = await createInvite(t, ALICE);
    await wait(t, 1000);
    const second = await createInvite(t, ALICE, 'tavli', 5);
    await wait(t, 1000);
    const accepted = await createInvite(t, ALICE);
    const cancelled = await createInvite(t, ALICE);
    await createInvite(t, BOB);
    await as(t, BOB).mutation(api.invites.acceptInvite, { code: accepted });
    await as(t, ALICE).mutation(api.invites.cancelInvite, { code: cancelled });

    const mine = await as(t, ALICE).query(api.invites.listMyInvites, {});
    expect(mine.map((view) => view.code)).toEqual([second, first]);
    expect(mine[0]).toMatchObject({
      from: ALICE,
      choice: 'tavli',
      targetPoints: 5,
      status: 'open',
    });
    expect(await as(t, CAROL).query(api.invites.listMyInvites, {})).toEqual([]);
  });

  it('drops invites once they expire', async () => {
    const t = setup();
    const old = await createInvite(t, ALICE);
    await wait(t, INVITE_TIME_MS / 2);
    const fresh = await createInvite(t, ALICE);
    await wait(t, INVITE_TIME_MS / 2);
    const mine = await as(t, ALICE).query(api.invites.listMyInvites, {});
    expect(mine.map((view) => view.code)).toEqual([fresh]);
    expect((await invite(t, old)).status).toBe('expired');
  });
});

describe('sign-in (#131)', () => {
  it('refuses every call without a sign-in, and saves nothing', async () => {
    const t = setup();
    const code = await createInvite(t);
    await rejectsWith(
      t.mutation(api.invites.createInvite, { choice: 'portes', targetPoints: 3, pace: 'live' }),
      'NOT_SIGNED_IN',
    );
    await rejectsWith(t.query(api.invites.getInvite, { code }), 'NOT_SIGNED_IN');
    await rejectsWith(t.mutation(api.invites.acceptInvite, { code }), 'NOT_SIGNED_IN');
    await rejectsWith(t.mutation(api.invites.declineInvite, { code }), 'NOT_SIGNED_IN');
    await rejectsWith(t.mutation(api.invites.cancelInvite, { code }), 'NOT_SIGNED_IN');
    await rejectsWith(t.query(api.invites.listMyInvites, {}), 'NOT_SIGNED_IN');
    // The error is a game error too, so a client can treat both the same.
    const error: unknown = await t.query(api.invites.listMyInvites, {}).catch((e: unknown) => e);
    expect(isGameTransportErrorData((error as { data?: unknown }).data)).toBe(true);
    expect((await invite(t, code)).status).toBe('open');
    const rows = await t.run(async (ctx) => ctx.db.query('invites').collect());
    expect(rows).toHaveLength(1);
  });

  it('the inviter is the signed-in user: the invite, the game and the list use that id', async () => {
    const t = setup();
    const code = await createInvite(t, ALICE);
    expect((await invite(t, code)).from).toBe(ALICE);
    expect((await as(t, ALICE).query(api.invites.listMyInvites, {})).map((i) => i.code)).toEqual([
      code,
    ]);
    expect(await as(t, BOB).query(api.invites.listMyInvites, {})).toEqual([]);
    const gameId = await as(t, BOB).mutation(api.invites.acceptInvite, { code });
    await expect(as(t, CAROL).query(api.games.getGame, { gameId })).rejects.toMatchObject({
      data: { code: 'NOT_A_PLAYER' },
    });
  });
});

/**
 * The `Invites` port contract (#256) on the real functions. A Convex
 * client rejects with a `ConvexError`; the port rejects with its `data`,
 * so this subject unwraps it, as a client adapter will.
 */
function contractSubject(): InvitesContractSubject {
  const t = setup();
  const ids = { inviter: ALICE, friend: BOB, other: CAROL } as const;
  const unwrap = (error: unknown) => {
    throw (error as { data?: unknown }).data ?? error;
  };
  const invitesFor = (who: InvitesContractPlayer): Invites => {
    const caller = as(t, ids[who]);
    return {
      getInvite: (code) => caller.query(api.invites.getInvite, { code }).catch(unwrap),
      acceptInvite: (code) => caller.mutation(api.invites.acceptInvite, { code }).catch(unwrap),
      declineInvite: async (code) => {
        await caller.mutation(api.invites.declineInvite, { code }).catch(unwrap);
      },
    };
  };
  return {
    inviterId: ALICE,
    createInvite: ({ choice, targetPoints, pace }) =>
      createInvite(t, ALICE, choice, targetPoints, pace),
    invitesFor,
    passTime: (ms) => wait(t, ms),
  };
}

describe('Invites contract (Convex functions)', () => {
  for (const check of invitesContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});
