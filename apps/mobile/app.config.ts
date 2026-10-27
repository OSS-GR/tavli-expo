// Dynamic app config. The static config lives in app.json; Expo passes it
// in as `config`. Only settings that depend on build env vars belong here.
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Sentry config plugin (`@sentry/react-native/expo`). It adds the steps
 * that upload source maps and debug files during EAS Build.
 *
 * The upload needs `SENTRY_AUTH_TOKEN`, a secret. It is never in the repo:
 * the owner adds it as an EAS environment variable (see
 * packages/adapters/crash-sentry/README.md). Without it the upload is
 * skipped, so builds still work.
 */
function sentryPlugin(): [string, Record<string, unknown>] {
  const env = process.env;
  return [
    '@sentry/react-native/expo',
    {
      url: env.SENTRY_URL || 'https://sentry.io/',
      ...(env.SENTRY_ORG ? { organization: env.SENTRY_ORG } : {}),
      ...(env.SENTRY_PROJECT ? { project: env.SENTRY_PROJECT } : {}),
      disableAutoUpload: !env.SENTRY_AUTH_TOKEN,
    },
  ];
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Tavlaki',
  slug: config.slug ?? 'tavlaki',
  plugins: [...(config.plugins ?? []), sentryPlugin()],
});
