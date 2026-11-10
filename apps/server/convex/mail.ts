/**
 * The mail sender of the server (#399): AhaSend (`@tavli/mail-ahasend`),
 * made on first use from env vars the owner sets on each deployment with
 * `npx convex env set` (never in the repo):
 *
 * - `AHASEND_API_KEY`: a send-only key (`messages:send:<domain>`);
 * - `AHASEND_ACCOUNT_ID`: the account id from AhaSend's dashboard;
 * - `MAIL_FROM`: the sender address, on the domain verified at AhaSend;
 * - `MAIL_FROM_NAME`: the sender name (default `Tavlaki`);
 * - `AHASEND_SANDBOX`: `true` makes AhaSend answer without delivering.
 *
 * With no key, account or sender, email codes are off: `mailSender()` is
 * `null` and `/key/email-code` says so. See "Email code" in
 * `docs/process/running-the-app.md`.
 */

import type { MailSender } from '@tavli/contracts';
import { createAhaSendMailSender } from '@tavli/mail-ahasend';

let sender: MailSender | null | undefined;

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/** The sender, or `null` when the env vars are missing. */
export function mailSender(): MailSender | null {
  if (sender !== undefined) return sender;
  const apiKey = env('AHASEND_API_KEY');
  const accountId = env('AHASEND_ACCOUNT_ID');
  const from = env('MAIL_FROM');
  if (apiKey === '' || accountId === '' || from === '') return null;
  // Made once per isolate; a deploy with new env vars starts new isolates.
  sender = createAhaSendMailSender({
    fetch: (url, init) => fetch(url, init),
    apiKey,
    accountId,
    from: { email: from, name: env('MAIL_FROM_NAME') || 'Tavlaki' },
    sandbox: env('AHASEND_SANDBOX') === 'true',
  });
  return sender;
}

/**
 * Tests only: swap the sender (`createRecordingMailSender` from
 * `@tavli/contracts`). `null` turns email codes off; `undefined` goes
 * back to the env vars. No deployed function calls it.
 */
export function setMailSender(next: MailSender | null | undefined): void {
  sender = next;
}
