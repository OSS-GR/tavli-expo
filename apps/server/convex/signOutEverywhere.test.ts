// Sign out of all phones (#446), over the HTTP routes with convex-test:
// `/sign-out-everywhere` (`keyPlugin.ts`) ends every session of a saved
// account and drops its push tokens (`endSessionsOf` in `account.ts`). A
// fake Apple signs the id tokens (`test.apple.ts`): no test reaches Apple.

import { ConvexError } from 'convex/values';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { api, components } from './_generated/api';
import {
  call,
  convexToken,
  fakeApple,
  guest,
  newPhone,
  payloadOf,
  setup,
  signInWithApple,
  stopFakeApple,
  useFakeApple,
  userOf,
} from './test.apple';
import type { Convex, FakeApple, Phone } from './test.apple';

let apple: FakeApple;

beforeAll(async () => {
  apple = await fakeApple();
});

beforeEach(() => {
  useFakeApple(apple);
});

afterEach(() => {
  stopFakeApple();
});

/** The Convex identity of `phone`'s session, as its token gives it. */
async function identityOf(t: Convex, phone: Phone) {
  const payload = payloadOf(await convexToken(t, phone));
  return { subject: String(payload['sub']), sessionId: String(payload['sessionId']) };
}

async function sessionsOf(t: Convex, userId: string) {
  return await t.run(async (ctx) => {
    const page = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: 'session',
      where: [{ field: 'userId', value: userId }],
      paginationOpts: { cursor: null, numItems: 100 },
    })) as { page: unknown[] };
    return page.page.length;
  });
}

async function pushTokensOf(t: Convex, playerId: string) {
  const rows = (await t.run(async (ctx) => await ctx.db.query('pushTokens').collect())) as {
    playerId: string;
  }[];
  return rows.filter((row) => row.playerId === playerId);
}

async function codeOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ConvexError) return String((error.data as { code: string }).code);
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('sign out of all phones', () => {
  it('ends the sessions of every phone and drops every push token', async () => {
    const t = setup();
    const here = newPhone();
    const there = newPhone();
    const id = userOf(await signInWithApple(t, apple, here, 'apple-ann')).id;
    expect(userOf(await signInWithApple(t, apple, there, 'apple-ann')).id).toBe(id);
    const hereId = await identityOf(t, here);
    const thereId = await identityOf(t, there);
    await t
      .withIdentity(hereId)
      .mutation(api.push.registerPushToken, { token: 'ExponentPushToken[here]', platform: 'ios' });
    await t.withIdentity(thereId).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[there]',
      platform: 'android',
    });
    expect(await sessionsOf(t, id)).toBe(2);

    const reply = await call(t, here, 'sign-out-everywhere', {});
    expect(reply.status).toBe(200);
    expect(await sessionsOf(t, id)).toBe(0);
    expect(await pushTokensOf(t, id)).toEqual([]);
    // Both phones are signed out: no session, no new Convex token.
    expect((await call(t, here, 'get-session')).body).toBeNull();
    expect((await call(t, there, 'convex/token')).status).toBe(401);

    // A Convex token outlives its session (15 minutes), but it can no
    // longer save a push token: its session is gone.
    expect(
      await codeOf(
        t.withIdentity(thereId).mutation(api.push.registerPushToken, {
          token: 'ExponentPushToken[there]',
          platform: 'android',
        }),
      ),
    ).toBe('NOT_SIGNED_IN');
    expect(await pushTokensOf(t, id)).toEqual([]);

    // The account stays: the key signs in to it again.
    expect(userOf(await signInWithApple(t, apple, there, 'apple-ann')).id).toBe(id);
    await t.withIdentity(await identityOf(t, there)).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[there]',
      platform: 'android',
    });
    expect(await pushTokensOf(t, id)).toHaveLength(1);
  });

  it('refuses a guest (GUEST) and changes nothing', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    const reply = await call(t, phone, 'sign-out-everywhere', {});
    expect(reply.status).toBe(400);
    expect(reply.body['code']).toBe('GUEST');
    expect(await sessionsOf(t, id)).toBe(1);
  });

  it('needs a session', async () => {
    const t = setup();
    const reply = await call(t, newPhone(), 'sign-out-everywhere', {});
    expect(reply.status).toBe(401);
  });

  it("keeps Better Auth's revoke routes off", async () => {
    const t = setup();
    const phone = newPhone();
    const id = userOf(await signInWithApple(t, apple, phone, 'apple-ann')).id;
    for (const path of ['revoke-sessions', 'revoke-other-sessions', 'revoke-session']) {
      expect((await call(t, phone, path, {})).status).toBe(404);
    }
    expect(await sessionsOf(t, id)).toBe(1);
  });
});
