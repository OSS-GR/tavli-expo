/**
 * The email sign-in code (#399, ADR-0008 point 3): the shared rules for
 * an address and a code. The app, the in-memory provider and the server
 * all use these, so they agree on what they accept.
 */

/** The longest address we take (the limit of an address in SMTP). */
export const MAX_EMAIL_LENGTH = 254;

/** A code has this many digits. */
export const EMAIL_CODE_LENGTH = 6;

/** A code works this long after the server sends it. */
export const EMAIL_CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Wrong tries a code takes. The last wrong try uses the code up: the
 * player then asks for a new one.
 */
export const EMAIL_CODE_TRIES = 3;

/** The languages of the code email: the app's languages. */
export const EMAIL_CODE_LANGUAGES = ['en', 'el'] as const;

export type EmailCodeLanguage = (typeof EMAIL_CODE_LANGUAGES)[number];

export function isEmailCodeLanguage(value: unknown): value is EmailCodeLanguage {
  return (EMAIL_CODE_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * One local part, one `@`, a domain with a dot, and no spaces or angle
 * brackets. A loose check on purpose: the code itself proves the address.
 */
const EMAIL_SHAPE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:".]+$/;

/**
 * `text` as an address we keep: trimmed and in lower case. `null` when it
 * does not look like an address or is longer than `MAX_EMAIL_LENGTH`.
 * Lower case on the whole address: almost no mail service treats case in
 * the local part as a different mailbox, and two keys for one mailbox
 * would be worse.
 */
export function normalizeEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_SHAPE.test(email) ? email : null;
}

/** True for exactly `EMAIL_CODE_LENGTH` digits. */
export function isEmailCode(text: string): boolean {
  return text.length === EMAIL_CODE_LENGTH && /^[0-9]+$/.test(text);
}
