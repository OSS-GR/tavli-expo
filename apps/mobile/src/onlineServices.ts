/**
 * Online play (#266): sign-in (`AuthProvider`) and online games
 * (`GameTransport`), built on first use.
 *
 * `services.ts` passes the adapters. This file imports none, so Jest can
 * test it with fakes. Nothing here runs at app start:
 * - the sign-in client is made on the first call to `auth`;
 * - the Convex client (one socket) opens on the first call to `games`.
 *
 * No call here makes an account. A guest account is made only when a
 * screen calls `auth.signInAsGuest()`, when the user first opens online
 * play. Never send the user id to analytics.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';

import type { ConvexServer } from './convexUrl';

/** Sign-in and online games. Both share one signed-in client. */
export interface OnlineServices {
  readonly auth: AuthProvider;
  readonly games: GameTransport;
}

/** How to make the real parts. `services.ts` passes the adapters. */
export interface OnlineAdapters<Client> {
  /** The sign-in provider, on the Convex site URL. */
  createAuth(siteUrl: string): AuthProvider;
  /** The backend client on the deployment URL, signed in through `auth`. One per app. */
  createClient(url: string, auth: AuthProvider): Client;
  /** The game transport on the shared client. */
  createGames(client: Client): GameTransport;
}

/** Calls `make` once, on the first call, and keeps the result. */
export function once<T>(make: () => T): () => T {
  let made: { readonly value: T } | undefined;
  return () => {
    made ??= { value: make() };
    return made.value;
  };
}

/** An `AuthProvider` that makes the real one on its first call. */
export function lazyAuthProvider(get: () => AuthProvider): AuthProvider {
  return {
    ready: () => get().ready(),
    currentUser: () => get().currentUser(),
    signInAsGuest: () => get().signInAsGuest(),
    signOut: () => get().signOut(),
    getToken: (options) => get().getToken(options),
    onChange: (listener) => get().onChange(listener),
  };
}

/** A `GameTransport` that makes the real one on its first call. */
export function lazyGameTransport(get: () => GameTransport): GameTransport {
  return {
    subscribe: (gameId, onView, onError) => get().subscribe(gameId, onView, onError),
    sendTurn: (request) => get().sendTurn(request),
    sendAnswer: (request) => get().sendAnswer(request),
    resign: (gameId) => get().resign(gameId),
  };
}

/**
 * The online services for `server`, or `undefined` when this build has
 * no server (`convexServer()` is `undefined`): then online play is off.
 */
export function createOnlineServices<Client>(
  server: ConvexServer | undefined,
  adapters: OnlineAdapters<Client>,
): OnlineServices | undefined {
  if (server === undefined) return undefined;
  const auth = once(() => adapters.createAuth(server.siteUrl));
  // Later the invite calls take this same client (one socket).
  const client = once(() => adapters.createClient(server.url, auth()));
  const games = once(() => adapters.createGames(client()));
  return { auth: lazyAuthProvider(auth), games: lazyGameTransport(games) };
}
