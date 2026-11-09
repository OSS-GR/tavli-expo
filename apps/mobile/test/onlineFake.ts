/**
 * Online play in Jest (#255, #266): the online parts of the `@/services`
 * fake (`jest.setup.ts`). One in-memory server (`createMemoryGameServer`
 * from `@tavli/online`, seeded dice) serves all of them:
 *
 * - `auth` is the in-memory `AuthProvider` (`createMemoryAuthProvider`):
 *   guests `guest-1`, `guest-2`, … Nobody is signed in at the start.
 * - `games` is a `GameTransport` on the server. Each call comes from the
 *   user signed in to `auth` at that moment, like the Convex adapter with
 *   the sign-in token. With nobody signed in it fails `NOT_SIGNED_IN`.
 *   Its watches (`subscribe`, `watchMyGames`, #297) act as the user
 *   signed in when the watch starts.
 * - `onlineServer()` and `gameTransportFor(playerId)` are the dev game
 *   parts (`/dev/online`): the server itself, and one cached transport
 *   per player.
 * - `invites` is the `Invites` port on the server as the signed-in user
 *   (#281), like the Convex adapter. With nobody signed in it fails
 *   `NOT_SIGNED_IN`. Its watches (`watchInvite`, `watchMyInvites`, #314)
 *   act as the user signed in when the watch starts.
 * - `invitesFor(playerId)` is the `Invites` port of a player on the same
 *   server (#256): the dev invites, and a friend in a test.
 * - `notifications` is the phone's notifications in memory (#285): it
 *   starts `undetermined`, and the system prompt answers `granted`.
 *   `pushTokens` is the server's token list, called as the user signed
 *   in to `auth` (`saved` and `calls` show what reached it).
 * - `onlineData` is Delete my online data (#315) on the server, as the
 *   user signed in to `auth`. With nobody signed in it fails
 *   `NOT_SIGNED_IN`, and so does a second call. It leaves `pushTokens`
 *   alone (the app removes its token first, `deleteOnlineData`), and it
 *   does not sign the user out: the app does.
 * - `appUpdates` is the update policy (#390): it blocks no build until a
 *   test sets one (`onlineFake.appUpdates.set('ios', …)`). `appBuild()`
 *   is this build: iOS build `TEST_BUILD`, until a test calls
 *   `onlineFake.setAppBuild(…)`.
 *
 * A test makes games with `onlineFake.server().createGame(...)`. A new
 * match waits for both opening dice (#379): `onlineFake.openGame(gameId)`
 * rolls them (again after each tie), or a test taps its own. Each test
 * starts with a new server, no cached transports and nobody signed in
 * (`resetOnlineFake`, called in `test/afterEnv.ts`). The server clock is
 * `Date.now`, which the fake timers move.
 */
import {
  createMemoryAppleSheet,
  createMemoryAppUpdates,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createMemoryPushNotifications,
  createMemoryPushTokens,
  type GameTransport,
  type GameTransportErrorData,
  type Invites,
  type OnlineData,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { openMemoryGame } from '@tavli/online/testing';

import type { AppBuild } from '../src/features/update/decision';

/** The build number of the app in Jest (iOS). */
export const TEST_BUILD = 20;

const DEFAULT_BUILD: AppBuild = { platform: 'ios', build: TEST_BUILD, appId: 'com.tavlaki.dev' };

const NOT_SIGNED_IN: GameTransportErrorData = {
  code: 'NOT_SIGNED_IN',
  message: 'nobody is signed in',
};

function newServer(): MemoryGameServer {
  // Fixed dice, so tests are repeatable.
  return createMemoryGameServer({ rng: createSeededRng(11), now: () => Date.now() });
}

const authStore = createMemoryAuthStore();
const auth = createMemoryAuthProvider(authStore);
let server = newServer();
const transports = new Map<string, GameTransport>();
const invitePorts = new Map<string, Invites>();
const notifications = createMemoryPushNotifications('ios');
const appleSheet = createMemoryAppleSheet();
const pushTokens = createMemoryPushTokens(() => auth.currentUser()?.id ?? null);
const appUpdates = createMemoryAppUpdates();
let build: AppBuild | null = DEFAULT_BUILD;

/** One transport per player on the current server, like `gameTransportFor` in the app. */
function transportFor(playerId: string): GameTransport {
  let transport = transports.get(playerId);
  if (transport === undefined) {
    transport = server.transportFor(playerId);
    transports.set(playerId, transport);
  }
  return transport;
}

/** One `Invites` port per player on the current server, like `invitesFor` in the app. */
function invitesFor(playerId: string): Invites {
  let invites = invitePorts.get(playerId);
  if (invites === undefined) {
    invites = server.invitesFor(playerId);
    invitePorts.set(playerId, invites);
  }
  return invites;
}

/** The transport of the signed-in user, or `null` when nobody is signed in. */
function caller(): GameTransport | null {
  const user = auth.currentUser();
  return user === null ? null : transportFor(user.id);
}

/** The `Invites` of the signed-in user, or `null` when nobody is signed in. */
function inviter(): Invites | null {
  const user = auth.currentUser();
  return user === null ? null : invitesFor(user.id);
}

/** A rejection like the server's, when nobody is signed in. */
function notSignedIn(): Promise<never> {
  return Promise.reject({ ...NOT_SIGNED_IN });
}

/** A watch with nobody signed in: `NOT_SIGNED_IN` later, never inside the call. */
function signedOutWatch(onError: ((error: unknown) => void) | undefined): () => void {
  let active = true;
  void Promise.resolve().then(() => {
    if (active) onError?.({ ...NOT_SIGNED_IN });
  });
  return () => {
    active = false;
  };
}

/**
 * The Convex invites of the app (`invites` of `@/services`): each call
 * comes from the user signed in to `auth` at that moment, like the Convex
 * adapter with the sign-in token. With nobody signed in it fails
 * `NOT_SIGNED_IN`.
 */
const invites: Invites = {
  createInvite: (game) => inviter()?.createInvite(game) ?? notSignedIn(),
  getInvite: (code) => inviter()?.getInvite(code) ?? notSignedIn(),
  watchInvite(code, onView, onError) {
    const port = inviter();
    if (port !== null) return port.watchInvite(code, onView, onError);
    return signedOutWatch(onError);
  },
  acceptInvite: (code) => inviter()?.acceptInvite(code) ?? notSignedIn(),
  declineInvite: (code) => inviter()?.declineInvite(code) ?? notSignedIn(),
  cancelInvite: (code) => inviter()?.cancelInvite(code) ?? notSignedIn(),
  listMyInvites: () => inviter()?.listMyInvites() ?? notSignedIn(),
  // The user signed in when the watch starts, like `games.watchMyGames`.
  watchMyInvites(onList, onError) {
    const port = inviter();
    if (port !== null) return port.watchMyInvites(onList, onError);
    return signedOutWatch(onError);
  },
};

const games: GameTransport = {
  subscribe(gameId, onView, onError) {
    const transport = caller();
    if (transport !== null) return transport.subscribe(gameId, onView, onError);
    return signedOutWatch(onError);
  },
  rollDice: (request) => caller()?.rollDice(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  sendTurn: (request) => caller()?.sendTurn(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  setDraft: (request) => caller()?.setDraft(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  sendAnswer: (request) => caller()?.sendAnswer(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  resign: (gameId) => caller()?.resign(gameId) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  listMyGames: (request) => caller()?.listMyGames(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  // The user signed in when the watch starts, like a Convex watch on one token.
  watchMyGames(request, onList, onError) {
    const transport = caller();
    if (transport !== null) return transport.watchMyGames(request, onList, onError);
    return signedOutWatch(onError);
  },
};

/** Delete my online data on the server, as the user signed in to `auth` at that moment. */
const onlineData: OnlineData = {
  deleteMyData() {
    const user = auth.currentUser();
    return user === null ? notSignedIn() : server.onlineDataFor(user.id).deleteMyData();
  },
};

export const onlineFake = {
  auth,
  /** Apple's sheet on the phone: set `next`, `sub` or `available` to act it out. */
  appleSheet,
  games,
  invites,
  notifications,
  pushTokens,
  onlineData,
  appUpdates,
  /** This build, like `appBuild()` of `@/services`. */
  appBuild: (): AppBuild | null => build,
  /** Sets this build for the rest of the test (`null`: no store build). */
  setAppBuild: (next: AppBuild | null) => {
    build = next;
  },
  /** Where the fake keeps the session. Set `session` to sign a user in at once. */
  authStore,
  /** The in-memory server of the current test. */
  server: () => server,
  /** The cached transport of `playerId` on the current server. */
  transportFor,
  /** The cached `Invites` port of `playerId` on the current server. */
  invitesFor,
  /**
   * Rolls both opening dice of a new match (#379), as its players, again
   * after each tie. Resolves to the view after the opening.
   */
  openGame: (gameId: string) => openMemoryGame(server, gameId),
};

/**
 * A new server, no cached transports or invite ports, nobody signed in
 * and no accounts or keys,
 * notifications not asked yet, no saved push token, no update policy and
 * the default build.
 */
export function resetOnlineFake(): void {
  Object.assign(authStore, createMemoryAuthStore());
  server = newServer();
  transports.clear();
  invitePorts.clear();
  notifications.reset();
  pushTokens.reset();
  appUpdates.reset();
  Object.assign(appleSheet, { sub: 'apple-1', available: true, next: 'proof' });
  appleSheet.shown.length = 0;
  build = DEFAULT_BUILD;
}
