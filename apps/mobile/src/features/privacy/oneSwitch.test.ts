import {
  createMemoryStorage,
  createRecordingAnalytics,
  createRecordingCrashReporter,
  type Storage,
} from '@tavli/contracts';

import { connectAnalytics } from '@/features/analytics/connect';
import { setupCrashReporting } from '@/features/crash/setup';
import { INSTALL_ID_STORAGE_KEY } from '@/features/install-id/installId';
import { createSettingsStore } from '@/features/settings/settings';

import { CONSENT_STORAGE_KEY, CONSENT_VERSION, createConsentStore, needsWelcome } from './consent';

/** A storage with an answer saved for an older consent text. */
function oldAnswer(status: 'granted' | 'denied'): Storage {
  return createMemoryStorage({
    [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION - 1, status }),
  });
}

/** Starts crash reports and analytics on one consent store, like the app does. */
function startApp(storage: Storage = createMemoryStorage()) {
  const consent = createConsentStore(storage);
  const crash = createRecordingCrashReporter();
  const analytics = createRecordingAnalytics();
  setupCrashReporting({
    reporter: crash,
    consent,
    storage,
    dsn: 'https://public@example.ingest.sentry.io/1',
    environment: 'test',
  });
  const app = connectAnalytics({
    analytics,
    consent,
    settings: createSettingsStore(storage),
    storage,
  });
  app.appOpened();
  return { consent, crash, analytics, storage };
}

describe('the one privacy switch', () => {
  it('before an answer: anonymous crash reports only, no usage data', () => {
    const { crash, analytics } = startApp();

    expect(crash.enabled).toBe(true);
    expect(crash.user).toBeNull();
    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);
  });

  it('"Allow": crash reports and usage data, with the same install id', () => {
    const { consent, crash, analytics, storage } = startApp();
    consent.getState().setConsent(true);

    const id = storage.getString(INSTALL_ID_STORAGE_KEY);
    expect(crash.enabled).toBe(true);
    expect(crash.user).toBe(id);
    expect(analytics.isOptedIn()).toBe(true);
    expect(analytics.sent[0]).toEqual({ type: 'identify', id });
  });

  it('"Don\'t allow": stops both crash reports and usage data', () => {
    const { consent, crash, analytics } = startApp();
    consent.getState().setConsent(true);
    analytics.sent.length = 0;

    consent.getState().setConsent(false);
    crash.captureException(new Error('boom'));
    analytics.track('undo_used');

    expect(crash.enabled).toBe(false);
    expect(crash.user).toBeNull();
    expect(crash.reports).toEqual([]);
    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);
  });

  it('a saved "Don\'t allow" keeps both off from the next start', () => {
    const storage = createMemoryStorage();
    startApp(storage).consent.getState().setConsent(false);

    const { crash, analytics } = startApp(storage);
    expect(crash.config?.enabled).toBe(false);
    expect(crash.enabled).toBe(false);
    expect(analytics.isOptedIn()).toBe(false);
  });

  it('new consent text after "Don\'t allow": asks again, and crash reports stay off', () => {
    const { consent, crash, analytics, storage } = startApp(oldAnswer('denied'));

    expect(needsWelcome(consent.getState().status)).toBe(true);
    expect(crash.config?.enabled).toBe(false);
    expect(crash.enabled).toBe(false);
    expect(crash.user).toBeNull();
    crash.captureException(new Error('boom'));
    expect(crash.reports).toEqual([]);
    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);

    // The new answer counts from now on.
    consent.getState().setConsent(true);
    expect(needsWelcome(consent.getState().status)).toBe(false);
    expect(crash.enabled).toBe(true);
    expect(crash.user).toBe(storage.getString(INSTALL_ID_STORAGE_KEY));
    expect(analytics.isOptedIn()).toBe(true);
  });

  it('new consent text after "Allow": asks again, as before any answer', () => {
    const { consent, crash, analytics } = startApp(oldAnswer('granted'));

    expect(needsWelcome(consent.getState().status)).toBe(true);
    // The "not answered yet" row: anonymous crash reports, no usage data.
    expect(crash.enabled).toBe(true);
    expect(crash.user).toBeNull();
    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);
  });
});
