// The AhaSend sender on a fake `fetch` (no network, never real mail).

import { describe, expect, it } from 'vitest';

import type { MailMessage } from '@tavli/contracts';
import { mailSenderContract } from '@tavli/contracts/testing';

import { AHASEND_TIMEOUT_MS, ahaSendUrl, createAhaSendMailSender } from './sender';
import type { AhaSendOptions, MailFetch } from './sender';

const ACCOUNT = '00000000-0000-4000-8000-000000000000';
const KEY = 'aha-sk-test';
const REFUSED = 'refused@example.com';

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/** A fake AhaSend: 202 per message, `error` for `REFUSED`. */
function fakeAhaSend(
  answer?: (body: Record<string, unknown>) => { status: number; json: unknown },
) {
  const calls: Call[] = [];
  const fetch: MailFetch = (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const to = (body['recipients'] as { email: string }[])[0]!.email;
    const reply = answer?.(body) ?? {
      status: 202,
      json: {
        object: 'list',
        data: [
          to === REFUSED
            ? { object: 'message', id: null, recipient: { email: to }, status: 'error', error: 'x' }
            : { object: 'message', id: 'm-1', recipient: { email: to }, status: 'queued' },
        ],
      },
    };
    return Promise.resolve({
      ok: reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.json),
    });
  };
  return { calls, fetch };
}

function sender(fetch: MailFetch, more: Partial<AhaSendOptions> = {}) {
  return createAhaSendMailSender({
    fetch,
    apiKey: KEY,
    accountId: ACCOUNT,
    from: { email: 'no-reply@example.com', name: 'Tavlaki' },
    ...more,
  });
}

const MESSAGE: MailMessage = {
  to: 'player@example.com',
  subject: 'Tavlaki sign-in',
  text: 'Your code is 123456.',
  html: '<p>Your code is <b>123456</b>.</p>',
};

describe('the AhaSend mail sender', () => {
  for (const check of mailSenderContract()) {
    it(check.name, () =>
      check.run({
        mail: sender(fakeAhaSend().fetch),
        refusedAddress: REFUSED,
        broken: sender(() => Promise.reject(new Error('offline'))),
      }),
    );
  }

  it('posts the v2 format with the key, tracking off and no content kept', async () => {
    const fake = fakeAhaSend();
    expect(await sender(fake.fetch).send(MESSAGE)).toEqual({ ok: true });
    expect(fake.calls).toEqual([
      {
        url: `https://api.ahasend.com/v2/accounts/${ACCOUNT}/messages`,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
        },
        body: {
          from: { email: 'no-reply@example.com', name: 'Tavlaki' },
          recipients: [{ email: 'player@example.com' }],
          subject: 'Tavlaki sign-in',
          text_content: 'Your code is 123456.',
          html_content: '<p>Your code is <b>123456</b>.</p>',
          tracking: { open: false, click: false },
          retention: { metadata: 1, data: 0 },
        },
      },
    ]);
  });

  it('asks for the sandbox only when told', async () => {
    const fake = fakeAhaSend();
    await sender(fake.fetch, { sandbox: true }).send(MESSAGE);
    expect(fake.calls[0]!.body['sandbox']).toBe(true);
  });

  it('puts the account id in the path safely', () => {
    expect(ahaSendUrl('a/b', 'https://x.test/v2')).toBe(
      'https://x.test/v2/accounts/a%2Fb/messages',
    );
  });

  it('maps HTTP errors to our codes, with no text from AhaSend', async () => {
    const cases: [number, string][] = [
      [400, 'Rejected'],
      [401, 'InvalidCredentials'],
      [403, 'InvalidCredentials'],
      [404, 'InvalidCredentials'],
      [409, 'RateLimited'],
      [413, 'Rejected'],
      [422, 'Rejected'],
      [429, 'RateLimited'],
      [500, 'Failed'],
      [503, 'Failed'],
    ];
    for (const [status, error] of cases) {
      const fake = fakeAhaSend(() => ({ status, json: { message: 'player@example.com is bad' } }));
      const result = await sender(fake.fetch).send(MESSAGE);
      expect(result).toEqual({ ok: false, error, message: `AhaSend answered HTTP ${status}` });
    }
  });

  it('fails an answer it cannot read', async () => {
    for (const json of [null, {}, { data: [] }, { data: [{ status: 'odd' }] }]) {
      const fake = fakeAhaSend(() => ({ status: 202, json }));
      expect(await sender(fake.fetch).send(MESSAGE)).toMatchObject({ ok: false, error: 'Failed' });
    }
  });

  it('cuts off a request with no answer in time', async () => {
    let aborted = false;
    const fetch: MailFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const result = await sender(fetch, { timeoutMs: 5 }).send(MESSAGE);
    expect(result).toEqual({ ok: false, error: 'Failed', message: 'the mail request failed' });
    expect(aborted).toBe(true);
    expect(AHASEND_TIMEOUT_MS).toBe(10_000);
  });
});
