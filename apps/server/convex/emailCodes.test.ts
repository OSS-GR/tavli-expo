// The email sign-in code (#399), over the HTTP routes with convex-test.
// A recording mail sender is the inbox (`setMailSender`): no test sends
// real mail. Time windows are checked on the mutations, which take `now`.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecordingMailSender, EMAIL_CODE_TTL_MS } from '@tavli/contracts';
import type { RecordingMailSender } from '@tavli/contracts';

import { internal } from './_generated/api';
import { authComponent } from './auth';
import { OLD_ROWS_PER_CALL } from './emailCodes';
import { setMailSender } from './mail';
import { ADDRESS_LIMITS, CALLER_LIMITS, DAY, SEND_LOG_MS } from './model/emailCode';
import {
  call,
  fakeApple,
  guest,
  newPhone,
  saveApple,
  setup,
  signInWithApple,
  stopFakeApple,
  useFakeApple,
  userOf,
} from './test.apple';
import type { Convex, FakeApple, Phone } from './test.apple';

const MINUTE = 60 * 1000;
const ANN = 'ann@example.com';

let apple: FakeApple;
let mail: RecordingMailSender;

beforeAll(async () => {
  apple = await fakeApple();
});

beforeEach(() => {
  useFakeApple(apple);
  mail = createRecordingMailSender();
  setMailSender(mail);
});

afterEach(() => {
  stopFakeApple();
  setMailSender(undefined);
  vi.unstubAllEnvs();
});

function askCode(t: Convex, phone: Phone, email: string, language = 'en') {
  return call(t, phone, 'key/email-code', { email, language });
}

/** The code in the newest email to `email`. */
function codeIn(email: string): string {
  const message = mail.sent.filter((sent) => sent.to === email).at(-1);
  const code = /\b\d{6}\b/.exec(message?.text ?? '')?.[0];
  if (code === undefined) throw new Error('no code was sent');
  return code;
}

async function signInWithCode(t: Convex, phone: Phone, email: string) {
  expect((await askCode(t, phone, email)).status).toBe(200);
  return await call(t, phone, 'key/email-sign-in', {
    email,
    code: codeIn(email.trim().toLowerCase()),
  });
}

async function userRow(t: Convex, id: string) {
  return await t.run(async (ctx) => await authComponent.getAnyUserById(ctx, id));
}

async function tables(t: Convex) {
  return await t.run(async (ctx) => ({
    codes: await ctx.db.query('emailCodes').collect(),
    sends: await ctx.db.query('emailCodeSends').collect(),
    claims: await ctx.db.query('authKeys').collect(),
  }));
}

describe('asking for a code', () => {
  it('mails a code in the asked language and keeps only hashes', async () => {
    const t = setup();
    const reply = await askCode(t, newPhone(), '  Ann@Example.com ', 'el');
    expect(reply).toEqual({ status: 200, body: { sent: true } });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(ANN);
    expect(mail.sent[0]!.subject).toBe('Ο κωδικός σύνδεσης στο Tavlaki');
    const code = codeIn(ANN);
    const { codes, sends } = await tables(t);
    expect(codes).toHaveLength(1);
    expect(codes[0]!.tries).toBe(0);
    // The send log: the address, the caller (no IP in the test: none) and the day cap.
    expect(sends.map((row) => row.bucket.split(':')[0]).sort()).toEqual(['address', 'all']);
    const stored = JSON.stringify({ codes, sends });
    expect(stored).not.toContain('ann');
    expect(stored).not.toContain('example');
    expect(stored).not.toContain(code);
  });

  it('gives the same answer for a known and a new address', async () => {
    const t = setup();
    const phone = newPhone();
    expect((await signInWithCode(t, phone, ANN)).status).toBe(200);
    await call(t, phone, 'sign-out', {});
    const known = await askCode(t, newPhone(), ANN);
    const fresh = await askCode(t, newPhone(), 'bea@example.com');
    expect(known).toEqual(fresh);
  });

  it('refuses a bad address or language', async () => {
    const t = setup();
    for (const email of ['', 'ann', 'ann@example', 'a b@example.com', 42]) {
      const reply = await call(t, newPhone(), 'key/email-code', { email, language: 'en' });
      expect(reply.status).toBe(400);
      expect(reply.body['code']).toBe('INVALID_EMAIL');
    }
    const reply = await askCode(t, newPhone(), ANN, 'fr');
    expect(reply.status).toBe(400);
    expect(reply.body['code']).toBe('BAD_REQUEST');
    expect(mail.sent).toHaveLength(0);
  });

  it('says so when email codes are off, or the mail fails', async () => {
    const t = setup();
    setMailSender(null);
    let reply = await askCode(t, newPhone(), ANN);
    expect(reply.status).toBe(503);
    expect(reply.body['code']).toBe('EMAIL_OFF');

    setMailSender(mail);
    mail.fail(ANN);
    reply = await askCode(t, newPhone(), ANN);
    expect(reply.status).toBe(502);
    expect(reply.body['code']).toBe('MAIL_FAILED');
    expect(JSON.stringify(reply.body)).not.toContain(ANN);

    mail.fail(ANN, 'Rejected');
    reply = await askCode(t, newPhone(), ANN);
    expect(reply.status).toBe(400);
    expect(reply.body['code']).toBe('INVALID_EMAIL');
  });

  it('limits the codes to one address', async () => {
    const t = setup();
    const max = ADDRESS_LIMITS[0]!.max;
    for (let i = 0; i < max; i++) expect((await askCode(t, newPhone(), ANN)).status).toBe(200);
    const reply = await askCode(t, newPhone(), ANN);
    expect(reply.status).toBe(429);
    expect(reply.body['code']).toBe('RATE_LIMITED');
    expect(reply.body['retryAfterMs']).toBeGreaterThan(0);
    expect(mail.sent).toHaveLength(max);
    // Another address still gets one.
    expect((await askCode(t, newPhone(), 'bea@example.com')).status).toBe(200);
  });

  it('limits the codes of the whole server a day (EMAIL_CODES_PER_DAY)', async () => {
    const t = setup();
    vi.stubEnv('EMAIL_CODES_PER_DAY', '2');
    expect((await askCode(t, newPhone(), 'a@example.com')).status).toBe(200);
    expect((await askCode(t, newPhone(), 'b@example.com')).status).toBe(200);
    const reply = await askCode(t, newPhone(), 'c@example.com');
    expect(reply.status).toBe(429);
    expect(mail.sent).toHaveLength(2);
  });
});

describe('the send limits over time (startEmailCode)', () => {
  const now = Date.UTC(2026, 10, 9);

  function start(t: Convex, at: number, more: { address?: string; caller?: string | null } = {}) {
    return t.mutation(internal.emailCodes.startEmailCode, {
      address: more.address ?? 'address-1',
      caller: more.caller ?? null,
      codeHash: `code-${at}`,
      expiresAt: at + EMAIL_CODE_TTL_MS,
      now: at,
      perDay: 1_000,
    });
  }

  it('lets an address send again once the window has passed', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect(await start(t, now + i)).toEqual({ ok: true });
    expect(await start(t, now + 3 * MINUTE)).toEqual({
      ok: false,
      retryAfterMs: 15 * MINUTE - 3 * MINUTE,
    });
    expect(await start(t, now + 15 * MINUTE)).toEqual({ ok: true });
  });

  it('caps an address a day', async () => {
    const t = setup();
    const max = ADDRESS_LIMITS[1]!.max;
    for (let i = 0; i < max; i++) {
      expect(await start(t, now + i * 20 * MINUTE)).toEqual({ ok: true });
    }
    const late = now + max * 20 * MINUTE;
    expect(await start(t, late)).toEqual({ ok: false, retryAfterMs: now + DAY - late });
  });

  it('limits one caller over many addresses', async () => {
    const t = setup();
    const max = CALLER_LIMITS[0]!.max;
    for (let i = 0; i < max; i++) {
      expect(await start(t, now + i, { address: `address-${i}`, caller: 'caller-1' })).toEqual({
        ok: true,
      });
    }
    expect(await start(t, now + max, { address: 'address-x', caller: 'caller-1' })).toMatchObject({
      ok: false,
    });
    expect(await start(t, now + max, { address: 'address-x', caller: 'caller-2' })).toEqual({
      ok: true,
    });
  });

  it('keeps one code per address: a new one replaces the old', async () => {
    const t = setup();
    await start(t, now);
    await start(t, now + 1);
    const { codes } = await tables(t);
    expect(codes.map((row) => row.codeHash)).toEqual([`code-${now + 1}`]);
  });

  it('drops a few old rows on each call', async () => {
    const t = setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < OLD_ROWS_PER_CALL + 2; i++) {
        await ctx.db.insert('emailCodeSends', { bucket: 'all', at: now - SEND_LOG_MS - i });
        await ctx.db.insert('emailCodes', {
          address: `old-${i}`,
          codeHash: 'x',
          expiresAt: now - 1,
          tries: 0,
        });
      }
    });
    await start(t, now);
    const { codes, sends } = await tables(t);
    // 2 old rows stay for the next call; the new send has 2 rows, the new code 1.
    expect(sends).toHaveLength(2 + 2);
    expect(codes).toHaveLength(2 + 1);
  });
});

describe('using a code (useEmailCode)', () => {
  const now = Date.UTC(2026, 10, 9);

  it('is dead after its time, also for the right code', async () => {
    const t = setup();
    await t.mutation(internal.emailCodes.startEmailCode, {
      address: 'a',
      caller: null,
      codeHash: 'right',
      expiresAt: now + EMAIL_CODE_TTL_MS,
      now,
      perDay: 10,
    });
    const use = (codeHash: string, at: number) =>
      t.mutation(internal.emailCodes.useEmailCode, { address: 'a', codeHash, now: at });
    expect(await use('wrong', now + 1)).toBe('wrong');
    expect(await use('right', now + EMAIL_CODE_TTL_MS)).toBe('dead');
    expect((await tables(t)).codes).toHaveLength(0);
  });
});

describe('signing in with a code', () => {
  it('makes a saved account with the email key, and finds it again', async () => {
    const t = setup();
    const phone = newPhone();
    const reply = await signInWithCode(t, phone, 'Ann@Example.com');
    expect(reply.status).toBe(200);
    expect(typeof reply.body['token']).toBe('string');
    const user = userOf(reply);
    expect(user.isAnonymous).toBe(false);
    expect(reply.body['user']).toEqual({ id: user.id, isAnonymous: false });
    const row = await userRow(t, user.id);
    expect(row?.email).toBe(ANN);
    expect(row?.emailVerified).toBe(true);
    expect((await call(t, phone, 'key/list')).body['keys']).toEqual([{ provider: 'email' }]);
    const { claims, codes } = await tables(t);
    expect(claims.map((claim) => [claim.providerId, claim.accountId, claim.userId])).toEqual([
      ['email', ANN, user.id],
    ]);
    expect(codes).toHaveLength(0);

    const again = await signInWithCode(t, newPhone(), ANN);
    expect(userOf(again).id).toBe(user.id);
  });

  it('never joins an account that only has the same email (ADR-0008)', async () => {
    const t = setup();
    const applePhone = newPhone();
    // An Apple account whose email is Ann's address, with no email key.
    const appleUser = userOf(await signInWithAppleEmail(t, applePhone, ANN));
    expect((await userRow(t, appleUser.id))?.email).toBe(ANN);

    const reply = await signInWithCode(t, newPhone(), ANN);
    const user = userOf(reply);
    expect(user.id).not.toBe(appleUser.id);
    const row = await userRow(t, user.id);
    expect(row?.email).toMatch(/^email-[0-9a-f-]+@users\.tavlaki\.invalid$/);
    expect(row?.emailVerified).toBe(false);
  });

  it('refuses a wrong, used or missing code', async () => {
    const t = setup();
    const phone = newPhone();
    let reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code: '123456' });
    expect([reply.status, reply.body['code']]).toEqual([401, 'CODE_EXPIRED']);
    await askCode(t, phone, ANN);
    const code = codeIn(ANN);
    const wrong = code === '000000' ? '000001' : '000000';
    reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code: wrong });
    expect([reply.status, reply.body['code']]).toEqual([401, 'WRONG_CODE']);
    // Not 6 digits: a wrong try all the same.
    reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code: 'abc' });
    expect([reply.status, reply.body['code']]).toEqual([401, 'WRONG_CODE']);
    reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code: wrong });
    expect([reply.status, reply.body['code']]).toEqual([401, 'CODE_EXPIRED']);
    reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code });
    expect([reply.status, reply.body['code']]).toEqual([401, 'CODE_EXPIRED']);
    expect(phone.cookie).toBe('');
  });

  it('two sign-ins at once make one account', async () => {
    const t = setup();
    await askCode(t, newPhone(), ANN);
    const code = codeIn(ANN);
    // The second phone's code is used up by then, so both use the same one:
    // one of them wins it.
    const [a, b] = await Promise.all([
      call(t, newPhone(), 'key/email-sign-in', { email: ANN, code }),
      call(t, newPhone(), 'key/email-sign-in', { email: ANN, code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect((await tables(t)).claims).toHaveLength(1);
  });
});

describe('saving an email key', () => {
  it('saves a guest with the address and keeps its id', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    await askCode(t, phone, ANN, 'el');
    const reply = await call(t, phone, 'key/save', {
      provider: 'email',
      email: 'ANN@example.com',
      code: codeIn(ANN),
    });
    expect(reply.status).toBe(200);
    expect(userOf(reply)).toEqual({ id, isAnonymous: false });
    const row = await userRow(t, id);
    expect(row?.email).toBe(ANN);
    expect(row?.emailVerified).toBe(true);

    // The email key is the only key: it cannot go. With Apple too, it can.
    let removed = await call(t, phone, 'key/remove', { provider: 'email' });
    expect(removed.body['code']).toBe('LAST_KEY');
    expect((await saveApple(t, apple, phone, 'apple-ann')).status).toBe(200);
    expect((await call(t, phone, 'key/list')).body['keys']).toEqual([
      { provider: 'email' },
      { provider: 'apple' },
    ]);
    removed = await call(t, phone, 'key/remove', { provider: 'email' });
    expect(removed.body).toEqual({ removed: true });
    expect((await tables(t)).claims.map((claim) => claim.providerId)).toEqual(['apple']);
  });

  it('offers a guest the move when the address is another account’s key (#403)', async () => {
    const t = setup();
    const owner = userOf(await signInWithCode(t, newPhone(), ANN));
    const phone = newPhone();
    await guest(t, phone);
    await askCode(t, phone, ANN);
    const reply = await call(t, phone, 'key/save', {
      provider: 'email',
      email: ANN,
      code: codeIn(ANN),
    });
    expect([reply.status, reply.body['code']]).toEqual([409, 'KEY_BELONGS_TO_OTHER']);
    const move = reply.body['move'] as { ticket: string };
    const moved = await call(t, phone, 'key/move', { ticket: move.ticket });
    expect(userOf(moved).id).toBe(owner.id);
  });

  it('refuses a second email key, and a wrong code', async () => {
    const t = setup();
    const phone = newPhone();
    expect((await signInWithCode(t, phone, ANN)).status).toBe(200);
    await askCode(t, phone, 'bea@example.com');
    let reply = await call(t, phone, 'key/save', {
      provider: 'email',
      email: 'bea@example.com',
      code: codeIn('bea@example.com'),
    });
    expect([reply.status, reply.body['code']]).toEqual([409, 'PROVIDER_TAKEN']);
    await askCode(t, phone, 'cy@example.com');
    reply = await call(t, phone, 'key/save', {
      provider: 'email',
      email: 'cy@example.com',
      code: codeIn('cy@example.com') === '000000' ? '000001' : '000000',
    });
    expect([reply.status, reply.body['code']]).toEqual([401, 'WRONG_CODE']);
  });
});

/** An Apple sign-in whose id token carries `email`. */
async function signInWithAppleEmail(t: Convex, phone: Phone, email: string) {
  return await signInWithApple(t, apple, phone, 'apple-with-email', { email });
}
