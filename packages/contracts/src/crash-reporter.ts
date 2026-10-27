/**
 * CrashReporter port: sends errors and crashes from test and store builds
 * to a crash service (ADR-0003).
 *
 * Privacy rules for every adapter:
 * - No personal data. The only user id is a random install id
 *   (`setUser`), never a name, email or account id.
 * - `setEnabled(false)` stops all sending. The app calls it when the player
 *   opts out of usage data.
 * - Calls never throw. A broken crash service must not break the app.
 *
 * Adapters: `@tavli/crash-sentry` (the app), `createNoopCrashReporter` and
 * `createRecordingCrashReporter` (tests and local dev).
 */

/** How serious a message is. Same names as Sentry's levels. */
export const CRASH_LEVELS = ['fatal', 'error', 'warning', 'info', 'debug'] as const;

export type CrashLevel = (typeof CRASH_LEVELS)[number];

export interface CrashReporterConfig {
  /**
   * Where to send reports (for Sentry: the DSN). Empty or missing means
   * "send nothing": the reporter stays a no-op.
   */
  dsn?: string;
  /** For example `development`, `preview` or `production`. */
  environment?: string;
  /** The app version, for example `1.0.0`. */
  release?: string;
  /** The build number. */
  dist?: string;
  /** Start enabled? Default `true`. Pass `false` when the player opted out. */
  enabled?: boolean;
  /** Log what the SDK does. Use it in dev only. */
  debug?: boolean;
}

/** Simple values only, so nothing large or personal slips into a report. */
export type CrashData = Readonly<Record<string, string | number | boolean | null>>;

export interface CrashContext {
  /** Short, searchable labels, for example `{ screen: 'game' }`. */
  tags?: Readonly<Record<string, string>>;
  /** Extra facts about the error. No personal data. */
  extra?: CrashData;
  /** React's component stack, from an error boundary. */
  componentStack?: string;
  /** Default `error`. */
  level?: CrashLevel;
}

/** A small note about what happened before an error ("tapped Roll"). */
export interface CrashBreadcrumb {
  /** For example `game`, `navigation` or `ui`. */
  category: string;
  message?: string;
  level?: CrashLevel;
  data?: CrashData;
}

export interface CrashReporter {
  /** Starts the reporter. Call it once, as early as possible. */
  init(config: CrashReporterConfig): void;
  /** Reports an error. `error` may be anything that was thrown. */
  captureException(error: unknown, context?: CrashContext): void;
  /** Reports a message that is not an exception. */
  captureMessage(message: string, level?: CrashLevel): void;
  /**
   * Links reports to an anonymous install id (see `isAnonymousInstallId`).
   * Pass `null` to clear it. Adapters ignore ids that fail the check.
   */
  setUser(anonId: string | null): void;
  addBreadcrumb(breadcrumb: CrashBreadcrumb): void;
  /** Turns sending on or off, for example after a privacy opt-out. */
  setEnabled(enabled: boolean): void;
}

/**
 * True for a random install id: 8 to 64 letters, digits, `-` or `_`.
 * This rejects emails, names with spaces and other personal data.
 */
export function isAnonymousInstallId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

/** A CrashReporter that does nothing. */
export function createNoopCrashReporter(): CrashReporter {
  return {
    init: () => undefined,
    captureException: () => undefined,
    captureMessage: () => undefined,
    setUser: () => undefined,
    addBreadcrumb: () => undefined,
    setEnabled: () => undefined,
  };
}

/** One call that a `RecordingCrashReporter` saw and kept. */
export type RecordedCrash =
  | { kind: 'exception'; error: unknown; context?: CrashContext }
  | { kind: 'message'; message: string; level: CrashLevel };

export interface RecordingCrashReporter extends CrashReporter {
  /** Reports that would have been sent (only while enabled). */
  readonly reports: RecordedCrash[];
  readonly breadcrumbs: CrashBreadcrumb[];
  readonly config: CrashReporterConfig | undefined;
  readonly user: string | null;
  readonly enabled: boolean;
  /** Forgets every report and breadcrumb. */
  clear(): void;
}

/**
 * A CrashReporter that keeps reports in memory, for tests. It follows the
 * same rules as a real adapter: nothing is kept while disabled, and ids that
 * fail `isAnonymousInstallId` are ignored.
 */
export function createRecordingCrashReporter(): RecordingCrashReporter {
  const reports: RecordedCrash[] = [];
  const breadcrumbs: CrashBreadcrumb[] = [];
  let config: CrashReporterConfig | undefined;
  let user: string | null = null;
  let enabled = true;

  return {
    reports,
    breadcrumbs,
    get config() {
      return config;
    },
    get user() {
      return user;
    },
    get enabled() {
      return enabled;
    },
    init: (next) => {
      config = next;
      enabled = next.enabled ?? true;
    },
    captureException: (error, context) => {
      if (enabled)
        reports.push(
          context ? { kind: 'exception', error, context } : { kind: 'exception', error },
        );
    },
    captureMessage: (message, level = 'info') => {
      if (enabled) reports.push({ kind: 'message', message, level });
    },
    setUser: (anonId) => {
      if (anonId === null) user = null;
      else if (isAnonymousInstallId(anonId)) user = anonId;
    },
    addBreadcrumb: (breadcrumb) => {
      if (enabled) breadcrumbs.push(breadcrumb);
    },
    setEnabled: (next) => {
      enabled = next;
    },
    clear: () => {
      reports.length = 0;
      breadcrumbs.length = 0;
    },
  };
}
