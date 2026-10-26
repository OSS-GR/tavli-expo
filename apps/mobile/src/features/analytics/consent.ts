/**
 * The user's answer to "Share anonymous usage data" (GDPR, issue #61).
 *
 * - `unset`: not asked yet, or the app closed before an answer. This counts
 *   as "no": nothing is sent, and the welcome flow shows on next launch.
 * - `granted` / `denied`: the answer from the welcome screen or Settings.
 *
 * Saved through the `Storage` port. Kept apart from Settings, so "reset
 * settings" can never turn analytics on or off by accident.
 */
import type { Storage } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

export type ConsentStatus = 'unset' | 'granted' | 'denied';

/** The privacy policy page (wireframe 02, Settings → Privacy). */
export const PRIVACY_POLICY_URL = 'https://tavlaki.com/privacy';

/** Storage key. The saved value is `{ version, status }` JSON. */
export const CONSENT_STORAGE_KEY = 'analyticsConsent';
export const CONSENT_VERSION = 1;

export interface ConsentState {
  readonly status: ConsentStatus;
  /** Saves the answer. */
  setConsent: (granted: boolean) => void;
}

function load(storage: Storage): ConsentStatus {
  const raw = storage.getString(CONSENT_STORAGE_KEY);
  if (raw === undefined) return 'unset';
  try {
    const saved: unknown = JSON.parse(raw);
    const status =
      typeof saved === 'object' && saved !== null ? (saved as { status?: unknown }).status : null;
    return status === 'granted' || status === 'denied' ? status : 'unset';
  } catch {
    return 'unset';
  }
}

/** A consent store saved in `storage`. The saved answer is loaded before this returns. */
export function createConsentStore(storage: Storage) {
  return createStore<ConsentState>()((set) => ({
    status: load(storage),
    setConsent: (granted) => {
      const status: ConsentStatus = granted ? 'granted' : 'denied';
      storage.setString(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, status }));
      set({ status });
    },
  }));
}

export type ConsentStore = ReturnType<typeof createConsentStore>;

/**
 * The one "Share usage data" switch. Analytics follows it; crash reports
 * (#43, `crashReportingAllowed`) should read it too.
 */
export function usageDataAllowed(status: ConsentStatus): boolean {
  return status === 'granted';
}

/** The welcome flow (language, then usage data) shows until the user answers. */
export function needsWelcome(status: ConsentStatus): boolean {
  return status === 'unset';
}
