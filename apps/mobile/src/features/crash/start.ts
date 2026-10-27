// Starts crash reporting. The app entry (index.ts) imports this first, so
// errors while the rest of the app loads are caught too.
import { settingsStore } from '@/features/settings/store';
import { crashReporter, storage } from '@/services';

import { setupCrashReporting } from './setup';

setupCrashReporting({
  reporter: crashReporter,
  settings: settingsStore,
  storage,
  // Read env vars this exact way: Expo inlines only `process.env.EXPO_PUBLIC_X`.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Set it per EAS build profile (for example `preview`) to tell test builds apart.
  environment:
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? 'development' : 'production'),
});
