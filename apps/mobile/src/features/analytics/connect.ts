/**
 * Connects the `Analytics` port to the app: consent, the install ID,
 * `app_opened`, and the settings events. Pure wiring with injected stores,
 * so tests can run it with fakes. The app's instance is in `store.ts`.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, Storage } from '@tavli/contracts';
import type { StoreApi } from 'zustand/vanilla';

import { getInstallId } from '@/features/install-id/installId';
import type { Settings } from '@/features/settings/settings';

import type { ConsentState } from '@/features/privacy/consent';

export interface ConnectAnalyticsOptions {
  analytics: Analytics;
  consent: StoreApi<ConsentState>;
  settings: StoreApi<Settings>;
  storage: Storage;
}

export interface AppAnalytics {
  /**
   * Call at start. Sends `app_opened` once per cold start: now if the user
   * said yes, or as soon as they do (first launch). Later calls do nothing.
   */
  appOpened: () => void;
  /** Stops listening to the stores (tests). */
  disconnect: () => void;
}

export function connectAnalytics({
  analytics,
  consent,
  settings,
  storage,
}: ConnectAnalyticsOptions): AppAnalytics {
  let openPending = false;

  const sendAppOpened = () => {
    if (openPending && analytics.isOptedIn()) {
      openPending = false;
      analytics.track('app_opened');
    }
  };

  const apply = (status: ConsentState['status']) => {
    if (status === 'granted') {
      analytics.optIn();
      // The same anonymous install ID as crash reports (#43).
      analytics.identify(getInstallId(storage));
      sendAppOpened();
    } else {
      // The install ID stays (crash reports use it too). PostHog forgets its own IDs.
      analytics.optOut();
    }
  };

  apply(consent.getState().status);

  const stopConsent = consent.subscribe((state, previous) => {
    if (state.status !== previous.status) apply(state.status);
  });

  const stopSettings = settings.subscribe((state, previous) => {
    for (const key of Object.keys(state) as (keyof Settings)[]) {
      if (typeof state[key] === 'function' || state[key] === previous[key]) continue;
      if (key === 'theme') {
        analytics.track('theme_changed', { theme: state.theme });
      } else {
        // Only the key: values could say more than we need.
        analytics.track('settings_changed', { key });
      }
    }
  });

  let opened = false;
  return {
    appOpened: () => {
      if (opened) return;
      opened = true;
      openPending = true;
      sendAppOpened();
    },
    disconnect: () => {
      stopConsent();
      stopSettings();
    },
  };
}
