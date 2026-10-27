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
  // The user first: the reporter starts anonymous (JS only, no sessions)
  // or identified, by whether it has a user when `init` runs.
  applyUser(status);
  reporter.init({
    ...(dsn ? { dsn } : {}),
    environment,
    enabled: allowed,
  });

  return consent.subscribe((state, previous) => {
    if (state.status === previous.status) return;
    const next = crashReportingAllowed(state.status);
    if (next === allowed) {
      applyUser(state.status);
      return;
    }
    allowed = next;
    // Change the user while the reporter is off, so it starts (or would
    // start again) in the right mode and does not restart for nothing.
    if (next) {
      applyUser(state.status);
      reporter.setEnabled(true);
    } else {
      reporter.setEnabled(false);
      applyUser(state.status);
    }
  });
}
