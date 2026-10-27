/**
 * `CrashReporter` adapter backed by Sentry (`@sentry/react-native`).
 *
 * - No DSN means no Sentry: every call does nothing. Local dev and forks
 *   without a Sentry project work as before.
 * - Privacy: `sendDefaultPii` is off, no screenshots, no view hierarchy, no
 *   session replay. `beforeSend` drops every user field except the
 *   anonymous install id, and drops the device name ("Maria's iPhone").
 *   `beforeBreadcrumb` drops console lines and cuts query strings from URLs.
 * - `setEnabled(false)` closes the SDK (JS and native), so nothing is sent.
 *   `setEnabled(true)` starts it again. If the player opted out before
 *   launch, pass `enabled: false` to `init` and the SDK never starts.
 * - Calls never throw. A Sentry failure must not crash the app.
 *
 * Setup (DSN, config plugin, source maps): see this package's README.
 */
import {
  isAnonymousInstallId,
  type CrashContext,
  type CrashReporter,
  type CrashReporterConfig,
} from '@tavli/contracts';
import * as Sentry from '@sentry/react-native';

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type SentryEvent = Sentry.ErrorEvent;
type SentryBreadcrumb = Sentry.Breadcrumb;

/** Runs `fn` and drops any error. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // The crash reporter itself failed. There is nowhere to report it.
  }
}

/** Removes personal data from an event before it leaves the phone. */
export function scrubEvent(event: SentryEvent, anonId: string | null): SentryEvent {
  const scrubbed: SentryEvent = { ...event };
  // Only the anonymous install id. No IP address, email or username.
  if (anonId) scrubbed.user = { id: anonId };
  else delete scrubbed.user;
  delete scrubbed.request;
  delete scrubbed.server_name;
  const device = scrubbed.contexts?.['device'];
  if (device && 'name' in device) {
    const rest = { ...device };
    delete rest['name'];
    scrubbed.contexts = { ...scrubbed.contexts, device: rest };
  }
  return scrubbed;
}

/**
 * Removes personal data from an automatic breadcrumb. Console lines can hold
 * anything, so they are dropped. Query strings and fragments are cut from
 * request URLs, because they may hold ids or tokens.
 */
export function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  const url = breadcrumb.data?.['url'];
  if (typeof url !== 'string') return breadcrumb;
  return { ...breadcrumb, data: { ...breadcrumb.data, url: url.split(/[?#]/, 1)[0] } };
}

function sentryCaptureContext(context: CrashContext | undefined) {
  if (!context) return undefined;
  return {
    ...(context.tags ? { tags: { ...context.tags } } : {}),
    ...(context.extra ? { extra: { ...context.extra } } : {}),
    ...(context.level ? { level: context.level } : {}),
    ...(context.componentStack
      ? { contexts: { react: { componentStack: context.componentStack } } }
      : {}),
  };
}

export function createSentryCrashReporter(): CrashReporter {
  let config: CrashReporterConfig | undefined;
  let dsn: string | undefined;
  let enabled = true;
  let running = false;
  let user: string | null = null;
  // Set while `Sentry.close()` runs. It closes the native SDK only after it
  // flushes, so a new `Sentry.init` must wait, or that late close shuts the
  // new native SDK down.
  let closing: Promise<void> | null = null;

  function start(): void {
    if (running || !dsn || !enabled || !config) return;
    if (closing) {
      void closing.then(() => safely(start));
      return;
    }
    const options: SentryOptions = {
      dsn,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      // No performance tracing or replay: the free tier is for errors.
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend: (event) => (enabled ? scrubEvent(event, user) : null),
      beforeBreadcrumb: (breadcrumb) => (enabled ? scrubBreadcrumb(breadcrumb) : null),
      ...(config.environment ? { environment: config.environment } : {}),
      ...(config.release ? { release: config.release } : {}),
      ...(config.dist ? { dist: config.dist } : {}),
      ...(config.debug ? { debug: true } : {}),
    };
    Sentry.init(options);
    running = true;
    Sentry.setUser(user ? { id: user } : null);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    const done: Promise<void> = Sentry.close()
      .catch(() => undefined)
      .then(() => {
        if (closing === done) closing = null;
      });
    closing = done;
  }

  return {
    init: (next) => {
      safely(() => {
        if (config) return; // Once only.
        config = next;
        dsn = next.dsn?.trim() || undefined;
        enabled = next.enabled ?? true;
        start();
      });
    },
    captureException: (error, context) => {
      if (!running) return;
      safely(() => {
        Sentry.captureException(error, sentryCaptureContext(context));
      });
    },
    captureMessage: (message, level = 'info') => {
      if (!running) return;
      safely(() => {
        Sentry.captureMessage(message, level);
      });
    },
    setUser: (anonId) => {
      if (anonId !== null && !isAnonymousInstallId(anonId)) return;
      user = anonId;
      if (!running) return;
      safely(() => {
        Sentry.setUser(anonId ? { id: anonId } : null);
      });
    },
    addBreadcrumb: (breadcrumb) => {
      if (!running) return;
      safely(() => {
        Sentry.addBreadcrumb({
          category: breadcrumb.category,
          ...(breadcrumb.message !== undefined ? { message: breadcrumb.message } : {}),
          ...(breadcrumb.level ? { level: breadcrumb.level } : {}),
          ...(breadcrumb.data ? { data: { ...breadcrumb.data } } : {}),
        });
      });
    },
    setEnabled: (next) => {
      safely(() => {
        enabled = next;
        if (next) start();
        else stop();
      });
    },
  };
}
