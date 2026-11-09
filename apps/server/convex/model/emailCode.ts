/**
 * The email sign-in code (#399, ADR-0008 points 3 and 10): the pure parts.
 *
 * - **The code:** 6 random digits, the same chance for each.
 * - **The ticket:** each send also gives the phone that asked a random
 *   ticket (`makeCodeTicket`). A code is checked only with its ticket, so
 *   someone who types another person's address cannot use up the tries
 *   of that person's code: without the ticket a try reaches no code.
 * - **What we keep:** never the code, the ticket or the address in our
 *   own tables. The code row holds an HMAC of the address (`addressKey`),
 *   of the ticket (`ticketKey`) and of the address and the code
 *   (`codeKey`), all with the Better Auth secret, so a copy of the table
 *   gives no code and no address. The send log holds HMACs too
 *   (`callerKey`).
 * - **Send limits:** per address (`ADDRESS_LIMITS`), per caller
 *   (`CALLER_LIMITS`: the signed-in user, else the IP address the request
 *   names), and per day for addresses that are no email key yet
 *   (`codesPerDay`, so a flood cannot use up the mail plan; an email
 *   key's address has only its own limits, so a flood never locks out a
 *   player who has one). Better Auth's own limiter lives in memory,
 *   which a new Convex isolate loses, so the log is a Convex table.
 * - **The email:** a neutral subject with no code in it, plain text and
 *   simple HTML, in English or Greek.
 *
 * Pure: no Convex types. `now` and the random bytes are arguments.
 */
import { EMAIL_CODE_LENGTH, EMAIL_CODE_TTL_MS } from '@tavli/contracts';
import type { EmailCodeLanguage } from '@tavli/contracts';

import { signText } from './keyNonce';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** At most `max` sends in any `windowMs`. */
export interface SendLimit {
  readonly windowMs: number;
  readonly max: number;
}

/** Sends to one address: enough for a typo and a resend, never a flood. */
export const ADDRESS_LIMITS: readonly SendLimit[] = [
  { windowMs: 15 * MINUTE, max: 3 },
  { windowMs: DAY, max: 10 },
];

/** Sends from one caller (a user, or an IP address) to any address. */
export const CALLER_LIMITS: readonly SendLimit[] = [
  { windowMs: HOUR, max: 10 },
  { windowMs: DAY, max: 30 },
];

/**
 * Sends a day to new addresses when `EMAIL_CODES_PER_DAY` is not set.
 * AhaSend's free plan sends 1,000 mails a month: about 33 a day.
 */
export const DEFAULT_CODES_PER_DAY = 30;

/**
 * The highest day cap. A send reads up to this many log rows of one
 * bucket, so it stays far below Convex's read limit.
 */
export const MAX_CODES_PER_DAY = 1000;

/**
 * The day cap from `EMAIL_CODES_PER_DAY`: a whole number from 1 to
 * `MAX_CODES_PER_DAY` (a larger one is cut to it), else the default.
 */
export function codesPerDay(env: Readonly<Record<string, string | undefined>>): number {
  const text = env['EMAIL_CODES_PER_DAY']?.trim() ?? '';
  if (!/^\d{1,7}$/.test(text)) return DEFAULT_CODES_PER_DAY;
  const value = Number(text);
  return value >= 1 ? Math.min(value, MAX_CODES_PER_DAY) : DEFAULT_CODES_PER_DAY;
}

/**
 * How long to wait before the next send, ms: 0 when every limit lets it
 * through. `times` are the earlier sends (epoch ms), in any order.
 */
export function sendWait(
  times: readonly number[],
  limits: readonly SendLimit[],
  now: number,
): number {
  const sorted = [...times].sort((a, b) => a - b);
  let wait = 0;
  for (const { windowMs, max } of limits) {
    const inWindow = sorted.filter((time) => time > now - windowMs);
    if (inWindow.length < max) continue;
    // The send that must leave the window before one more fits.
    const leaving = inWindow[inWindow.length - max]!;
    wait = Math.max(wait, leaving + windowMs - now);
  }
  return wait;
}

/** The longest window: older sends never count, so their rows can go. */
export const SEND_LOG_MS = Math.max(
  ...[...ADDRESS_LIMITS, ...CALLER_LIMITS].map((limit) => limit.windowMs),
  DAY,
);

const CODE_RANGE = 10 ** EMAIL_CODE_LENGTH;
/** The largest multiple of `CODE_RANGE` below 2^32: values above it would favour small codes. */
const FAIR_LIMIT = Math.floor(2 ** 32 / CODE_RANGE) * CODE_RANGE;

/**
 * A new code: `EMAIL_CODE_LENGTH` digits, each code as likely as any
 * other. `random(n)` gives `n` random bytes (`crypto.getRandomValues`).
 */
export function makeEmailCode(random: (bytes: number) => Uint8Array): string {
  for (;;) {
    const bytes = random(4);
    if (bytes.length < 4) throw new Error('not enough random bytes');
    const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    if (value < FAIR_LIMIT) return String(value % CODE_RANGE).padStart(EMAIL_CODE_LENGTH, '0');
  }
}

/** The address as we keep it: an HMAC, never the address itself. */
export function addressKey(secret: string, email: string): Promise<string> {
  return signText(secret, 'tavlaki-email-address:', email);
}

/** A code as we keep it: an HMAC of the address key and the code. */
export function codeKey(secret: string, address: string, code: string): Promise<string> {
  return signText(secret, 'tavlaki-email-code:', `${address}:${code}`);
}

/** Random bytes in a ticket: 128 bits, so no one guesses one. */
export const CODE_TICKET_BYTES = 16;

/** A new ticket: `CODE_TICKET_BYTES` random bytes as base64url. */
export function makeCodeTicket(random: (bytes: number) => Uint8Array): string {
  const bytes = random(CODE_TICKET_BYTES);
  if (bytes.length < CODE_TICKET_BYTES) throw new Error('not enough random bytes');
  let text = '';
  for (const byte of bytes.subarray(0, CODE_TICKET_BYTES)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Whether `text` has a ticket's form (22 base64url characters). */
export function isCodeTicket(text: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(text);
}

/** A ticket as we keep it: an HMAC. */
export function ticketKey(secret: string, ticket: string): Promise<string> {
  return signText(secret, 'tavlaki-email-ticket:', ticket);
}

/** A caller as the send log keeps it: an HMAC. */
export function callerKey(secret: string, caller: string): Promise<string> {
  return signText(secret, 'tavlaki-email-caller:', caller);
}

/** The bucket of the day cap for new addresses in the send log. */
export const NEW_ADDRESS_SENDS = 'new';

/**
 * Who asks for a code, for the caller limit: the signed-in user, else the
 * IP address the request names, else `null` (only the address and the
 * day cap count then). Convex gives an HTTP route no client address it
 * vouches for, and a script can pick its own `x-forwarded-for` or make
 * guests, so this limit only slows a script down. The address limit
 * stops a flood to one address, and the day cap a flood to many; a
 * player with an email key is never under the day cap.
 */
export function callerOf(headers: Headers | undefined, userId: string | null): string | null {
  if (userId !== null && userId !== '') return `user:${userId}`;
  const ip =
    headers?.get('cf-connecting-ip') ??
    headers?.get('x-real-ip') ??
    headers?.get('x-forwarded-for')?.split(',')[0];
  const value = ip?.trim() ?? '';
  return value === '' ? null : `ip:${value}`;
}

/** When a code sent at `now` runs out. */
export function codeExpiresAt(now: number): number {
  return now + EMAIL_CODE_TTL_MS;
}

interface MailText {
  readonly subject: string;
  readonly intro: string;
  readonly works: string;
  readonly notYou: string;
}

const MINUTES = EMAIL_CODE_TTL_MS / MINUTE;

const TEXT: Readonly<Record<EmailCodeLanguage, MailText>> = {
  en: {
    subject: 'Your Tavlaki sign-in code',
    intro: 'Your Tavlaki code is:',
    works: `It works for ${MINUTES} minutes. Type it in the app to sign in.`,
    notYou:
      'If you did not ask for this code, you can ignore this email. Nobody can sign in without the code.',
  },
  el: {
    subject: 'Ο κωδικός σύνδεσης στο Tavlaki',
    intro: 'Ο κωδικός σου για το Tavlaki είναι:',
    works: `Ισχύει για ${MINUTES} λεπτά. Γράψε τον στην εφαρμογή για να συνδεθείς.`,
    notYou:
      'Αν δεν ζήτησες αυτόν τον κωδικό, αγνόησε αυτό το email. Κανείς δεν μπορεί να συνδεθεί χωρίς τον κωδικό.',
  },
};

/** The code email in `language`. The code is digits only, so it needs no escaping. */
export function emailCodeMail(
  code: string,
  language: EmailCodeLanguage,
): { subject: string; text: string; html: string } {
  const text = TEXT[language];
  return {
    subject: text.subject,
    text: `${text.intro}\n\n${code}\n\n${text.works}\n\n${text.notYou}\n`,
    html:
      `<!doctype html><html lang="${language}"><body style="font-family:sans-serif">` +
      `<p>${text.intro}</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      `<p>${text.works}</p><p style="color:#666">${text.notYou}</p>` +
      `</body></html>`,
  };
}
