/**
 * The app's consent store: the one privacy switch (#61). Analytics
 * (`features/analytics/store.ts`) and crash reports (`features/crash/start.ts`)
 * both follow it. It loads nothing but the `Storage` port, so crash
 * reporting can read it first thing at start.
 */
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createConsentStore, type ConsentState } from './consent';

export const consentStore = createConsentStore(storage);

/** Reads the consent answer in a component. */
export function useConsent<T>(selector: (state: ConsentState) => T): T {
  return useStore(consentStore, selector);
}
