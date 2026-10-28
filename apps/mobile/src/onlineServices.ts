/**
 * Online play (#266, #281): sign-in (`AuthProvider`), online games
 * (`GameTransport`) and invites (`Invites`), built on first use.
 *
 * `services.ts` passes the adapters. This file imports none, so Jest can
 * test it with fakes. Nothing here runs at app start:
 * - the sign-in client is made on the first call to `auth`;
 * - the Convex client (one socket) opens on the first call to `games` or
 *   `invites`; both share it.
 *
 * No call here makes an account. A guest account is made only when a
 * screen calls `auth.signInAsGuest()`: when the user makes or opens an
 * invite (`features/online/account.ts`). Never send the user id to analytics.
 */
import type { AuthProvider, GameTransport, Invites } from '@tavli/contracts';

import type { ConvexServer } from './convexUrl';

/** Sign-in, online games and invites. Games and invites share one signed-in client. */
export interface OnlineServices {
  readonly auth: AuthProvider;
  readonly games: GameTransport;
  readonly invites: Invites;
}

/** How to make the real parts. `services.ts` passes the adapters. */
export interface OnlineAdapters<Client> {
  /** The sign-in provider, on the Convex site URL. */
  createAuth(siteUrl: string): AuthProvider;
  /** The backend client on the deployment URL, signed in through `auth`. One per app. */
  createClient(url: string, auth: AuthProvider): Client;
  /** The game transport on the shared client. */
  createGames(client: Client): GameTransport;
  /** The invites on the shared client. */
  createInvites(client: Client): Invites;
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

/** An `Invites` port that makes the real one on its first call. */
export function lazyInvites(get: () => Invites): Invites {
  return {
    createInvite: (game) => get().createInvite(game),
    getInvite: (code) => get().getInvite(code),
    watchInvite: (code, onView, onError) => get().watchInvite(code, onView, onError),
    acceptInvite: (code) => get().acceptInvite(code),
    declineInvite: (code) => get().declineInvite(code),
    cancelInvite: (code) => get().cancelInvite(code),
    listMyInvites: () => get().listMyInvites(),
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
  // Games and invites share this client (one socket).
  const client = once(() => adapters.createClient(server.url, auth()));
  const games = once(() => adapters.createGames(client()));
  const invites = once(() => adapters.createInvites(client()));
  return {
    auth: lazyAuthProvider(auth),
    games: lazyGameTransport(games),
    invites: lazyInvites(invites),
  };
}
