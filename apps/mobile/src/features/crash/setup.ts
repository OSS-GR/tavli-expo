/**
 * Starts crash reporting and keeps it in line with the privacy switch
 * (the consent store, #61).
 *
 * `start.ts` calls this with the real services before anything else loads.
 * Tests call it with fakes.
 */
import type { CrashReporter, Storage } from '@tavli/contracts';
import type { StoreApi } from 'zustand/vanilla';

import { getInstallId } from '@/features/install-id/installId';
import type { ConsentState, ConsentStatus } from '@/features/privacy/consent';

import { crashReportingAllowed, crashUserAllowed } from './consent';

export interface CrashSetupDeps {
  reporter: CrashReporter;
  consent: StoreApi<ConsentState>;
  storage: Storage;
  /** Public Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`). Missing means no reports. */
  dsn: string | undefined;
  /** For example `development` or `production`. */
  environment: string;
}

/** Starts the reporter. Returns a function that stops following the switch. */
export function setupCrashReporting({
  reporter,
  consent,
  storage,
  dsn,
  environment,
}: CrashSetupDeps): () => void {
  // The install id is read (and made) only once the user said yes.
  const applyUser = (status: ConsentStatus) =>
    reporter.setUser(crashUserAllowed(status) ? getInstallId(storage) : null);

  const status = consent.getState().status;
  let allowed = crashReportingAllowed(status);
  reporter.init({
    ...(dsn ? { dsn } : {}),
    environment,
    enabled: allowed,
  });
  applyUser(status);

  return consent.subscribe((state, previous) => {
    if (state.status === previous.status) return;
    const next = crashReportingAllowed(state.status);
    // Clear the user before turning off, set it after turning on.
    if (!next) applyUser(state.status);
    if (next !== allowed) {
      allowed = next;
      reporter.setEnabled(next);
    }
    if (next) applyUser(state.status);
  });
}
