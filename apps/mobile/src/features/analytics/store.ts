/**
 * The app's analytics wiring (#61). Importing this module applies the saved
 * consent before any event can be sent: until the user says yes, the
 * `Analytics` port drops everything.
 */
import { useStore } from 'zustand';

import { settingsStore } from '@/features/settings/store';
import { analytics, storage } from '@/services';

import { connectAnalytics } from './connect';
import { createConsentStore, type ConsentState } from './consent';

export const consentStore = createConsentStore(storage);

export const appAnalytics = connectAnalytics({
  analytics,
  consent: consentStore,
  settings: settingsStore,
  storage,
});

/** Reads the consent answer in a component. */
export function useConsent<T>(selector: (state: ConsentState) => T): T {
  return useStore(consentStore, selector);
}
