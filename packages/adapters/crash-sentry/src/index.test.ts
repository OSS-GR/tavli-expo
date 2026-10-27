import { runCrashReporterContract } from '@tavli/contracts/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// @sentry/react-native ships React Native code, which Node cannot load.
// Replace it with fakes that record the calls.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  close: vi.fn(() => Promise.resolve(true)),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@sentry/react-native', () => sentry);

const {
  ANONYMOUS_OPTIONS,
  IDENTIFIED_OPTIONS,
  createSentryCrashReporter,
  scrubBreadcrumb,
  scrubEvent,
} = await import('./index');

const DSN = 'https://public@example.ingest.sentry.io/1';

type InitOptions = {
  dsn: string;
  sendDefaultPii: boolean;
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
  beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => Record<string, unknown> | null;
  [key: string]: unknown;
};

function lastInitOptions(): InitOptions {
  const call = sentry.init.mock.calls.at(-1) as unknown as [InitOptions] | undefined;
  if (!call) throw new Error('Sentry.init was not called');
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

runCrashReporterContract('sentry', createSentryCrashReporter);

describe('createSentryCrashReporter without a DSN', () => {
  it('never starts Sentry and sends nothing', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: '   ' });
    reporter.captureException(new Error('boom'));
    reporter.captureMessage('hello');
    reporter.addBreadcrumb({ category: 'ui' });
    reporter.setEnabled(true);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });
});

describe('createSentryCrashReporter with a DSN', () => {
  it('starts Sentry once, with privacy-safe options', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN, environment: 'preview', release: '1.0.0', dist: '7' });
    reporter.init({ dsn: DSN });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(lastInitOptions()).toMatchObject({
      dsn: DSN,
      environment: 'preview',
      release: '1.0.0',
      dist: '7',
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    expect(lastInitOptions()).not.toHaveProperty('debug');
  });

  it('starts anonymous before an answer: JS only, no sessions, no user', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    expect(lastInitOptions()).toMatchObject({
      enableNative: false,
      enableAutoSessionTracking: false,
      enableNativeCrashHandling: false,
      enableAppHangTracking: false,
      enableWatchdogTerminationTracking: false,
    });
    expect(lastInitOptions()).toMatchObject(ANONYMOUS_OPTIONS);
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    // Even if the native SDK put its own id on a JS event.
    const sent = lastInitOptions().beforeSend({
      message: 'boom',
      user: { id: 'sentry-installation-id' },
      contexts: { device: { id: 'sentry-installation-id', model: 'Pixel 9' } },
    });
    expect(sent).toEqual({ message: 'boom', contexts: { device: { model: 'Pixel 9' } } });
  });

  it('starts identified when the install id is set before init', () => {
    const reporter = createSentryCrashReporter();
    reporter.setUser('install_1234abcd');
    reporter.init({ dsn: DSN });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(lastInitOptions()).toMatchObject({
      enableNative: true,
      enableAutoSessionTracking: true,
    });
    expect(lastInitOptions()).toMatchObject(IDENTIFIED_OPTIONS);
    for (const key of [
      'enableNativeCrashHandling',
      'enableAppHangTracking',
      'enableWatchdogTerminationTracking',
    ]) {
      // Left to the SDK default (on).
      expect(lastInitOptions()).not.toHaveProperty(key);
    }
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: 'install_1234abcd' });
    expect(lastInitOptions().beforeSend({ message: 'boom' })).toEqual({
      message: 'boom',
      user: { id: 'install_1234abcd' },
    });
  });

  it('restarts in identified mode when the install id comes after init ("Allow")', async () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    expect(lastInitOptions()).toMatchObject(ANONYMOUS_OPTIONS);

    reporter.setUser('install_1234abcd');
    expect(sentry.close).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(2));
    expect(lastInitOptions()).toMatchObject(IDENTIFIED_OPTIONS);
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: 'install_1234abcd' });

    // The same mode again: no restart.
    reporter.setUser('install_5678efgh');
    expect(sentry.close).toHaveBeenCalledTimes(1);
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: 'install_5678efgh' });
  });

  it('does not restart for a user set while disabled', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN, enabled: false });
    reporter.setUser('install_1234abcd');
    reporter.setEnabled(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.close).not.toHaveBeenCalled();
    expect(lastInitOptions()).toMatchObject(IDENTIFIED_OPTIONS);
  });

  it('maps exceptions, messages and breadcrumbs to Sentry', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    const error = new Error('boom');
    reporter.captureException(error, {
      tags: { screen: 'game' },
      extra: { turn: 3 },
      componentStack: '\n    in Board',
      level: 'fatal',
    });
    reporter.captureException('plain');
    reporter.captureMessage('hello');
    reporter.captureMessage('careful', 'warning');
    reporter.addBreadcrumb({ category: 'game', message: 'rolled', data: { die: 6 } });

    expect(sentry.captureException.mock.calls).toEqual([
      [
        error,
        {
          tags: { screen: 'game' },
          extra: { turn: 3 },
          level: 'fatal',
          contexts: { react: { componentStack: '\n    in Board' } },
        },
      ],
      ['plain', undefined],
    ]);
    expect(sentry.captureMessage.mock.calls).toEqual([
      ['hello', 'info'],
      ['careful', 'warning'],
    ]);
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'game',
      message: 'rolled',
      data: { die: 6 },
    });
  });

  it('sets only anonymous ids as the user', async () => {
    const reporter = createSentryCrashReporter();
    reporter.setUser('install_1234abcd');
    reporter.init({ dsn: DSN });
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: 'install_1234abcd' });

    reporter.setUser('someone@example.com');
    expect(sentry.setUser).toHaveBeenCalledTimes(1);

    reporter.setUser(null);
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(2));
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it('does not start when the player opted out, and starts on opt-in', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN, enabled: false });
    reporter.captureException(new Error('boom'));
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();

    reporter.setEnabled(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    reporter.captureException(new Error('boom'));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('closes Sentry on opt-out and drops events made after it', () => {
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    const { beforeSend, beforeBreadcrumb } = lastInitOptions();

    reporter.setEnabled(false);
    expect(sentry.close).toHaveBeenCalledTimes(1);
    reporter.captureException(new Error('boom'));
    reporter.captureMessage('hello');
    reporter.addBreadcrumb({ category: 'ui' });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    // Events the SDK made before the opt-out (for example native ones).
    expect(beforeSend({ message: 'late' })).toBeNull();
    expect(beforeBreadcrumb({ category: 'ui' })).toBeNull();

    reporter.setEnabled(false);
    expect(sentry.close).toHaveBeenCalledTimes(1);
  });

  it('waits for a running close before it starts Sentry again', async () => {
    let finishClose: (flushed: boolean) => void = () => undefined;
    sentry.close.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishClose = resolve;
        }),
    );
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    reporter.setEnabled(false);
    reporter.setEnabled(true);
    // The old close would shut down a new native SDK, so init must wait.
    expect(sentry.init).toHaveBeenCalledTimes(1);
    reporter.captureException(new Error('boom'));
    expect(sentry.captureException).not.toHaveBeenCalled();

    finishClose(true);
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(2));
    reporter.captureException(new Error('boom'));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('stays off if the player opts out again while Sentry closes', async () => {
    let finishClose: (flushed: boolean) => void = () => undefined;
    sentry.close.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishClose = resolve;
        }),
    );
    const reporter = createSentryCrashReporter();
    reporter.init({ dsn: DSN });
    reporter.setEnabled(false);
    reporter.setEnabled(true);
    reporter.setEnabled(false);
    finishClose(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  it('never throws when Sentry throws', () => {
    sentry.init.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    const reporter = createSentryCrashReporter();
    expect(() => reporter.init({ dsn: DSN })).not.toThrow();

    sentry.captureException.mockImplementationOnce(() => {
      throw new Error('sdk broke');
    });
    const working = createSentryCrashReporter();
    working.init({ dsn: DSN });
    expect(() => working.captureException(new Error('boom'))).not.toThrow();
  });
});

describe('scrubEvent', () => {
  it('keeps only the anonymous id and drops the device name', () => {
    const event = {
      message: 'boom',
      user: { id: 'account-42', email: 'someone@example.com', ip_address: '1.2.3.4' },
      request: { url: 'https://example.com' },
      server_name: "Maria's iPhone",
      contexts: { device: { name: "Maria's iPhone", model: 'iPhone17,1' }, os: { name: 'iOS' } },
    };
    expect(scrubEvent(event as never, 'install_1234abcd')).toEqual({
      message: 'boom',
      user: { id: 'install_1234abcd' },
      contexts: { device: { model: 'iPhone17,1' }, os: { name: 'iOS' } },
    });
  });

  it("drops the native SDKs' own ids", () => {
    const event = {
      message: 'boom',
      contexts: {
        device: { id: 'sentry-installation-id', model: 'Pixel 9' },
        app: { device_app_hash: 'abc123', app_version: '1.0.0' },
      },
    };
    expect(scrubEvent(event as never, null)).toEqual({
      message: 'boom',
      contexts: { device: { model: 'Pixel 9' }, app: { app_version: '1.0.0' } },
    });
  });

  it('removes the user when there is no install id', () => {
    const event = { message: 'boom', user: { email: 'someone@example.com' } };
    expect(scrubEvent(event as never, null)).toEqual({ message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'joined as Maria' })).toBeNull();
  });

  it('cuts the query string and fragment from request URLs', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: 'https://api.example.com/games?email=someone@example.com#top', method: 'GET' },
      }),
    ).toEqual({ category: 'fetch', data: { url: 'https://api.example.com/games', method: 'GET' } });
  });

  it('keeps other breadcrumbs as they are', () => {
    const breadcrumb = { category: 'navigation', data: { from: '/', to: '/play' } };
    expect(scrubBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});
