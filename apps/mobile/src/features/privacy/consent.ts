/**
 * The user's answer to "Share anonymous usage data" (GDPR, issue #61).
 * It is the one privacy switch: analytics and crash reports both follow it.
 *
 * - `unset`: not asked yet, or the app closed before an answer. No usage
 *   data is sent. Crash reports are sent, but with no install id. The
 *   welcome flow shows on next launch.
 * - `granted`: usage data and crash reports, both with the install id.
 * - `denied`: nothing at all, not even crash reports.
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
/**
 * The version of the consent text. Raise it when the text changes in a way
 * the user must agree to again: an answer saved for another version loads
 * as `unset`, so the welcome flow asks again.
 */
export const CONSENT_VERSION = 1;

export interface ConsentState {
  readonly status: ConsentStatus;
  /** Saves the answer. */
  setConsent: (granted: boolean) => void;
}

/** The saved answer. A missing, broken or other-version save is `unset`. */
function load(storage: Storage): ConsentStatus {
  const raw = storage.getString(CONSENT_STORAGE_KEY);
  if (raw === undefined) return 'unset';
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return 'unset';
    const { version, status } = saved as { version?: unknown; status?: unknown };
    if (version !== CONSENT_VERSION) return 'unset';
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
 * May the app send usage data, and tie crash reports to the install id?
 * Only after "Allow". For crash reports themselves, see
 * `features/crash/consent.ts` (`crashReportingAllowed`).
 */
export function usageDataAllowed(status: ConsentStatus): boolean {
  return status === 'granted';
}

/** The welcome flow (language, then usage data) shows until the user answers. */
export function needsWelcome(status: ConsentStatus): boolean {
  return status === 'unset';
}
