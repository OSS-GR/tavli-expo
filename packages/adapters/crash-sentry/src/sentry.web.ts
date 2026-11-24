/**
 * The browser twin of `sentry.ts` (#690): crash reports do nothing on the
 * web for now, so the web build does not download the Sentry SDK. Crash
 * reports for the web come in phase 4 of `docs/architecture/web-app.md`,
 * with the web privacy text.
 */
import { createNoopCrashReporter, type CrashReporter } from '@tavli/contracts';

export function createSentryCrashReporter(): CrashReporter {
  return createNoopCrashReporter();
}
