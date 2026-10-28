// The Expo Push adapter on a fake `fetch` (no network).

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PushMessage } from '@tavli/contracts';
import { pushProviderContract } from '@tavli/contracts/testing';

import {
  EXPO_PUSH_BATCH,
  EXPO_PUSH_TIMEOUT_MS,
  EXPO_PUSH_URL,
  createExpoPushProvider,
} from './provider';
import type { PushFetch } from './provider';

const DEAD = 'ExponentPushToken[dead]';

interface Request {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown[];
}

/**
 * A fake Expo Push Service. It answers one ticket per message: an error
 * `DeviceNotRegistered` for `DEAD`, else `ok`. `answer` can replace the
 * whole answer.
 */
function fakeExpo(answer?: (body: unknown[]) => { ok: boolean; status: number; json: unknown }) {
  const requests: Request[] = [];
  const fetch: PushFetch = (url, init) => {
    const body = JSON.parse(init.body) as unknown[];
    requests.push({ url, headers: init.headers, body });
    const reply = answer?.(body) ?? {
      ok: true,
      status: 200,
      json: {
        data: body.map((message, i) =>
          (message as { to: string }).to === DEAD
            ? {
                status: 'error',
                message: `"${DEAD}" is not a registered push notification recipient`,
                details: { error: 'DeviceNotRegistered', expoPushToken: DEAD },
              }
            : { status: 'ok', id: `ticket-${i}` },
        ),
      },
    };
    return Promise.resolve({
      ok: reply.ok,
      status: reply.status,
      json: () => Promise.resolve(reply.json),
    });
  };
  return { fetch, requests };
}

function message(to: string, gameId = 'g1'): PushMessage {
  return { to, title: 'Your turn', body: 'Play now', data: { gameId } };
}

describe('createExpoPushProvider: PushProvider contract', () => {
  for (const check of pushProviderContract()) {
    it(check.name, () =>
      check.run({
        push: createExpoPushProvider({ fetch: fakeExpo().fetch }),
        token: (i) => `ExponentPushToken[live-${i}]`,
        deadToken: DEAD,
        broken: createExpoPushProvider({ fetch: () => Promise.reject(new Error('offline')) }),
      }),
    );
  }
});

describe('createExpoPushProvider', () => {
  it('POSTs the Expo message format to the Expo URL, with JSON headers', async () => {
    const expo = fakeExpo();
    const push = createExpoPushProvider({ fetch: expo.fetch });
    expect(await push.send([message('ExponentPushToken[a]', 'game-7')])).toEqual([{ ok: true }]);
    expect(expo.requests).toEqual([
      {
        url: EXPO_PUSH_URL,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: [
          {
            to: 'ExponentPushToken[a]',
            title: 'Your turn',
            body: 'Play now',
            data: { gameId: 'game-7' },
            sound: 'default',
          },
        ],
      },
    ]);
  });

  it('sends priority and ttl only when the message has them', async () => {
    const expo = fakeExpo();
    const push = createExpoPushProvider({ fetch: expo.fetch });
    await push.send([
      { ...message('ExponentPushToken[a]'), priority: 'high', ttlSeconds: 3600 },
      message('ExponentPushToken[b]'),
    ]);
    const [high, plain] = expo.requests[0]?.body ?? [];
    expect(high).toMatchObject({ priority: 'high', ttl: 3600 });
    expect(high).not.toHaveProperty('ttlSeconds');
    expect(plain).not.toHaveProperty('priority');
    expect(plain).not.toHaveProperty('ttl');
  });

  it('sends no request for no messages', async () => {
    const expo = fakeExpo();
    expect(await createExpoPushProvider({ fetch: expo.fetch }).send([])).toEqual([]);
    expect(expo.requests).toEqual([]);
  });

  it(`splits the messages into batches of ${EXPO_PUSH_BATCH}`, async () => {
    const expo = fakeExpo();
    const push = createExpoPushProvider({ fetch: expo.fetch });
    const messages = Array.from({ length: 2 * EXPO_PUSH_BATCH + 1 }, (_, i) =>
      message(`ExponentPushToken[${i}]`),
    );
    expect(await push.send(messages)).toHaveLength(messages.length);
    expect(expo.requests.map((request) => request.body.length)).toEqual([100, 100, 1]);
  });

  it('sends the access token only when there is one', async () => {
    const expo = fakeExpo();
    await createExpoPushProvider({ fetch: expo.fetch, accessToken: 'secret' }).send([
      message('ExponentPushToken[a]'),
    ]);
    await createExpoPushProvider({ fetch: expo.fetch, accessToken: '' }).send([
      message('ExponentPushToken[a]'),
    ]);
    expect(expo.requests[0]?.headers['Authorization']).toBe('Bearer secret');
    expect(expo.requests[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('maps the Expo error names to our codes', async () => {
    const names = [
      'DeviceNotRegistered',
      'MessageTooBig',
      'MessageRateExceeded',
      'InvalidCredentials',
      'MismatchSenderId',
      'SomethingNew',
      // Keys every plain object has: they must not match.
      'constructor',
      'toString',
      '__proto__',
    ];
    const expo = fakeExpo(() => ({
      ok: true,
      status: 200,
      json: {
        data: [
          ...names.map((error) => ({ status: 'error', message: error, details: { error } })),
          { status: 'error', message: 'no details' },
          'junk',
        ],
      },
    }));
    const push = createExpoPushProvider({ fetch: expo.fetch });
    const results = await push.send(
      Array.from({ length: names.length + 2 }, (_, i) => message(`ExponentPushToken[${i}]`)),
    );
    expect(results.map((result) => (result.ok ? 'ok' : result.error))).toEqual([
      'DeviceNotRegistered',
      'MessageTooBig',
      'MessageRateExceeded',
      'InvalidCredentials',
      'InvalidCredentials',
      'Failed',
      'Failed',
      'Failed',
      'Failed',
      'Failed',
      'Failed',
    ]);
    expect(results[0]).toEqual({
      ok: false,
      error: 'DeviceNotRegistered',
      message: 'DeviceNotRegistered',
    });
  });

  it('fails the whole batch on an HTTP error, a wrong ticket count or a bad body', async () => {
    const answers = [
      { ok: false, status: 500, json: { errors: [{ code: 'INTERNAL_SERVER_ERROR' }] } },
      { ok: true, status: 200, json: { data: [{ status: 'ok' }] } },
      { ok: true, status: 200, json: 'not an object' },
    ];
    for (const answer of answers) {
      const push = createExpoPushProvider({ fetch: fakeExpo(() => answer).fetch });
      const results = await push.send([
        message('ExponentPushToken[a]'),
        message('ExponentPushToken[b]'),
      ]);
      expect(results.map((result) => (result.ok ? 'ok' : result.error))).toEqual([
        'Failed',
        'Failed',
      ]);
    }
  });

  it('keeps going after a failed batch', async () => {
    let calls = 0;
    const expo = fakeExpo((body) => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, json: null };
      return { ok: true, status: 200, json: { data: body.map(() => ({ status: 'ok' })) } };
    });
    const push = createExpoPushProvider({ fetch: expo.fetch });
    const messages = Array.from({ length: EXPO_PUSH_BATCH + 1 }, (_, i) =>
      message(`ExponentPushToken[${i}]`),
    );
    const results = await push.send(messages);
    expect(results.slice(0, EXPO_PUSH_BATCH).every((result) => !result.ok)).toBe(true);
    expect(results[EXPO_PUSH_BATCH]).toEqual({ ok: true });
  });

  it('calls fetch with no `this`, like a plain function call', async () => {
    const seen: unknown[] = [];
    const fetch: PushFetch = function (this: unknown, _url, init) {
      seen.push(this);
      const count = (JSON.parse(init.body) as unknown[]).length;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ data: Array.from({ length: count }, () => ({ status: 'ok' })) }),
      });
    };
    await createExpoPushProvider({ fetch }).send([message('ExponentPushToken[a]')]);
    expect(seen).toEqual([undefined]);
  });

  describe('a request with no answer', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A fetch that never answers. It stops on the signal when `honour` is true. */
    function hangingFetch(honour: boolean) {
      const signals: AbortSignal[] = [];
      const fetch: PushFetch = (_url, init) => {
        signals.push(init.signal);
        return new Promise((_, reject) => {
          if (honour) {
            init.signal.addEventListener('abort', () => {
              reject(init.signal.reason as Error);
            });
          }
        });
      };
      return { fetch, signals };
    }

    for (const honour of [true, false]) {
      it(`fails after ${EXPO_PUSH_TIMEOUT_MS} ms (${honour ? 'fetch stops on the signal' : 'fetch ignores it'})`, async () => {
        vi.useFakeTimers();
        const hang = hangingFetch(honour);
        const push = createExpoPushProvider({ fetch: hang.fetch });
        let results: readonly unknown[] | undefined;
        const sending = push.send([message('ExponentPushToken[a]')]).then((r) => {
          results = r;
        });
        await vi.advanceTimersByTimeAsync(EXPO_PUSH_TIMEOUT_MS - 1);
        expect(results).toBeUndefined();
        expect(hang.signals[0]?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await sending;
        expect(hang.signals[0]?.aborted).toBe(true);
        expect(results).toEqual([
          {
            ok: false,
            error: 'Failed',
            message: expect.stringContaining(`no answer in ${EXPO_PUSH_TIMEOUT_MS} ms`) as unknown,
          },
        ]);
      });
    }

    it('takes its own time limit, also for a body that never ends', async () => {
      vi.useFakeTimers();
      const fetch: PushFetch = () =>
        Promise.resolve({ ok: true, status: 200, json: () => new Promise<never>(() => {}) });
      const push = createExpoPushProvider({ fetch, timeoutMs: 500 });
      const sending = push.send([message('ExponentPushToken[a]')]);
      await vi.advanceTimersByTimeAsync(500);
      expect((await sending).map((result) => (result.ok ? 'ok' : result.error))).toEqual([
        'Failed',
      ]);
    });

    it('clears its timer when the answer comes in time', async () => {
      vi.useFakeTimers();
      const push = createExpoPushProvider({ fetch: fakeExpo().fetch });
      expect(await push.send([message('ExponentPushToken[a]')])).toEqual([{ ok: true }]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
