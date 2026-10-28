/**
 * The URL of the Convex deployment for online games (#257).
 *
 * `app.config.ts` picks it per app variant and puts it in `extra.convexUrl`:
 * the dev deployment for `development`, prod for `preview` and `production`.
 * `EXPO_PUBLIC_CONVEX_URL` overrides it there. Read the URL only here.
 * See docs/process/running-the-app.md.
 */
import Constants from 'expo-constants';

/** http or https, a host, then an optional path. No spaces. */
const HTTP_URL = /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/;

/** The Convex URL from the app config `extra`, or `undefined` when it has none. */
export function readConvexUrl(extra: unknown): string | undefined {
  if (typeof extra !== 'object' || extra === null) return undefined;
  const value: unknown = (extra as { convexUrl?: unknown }).convexUrl;
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  // A regex, not `new URL`: React Native's `URL` is not complete.
  // http is for a local Convex backend (`npx convex dev --local`).
  return HTTP_URL.test(url) ? url : undefined;
}

/** The Convex URL of this build, or `undefined` when the config has none. */
export function convexUrl(): string | undefined {
  return readConvexUrl(Constants.expoConfig?.extra);
}
