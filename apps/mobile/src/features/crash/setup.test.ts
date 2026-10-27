import { createMemoryStorage, createRecordingCrashReporter, type Storage } from '@tavli/contracts';

import { INSTALL_ID_STORAGE_KEY } from '@/features/install-id/installId';
import { createConsentStore } from '@/features/privacy/consent';

import { crashReportingAllowed, crashUserAllowed } from './consent';
import { setupCrashReporting } from './setup';

const DSN = 'https://public@example.ingest.sentry.io/1';

function setup({
  dsn = DSN as string | undefined,
  storage = createMemoryStorage() as Storage,
} = {}) {
  const reporter = createRecordingCrashReporter();
  const consent = createConsentStore(storage);
  const stop = setupCrashReporting({ reporter, consent, storage, dsn, environment: 'test' });
  return { reporter, storage, consent, stop };
}

/** A storage where the user already answered. */
function answered(granted: boolean): Storage {
  const storage = createMemoryStorage();
  createConsentStore(storage).getState().setConsent(granted);
  return storage;
}

describe('crash consent rules', () => {
  it('sends before an answer and after "Allow", never after "Don\'t allow"', () => {
    expect(crashReportingAllowed('unset')).toBe(true);
    expect(crashReportingAllowed('granted')).toBe(true);
    expect(crashReportingAllowed('denied')).toBe(false);
    // "Don't allow" to an older consent text stays a "no" until the new answer.
    expect(crashReportingAllowed('stale-denied')).toBe(false);
  });

  it('adds the install id only after "Allow"', () => {
    expect(crashUserAllowed('unset')).toBe(false);
    expect(crashUserAllowed('granted')).toBe(true);
    expect(crashUserAllowed('denied')).toBe(false);
    expect(crashUserAllowed('stale-denied')).toBe(false);
  });
});

describe('setupCrashReporting', () => {
  it('starts the reporter with the DSN, enabled before an answer', () => {
    const { reporter } = setup();
    expect(reporter.config).toEqual({ dsn: DSN, environment: 'test', enabled: true });
    expect(reporter.enabled).toBe(true);
  });

  it('passes no DSN when it is missing, so the adapter stays a no-op', () => {
    const { reporter } = setup({ dsn: '' });
    expect(reporter.config).toEqual({ environment: 'test', enabled: true });
  });

  it('stays anonymous before an answer: no user, and no install id is made', () => {
    const { reporter, storage } = setup();
    expect(reporter.user).toBeNull();
    expect(storage.getString(INSTALL_ID_STORAGE_KEY)).toBeUndefined();
  });

  it('sets the saved anonymous install id as the user after "Allow"', () => {
    const { reporter, storage } = setup({ storage: answered(true) });
    expect(reporter.user).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(storage.getString(INSTALL_ID_STORAGE_KEY)).toBe(reporter.user);
  });

  it('starts disabled, with no user, when the player said "Don\'t allow"', () => {
    const { reporter } = setup({ storage: answered(false) });
    expect(reporter.config?.enabled).toBe(false);
    expect(reporter.enabled).toBe(false);
    expect(reporter.user).toBeNull();
  });

  it('follows the consent answer while the app runs', () => {
    const { reporter, consent, storage, stop } = setup();

    consent.getState().setConsent(true);
    expect(reporter.enabled).toBe(true);
    const id = storage.getString(INSTALL_ID_STORAGE_KEY);
    expect(reporter.user).toBe(id);

    consent.getState().setConsent(false);
    expect(reporter.enabled).toBe(false);
    expect(reporter.user).toBeNull();

    consent.getState().setConsent(true);
    expect(reporter.enabled).toBe(true);
    expect(reporter.user).toBe(id);

    stop();
    consent.getState().setConsent(false);
    expect(reporter.enabled).toBe(true);
  });

  it('sets the user before init and changes it only while the reporter is off', () => {
    // The Sentry adapter picks its mode (anonymous or identified) from the
    // user when it starts, and restarts if the user changes while it runs.
    const calls: string[] = [];
    const reporter = createRecordingCrashReporter();
    const logged = {
      ...reporter,
      init: (config: Parameters<typeof reporter.init>[0]) => {
        calls.push(`init:${reporter.user ? 'user' : 'none'}`);
        reporter.init(config);
      },
      setUser: (id: string | null) => {
        calls.push(id ? 'user' : 'no user');
        reporter.setUser(id);
      },
      setEnabled: (enabled: boolean) => {
        calls.push(enabled ? 'on' : 'off');
        reporter.setEnabled(enabled);
      },
    };
    const storage = answered(true);
    const consent = createConsentStore(storage);
    setupCrashReporting({ reporter: logged, consent, storage, dsn: DSN, environment: 'test' });
    expect(calls).toEqual(['user', 'init:user']);

    calls.length = 0;
    consent.getState().setConsent(false);
    expect(calls).toEqual(['off', 'no user']);

    calls.length = 0;
    consent.getState().setConsent(true);
    expect(calls).toEqual(['user', 'on']);
  });

  it('clears the user when the answer moves away from "Allow"', () => {
    const { reporter, consent } = setup({ storage: answered(true) });
    expect(reporter.user).not.toBeNull();

    consent.setState({ status: 'unset' });
    expect(reporter.user).toBeNull();
    expect(reporter.enabled).toBe(true);
  });
});
