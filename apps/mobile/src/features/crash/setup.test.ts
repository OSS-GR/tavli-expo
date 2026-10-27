import { createMemoryStorage, createRecordingCrashReporter } from '@tavli/contracts';

import { INSTALL_ID_STORAGE_KEY } from '@/features/install-id/installId';
import { createSettingsStore } from '@/features/settings/settings';

import * as consent from './consent';
import { setupCrashReporting } from './setup';

const DSN = 'https://public@example.ingest.sentry.io/1';

afterEach(() => {
  jest.restoreAllMocks();
});

function setup({ dsn = DSN as string | undefined } = {}) {
  const reporter = createRecordingCrashReporter();
  const storage = createMemoryStorage();
  const settings = createSettingsStore(storage);
  const stop = setupCrashReporting({ reporter, settings, storage, dsn, environment: 'test' });
  return { reporter, storage, settings, stop };
}

describe('setupCrashReporting', () => {
  it('starts the reporter with the DSN, enabled by default', () => {
    const { reporter } = setup();
    expect(reporter.config).toEqual({ dsn: DSN, environment: 'test', enabled: true });
    expect(reporter.enabled).toBe(true);
  });

  it('passes no DSN when it is missing, so the adapter stays a no-op', () => {
    const { reporter } = setup({ dsn: '' });
    expect(reporter.config).toEqual({ environment: 'test', enabled: true });
  });

  it('sets a saved anonymous install id as the user', () => {
    const { reporter, storage } = setup();
    expect(reporter.user).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(storage.getString(INSTALL_ID_STORAGE_KEY)).toBe(reporter.user);
  });

  it('starts disabled when the player opted out', () => {
    jest.spyOn(consent, 'crashReportingAllowed').mockReturnValue(false);
    const { reporter } = setup();
    expect(reporter.config?.enabled).toBe(false);
    expect(reporter.enabled).toBe(false);
  });

  it('follows the privacy setting while the app runs', () => {
    const allowed = jest.spyOn(consent, 'crashReportingAllowed');
    const { reporter, settings, stop } = setup();

    allowed.mockReturnValue(false);
    settings.getState().setSetting('sound', false);
    expect(reporter.enabled).toBe(false);

    allowed.mockReturnValue(true);
    settings.getState().setSetting('sound', true);
    expect(reporter.enabled).toBe(true);

    stop();
    allowed.mockReturnValue(false);
    settings.getState().setSetting('sound', false);
    expect(reporter.enabled).toBe(true);
  });
});
