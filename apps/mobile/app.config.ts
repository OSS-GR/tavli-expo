/**
 * App variants. Each variant gets its own name and app id, so dev, preview
 * and production builds can sit side by side on one phone.
 *
 * - No `APP_VARIANT` means `development`. Local `expo run:ios` and
 *   `expo run:android` builds use it.
 * - The EAS build profiles in `eas.json` set `APP_VARIANT`.
 *
 * Why dev is the default: a free Apple ID in Xcode reserves the bundle id it
 * signs. A reserved `com.tavlaki` could block the paid Apple account later.
 * So only `APP_VARIANT=production` builds use the real id.
 *
 * `app.json` holds the base config. EAS CLI writes there (for example the
 * project id from `eas init`). This file reads it through `config`. Only
 * settings that depend on build env vars belong here.
 * See docs/process/running-the-app.md.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const VARIANTS = {
  development: { idSuffix: '.dev', nameSuffix: ' Dev' },
  preview: { idSuffix: '.preview', nameSuffix: ' Preview' },
  production: { idSuffix: '', nameSuffix: '' },
} as const;

type Variant = keyof typeof VARIANTS;

function isVariant(value: string): value is Variant {
  return Object.hasOwn(VARIANTS, value);
}

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

function readVariant(): Variant {
  // An empty APP_VARIANT counts as unset.
  const value = process.env.APP_VARIANT || 'development';
  if (!isVariant(value)) {
    throw new Error(`Unknown APP_VARIANT "${value}". Use development, preview or production.`);
  }
  return value;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { idSuffix, nameSuffix } = VARIANTS[readVariant()];
  const name = config.name ?? 'Tavlaki';
  const slug = config.slug ?? 'tavlaki';
  const bundleIdentifier = config.ios?.bundleIdentifier ?? 'com.tavlaki';
  const androidPackage = config.android?.package ?? 'com.tavlaki';

  return {
    ...config,
    name: `${name}${nameSuffix}`,
    slug,
    ios: { ...config.ios, bundleIdentifier: `${bundleIdentifier}${idSuffix}` },
    android: { ...config.android, package: `${androidPackage}${idSuffix}` },
    plugins: [...(config.plugins ?? []), sentryPlugin()],
  };
};
