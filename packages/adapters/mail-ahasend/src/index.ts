/**
 * `@tavli/mail-ahasend`: the `MailSender` port on AhaSend (#399). The
 * Convex functions in `apps/server` use it. See the README.
 */
export { AHASEND_API, AHASEND_TIMEOUT_MS, ahaSendUrl, createAhaSendMailSender } from './sender';
export type { AhaSendOptions, MailFetch } from './sender';
