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
 *
 * Only the development build registers the dev client's link scheme
 * (`exp+tavlaki`, from the slug). The QR code of `expo start` opens that
 * scheme. If a preview or production app on the phone registered it too, iOS
 * could open that app instead of the dev app. Those variants have no dev
 * launcher to open anyway (see `withDevClientScheme`).
 *
 * The result goes into the fingerprint (the runtime version). EAS Build
 * makes the fingerprint on your computer and again on the build server, and
 * the build fails when the two differ. So read only env vars that both
 * places see: a profile's `env` in `eas.json`, or a plain-text or sensitive
 * EAS variable. Never read a secret EAS variable (your computer never gets
 * it) or a value that is only in `.env.local` (git ignores it, so EAS never
 * gets it). `src/convexUrl.test.ts` lists the env vars this file may read.
 * That test reads this file's text, so read each var here, in the dot form
 * that `readVariant` uses. The test fails on a destructured or bracket read,
 * and it cannot see a read in another file.
 * See docs/process/running-the-app.md.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The Convex deployments (#257). These URLs are public client config, not
 * secrets. `.github/workflows/deploy-server.yml` deploys the functions there.
 */
const CONVEX_DEV_URL = 'https://exciting-reindeer-792.eu-west-1.convex.cloud';
const CONVEX_PROD_URL = 'https://superb-dog-503.eu-west-1.convex.cloud';

const VARIANTS = {
  development: { idSuffix: '.dev', nameSuffix: ' Dev', convexUrl: CONVEX_DEV_URL },
  preview: { idSuffix: '.preview', nameSuffix: ' Preview', convexUrl: CONVEX_DEV_URL },
  production: { idSuffix: '', nameSuffix: '', convexUrl: CONVEX_PROD_URL },
} as const;

type Variant = keyof typeof VARIANTS;

function isVariant(value: string): value is Variant {
  return Object.hasOwn(VARIANTS, value);
}

function readVariant(): Variant {
  // An empty APP_VARIANT counts as unset.
  const value = process.env.APP_VARIANT || 'development';
  if (!isVariant(value)) {
    throw new Error(`Unknown APP_VARIANT "${value}". Use development, preview or production.`);
  }
  return value;
}

/**
 * The Convex URL for the variant. `EXPO_PUBLIC_CONVEX_URL`, when set, wins,
 * so you can point any build at your own deployment. The app reads the
 * result from `extra.convexUrl` (`src/convexUrl.ts`).
 */
function convexUrl(variant: Variant): string {
  return process.env.EXPO_PUBLIC_CONVEX_URL?.trim() || VARIANTS[variant].convexUrl;
}

/** A Convex cloud URL: `https://<name>.convex.cloud`. */
const CONVEX_CLOUD_URL = /^(https:\/\/[^\s/?#]+)\.convex\.cloud\/?$/;

/**
 * The Convex site URL (#266), where Better Auth signs the user in.
 * `EXPO_PUBLIC_CONVEX_SITE_URL`, when set, wins. Else it is the Convex URL
 * with `.convex.site` in place of `.convex.cloud`: a cloud deployment
 * serves its HTTP routes there. Any other URL (a local backend) has no
 * site URL unless you set the variable. The app reads the result from
 * `extra.convexSiteUrl` (`src/convexUrl.ts`).
 */
function convexSiteUrl(url: string): string | undefined {
  const own = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();
  if (own) return own;
  const cloud = CONVEX_CLOUD_URL.exec(url);
  return cloud ? `${cloud[1]}.convex.site` : undefined;
}

/**
 * The plugins for `variant`. Preview and production builds turn off the
 * dev client's generated `exp+<slug>` scheme (see the top of this file).
 * Never list `expo-dev-client` twice: the dev build keeps the default.
 */
export function withDevClientScheme(
  plugins: ExpoConfig['plugins'],
  variant: Variant,
): ExpoConfig['plugins'] {
  if (variant === 'development') return plugins;
  return [...(plugins ?? []), ['expo-dev-client', { addGeneratedScheme: false }]];
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = readVariant();
  const { idSuffix, nameSuffix } = VARIANTS[variant];
  const url = convexUrl(variant);
  const siteUrl = convexSiteUrl(url);
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
    plugins: withDevClientScheme(config.plugins, variant),
    extra: { ...config.extra, convexUrl: url, ...(siteUrl ? { convexSiteUrl: siteUrl } : {}) },
  };
};
