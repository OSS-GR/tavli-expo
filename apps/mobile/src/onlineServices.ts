/**
 * Online play (#266, #281, #285): sign-in (`AuthProvider`), online games
 * (`GameTransport`), invites (`Invites`), the server's push tokens
 * (`PushTokens`) and the phone's turn notifications (`PushNotifications`),
 * built on first use.
 *
 * `services.ts` passes the adapters. This file imports none, so Jest can
 * test it with fakes. Nothing here runs at app start:
 * - the sign-in client is made on the first call to `auth`;
 * - the Convex client (one socket) opens on the first call to `games`,
 *   `invites` or `pushTokens`; they share it;
 * - the notifications adapter is made on its first call. The root layout
 *   listens for taps on a push at start (`usePushTaps`): that only reads
 *   the phone, with no network call and no prompt. Turn notifications are
 *   for online games only, so a build with no server has none.
 *
 * No call here makes an account. A guest account is made only when a
 * screen calls `auth.signInAsGuest()`: when the user makes or opens an
 * invite (`features/online/account.ts`). Never send the user id to analytics.
 */
import type {
  AuthProvider,
  GameTransport,
  Invites,
  PushNotifications,
  PushTokens,
} from '@tavli/contracts';

import type { ConvexServer } from './convexUrl';

/** Sign-in, online games, invites and pushes. The server calls share one signed-in client. */
export interface OnlineServices {
  readonly auth: AuthProvider;
  readonly games: GameTransport;
  readonly invites: Invites;
  readonly pushTokens: PushTokens;
  readonly notifications: PushNotifications;
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
  /** The push token calls on the shared client. */
  createPushTokens(client: Client): PushTokens;
  /** The phone's notifications: permission, token and taps. */
  createNotifications(): PushNotifications;
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
    listMyGames: (request) => get().listMyGames(request),
    watchMyGames: (request, onList, onError) => get().watchMyGames(request, onList, onError),
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
    watchMyInvites: (onList, onError) => get().watchMyInvites(onList, onError),
  };
}

/** A `PushTokens` port that makes the real one on its first call. */
export function lazyPushTokens(get: () => PushTokens): PushTokens {
  return {
    register: (token, platform) => get().register(token, platform),
    remove: (token) => get().remove(token),
  };
}

/** A `PushNotifications` port that makes the real one on its first use. */
export function lazyPushNotifications(get: () => PushNotifications): PushNotifications {
  return {
    get platform() {
      return get().platform;
    },
    permission: () => get().permission(),
    requestPermission: () => get().requestPermission(),
    getToken: () => get().getToken(),
    onTokenChange: (listener) => get().onTokenChange(listener),
    lastTap: () => get().lastTap(),
    onTap: (listener) => get().onTap(listener),
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
  // Games, invites and push tokens share this client (one socket).
  const client = once(() => adapters.createClient(server.url, auth()));
  const games = once(() => adapters.createGames(client()));
  const invites = once(() => adapters.createInvites(client()));
  const pushTokens = once(() => adapters.createPushTokens(client()));
  const notifications = once(() => adapters.createNotifications());
  return {
    auth: lazyAuthProvider(auth),
    games: lazyGameTransport(games),
    invites: lazyInvites(invites),
    pushTokens: lazyPushTokens(pushTokens),
    notifications: lazyPushNotifications(notifications),
  };
}
