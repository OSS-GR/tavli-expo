/**
 * The URLs of the Convex deployment for online games (#257, #266).
 *
 * `app.config.ts` picks them per app variant and puts them in `extra`:
 * - `convexUrl`: the deployment (`.convex.cloud`). The dev deployment for
 *   `development` and `preview` (test builds), prod for `production`.
 *   `EXPO_PUBLIC_CONVEX_URL` overrides it.
 * - `convexSiteUrl`: the same deployment's site (`.convex.site`), where
 *   Better Auth signs the user in. `EXPO_PUBLIC_CONVEX_SITE_URL`
 *   overrides it.
 *
 * Read the URLs only here. See docs/process/running-the-app.md.
 */
import Constants from 'expo-constants';

/**
 * The app's URL scheme (`scheme` in `app.json`). Better Auth sends it as
 * the origin (`tavlaki://`), so it must be in `trustedOrigins` in
 * `apps/server/convex/auth.ts`. `convexUrl.test.ts` checks both.
 */
export const APP_SCHEME = 'tavlaki';

/** http or https, a host, then an optional path. No spaces. */
const HTTP_URL = /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/;

/** The URL in `extra[key]`, or `undefined` when there is no usable one. */
function readUrl(extra: unknown, key: 'convexUrl' | 'convexSiteUrl'): string | undefined {
  if (typeof extra !== 'object' || extra === null) return undefined;
  const value: unknown = (extra as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  // A regex, not `new URL`: React Native's `URL` is not complete.
  // http is for a local Convex backend (`npx convex dev --local`).
  return HTTP_URL.test(url) ? url : undefined;
}

/** The Convex URL from the app config `extra`, or `undefined` when it has none. */
export function readConvexUrl(extra: unknown): string | undefined {
  return readUrl(extra, 'convexUrl');
}

/** The Convex site URL from the app config `extra`, or `undefined` when it has none. */
export function readConvexSiteUrl(extra: unknown): string | undefined {
  return readUrl(extra, 'convexSiteUrl');
}

/** The Convex URL of this build, or `undefined` when the config has none. */
export function convexUrl(): string | undefined {
  return readConvexUrl(Constants.expoConfig?.extra);
}

/** Where online play connects: the deployment, and its site for sign-in. */
export interface ConvexServer {
  /** The deployment URL (`.convex.cloud`), for the Convex client. */
  readonly url: string;
  /** The site URL (`.convex.site`): the Better Auth base URL. */
  readonly siteUrl: string;
}

/**
 * Both URLs of this build, or `undefined` when one is missing. Then
 * online play is off: `auth` and `games` in `services.ts` are `undefined`.
 */
export function convexServer(): ConvexServer | undefined {
  const extra = Constants.expoConfig?.extra;
  const url = readConvexUrl(extra);
  const siteUrl = readConvexSiteUrl(extra);
  return url === undefined || siteUrl === undefined ? undefined : { url, siteUrl };
}
