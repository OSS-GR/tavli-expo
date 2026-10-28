/**
 * The `PushProvider` port on the Expo Push Service (#280, ADR-0004 point 7).
 *
 * It POSTs the messages to `EXPO_PUSH_URL`, at most `EXPO_PUSH_BATCH`
 * per request, and reads one "push ticket" per message from the answer.
 * It uses `fetch` only (no Expo SDK), so it runs in a Convex action.
 *
 * No access token is needed now. If push security is ever turned on for
 * the Expo project, pass `accessToken` from a Convex env var, never from
 * the repo.
 *
 * Expo also gives "push receipts" later (a second call, by ticket id).
 * This adapter reads only the tickets. See the README.
 */
import type { PushErrorCode, PushMessage, PushProvider, PushResult } from '@tavli/contracts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** The most messages Expo takes in one request. */
export const EXPO_PUSH_BATCH = 100;

/** The part of `fetch` the adapter uses. The global `fetch` fits. */
export type PushFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface ExpoPushOptions {
  /** Usually the global `fetch`. Tests pass a fake. */
  readonly fetch: PushFetch;
  /** The Expo access token, only when push security is on. From an env var. */
  readonly accessToken?: string | undefined;
  /** Default `EXPO_PUSH_URL`. */
  readonly url?: string;
}

/** The error names Expo puts in `details.error`, and our code for each. */
const EXPO_ERRORS: Readonly<Record<string, PushErrorCode>> = {
  DeviceNotRegistered: 'DeviceNotRegistered',
  MessageTooBig: 'MessageTooBig',
  MessageRateExceeded: 'MessageRateExceeded',
  InvalidCredentials: 'InvalidCredentials',
  // The FCM credentials of the project do not match the token's app.
  MismatchSenderId: 'InvalidCredentials',
};

function failed(error: PushErrorCode, message: string): PushResult {
  return { ok: false, error, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One Expo push ticket as our result. */
function ticketResult(ticket: unknown): PushResult {
  if (!isRecord(ticket)) return failed('Failed', 'Expo sent a ticket we cannot read');
  if (ticket['status'] === 'ok') return { ok: true };
  const message = typeof ticket['message'] === 'string' ? ticket['message'] : 'Expo said no';
  const details = ticket['details'];
  const name = isRecord(details) ? details['error'] : undefined;
  const code = typeof name === 'string' ? EXPO_ERRORS[name] : undefined;
  return failed(code ?? 'Failed', message);
}

/** The Expo wire format of a message. `sound: 'default'` plays the phone's push sound. */
function toExpo(message: PushMessage) {
  return {
    to: message.to,
    title: message.title,
    body: message.body,
    data: { gameId: message.data.gameId },
    sound: 'default',
  };
}

export function createExpoPushProvider(options: ExpoPushOptions): PushProvider {
  // A local copy: calling `options.fetch(…)` would pass `options` as
  // `this`, and some runtimes reject `fetch` with a foreign `this`.
  const send = options.fetch;
  const url = options.url ?? EXPO_PUSH_URL;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (options.accessToken !== undefined && options.accessToken !== '') {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  async function sendBatch(batch: readonly PushMessage[]): Promise<PushResult[]> {
    const all = (result: PushResult) => batch.map(() => result);
    try {
      const response = await send(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map(toExpo)),
      });
      const answer: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return all(failed('Failed', `Expo answered HTTP ${response.status}`));
      }
      const tickets = isRecord(answer) ? answer['data'] : undefined;
      if (!Array.isArray(tickets) || tickets.length !== batch.length) {
        return all(failed('Failed', 'Expo sent no ticket for each message'));
      }
      return tickets.map(ticketResult);
    } catch (error) {
      return all(failed('Failed', `the push request failed: ${String(error)}`));
    }
  }

  return {
    async send(messages) {
      const results: PushResult[] = [];
      // One batch after the other: few messages go out at a time, and
      // Expo asks senders to keep the number of open requests low.
      for (let start = 0; start < messages.length; start += EXPO_PUSH_BATCH) {
        results.push(...(await sendBatch(messages.slice(start, start + EXPO_PUSH_BATCH))));
      }
      return results;
    },
  };
}
