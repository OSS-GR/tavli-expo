/**
 * The pure parts of the email code step (#433, `EmailCodeForm`): the code
 * from what the player typed or pasted, the language of the email, the
 * wait before a new code, and the problem each server answer means.
 *
 * Never log or send an address or a code.
 */
import {
  EMAIL_CODE_LENGTH,
  isAuthErrorData,
  isEmailCodeLanguage,
  type EmailCodeLanguage,
} from '@tavli/contracts';

/**
 * A new code may go out this long after the last one. The server has its
 * own limits (3 sends to one address in 15 minutes); this wait only keeps
 * a quick second tap from using one up.
 */
export const RESEND_WAIT_MS = 30 * 1000;

/**
 * The code in `text`: its digits, at most `EMAIL_CODE_LENGTH`. A paste
 * such as "123 456" or "Your code: 123456" gives "123456".
 */
export function codeDigits(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, EMAIL_CODE_LENGTH);
}

/** The language of the email: the app's language, else English. */
export function codeLanguage(language: string): EmailCodeLanguage {
  const base = language.split('-')[0] ?? '';
  return isEmailCodeLanguage(base) ? base : 'en';
}

/** Seconds left of the resend wait (rounded up), or 0. */
export function resendSecondsLeft(sentAt: number, now: number): number {
  return Math.max(0, Math.ceil((sentAt + RESEND_WAIT_MS - now) / 1000));
}

export type EmailCodeProblem =
  /** The phone's check: not an address. */
  | 'badAddress'
  /** The server would not send a code to it. */
  | 'sendRefused'
  /** Too many codes for now. `minutes`, when the server says how long. */
  | 'rateLimited'
  /** A wrong code that may be typed again. */
  | 'wrongCode'
  /** The code is used up or too old: ask for a new one. */
  | 'codeUsed'
  /** Another account has this address (saving a key). */
  | 'keyTaken'
  /** Email codes are off on the server (`KEY_OFF`, #462). */
  | 'emailOff'
  /** The server could not be reached. */
  | 'network'
  /** Anything else. */
  | 'other';

export interface EmailCodeProblemState {
  readonly problem: EmailCodeProblem;
  /** With `rateLimited`: whole minutes to wait, when the server says. */
  readonly minutes?: number;
}

/** What a failed `requestEmailCode` means. */
export function sendProblemOf(error: unknown): EmailCodeProblemState {
  if (!isAuthErrorData(error)) return { problem: 'other' };
  if (error.code === 'RATE_LIMITED') {
    const wait = error.retryAfterMs;
    return wait === undefined || wait <= 0
      ? { problem: 'rateLimited' }
      : { problem: 'rateLimited', minutes: Math.ceil(wait / 60_000) };
  }
  if (error.code === 'REJECTED') return { problem: 'sendRefused' };
  if (error.code === 'KEY_OFF') return { problem: 'emailOff' };
  if (error.code === 'NETWORK') return { problem: 'network' };
  return { problem: 'other' };
}

/** What a failed sign-in or save with a code means. */
export function codeProblemOf(error: unknown): EmailCodeProblemState {
  if (!isAuthErrorData(error)) return { problem: 'other' };
  if (error.code === 'WRONG_CODE') return { problem: 'wrongCode' };
  if (error.code === 'REJECTED') return { problem: 'codeUsed' };
  if (error.code === 'KEY_BELONGS_TO_OTHER') return { problem: 'keyTaken' };
  if (error.code === 'KEY_OFF') return { problem: 'emailOff' };
  if (error.code === 'NETWORK') return { problem: 'network' };
  return { problem: 'other' };
}
