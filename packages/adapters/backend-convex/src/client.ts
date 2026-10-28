/**
 * The real Convex client for the app (#253): a `ConvexClient` on the
 * deployment URL, signed in through the `AuthProvider` port (#131).
 */
import { ConvexClient } from 'convex/browser';

import type { AuthProvider, GameTransport } from '@tavli/contracts';

import { createConvexGameTransport } from './transport';

/** What `ConvexClient.setAuth` calls to get a token (`AuthTokenFetcher`). */
export type ConvexTokenFetcher = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null | undefined>;

/**
 * The token fetcher for `ConvexClient.setAuth`, on the `AuthProvider`.
 * The Convex client asks with `forceRefreshToken: true` when the server
 * refused the old token. `null` means nobody is signed in: the server
 * then answers `NOT_SIGNED_IN`.
 */
export function authTokenFetcher(auth: Pick<AuthProvider, 'getToken'>): ConvexTokenFetcher {
  return ({ forceRefreshToken }) => auth.getToken({ forceRefresh: forceRefreshToken });
}

/**
 * A `ConvexClient` on `url` (`EXPO_PUBLIC_CONVEX_URL`, the `.convex.cloud`
 * URL) that sends the token of `auth`. Make one per app and share it.
 *
 * The client asks for a token when `setAuth` is called, and again only
 * when the server refuses one. When the first answer is `null` (nobody
 * signed in yet), it stays signed out for good. So each sign-in and
 * sign-out (`auth.onChange`) calls `setAuth` again (#281).
 */
export function createConvexClient(
  url: string,
  auth: Pick<AuthProvider, 'getToken' | 'onChange'>,
): ConvexClient {
  const client = new ConvexClient(url);
  const fetchToken = authTokenFetcher(auth);
  client.setAuth(fetchToken);
  // One client per app: it follows the sign-in for the whole app run.
  auth.onChange(() => {
    client.setAuth(fetchToken);
  });
  return client;
}

/** The `GameTransport` for the app: a new signed-in `ConvexClient` on `url`. */
export function createConvexGameTransportFromUrl(
  url: string,
  auth: Pick<AuthProvider, 'getToken' | 'onChange'>,
): GameTransport {
  return createConvexGameTransport({ client: createConvexClient(url, auth) });
}
