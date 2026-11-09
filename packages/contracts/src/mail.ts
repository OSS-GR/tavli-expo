/**
 * The mail port (#399, ADR-0008 point 12): the server sends one email to
 * one address, for example a sign-in code.
 *
 * Rules for every adapter:
 * - `send` never throws. A broken mail service must not break the caller:
 *   it answers with an error result.
 * - Never log the address, the subject or the body: the body may hold a
 *   sign-in code.
 *
 * The AhaSend adapter is `@tavli/mail-ahasend`. The recording sender
 * below is for tests. The contract checks are `mailSenderContract` in
 * `@tavli/contracts/testing`. See "Email code" in
 * `docs/architecture/online-game-service.md`.
 */

/** One email to one address. Plain JSON. */
export interface MailMessage {
  /** The address, already checked and in lower case (`normalizeEmail`). */
  readonly to: string;
  readonly subject: string;
  /** The plain text body. */
  readonly text: string;
  /** The HTML body. Simple markup only. */
  readonly html: string;
}

/** Why a mail failed. */
export const MAIL_ERROR_CODES = [
  /** The service refused this address or message. Sending it again fails the same way. */
  'Rejected',
  /** Too many sends. Try again later. */
  'RateLimited',
  /** The service does not accept our key, or our account may not send. */
  'InvalidCredentials',
  /** Anything else: the network, a server error, an answer we do not know. */
  'Failed',
] as const;

export type MailErrorCode = (typeof MAIL_ERROR_CODES)[number];

export type MailResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: MailErrorCode; readonly message: string };

export interface MailSender {
  /** Sends `message`. Never rejects: a failed request gives an error result. */
  send(message: MailMessage): Promise<MailResult>;
}

export function isMailErrorCode(value: unknown): value is MailErrorCode {
  return typeof value === 'string' && (MAIL_ERROR_CODES as readonly string[]).includes(value);
}

export interface RecordingMailSender extends MailSender {
  /** Every message sent so far, in order (also the failed ones). */
  readonly sent: readonly MailMessage[];
  /** From now on, a mail to `to` fails with `error` (default `Failed`), until `revive(to)`. */
  fail(to: string, error?: MailErrorCode): void;
  /** A mail to `to` goes out again. */
  revive(to: string): void;
  /** Forgets the sent messages. */
  clear(): void;
}

const ERROR_TEXT: Readonly<Record<MailErrorCode, string>> = {
  Rejected: 'the mail service refused the message',
  RateLimited: 'too many mails',
  InvalidCredentials: 'the mail service does not accept our key',
  Failed: 'the mail failed',
};

/** A mail sender that only records what it sends. Never sends real mail. */
export function createRecordingMailSender(): RecordingMailSender {
  const failing = new Map<string, MailErrorCode>();
  let sent: MailMessage[] = [];
  return {
    get sent() {
      return sent;
    },
    fail(to, error = 'Failed') {
      failing.set(to, error);
    },
    revive(to) {
      failing.delete(to);
    },
    clear() {
      sent = [];
    },
    send(message) {
      sent = [...sent, { ...message }];
      const error = failing.get(message.to);
      return Promise.resolve(
        error === undefined ? { ok: true } : { ok: false, error, message: ERROR_TEXT[error] },
      );
    },
  };
}
