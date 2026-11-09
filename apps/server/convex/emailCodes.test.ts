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
/** The answer to every code request that went through. */
const SENT = { status: 200, body: { sent: true, ticket: expect.any(String) } };

let apple: FakeApple;
let mail: RecordingMailSender;
/** The ticket of the newest code each address got (normalized address). */
let tickets: Map<string, string>;

beforeAll(async () => {
  apple = await fakeApple();
});

beforeEach(() => {
  useFakeApple(apple);
  mail = createRecordingMailSender();
  setMailSender(mail);
  tickets = new Map();
});

afterEach(() => {
  stopFakeApple();
  setMailSender(undefined);
  vi.unstubAllEnvs();
});

async function askCode(t: Convex, phone: Phone, email: string, language = 'en') {
  const reply = await call(t, phone, 'key/email-code', { email, language });
  const ticket = reply.body['ticket'];
  if (typeof ticket === 'string') tickets.set(email.trim().toLowerCase(), ticket);
  return reply;
}

/** The code in the newest email to `email`. */
function codeIn(email: string): string {
  const message = mail.sent.filter((sent) => sent.to === email).at(-1);
  const code = /\b\d{6}\b/.exec(message?.text ?? '')?.[0];
  if (code === undefined) throw new Error('no code was sent');
  return code;
}

/** What proves `email` (normalized): a code, by default the newest, and its ticket. */
function proof(email: string, code = codeIn(email)) {
  return { email, code, ticket: tickets.get(email) ?? '' };
}

async function signInWithCode(t: Convex, phone: Phone, email: string) {
  expect((await askCode(t, phone, email)).status).toBe(200);
  return await call(t, phone, 'key/email-sign-in', {
    ...proof(email.trim().toLowerCase()),
    email,
  });
}

/** Another code than `code`. */
function wrongTo(code: string): string {
  return code === '000000' ? '000001' : '000000';
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
    expect(reply).toEqual({ status: 200, body: { sent: true, ticket: expect.any(String) } });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(ANN);
    expect(mail.sent[0]!.subject).toBe('Ο κωδικός σύνδεσης στο Tavlaki');
    const code = codeIn(ANN);
    const { codes, sends } = await tables(t);
    expect(codes).toHaveLength(1);
    expect(codes[0]!.tries).toBe(0);
    // The send log: the address, the caller (no IP in the test: none) and
    // the day cap of new addresses.
    expect(sends.map((row) => row.bucket.split(':')[0]).sort()).toEqual(['address', 'new']);
    const stored = JSON.stringify({ codes, sends });
    expect(stored).not.toContain('ann');
    expect(stored).not.toContain('example');
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(tickets.get(ANN));
  });

  it('gives the same answer for a known and a new address', async () => {
    const t = setup();
    const phone = newPhone();
    expect((await signInWithCode(t, phone, ANN)).status).toBe(200);
    await call(t, phone, 'sign-out', {});
    const known = await askCode(t, newPhone(), ANN);
    const fresh = await askCode(t, newPhone(), 'bea@example.com');
    // Each gets its own ticket; nothing else differs.
    expect(known).toEqual(SENT);
    expect(fresh).toEqual(SENT);
    expect(fresh.body['ticket']).not.toBe(known.body['ticket']);
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
    const phone = newPhone();
    expect((await askCode(t, phone, ANN)).status).toBe(200);
    const sent = proof(ANN);
    const before = await tables(t);
    mail.fail(ANN);
    reply = await askCode(t, newPhone(), ANN);
    expect(reply.status).toBe(502);
    expect(reply.body['code']).toBe('MAIL_FAILED');
    expect(JSON.stringify(reply.body)).not.toContain(ANN);
    // The failed send is taken back: no new code, no limit used, and the
    // code sent before still works.
    expect(await tables(t)).toEqual(before);
    expect((await call(t, phone, 'key/email-sign-in', sent)).status).toBe(200);
  });

  it('answers a refused address like any other (no one learns which ones the mail service refuses)', async () => {
    const t = setup();
    mail.fail(ANN, 'Rejected');
    const refused = await askCode(t, newPhone(), ANN);
    const fine = await askCode(t, newPhone(), 'bea@example.com');
    expect(refused).toEqual(SENT);
    expect(fine).toEqual(SENT);
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

  it('limits the codes to new addresses a day (EMAIL_CODES_PER_DAY), never a player’s email key', async () => {
    const t = setup();
    vi.stubEnv('EMAIL_CODES_PER_DAY', '2');
    // Ann has an email key; her sign-in was the first new address.
    expect((await signInWithCode(t, newPhone(), ANN)).status).toBe(200);
    expect((await askCode(t, newPhone(), 'b@example.com')).status).toBe(200);
    const reply = await askCode(t, newPhone(), 'c@example.com');
    expect(reply.status).toBe(429);
    expect(mail.sent).toHaveLength(2);
    // A flood of new addresses never locks out a player with an email key.
    expect((await askCode(t, newPhone(), ANN)).status).toBe(200);
    expect(mail.sent).toHaveLength(3);
  });
});

describe('the send limits over time (startEmailCode)', () => {
  const now = Date.UTC(2026, 10, 9);

  function start(
    t: Convex,
    at: number,
    more: { address?: string; caller?: string | null; known?: boolean; perDay?: number } = {},
  ) {
    return t.mutation(internal.emailCodes.startEmailCode, {
      address: more.address ?? 'address-1',
      caller: more.caller ?? null,
      codeHash: `code-${at}`,
      ticket: `ticket-${at}-${more.address ?? 'address-1'}`,
      known: more.known ?? false,
      expiresAt: at + EMAIL_CODE_TTL_MS,
      now: at,
      perDay: more.perDay ?? 1_000,
    });
  }
  const sent = { ok: true };

  it('lets an address send again once the window has passed', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect(await start(t, now + i)).toMatchObject(sent);
    expect(await start(t, now + 3 * MINUTE)).toEqual({
      ok: false,
      retryAfterMs: 15 * MINUTE - 3 * MINUTE,
    });
    expect(await start(t, now + 15 * MINUTE)).toMatchObject(sent);
  });

  it('counts the day cap only for new addresses', async () => {
    const t = setup();
    expect(await start(t, now, { address: 'a', perDay: 1 })).toMatchObject(sent);
    expect(await start(t, now + 1, { address: 'b', perDay: 1 })).toMatchObject({ ok: false });
    expect(await start(t, now + 2, { address: 'c', perDay: 1, known: true })).toMatchObject(sent);
    expect(await start(t, now + DAY, { address: 'b', perDay: 1 })).toMatchObject(sent);
  });

  it('takes a send back (cancelEmailCode)', async () => {
    const t = setup();
    const first = await start(t, now);
    const second = await start(t, now + 1);
    if (!second.ok) throw new Error('not sent');
    await t.mutation(internal.emailCodes.cancelEmailCode, {
      code: second.code,
      sends: second.sends,
    });
    const { codes, sends } = await tables(t);
    expect(codes.map((row) => row._id)).toEqual([first.ok ? first.code : null]);
    expect(sends.every((row) => row.at === now)).toBe(true);
  });

  it('caps an address a day', async () => {
    const t = setup();
    const max = ADDRESS_LIMITS[1]!.max;
    for (let i = 0; i < max; i++) {
      expect(await start(t, now + i * 20 * MINUTE)).toMatchObject(sent);
    }
    const late = now + max * 20 * MINUTE;
    expect(await start(t, late)).toEqual({ ok: false, retryAfterMs: now + DAY - late });
  });

  it('limits one caller over many addresses', async () => {
    const t = setup();
    const max = CALLER_LIMITS[0]!.max;
    for (let i = 0; i < max; i++) {
      expect(
        await start(t, now + i, { address: `address-${i}`, caller: 'caller-1' }),
      ).toMatchObject(sent);
    }
    expect(await start(t, now + max, { address: 'address-x', caller: 'caller-1' })).toMatchObject({
      ok: false,
    });
    expect(await start(t, now + max, { address: 'address-x', caller: 'caller-2' })).toMatchObject(
      sent,
    );
  });

  it('keeps a code per send: a new one ends no other phone’s code', async () => {
    const t = setup();
    await start(t, now);
    await start(t, now + 1);
    const { codes } = await tables(t);
    expect(codes.map((row) => row.codeHash)).toEqual([`code-${now}`, `code-${now + 1}`]);
  });

  it('drops a few old rows on each call', async () => {
    const t = setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < OLD_ROWS_PER_CALL + 2; i++) {
        await ctx.db.insert('emailCodeSends', { bucket: 'all', at: now - SEND_LOG_MS - i });
        await ctx.db.insert('emailCodes', {
          ticket: `old-${i}`,
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
    await startCode(t);
    const use = (codeHash: string, at: number) =>
      t.mutation(internal.emailCodes.useEmailCode, {
        ticket: 't',
        address: 'a',
        codeHash,
        now: at,
      });
    expect(await use('wrong', now + 1)).toBe('wrong');
    expect(await use('right', now + EMAIL_CODE_TTL_MS)).toBe('dead');
    expect((await tables(t)).codes).toHaveLength(0);
  });

  it('reaches no code without its ticket, and counts no try then', async () => {
    const t = setup();
    await startCode(t);
    const use = (ticket: string, address: string) =>
      t.mutation(internal.emailCodes.useEmailCode, { ticket, address, codeHash: 'wrong', now });
    for (let i = 0; i < 5; i++) {
      expect(await use('other', 'a')).toBe('dead');
      // The ticket of another address.
      expect(await use('t', 'b')).toBe('dead');
    }
    expect((await tables(t)).codes.map((row) => row.tries)).toEqual([0]);
  });

  function startCode(t: Convex) {
    return t.mutation(internal.emailCodes.startEmailCode, {
      address: 'a',
      caller: null,
      codeHash: 'right',
      ticket: 't',
      known: false,
      expiresAt: now + EMAIL_CODE_TTL_MS,
      now,
      perDay: 10,
    });
  }
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
    const reply = await call(t, phone, 'key/email-sign-in', { email: ANN, code: '123456' });
    expect([reply.status, reply.body['code']]).toEqual([401, 'CODE_EXPIRED']);
    await askCode(t, phone, ANN);
    const right = proof(ANN);
    const wrong = { ...right, code: wrongTo(right.code) };
    const signIn = async (body: object) => {
      const answer = await call(t, phone, 'key/email-sign-in', body);
      return [answer.status, answer.body['code']];
    };
    expect(await signIn(wrong)).toEqual([401, 'WRONG_CODE']);
    // Not 6 digits: wrong, but no try (it cannot be right).
    expect(await signIn({ ...right, code: 'abc' })).toEqual([401, 'WRONG_CODE']);
    expect(await signIn(wrong)).toEqual([401, 'WRONG_CODE']);
    // The third wrong try ends the code.
    expect(await signIn(wrong)).toEqual([401, 'CODE_EXPIRED']);
    expect(await signIn(right)).toEqual([401, 'CODE_EXPIRED']);
    expect(phone.cookie).toBe('');
  });

  it('a stranger with the address but not the ticket cannot use up the code', async () => {
    const t = setup();
    const phone = newPhone();
    await askCode(t, phone, ANN);
    const right = proof(ANN);
    const stranger = newPhone();
    for (const ticket of ['', 'A'.repeat(22), 'not a ticket']) {
      for (let i = 0; i < 3; i++) {
        const reply = await call(t, stranger, 'key/email-sign-in', {
          email: ANN,
          code: wrongTo(right.code),
          ticket,
        });
        expect(reply.body['code']).toBe('CODE_EXPIRED');
      }
    }
    // A new code for the address, asked by the stranger, ends no other code.
    await askCode(t, stranger, ANN);
    expect((await call(t, phone, 'key/email-sign-in', right)).status).toBe(200);
  });

  it('refuses a signed-in phone, which saves the key instead, and keeps the code', async () => {
    const t = setup();
    const phone = newPhone();
    const id = await guest(t, phone);
    await askCode(t, phone, ANN);
    const reply = await call(t, phone, 'key/email-sign-in', proof(ANN));
    expect([reply.status, reply.body['code']]).toEqual([409, 'SIGNED_IN']);
    // The guest is still signed in, and the code still saves it.
    const saved = await call(t, phone, 'key/save', { provider: 'email', ...proof(ANN) });
    expect(userOf(saved)).toEqual({ id, isAnonymous: false });
  });

  it('two sign-ins at once make one account', async () => {
    const t = setup();
    await askCode(t, newPhone(), ANN);
    const right = proof(ANN);
    // Both use the same code and ticket: one of them wins it.
    const [a, b] = await Promise.all([
      call(t, newPhone(), 'key/email-sign-in', right),
      call(t, newPhone(), 'key/email-sign-in', right),
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
      ...proof(ANN),
      email: 'ANN@example.com',
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
    const reply = await call(t, phone, 'key/save', { provider: 'email', ...proof(ANN) });
    expect([reply.status, reply.body['code']]).toEqual([409, 'KEY_BELONGS_TO_OTHER']);
    const move = reply.body['move'] as { ticket: string };
    const moved = await call(t, phone, 'key/move', { ticket: move.ticket });
    expect(userOf(moved).id).toBe(owner.id);
  });

  it('refuses a second email key before it uses the code', async () => {
    const t = setup();
    const phone = newPhone();
    expect((await signInWithCode(t, phone, ANN)).status).toBe(200);
    const bea = 'bea@example.com';
    await askCode(t, phone, bea);
    const save = (body: object) => call(t, phone, 'key/save', { provider: 'email', ...body });
    const reply = await save(proof(bea));
    expect([reply.status, reply.body['code']]).toEqual([409, 'PROVIDER_TAKEN']);
    // Its own address again: nothing to do, and no code needed.
    expect((await save({ email: ANN, code: '000000', ticket: '' })).status).toBe(200);
    // The refused save left Bea's code unused.
    expect((await call(t, newPhone(), 'key/email-sign-in', proof(bea))).status).toBe(200);
  });

  it('refuses a wrong code', async () => {
    const t = setup();
    const phone = newPhone();
    await guest(t, phone);
    await askCode(t, phone, ANN);
    const right = proof(ANN);
    const reply = await call(t, phone, 'key/save', {
      provider: 'email',
      ...right,
      code: wrongTo(right.code),
    });
    expect([reply.status, reply.body['code']]).toEqual([401, 'WRONG_CODE']);
  });
});

/** An Apple sign-in whose id token carries `email`. */
async function signInWithAppleEmail(t: Convex, phone: Phone, email: string) {
  return await signInWithApple(t, apple, phone, 'apple-with-email', { email });
}
