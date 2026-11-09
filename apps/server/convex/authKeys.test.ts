// Sign in with Apple and saving a guest (#397), over the HTTP routes with
// convex-test. A fake Apple signs the id tokens (`test.apple.ts`): no test
// reaches Apple.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { api, internal } from './_generated/api';
import { authComponent } from './auth';
import { CLAIM_GRACE_MS } from './authKeys';
import {
  appleToken,
  call,
  convexToken,
  fakeApple,
  guest,
  newPhone,
  nonce,
  payloadOf,
  saveApple,
  SERVICES_ID,
  setup,
  signInWithApple,
  stopFakeApple,
  useFakeApple,
  userOf,
} from './test.apple';
import type { Convex, FakeApple } from './test.apple';

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

async function userRow(t: Convex, id: string) {
  return await t.run(async (ctx) => await authComponent.getAnyUserById(ctx, id));
}

async function claims(t: Convex) {
  return await t.run(async (ctx) => await ctx.db.query('authKeys').collect());
}

async function keysOf(t: Convex, phone: ReturnType<typeof newPhone>) {
  return (await call(t, phone, 'key/list')).body['keys'];
}

describe('sign in with Apple (no session)', () => {
  it('makes a saved account, and the Convex token names it', async () => {
    const t = setup();
    const phone = newPhone();
    const reply = await signInWithApple(t, apple, phone, 'apple-ann');
    expect(reply.status).toBe(200);
    const user = userOf(reply);
    expect(user.isAnonymous).toBe(false);
    expect(payloadOf(await convexToken(t, phone))['sub']).toBe(user.id);
    expect(await claims(t)).toMatchObject([
      { providerId: 'apple', accountId: 'apple-ann', userId: user.id },
    ]);
    // No name and no photo from Apple.
    const row = await userRow(t, user.id);
    expect(row?.name).toBe('');
    expect(row?.image ?? null).toBeNull();
  });

  it('signs the same Apple id in to the same account on a new phone', async () => {
    const t = setup();
    const first = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    const second = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    expect(second.id).toBe(first.id);
    expect(await claims(t)).toHaveLength(1);
  });

  it('a Convex token holds no email or name', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithApple(t, apple, phone, 'apple-ann');
    const payload = payloadOf(await convexToken(t, phone));
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sessionId', 'sub']);
  });

  it('turns down a token with no nonce, a nonce we did not make, or a used nonce', async () => {
    const t = setup();
    const phone = newPhone();
    const token = await appleToken(apple, { sub: 'apple-ann' });
    const noNonce = await call(t, phone, 'sign-in/social', {
      provider: 'apple',
      idToken: { token },
    });
    expect(noNonce.status).toBe(401);

    const madeUp = 'madeup';
    const forged = await call(t, phone, 'sign-in/social', {
      provider: 'apple',
      idToken: {
        token: await appleToken(apple, { sub: 'apple-ann', nonce: madeUp }),
        nonce: madeUp,
      },
    });
    expect(forged.status).toBe(401);

    const value = await nonce(t, phone);
    const good = {
      provider: 'apple',
      idToken: { token: await appleToken(apple, { sub: 'apple-ann', nonce: value }), nonce: value },
    };
    expect((await call(t, newPhone(), 'sign-in/social', good)).status).toBe(200);
    // The same token and nonce again: the nonce is used up.
    expect((await call(t, newPhone(), 'sign-in/social', good)).status).toBe(401);
  });

  it('turns down a token for another app, from another issuer, or signed by another key', async () => {
    const t = setup();
    const other = await fakeApple('other-key');
    for (const bad of [
      { aud: 'com.someone.else' },
      { iss: 'https://example.com' },
      { signWith: other.privateKey },
    ]) {
      const value = await nonce(t, newPhone());
      const token = await appleToken(apple, { sub: 'apple-ann', nonce: value, ...bad });
      const reply = await call(t, newPhone(), 'sign-in/social', {
        provider: 'apple',
        idToken: { token, nonce: value },
      });
      expect(reply.status).toBe(401);
    }
    expect(await claims(t)).toEqual([]);
  });

  it('takes a token for each app variant and the Services ID', async () => {
    const t = setup();
    for (const aud of ['com.tavlaki', 'com.tavlaki.dev', 'com.tavlaki.preview', SERVICES_ID]) {
      const value = await nonce(t, newPhone());
      const token = await appleToken(apple, { sub: `apple-${aud}`, nonce: value, aud });
      const reply = await call(t, newPhone(), 'sign-in/social', {
        provider: 'apple',
        idToken: { token, nonce: value },
      });
      expect(reply.status).toBe(200);
    }
  });

  it('takes a token that holds the SHA-256 of the nonce (the iOS sheet with a hashed nonce)', async () => {
    const t = setup();
    const value = await nonce(t, newPhone());
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const token = await appleToken(apple, { sub: 'apple-ann', nonce: hex });
    const reply = await call(t, newPhone(), 'sign-in/social', {
      provider: 'apple',
      idToken: { token, nonce: value },
    });
    expect(reply.status).toBe(200);
  });

  it('never joins an Apple id to another user with the same email', async () => {
    const t = setup();
    const phone = newPhone();
    const first = userOf(await signInWithApple(t, apple, phone, 'apple-ann'));
    const email = (await userRow(t, first.id))?.email;
    const value = await nonce(t, newPhone());
    const token = await appleToken(apple, { sub: 'apple-other', nonce: value, email: email ?? '' });
    const reply = await call(t, newPhone(), 'sign-in/social', {
      provider: 'apple',
      idToken: { token, nonce: value },
    });
    expect(reply.status).toBe(401);
    expect(await claims(t)).toHaveLength(1);
  });
});

describe('a guest saves their account with Apple', () => {
  it('keeps the same id and invites, is no longer a guest, and copies the email', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    const code = await t.withIdentity({ subject: id }).mutation(api.invites.createInvite, {
      choice: 'portes',
      targetPoints: 3,
      turnTimeMinutes: 1,
    });

    const reply = await saveApple(t, apple, phone, 'apple-ann');
    expect(reply.status).toBe(200);
    expect(userOf(reply)).toEqual({ id, isAnonymous: false });
    const row = await userRow(t, id);
    expect(row?.isAnonymous).toBe(false);
    expect(row?.email).toBe('apple-ann@privaterelay.appleid.com');
    expect(row?.emailVerified).toBe(true);
    expect(await keysOf(t, phone)).toEqual([{ provider: 'apple' }]);
    // The same session goes on, with the same player id.
    expect(payloadOf(await convexToken(t, phone))['sub']).toBe(id);
    expect(
      (await t.withIdentity({ subject: id }).query(api.invites.getInvite, { code }))?.from,
    ).toBe(id);

    // A later Apple sign-in on another phone opens this account, and never deletes it.
    const later = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    expect(later.id).toBe(id);
    expect(await userRow(t, id)).not.toBeNull();
  });

  it('saving the same key again changes nothing', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    await saveApple(t, apple, phone, 'apple-ann');
    const again = await saveApple(t, apple, phone, 'apple-ann');
    expect(again.status).toBe(200);
    expect(userOf(again).id).toBe(id);
    expect(await claims(t)).toHaveLength(1);
  });

  it('a key on another user gives KEY_BELONGS_TO_OTHER and changes nothing', async () => {
    const t = setup();
    const owner = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    const phone = newPhone();
    const id = await guest(t, phone);
    const reply = await saveApple(t, apple, phone, 'apple-ann');
    expect(reply.status).toBe(409);
    expect(reply.body['code']).toBe('KEY_BELONGS_TO_OTHER');
    const row = await userRow(t, id);
    expect(row?.isAnonymous).toBe(true);
    expect(await keysOf(t, phone)).toEqual([]);
    expect(await claims(t)).toMatchObject([{ accountId: 'apple-ann', userId: owner.id }]);
  });

  it('a claim made a moment earlier by another user wins (the race path)', async () => {
    const t = setup();
    // Another request claimed the key, but has not made its account row yet.
    await t.mutation(internal.authKeys.claimKey, {
      providerId: 'apple',
      accountId: 'apple-ann',
      userId: 'someone-else',
      now: Date.now(),
    });
    const phone = newPhone();
    const id = await guest(t, phone);
    const reply = await saveApple(t, apple, phone, 'apple-ann');
    expect(reply.status).toBe(409);
    expect(reply.body['code']).toBe('KEY_BELONGS_TO_OTHER');
    expect((await userRow(t, id))?.isAnonymous).toBe(true);
    expect(await keysOf(t, phone)).toEqual([]);
    // A fresh sign-in with that key is turned down too.
    expect((await signInWithApple(t, apple, newPhone(), 'apple-ann')).status).not.toBe(200);
  });

  it('a stale claim (its account write failed) does not lock the Apple id out', async () => {
    const t = setup();
    // A claim long ago, with no account row behind it.
    await t.mutation(internal.authKeys.claimKey, {
      providerId: 'apple',
      accountId: 'apple-ann',
      userId: 'someone-else',
      now: 0,
    });
    const phone = newPhone();
    const id = await guest(t, phone);
    const reply = await saveApple(t, apple, phone, 'apple-ann');
    expect(reply.status).toBe(200);
    expect(userOf(reply)).toEqual({ id, isAnonymous: false });
    expect(await claims(t)).toMatchObject([{ accountId: 'apple-ann', userId: id }]);
  });

  it('an old claim with an account row behind it still wins', async () => {
    const t = setup();
    const owner = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('authKeys').collect()) {
        await ctx.db.patch(row._id, { claimedAt: 0 });
      }
    });
    // `/key/save` stops at the account row first, so ask `claimKey` itself.
    const claimed = await t.mutation(internal.authKeys.claimKey, {
      providerId: 'apple',
      accountId: 'apple-ann',
      userId: 'someone-else',
      now: Date.now(),
    });
    expect(claimed).toBe(owner.id);
    expect(await claims(t)).toMatchObject([{ accountId: 'apple-ann', userId: owner.id }]);
  });

  it('a second Apple id on the same account is turned down', async () => {
    const t = setup();
    const phone = newPhone();
    await guest(t, phone);
    await saveApple(t, apple, phone, 'apple-ann');
    const reply = await saveApple(t, apple, phone, 'apple-bob');
    expect(reply.status).toBe(409);
    expect(reply.body['code']).toBe('PROVIDER_TAKEN');
    expect(await claims(t)).toHaveLength(1);
  });

  it('a bad token saves nothing', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    const value = await nonce(t, phone);
    const token = await appleToken(apple, { sub: 'apple-ann', nonce: 'another-nonce' });
    const reply = await call(t, phone, 'key/save', {
      provider: 'apple',
      idToken: { token, nonce: value },
    });
    expect(reply.status).toBe(401);
    expect((await userRow(t, id))?.isAnonymous).toBe(true);
  });

  it('needs a session', async () => {
    const t = setup();
    const reply = await saveApple(t, apple, newPhone(), 'apple-ann');
    expect(reply.status).toBe(401);
    expect(await claims(t)).toEqual([]);
  });

  it('an Apple sign-in on a phone with a guest session never deletes the guest', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    const other = userOf(await signInWithApple(t, apple, phone, 'apple-ann'));
    expect(other.id).not.toBe(id);
    expect(await userRow(t, id)).not.toBeNull();
  });
});

describe('keys', () => {
  it('lists none for a guest', async () => {
    const t = setup();
    const phone = newPhone();
    await guest(t, phone);
    expect(await keysOf(t, phone)).toEqual([]);
  });

  it('never removes the last key', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithApple(t, apple, phone, 'apple-ann');
    const reply = await call(t, phone, 'key/remove', { provider: 'apple' });
    expect(reply.status).toBe(409);
    expect(reply.body['code']).toBe('LAST_KEY');
    expect(await keysOf(t, phone)).toEqual([{ provider: 'apple' }]);
  });

  it('keeps /link-social and /unlink-account off', async () => {
    const t = setup();
    const phone = newPhone();
    await guest(t, phone);
    const link = await call(t, phone, 'link-social', { provider: 'apple' });
    const unlink = await call(t, phone, 'unlink-account', { providerId: 'apple' });
    expect(link.status).toBe(404);
    expect(unlink.status).toBe(404);
  });

  it('deleting the account frees the Apple id', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    await saveApple(t, apple, phone, 'apple-ann');
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
    expect(await claims(t)).toEqual([]);
    const fresh = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    expect(fresh.id).not.toBe(id);
  });
});

describe('claimKey and useKeyNonce', () => {
  it('the first claim wins; a second user gets the owner back and writes nothing', async () => {
    const t = setup();
    const key = { providerId: 'apple', accountId: 'apple-ann', now: 1_000 };
    expect(await t.mutation(internal.authKeys.claimKey, { ...key, userId: 'u1' })).toBe('u1');
    expect(await t.mutation(internal.authKeys.claimKey, { ...key, userId: 'u2' })).toBe('u1');
    expect(await t.mutation(internal.authKeys.claimKey, { ...key, userId: 'u1' })).toBe('u1');
    expect(await claims(t)).toHaveLength(1);
    // Another user's claim stays when someone else releases it.
    const own = { providerId: key.providerId, accountId: key.accountId };
    await t.mutation(internal.authKeys.releaseKey, { ...own, userId: 'u2' });
    expect(await claims(t)).toHaveLength(1);
    await t.mutation(internal.authKeys.releaseKey, { ...own, userId: 'u1' });
    expect(await claims(t)).toEqual([]);
  });

  it('a claim with no account row stays its owner’s for CLAIM_GRACE_MS, then goes to the next user', async () => {
    const t = setup();
    const key = { providerId: 'apple', accountId: 'apple-ann' };
    const claim = (userId: string, now: number) =>
      t.mutation(internal.authKeys.claimKey, { ...key, userId, now });
    expect(await claim('u1', 1_000)).toBe('u1');
    expect(await claim('u2', 1_000 + CLAIM_GRACE_MS - 1)).toBe('u1');
    expect(await claim('u2', 1_000 + CLAIM_GRACE_MS)).toBe('u2');
    // The repaired claim starts its own grace time.
    expect(await claim('u3', 1_000 + 2 * CLAIM_GRACE_MS - 1)).toBe('u2');
    expect(await claims(t)).toMatchObject([
      { ...key, userId: 'u2', claimedAt: 1_000 + CLAIM_GRACE_MS },
    ]);
  });

  it('a nonce works once, and old rows go', async () => {
    const t = setup();
    const use = (nonceText: string, expiresAt: number, now: number) =>
      t.mutation(internal.authKeys.useKeyNonce, { nonce: nonceText, expiresAt, now });
    expect(await use('a', 1_000, 0)).toBe(true);
    expect(await use('a', 1_000, 10)).toBe(false);
    expect(await use('b', 5_000, 2_000)).toBe(true);
    const rows = await t.run(async (ctx) => await ctx.db.query('usedKeyNonces').collect());
    expect(rows.map((row) => row.nonce)).toEqual(['b']);
  });
});
