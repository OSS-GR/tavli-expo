/**
 * The `MailSender` port on AhaSend (#399, ADR-0008 point 12). AhaSend
 * B.V. is in the Netherlands and keeps the mail data in the EEA.
 *
 * It POSTs one message to the v2 API (`ahaSendUrl(accountId)`) with the
 * API key as a Bearer token. It uses `fetch` only (no SDK), so it runs in
 * a Convex action.
 *
 * AhaSend answers 202 with one entry per recipient; an entry can still
 * say `error` (a refused or suppressed address). Each message turns
 * tracking off and asks AhaSend to keep no message content (`retention`
 * data 0 days) and its metadata for 1 day: the body holds a sign-in code.
 *
 * A request that gets no answer in `timeoutMs` (default
 * `AHASEND_TIMEOUT_MS`) is cut off and fails with `Failed`.
 *
 * The key, the account id and the sender address come from Convex env
 * vars (`apps/server/convex/mail.ts`), never from the repo.
 */
import type { MailErrorCode, MailMessage, MailResult, MailSender } from '@tavli/contracts';

export const AHASEND_API = 'https://api.ahasend.com/v2';

/** The send URL of an AhaSend account (its id is a UUID from the dashboard). */
export function ahaSendUrl(accountId: string, api = AHASEND_API): string {
  return `${api}/accounts/${encodeURIComponent(accountId)}/messages`;
}

/** How long one request may take before the sender cuts it off. */
export const AHASEND_TIMEOUT_MS = 10_000;

/**
 * The part of `fetch` the sender uses. The global `fetch` fits. A fetch
 * should stop when `signal` aborts; the sender gives up at that time even
 * when it does not.
 */
export type MailFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface AhaSendOptions {
  /** Usually the global `fetch`. Tests pass a fake. */
  readonly fetch: MailFetch;
  /** The API key (`aha-sk-…`), with the `messages:send` scope. From an env var. */
  readonly apiKey: string;
  /** The AhaSend account id. From an env var. */
  readonly accountId: string;
  /** The sender: an address on a domain verified at AhaSend, and a name. */
  readonly from: { readonly email: string; readonly name?: string };
  /** AhaSend's sandbox: it answers like a send but delivers nothing. */
  readonly sandbox?: boolean;
  /** Default `AHASEND_API`. */
  readonly api?: string;
  /** How long one request may take, in ms. Default `AHASEND_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
}

function failed(error: MailErrorCode, message: string): MailResult {
  return { ok: false, error, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Our code for an HTTP error status. */
function statusError(status: number): MailErrorCode {
  if (status === 400 || status === 413 || status === 422) return 'Rejected';
  if (status === 401 || status === 403 || status === 404) return 'InvalidCredentials';
  if (status === 409 || status === 429) return 'RateLimited';
  return 'Failed';
}

/** The result in a 202 answer: its one recipient's entry. */
function acceptedResult(answer: unknown): MailResult {
  const data = isRecord(answer) ? answer['data'] : undefined;
  const entry: unknown = Array.isArray(data) ? data[0] : undefined;
  if (!isRecord(entry)) return failed('Failed', 'AhaSend sent no entry for the recipient');
  const status = entry['status'];
  if (status === 'queued' || status === 'scheduled') return { ok: true };
  if (status === 'error') return failed('Rejected', 'AhaSend refused the recipient');
  return failed('Failed', 'AhaSend sent an entry we cannot read');
}

/**
 * Runs `work` with a signal that aborts after `ms`. Rejects at that time
 * even when `work` does not stop on the signal.
 */
async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`no answer in ${ms} ms`);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeUp]);
  } finally {
    clearTimeout(timer);
  }
}

/** The AhaSend wire format of a message. */
function toAhaSend(message: MailMessage, options: AhaSendOptions) {
  return {
    from: {
      email: options.from.email,
      ...(options.from.name === undefined ? {} : { name: options.from.name }),
    },
    recipients: [{ email: message.to }],
    subject: message.subject,
    text_content: message.text,
    html_content: message.html,
    tracking: { open: false, click: false },
    retention: { metadata: 1, data: 0 },
    ...(options.sandbox === true ? { sandbox: true } : {}),
  };
}

export function createAhaSendMailSender(options: AhaSendOptions): MailSender {
  // A local copy: calling `options.fetch(…)` would pass `options` as
  // `this`, and some runtimes reject `fetch` with a foreign `this`.
  const send = options.fetch;
  const url = ahaSendUrl(options.accountId, options.api);
  const timeoutMs = options.timeoutMs ?? AHASEND_TIMEOUT_MS;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${options.apiKey}`,
  };

  return {
    async send(message) {
      const body = JSON.stringify(toAhaSend(message, options));
      try {
        // The time limit covers the answer's body too.
        const { response, answer } = await withTimeout(timeoutMs, async (signal) => {
          const response = await send(url, { method: 'POST', headers, body, signal });
          const answer: unknown = await response.json().catch(() => null);
          return { response, answer };
        });
        if (response.status === 202 || response.status === 200) return acceptedResult(answer);
        // Never AhaSend's text: it may repeat the address.
        return failed(statusError(response.status), `AhaSend answered HTTP ${response.status}`);
      } catch {
        // Never the error text either: a fetch error may hold the URL or body.
        return failed('Failed', 'the mail request failed');
      }
    },
  };
}
