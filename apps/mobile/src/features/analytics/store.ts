/**
 * The app's analytics wiring (#61). Importing this module applies the saved
 * consent before any event can be sent: until the user says yes, the
 * `Analytics` port drops everything.
 */
import { consentStore } from '@/features/privacy/consentStore';
import { settingsStore } from '@/features/settings/store';
import { analytics, storage } from '@/services';

import { connectAnalytics } from './connect';

export const appAnalytics = connectAnalytics({
  analytics,
  consent: consentStore,
  settings: settingsStore,
  storage,
});
