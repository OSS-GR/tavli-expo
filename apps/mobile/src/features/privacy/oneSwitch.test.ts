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

import { createConsentStore } from './consent';

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
});
