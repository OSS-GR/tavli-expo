/**
 * The `PushProvider` port contract (#280), as plain async checks that
 * work in any test runner.
 *
 *   for (const check of pushProviderContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. Its push service must be a fake (no
 * network): a push to `deadToken` answers "not registered", and a push to
 * any `token(i)` goes out. A check rejects with an `Error` when the
 * provider breaks the contract.
 */
import { isPushErrorCode } from '../push';
import type { PushMessage, PushProvider, PushResult } from '../push';

export interface PushProviderContractSubject {
  /** The provider under test, on a fake push service. */
  readonly push: PushProvider;
  /** A live token: a push to it goes out. Different `i`, different tokens. */
  readonly token: (i: number) => string;
  /** A dead token: the service answers that it is not registered. */
  readonly deadToken: string;
  /**
   * The same provider on a push service that fails every request (for
   * example, `fetch` rejects). Leave it out only when the provider has no
   * service at all (the recording provider).
   */
  readonly broken?: PushProvider;
}

export interface PushProviderContractCheck {
  readonly name: string;
  readonly run: (subject: PushProviderContractSubject) => Promise<void>;
}

/** More than one Expo batch (100), so batching adapters split it. */
const MANY = 250;

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function message(to: string, i = 0): PushMessage {
  return { to, title: 'Your turn', body: `Test ${i}`, data: { gameId: `game-${i}` } };
}

/** Only `ok` and the error code: the `message` text is up to the adapter. */
function shape(results: readonly PushResult[]): unknown[] {
  return results.map((result) => (result.ok ? 'ok' : result.error));
}

function checkResults(results: readonly PushResult[], what: string): void {
  if (!Array.isArray(results)) throw new Error(`${what}: the results are not an array`);
  for (const [i, result] of results.entries()) {
    if (result.ok) continue;
    if (!isPushErrorCode(result.error)) {
      throw new Error(`${what}: result ${i} has an unknown error ${JSON.stringify(result.error)}`);
    }
    if (typeof result.message !== 'string') {
      throw new Error(`${what}: result ${i} has no message text`);
    }
  }
  same(JSON.parse(JSON.stringify(results)), results, `${what}: the results are plain JSON`);
}

async function sent(
  push: PushProvider,
  messages: readonly PushMessage[],
  what: string,
): Promise<readonly PushResult[]> {
  let results: readonly PushResult[];
  try {
    results = await push.send(messages);
  } catch (error) {
    throw new Error(`${what}: send rejected (${String(error)})`, { cause: error });
  }
  checkResults(results, what);
  return results;
}

export function pushProviderContract(): PushProviderContractCheck[] {
  return [
    {
      name: 'an empty send resolves with no results',
      run: async ({ push }) => {
        same(await sent(push, [], 'send([])'), [], 'send([])');
      },
    },
    {
      name: 'gives one ok result per message, in order',
      run: async ({ push, token }) => {
        const messages = [message(token(0), 0), message(token(1), 1), message(token(2), 2)];
        same(shape(await sent(push, messages, 'send')), ['ok', 'ok', 'ok'], 'the results');
      },
    },
    {
      name: 'a dead token gets DeviceNotRegistered, and the others still go out',
      run: async ({ push, token, deadToken }) => {
        const messages = [message(token(0), 0), message(deadToken, 1), message(token(1), 2)];
        same(
          shape(await sent(push, messages, 'send')),
          ['ok', 'DeviceNotRegistered', 'ok'],
          'the results',
        );
      },
    },
    {
      name: `${MANY} messages (more than one batch) each get a result, in order`,
      run: async ({ push, token, deadToken }) => {
        const dead = 150;
        const messages = Array.from({ length: MANY }, (_, i) =>
          message(i === dead ? deadToken : token(i), i),
        );
        const expected = messages.map((_, i) => (i === dead ? 'DeviceNotRegistered' : 'ok'));
        same(shape(await sent(push, messages, 'send')), expected, 'the results');
      },
    },
    {
      name: 'a broken service never rejects: every message gets an error result',
      run: async ({ broken, token }) => {
        if (broken === undefined) return;
        const messages = [message(token(0), 0), message(token(1), 1)];
        const results = await sent(broken, messages, 'send on a broken service');
        same(results.length, messages.length, 'the number of results');
        if (results.some((result) => result.ok)) {
          throw new Error('send on a broken service: a result is ok');
        }
      },
    },
  ];
}
