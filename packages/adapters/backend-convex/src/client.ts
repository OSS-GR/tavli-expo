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

/** The first wait before `setAuth` runs again after the client lost its sign-in. */
export const REAUTH_FIRST_WAIT_MS = 1000;
/** The longest wait between two tries. */
export const REAUTH_MAX_WAIT_MS = 30_000;

/**
 * A `ConvexClient` on `url` (`EXPO_PUBLIC_CONVEX_URL`, the `.convex.cloud`
 * URL) that sends the token of `auth`. Make one per app and share it.
 *
 * The client asks for a token when `setAuth` is called, and again only
 * when the token is about to end or the server refuses it. When an answer
 * is `null`, it reports "not signed in" and never asks again. So:
 *
 * - each sign-in and sign-out (`auth.onChange`) calls `setAuth` again
 *   (#281);
 * - when the client reports "not signed in" while `auth` still has a
 *   user, `setAuth` runs again after a wait (1 s, then twice as long each
 *   time, at most 30 s). A token refresh fails when the phone was asleep
 *   or offline for a moment; without this the client stayed signed out
 *   until the app restarted, and every list on Home failed.
 */
export function createConvexClient(
  url: string,
  auth: Pick<AuthProvider, 'getToken' | 'onChange' | 'currentUser'>,
): ConvexClient {
  const client = new ConvexClient(url);
  const fetchToken = authTokenFetcher(auth);
  let wait = REAUTH_FIRST_WAIT_MS;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const stopRetry = () => {
    if (retry !== null) clearTimeout(retry);
    retry = null;
  };

  const onAuth = (signedIn: boolean) => {
    stopRetry();
    if (signedIn) {
      wait = REAUTH_FIRST_WAIT_MS;
      return;
    }
    // Nobody signed in: "not signed in" is right.
    if (auth.currentUser() === null) return;
    retry = setTimeout(() => {
      retry = null;
      setAuth();
    }, wait);
    wait = Math.min(wait * 2, REAUTH_MAX_WAIT_MS);
  };

  const setAuth = () => {
    stopRetry();
    client.setAuth(fetchToken, onAuth);
  };

  setAuth();
  // One client per app: it follows the sign-in for the whole app run.
  auth.onChange(() => {
    wait = REAUTH_FIRST_WAIT_MS;
    setAuth();
  });
  return client;
}

/** The `GameTransport` for the app: a new signed-in `ConvexClient` on `url`. */
export function createConvexGameTransportFromUrl(
  url: string,
  auth: Pick<AuthProvider, 'getToken' | 'onChange' | 'currentUser'>,
): GameTransport {
  return createConvexGameTransport({ client: createConvexClient(url, auth) });
}
