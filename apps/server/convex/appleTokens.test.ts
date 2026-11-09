// Apple's refresh token and its revoke (#398), over the real routes with
// convex-test. A fake Apple signs the id tokens and the notices
// (`test.apple.ts`), and a fake `AppleTokenClient` stands in for Apple's
// token and revoke calls: no test reaches Apple.

import { exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { CryptoKey } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { REVOKE_TRIES, REVOKE_WAITS_MS, setAppleTokenClient } from './appleTokens';
import { APPLE_ISSUER } from './model/appleIdToken';
import type { AppleTokenClient } from './model/appleTokens';
import {
  call,
  fakeApple,
  guest,
  newPhone,
  setup,
  signInWithApple,
  stopFakeApple,
  useFakeApple,
  userOf,
} from './test.apple';
import type { Convex, FakeApple, Phone } from './test.apple';

const START = Date.UTC(2026, 10, 9, 12, 0, 0);

let apple: FakeApple;
let teamPublicKey: CryptoKey;
let teamPrivateKey: string;

beforeAll(async () => {
  apple = await fakeApple();
  const pair = await generateKeyPair('ES256', { extractable: true });
  teamPublicKey = pair.publicKey;
  teamPrivateKey = await exportPKCS8(pair.privateKey);
});

/** An id token as Apple's token call gives it (the server reads only `sub`). */
function idTokenFor(sub: string): string {
  const part = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${part({ alg: 'none' })}.${part({ sub, iss: APPLE_ISSUER })}.`;
}

/** A fake Apple token endpoint: each code names its Apple id and token. */
interface FakeTokens extends AppleTokenClient {
  readonly codes: Map<string, { sub: string; refreshToken: string }>;
  readonly exchanged: { clientId: string; clientSecret: string; code: string }[];
  readonly revoked: { clientId: string; clientSecret: string; refreshToken: string }[];
  /** What the next revokes answer. */
  revokeAnswer: boolean;
}

function fakeTokens(): FakeTokens {
  const fake: FakeTokens = {
    codes: new Map(),
    exchanged: [],
    revoked: [],
    revokeAnswer: true,
    exchangeCode: async (request) => {
      fake.exchanged.push(request);
      const entry = fake.codes.get(request.code);
      if (entry === undefined) return null;
      return { refreshToken: entry.refreshToken, idToken: idTokenFor(entry.sub) };
    },
    revoke: async (request) => {
      fake.revoked.push(request);
      return fake.revokeAnswer;
    },
  };
  return fake;
}

let tokens: FakeTokens;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  useFakeApple(apple);
  vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
  vi.stubEnv('APPLE_KEY_ID', 'KEY1234567');
  vi.stubEnv('APPLE_PRIVATE_KEY', teamPrivateKey.replace(/\n/g, '\\n'));
  tokens = fakeTokens();
  setAppleTokenClient(tokens);
});

afterEach(() => {
  setAppleTokenClient(null);
  stopFakeApple();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs the scheduled functions that are due now (each `runAfter(0)`). */
async function flush(t: Convex) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

/** Runs every later try of the revoke, and the drop after the last. */
async function runRetries(t: Convex) {
  for (const wait of [...REVOKE_WAITS_MS, REVOKE_WAITS_MS[0]]) {
    vi.advanceTimersByTime(wait);
    await t.finishInProgressScheduledFunctions();
  }
}

async function tokenRows(t: Convex) {
  return await t.run(async (ctx) => await ctx.db.query('appleTokens').collect());
}

async function revokeRows(t: Convex) {
  return await t.run(async (ctx) => await ctx.db.query('appleRevokes').collect());
}

/** Signs `phone` in with Apple as `sub` and sends a code for it. */
async function signInWithCode(t: Convex, phone: Phone, sub: string, refreshToken: string) {
  const id = userOf(await signInWithApple(t, apple, phone, sub)).id;
  tokens.codes.set(`code-${sub}`, { sub, refreshToken });
  const reply = await call(t, phone, 'key/apple-code', {
    authorizationCode: `code-${sub}`,
    clientId: 'com.tavlaki',
  });
  expect(reply).toEqual({ status: 200, body: { saved: true } });
  return id;
}

/** A server-to-server notice as Apple sends it. */
async function notice(
  t: Convex,
  events: object | string,
  options: { aud?: string; key?: CryptoKey } = {},
): Promise<number> {
  const payload = await new SignJWT({
    events: typeof events === 'string' ? events : JSON.stringify(events),
  })
    .setProtectedHeader({ alg: 'RS256', kid: apple.jwk.kid ?? 'test-key' })
    .setIssuer(APPLE_ISSUER)
    .setAudience(options.aud ?? 'com.tavlaki')
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .setJti('n1')
    .sign(options.key ?? apple.privateKey);
  const response = await t.fetch('/apple/notifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  return response.status;
}

describe('/key/apple-code', () => {
  it('trades the code with a client secret and keeps the token, encrypted', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await signInWithCode(t, phone, 'apple-ann', 'rt-ann');

    expect(tokens.exchanged).toHaveLength(1);
    const { clientId, clientSecret, code } = tokens.exchanged[0]!;
    expect({ clientId, code }).toEqual({ clientId: 'com.tavlaki', code: 'code-apple-ann' });
    // The secret is the team's ES256 JWT for this app.
    const { payload } = await jwtVerify(clientSecret, teamPublicKey, {
      issuer: 'TEAM123456',
      subject: 'com.tavlaki',
      audience: APPLE_ISSUER,
    });
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);

    const rows = await tokenRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: id, accountId: 'apple-ann', clientId: 'com.tavlaki' });
    expect(rows[0]!.refreshToken).not.toContain('rt-ann');
  });

  it('a newer code replaces the token, with no revoke', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithCode(t, phone, 'apple-ann', 'rt-1');
    tokens.codes.set('second', { sub: 'apple-ann', refreshToken: 'rt-2' });
    const reply = await call(t, phone, 'key/apple-code', {
      authorizationCode: 'second',
      clientId: 'com.tavlaki.dev',
    });
    expect(reply.status).toBe(200);
    const rows = await tokenRows(t);
    expect(rows.map((row) => row.clientId)).toEqual(['com.tavlaki.dev']);
    await flush(t);
    expect(tokens.revoked).toEqual([]);
  });

  it('keeps nothing for a guest, another app, a code of another Apple id, or a code Apple refuses', async () => {
    const t = setup();
    const guestPhone = newPhone();
    await guest(t, guestPhone);
    tokens.codes.set('ann', { sub: 'apple-ann', refreshToken: 'rt-ann' });
    tokens.codes.set('bob', { sub: 'apple-bob', refreshToken: 'rt-bob' });
    const send = (phone: Phone, authorizationCode: string, clientId = 'com.tavlaki') =>
      call(t, phone, 'key/apple-code', { authorizationCode, clientId });

    expect(await send(guestPhone, 'ann')).toMatchObject({
      status: 400,
      body: { code: 'NO_KEY' },
    });
    const phone = newPhone();
    await signInWithApple(t, apple, phone, 'apple-ann');
    expect(await send(phone, 'ann', 'com.other.app')).toMatchObject({ status: 400 });
    expect(await send(phone, 'bob')).toMatchObject({ status: 401, body: { code: 'INVALID_CODE' } });
    expect(await send(phone, 'unknown')).toMatchObject({
      status: 401,
      body: { code: 'INVALID_CODE' },
    });
    expect(await call(t, phone, 'key/apple-code', { clientId: 'com.tavlaki' })).toMatchObject({
      status: 400,
    });
    expect((await send(newPhone(), 'ann')).status).toBe(401);
    expect(await tokenRows(t)).toEqual([]);
    // A token of another Apple id is dropped, never revoked: that would
    // end the other person's Sign in with Apple.
    await flush(t);
    expect(tokens.revoked).toEqual([]);
  });

  it('keeps nothing when the key or the account goes while Apple trades the code', async () => {
    const t = setup();
    const phone = newPhone();
    const id = userOf(await signInWithApple(t, apple, phone, 'apple-ann')).id;
    tokens.codes.set('ann', { sub: 'apple-ann', refreshToken: 'rt-ann' });
    const exchange = tokens.exchangeCode;
    tokens.exchangeCode = async (request) => {
      await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
      return await exchange(request);
    };
    const reply = await call(t, phone, 'key/apple-code', {
      authorizationCode: 'ann',
      clientId: 'com.tavlaki',
    });
    expect(reply).toMatchObject({ status: 400, body: { code: 'NO_KEY' } });
    expect(await tokenRows(t)).toEqual([]);
    // The save checks the key and its user in the same transaction.
    const row = { accountId: 'apple-ann', clientId: 'com.tavlaki', refreshToken: 'x' };
    expect(await t.mutation(internal.appleTokens.saveAppleToken, { ...row, userId: id })).toBe(
      false,
    );
    const bob = userOf(await signInWithApple(t, apple, newPhone(), 'apple-bob')).id;
    expect(await t.mutation(internal.appleTokens.saveAppleToken, { ...row, userId: bob })).toBe(
      false,
    );
    expect(await tokenRows(t)).toEqual([]);
  });

  it('keeps nothing without the APPLE_* key in the env', async () => {
    const t = setup();
    vi.stubEnv('APPLE_PRIVATE_KEY', '');
    const phone = newPhone();
    await signInWithApple(t, apple, phone, 'apple-ann');
    tokens.codes.set('ann', { sub: 'apple-ann', refreshToken: 'rt-ann' });
    const reply = await call(t, phone, 'key/apple-code', {
      authorizationCode: 'ann',
      clientId: 'com.tavlaki',
    });
    expect(reply.status).toBe(401);
    expect(tokens.exchanged).toEqual([]);
    expect(await tokenRows(t)).toEqual([]);
  });
});

describe('the revoke', () => {
  it('account delete queues the token in its own transaction and revokes it after', async () => {
    const t = setup();
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});

    // The delete is done; the token waits in a queue with no user id.
    expect(await tokenRows(t)).toEqual([]);
    const queued = await revokeRows(t);
    expect(queued).toHaveLength(1);
    expect(Object.keys(queued[0]!).sort()).toEqual(
      ['_creationTime', '_id', 'attempts', 'clientId', 'refreshToken'].sort(),
    );
    // The scheduler gets the queue row's id, never the token.
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
    );
    const revoke = scheduled.filter((job) => job.name.includes('revokeAppleToken'));
    expect(revoke.map((job) => job.args)).toEqual([[{ id: queued[0]!._id }]]);
    expect(tokens.revoked).toEqual([]);

    await flush(t);
    expect(tokens.revoked).toHaveLength(1);
    expect(tokens.revoked[0]).toMatchObject({ clientId: 'com.tavlaki', refreshToken: 'rt-ann' });
    const { payload } = await jwtVerify(tokens.revoked[0]!.clientSecret, teamPublicKey, {
      issuer: 'TEAM123456',
      subject: 'com.tavlaki',
      audience: APPLE_ISSUER,
    });
    expect(payload.sub).toBe('com.tavlaki');
    expect(await revokeRows(t)).toEqual([]);
  });

  it('a failed revoke tries again over about an hour, then drops the token and logs no token or id', async () => {
    const t = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tokens.revokeAnswer = false;
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
    await flush(t);
    expect(tokens.revoked).toHaveLength(1);
    expect(await revokeRows(t)).toMatchObject([{ attempts: 1 }]);

    await runRetries(t);
    expect(tokens.revoked).toHaveLength(REVOKE_TRIES);
    expect(tokens.revoked.map((r) => r.refreshToken)).toEqual(Array(REVOKE_TRIES).fill('rt-ann'));
    expect(await revokeRows(t)).toEqual([]);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('apple revoke failed');
    expect(logged).not.toContain('rt-ann');
    expect(logged).not.toContain('apple-ann');
    expect(logged).not.toContain(id);
  });

  it('an error in a try logs only its name, and the next try still runs', async () => {
    const t = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    tokens.revoke = async () => {
      throw new Error('boom rt-ann apple-ann');
    };
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
    await flush(t);
    expect(await revokeRows(t)).toMatchObject([{ attempts: 1 }]);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('apple revoke error');
    expect(logged).not.toContain('rt-ann');
    expect(logged).not.toContain('apple-ann');
    await runRetries(t);
    expect(await revokeRows(t)).toEqual([]);
  });

  it('without the APPLE_* key the token is dropped with an error in the log', async () => {
    const t = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    vi.stubEnv('APPLE_KEY_ID', '');
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
    await flush(t);
    expect(tokens.revoked).toEqual([]);
    expect(await revokeRows(t)).toEqual([]);
    expect(JSON.stringify(error.mock.calls)).toContain('no APPLE_* key');
  });

  it('a try that never ends still leaves no row: the next step is booked first', async () => {
    const t = setup();
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    await t.withIdentity({ subject: id }).mutation(api.account.deleteMyAccount, {});
    const [queued] = await revokeRows(t);
    // Two tries that crash, as if Apple's call never came back.
    for (let i = 0; i < REVOKE_TRIES; i += 1) {
      await t.mutation(internal.appleTokens.startRevoke, { id: queued!._id });
    }
    expect(await revokeRows(t)).toMatchObject([{ attempts: REVOKE_TRIES }]);
    const steps = await t.run(
      async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
    );
    expect(steps.some((job) => job.name.includes('dropRevoke'))).toBe(true);
    tokens.revokeAnswer = false;
    await flush(t);
    await runRetries(t);
    expect(await revokeRows(t)).toEqual([]);
  });

  it('removing a key revokes its token (releaseKey)', async () => {
    const t = setup();
    const id = await signInWithCode(t, newPhone(), 'apple-ann', 'rt-ann');
    await t.mutation(internal.authKeys.releaseKey, {
      providerId: 'apple',
      accountId: 'apple-ann',
      userId: id,
    });
    expect(await tokenRows(t)).toEqual([]);
    await flush(t);
    expect(tokens.revoked.map((r) => r.refreshToken)).toEqual(['rt-ann']);
  });
});

describe('/apple/notifications', () => {
  it('consent-revoked of the last key deletes the account, with no revoke', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await signInWithCode(t, phone, 'apple-ann', 'rt-ann');
    const status = await notice(t, {
      type: 'consent-revoked',
      sub: 'apple-ann',
      event_time: Date.now(),
    });
    expect(status).toBe(200);
    expect(await tokenRows(t)).toEqual([]);
    expect(await revokeRows(t)).toEqual([]);
    await flush(t);
    expect(tokens.revoked).toEqual([]);
    // The user is gone: the session no longer works, and the Apple id is free.
    expect((await call(t, phone, 'key/list')).status).toBe(401);
    const fresh = userOf(await signInWithApple(t, apple, newPhone(), 'apple-ann'));
    expect(fresh.id).not.toBe(id);
  });

  it('account-delete does the same', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithCode(t, phone, 'apple-ann', 'rt-ann');
    expect(
      await notice(t, { type: 'account-delete', sub: 'apple-ann', event_time: Date.now() }),
    ).toBe(200);
    expect((await call(t, phone, 'key/list')).status).toBe(401);
  });

  it('changes nothing for an email notice, an unknown Apple id, an old notice or one with no time', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithCode(t, phone, 'apple-ann', 'rt-ann');
    expect(await notice(t, { type: 'email-disabled', sub: 'apple-ann' })).toBe(200);
    expect(await notice(t, { type: 'consent-revoked', sub: 'apple-bob' })).toBe(200);
    // About an older key of the same Apple id: before this key was made.
    expect(
      await notice(t, { type: 'consent-revoked', sub: 'apple-ann', event_time: START - 60_000 }),
    ).toBe(200);
    // With no time it could be such an old notice too.
    expect(await notice(t, { type: 'account-delete', sub: 'apple-ann' })).toBe(200);
    expect((await call(t, phone, 'key/list')).status).toBe(200);
    expect(await tokenRows(t)).toHaveLength(1);
  });

  it('answers 400 to a notice that is not Apple’s for our app', async () => {
    const t = setup();
    const phone = newPhone();
    await signInWithCode(t, phone, 'apple-ann', 'rt-ann');
    const other = (await generateKeyPair('RS256')).privateKey;
    const events = { type: 'consent-revoked', sub: 'apple-ann' };
    expect(await notice(t, events, { key: other })).toBe(400);
    expect(await notice(t, events, { aud: 'com.other.app' })).toBe(400);
    const junk = await t.fetch('/apple/notifications', { method: 'POST', body: 'not json' });
    expect(junk.status).toBe(400);
    expect((await call(t, phone, 'key/list')).status).toBe(200);
  });
});
