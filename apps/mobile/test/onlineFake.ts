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
 * - `onlineServer()` and `gameTransportFor(playerId)` are the dev game
 *   parts (`/dev/online`): the server itself, and one cached transport
 *   per player.
 * - `invites` is the `Invites` port on the server as the signed-in user
 *   (#281), like the Convex adapter. With nobody signed in it fails
 *   `NOT_SIGNED_IN`.
 * - `invitesFor(playerId)` is the `Invites` port of a player on the same
 *   server (#256): the dev invites, and a friend in a test.
 *
 * A test makes games with `onlineFake.server().createGame(...)`. Each test
 * starts with a new server, no cached transports and nobody signed in
 * (`resetOnlineFake`, called in `test/afterEnv.ts`). The server clock is
 * `Date.now`, which the fake timers move.
 */
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  type GameTransport,
  type GameTransportErrorData,
  type Invites,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';

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
};

const games: GameTransport = {
  subscribe(gameId, onView, onError) {
    const transport = caller();
    if (transport !== null) return transport.subscribe(gameId, onView, onError);
    return signedOutWatch(onError);
  },
  sendTurn: (request) => caller()?.sendTurn(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
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

export const onlineFake = {
  auth,
  games,
  invites,
  /** Where the fake keeps the session. Set `session` to sign a user in at once. */
  authStore,
  /** The in-memory server of the current test. */
  server: () => server,
  /** The cached transport of `playerId` on the current server. */
  transportFor,
  /** The cached `Invites` port of `playerId` on the current server. */
  invitesFor,
};

/** A new server, no cached transports or invite ports, and nobody signed in. */
export function resetOnlineFake(): void {
  authStore.session = null;
  authStore.guests = 0;
  server = newServer();
  transports.clear();
  invitePorts.clear();
}
