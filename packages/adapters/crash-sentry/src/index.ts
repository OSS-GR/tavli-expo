/**
 * `CrashReporter` adapter.
 *
 * - On a phone it is backed by Sentry (`sentry.ts`), the only file that
 *   may import `@sentry/react-native`.
 * - In a browser Metro picks `sentry.web.ts`: no crash reports there until
 *   the web release (the web plan, phase 4). So the web build does not
 *   load the Sentry SDK, which is a large part of the download (#690).
 */
export * from './sentry';
