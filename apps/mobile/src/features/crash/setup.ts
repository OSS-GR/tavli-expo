/**
 * Starts crash reporting and keeps it in line with the privacy setting.
 *
 * `start.ts` calls this with the real services before anything else loads.
 * Tests call it with fakes.
 */
import type { CrashReporter, Storage } from '@tavli/contracts';

import type { SettingsStore } from '@/features/settings/settings';
import { getInstallId } from '@/features/install-id/installId';

import { crashReportingAllowed } from './consent';

export interface CrashSetupDeps {
  reporter: CrashReporter;
  settings: SettingsStore;
  storage: Storage;
  /** Public Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`). Missing means no reports. */
  dsn: string | undefined;
  /** For example `development` or `production`. */
  environment: string;
}

/** Starts the reporter. Returns a function that stops following the setting. */
export function setupCrashReporting({
  reporter,
  settings,
  storage,
  dsn,
  environment,
}: CrashSetupDeps): () => void {
  let allowed = crashReportingAllowed(settings.getState());
  reporter.init({
    ...(dsn ? { dsn } : {}),
    environment,
    enabled: allowed,
  });
  reporter.setUser(getInstallId(storage));

  return settings.subscribe((state) => {
    const next = crashReportingAllowed(state);
    if (next === allowed) return;
    allowed = next;
    reporter.setEnabled(next);
  });
}
